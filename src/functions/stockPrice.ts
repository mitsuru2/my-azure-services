import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();

// TSE: Tokyo Stock Exchange
// JIAA: Japan Investment Advisers Association
// NYSE: New York Stock Exchange
// NASDAQ: National Association of Securities Dealers Automated Quotations
export const MARKETS = ['TSE', 'JIAA', 'NYSE', 'NYSE_ARCA', 'NASDAQ'] as const;
export type Market = (typeof MARKETS)[number];

export function isMarket(value: string): value is Market {
  return (MARKETS as readonly string[]).includes(value);
}

export const MARKET_CURRENCY: Record<Market, string> = {
  TSE: 'JPY',
  JIAA: 'JPY',
  NYSE: 'USD',
  NYSE_ARCA: 'USD',
  NASDAQ: 'USD',
};

interface StockPriceResponse {
  timestamp: string;
  market: string;
  ticker: string;
  price?: number;
  currency?: string;
  error?: string;
}

interface MufgDataset {
  nav: number;
}

interface MufgApiResponse {
  result: {
    status: number;
    retcount: number;
    errcd: string | null;
    errmsg: string | null;
  };
  datasets: MufgDataset[] | null;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

const MUFG_API_BASE = 'https://developer.am.mufg.jp/fund_information_latest/association_fund_cd';

const YAHOO_FINANCE_QUOTE_BASE = 'https://finance.yahoo.co.jp/quote';

async function fetchMutualFundNavByScraping(
  ticker: string,
  context: InvocationContext
): Promise<number> {
  const url = `${YAHOO_FINANCE_QUOTE_BASE}/${ticker}`;
  context.log(`Fetching mutual fund NAV by scraping: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      context.log(`Ticker not found: ${ticker}`);
      throw new NotFoundError(`Ticker not found: ${ticker}`);
    }
    context.log(`Yahoo Finance scraping error: ${res.status}`);
    throw new Error(`Yahoo Finance scraping error: ${res.status}`);
  }

  const html = await res.text();

  // tickerコードを含む registerItem パターンから価格を抽出する
  const match = html.match(new RegExp(`"registerItem":\\{"code":"${ticker}","price":"([0-9,]+)"`));
  if (!match) {
    context.log(`Price not found in page for ticker: ${ticker}`);
    throw new NotFoundError(`Price not found in page for ticker: ${ticker}`);
  }

  const price = parseFloat(match[1].replace(/,/g, ''));
  if (isNaN(price)) {
    throw new Error(`Failed to parse price: ${match[1]}`);
  }

  context.log(`Fetched NAV for ${ticker}: ${price}`);
  return price;
}

async function fetchMutualFundNav(ticker: string, context: InvocationContext): Promise<number> {
  context.log(`Fetching mutual fund NAV for ticker: ${ticker}`);
  const res = await fetch(`${MUFG_API_BASE}/${ticker}`);

  if (!res.ok) {
    context.log(`MUFG API error: ${res.status}`);
    throw new Error(`MUFG API error: ${res.status}`);
  }

  // MUFG APIのレスポンスをパースしてNAVを取得する
  // 銘柄が見つからなかった場合、res.okはtrueだが、result.statusが404となる
  const data = (await res.json()) as MufgApiResponse;
  if (data.result.status !== 200 || !data.datasets || data.datasets.length === 0) {
    if (data.result.status === 404) {
      context.log(`Ticker not found: ${ticker}`);
      throw new NotFoundError(`Ticker not found: ${ticker}`);
    } else {
      context.log(`MUFG API error: ${data.result.status}, ${data.result.errmsg}`);
      throw new Error(`MUFG API error: ${data.result.status}, ${data.result.errmsg}`);
    }
  }
  const nav = data.datasets[0].nav;
  context.log(`Fetched NAV for ${ticker}: ${nav}`);
  return nav;
}

async function fetchEquityPrice(symbol: string, context: InvocationContext): Promise<number> {
  context.log(`Fetching equity price for symbol: ${symbol}`);
  const quote = await yf.quote(symbol);

  // 銘柄情報が見つからなかった場合
  if (quote === undefined) {
    context.log(`Symbol not found: ${symbol}`);
    throw new NotFoundError(`Symbol not found: ${symbol}`);
  }

  // その他のエラーで株価情報が取得できなかった場合
  if (quote.regularMarketPrice === undefined) {
    context.log(`Price not found for symbol: ${symbol}`);
    throw new NotFoundError(`Price not found for symbol: ${symbol}`);
  }

  const price = quote.regularMarketPrice;
  context.log(`Fetched price for ${symbol}: ${price}`);
  return price;
}

export async function getStockPrice(
  market: Market,
  ticker: string,
  context: InvocationContext
): Promise<number> {
  if (market === 'JIAA') {
    // 投資信託: Yahoo FinanceのページをスクレイピングしてNAVを取得する。
    return fetchMutualFundNavByScraping(ticker, context);
  }
  // 株式: Yahoo FinanceのAPIを使用して最新の株価を取得する。
  const symbol = market === 'TSE' && !ticker.endsWith('.T') ? `${ticker}.T` : ticker;
  return fetchEquityPrice(symbol, context);
}

export async function stockPrice(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  const market = request.query.get('market') ?? '';
  const ticker = request.query.get('ticker') ?? '';
  let price: number | undefined = undefined;
  let status = 200;
  let errorMessage: string | undefined = undefined;

  // バリデーション
  if (!market || !ticker) {
    context.log(`Validation error: market="${market}", ticker="${ticker}"`);
    status = 400;
    errorMessage = 'market and ticker are required';
  } else if (!isMarket(market)) {
    context.log(`Validation error: unsupported market "${market}"`);
    status = 400;
    errorMessage = `Invalid market: "${market}". Supported markets: ${MARKETS.join(', ')}`;
  }

  // 株価取得
  if (status === 200 && isMarket(market)) {
    try {
      price = await getStockPrice(market, ticker, context);
      context.log(`Returning price for ${market}:${ticker} = ${price}`);
    } catch (error) {
      // エラー処理: 株価取得に失敗した場合は、エラーメッセージを返す。
      context.log(`Error fetching price for ${market}:${ticker} - ${error}`);
      status = error instanceof NotFoundError ? 404 : 500;
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  // レスポンスの作成
  const response: StockPriceResponse = {
    market,
    ticker,
    price,
    currency: price !== undefined ? MARKET_CURRENCY[market] : undefined,
    timestamp: new Date().toISOString(),
    error: errorMessage,
  };
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
}

app.http('stock-price', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: stockPrice,
});

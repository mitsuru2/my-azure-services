import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance();

// TSE: Tokyo Stock Exchange
// JIAA: Japan Investment Advisers Association
// NYSE: New York Stock Exchange
// NASDAQ: National Association of Securities Dealers Automated Quotations
const MARKETS = ['TSE', 'JIAA', 'NYSE', 'NYSE_ARCA', 'NASDAQ'] as const;
type Market = (typeof MARKETS)[number];

function isMarket(value: string): value is Market {
  return (MARKETS as readonly string[]).includes(value.toUpperCase());
}

const MARKET_CURRENCY: Record<Market, string> = {
  TSE: 'JPY',
  JIAA: 'JPY',
  NYSE: 'USD',
  NYSE_ARCA: 'USD',
  NASDAQ: 'USD',
};

interface StockPriceResponse {
  market: string;
  ticker: string;
  price: number;
  currency: string;
  timestamp: string;
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

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

const MUFG_API_BASE = 'https://developer.am.mufg.jp/fund_information_latest/association_fund_cd';

async function fetchMutualFundNav(ticker: string, context: InvocationContext): Promise<number> {
  context.log(`Fetching mutual fund NAV for ticker: ${ticker}`);
  const res = await fetch(`${MUFG_API_BASE}/${ticker}`);

  if (!res.ok) {
    throw new Error(`MUFG API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as MufgApiResponse;

  if (data.result.status === 404 || data.datasets === null) {
    context.log(`Mutual fund not found: ${ticker}`);
    throw new Error(`Mutual fund not found: ${ticker}`);
  }

  const nav = data.datasets[0].nav;
  context.log(`Fetched NAV for ${ticker}: ${nav}`);
  return nav;
}

async function fetchEquityPrice(symbol: string, context: InvocationContext): Promise<number> {
  context.log(`Fetching equity price for symbol: ${symbol}`);
  const quote = await yf.quote(symbol);

  if (quote === undefined) {
    context.log(`Symbol not found: ${symbol}`);
    throw new Error(`Symbol not found: ${symbol}`);
  }

  const price = quote.regularMarketPrice ?? 0;
  context.log(`Fetched price for ${symbol}: ${price}`);
  return price;
}

export async function stockPrice(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  const market = request.query.get('market') ?? '';
  const ticker = request.query.get('ticker') ?? '';
  const timestamp = new Date().toISOString();

  if (!market || !ticker) {
    context.log(`Validation error: market="${market}", ticker="${ticker}"`);
    const response: StockPriceResponse = {
      market,
      ticker,
      price: 0,
      currency: '',
      timestamp,
      error: 'market and ticker are required',
    };
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  }

  if (!isMarket(market)) {
    context.log(`Validation error: unsupported market "${market}"`);
    const response: StockPriceResponse = {
      market,
      ticker,
      price: 0,
      currency: '',
      timestamp,
      error: `Invalid market: "${market}". Supported markets: ${MARKETS.join(', ')}`,
    };
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  }

  // 株価取得
  let price = 0;
  try {
    if (market !== 'JIAA') {
      // 株式: Yahoo FinanceのAPIを使用して最新の株価を取得する。
      const symbol = market === 'TSE' ? `${ticker}.T` : ticker;
      price = await fetchEquityPrice(symbol, context);
    } else {
      // 投資信託: MUFGのAPIを使用して最新のNAVを取得する。
      price = await fetchMutualFundNav(ticker, context);
    }
  } catch (error) {
    context.log(`Error fetching price for ${market}:${ticker} - ${error}`);
    const response: StockPriceResponse = {
      market,
      ticker,
      price: 0,
      currency: MARKET_CURRENCY[market],
      timestamp,
      error: 'Error fetching stock price',
    };
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  }

  context.log(`Returning price for ${market}:${ticker} = ${price}`);
  const response: StockPriceResponse = {
    market,
    ticker,
    price,
    currency: MARKET_CURRENCY[market],
    timestamp,
  };

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response),
  };
}

app.http('stock-price', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: stockPrice,
});

import {
  app,
  HttpHandler,
  HttpRequest,
  HttpResponse,
  InvocationContext,
  Timer,
  TimerHandler,
} from '@azure/functions';
import * as df from 'durable-functions';
import { ActivityHandler, OrchestrationContext, OrchestrationHandler } from 'durable-functions';
import { isLastDayOfMonth, jstTimeToUtcCronExpression } from '../utils/date';
import { DataRecords, GoogleSpreadSheet } from '../utils/googleSpreadSheet';
import { getStockPrice, isMarket, MARKET_CURRENCY } from './stockPrice';

//------------------------------------------------------------------------------
// 為替レート取得
//------------------------------------------------------------------------------
const FRANKFURTER_API_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=JPY';

interface ExchangeRate {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
}

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

async function fetchUsdJpyExchangeRate(context: InvocationContext): Promise<ExchangeRate> {
  context.log(`Fetching USD/JPY exchange rate: ${FRANKFURTER_API_URL}`);

  const res = await fetch(FRANKFURTER_API_URL);
  if (!res.ok) {
    context.log(`Frankfurter API error: ${res.status}`);
    throw new Error(`Frankfurter API error: ${res.status}`);
  }

  const data = (await res.json()) as FrankfurterResponse;
  const rate = data.rates?.JPY;
  if (rate === undefined) {
    context.log(`JPY rate not found in Frankfurter API response: ${JSON.stringify(data)}`);
    throw new Error('JPY rate not found in Frankfurter API response');
  }

  context.log(`Fetched USD/JPY exchange rate: ${rate}`);
  return { baseCurrency: 'USD', targetCurrency: 'JPY', rate };
}

const getExchangeRate: ActivityHandler = async (
  _input: unknown,
  context: InvocationContext
): Promise<ExchangeRate> => {
  return await fetchUsdJpyExchangeRate(context);
};
df.app.activity('getExchangeRate', { handler: getExchangeRate });

//------------------------------------------------------------------------------
// 為替レートシート更新
//------------------------------------------------------------------------------
interface ExchangeRateRecordData {
  date: string; // 日付 (YYYY/MM/DD)
  usdToJpy: number; // USD→JPY 為替レート
}

const updateExchangeRateSheet: ActivityHandler = async (
  input: ExchangeRateRecordData,
  context: InvocationContext
): Promise<void> => {
  const SHEET_NAME = '当月為替レート';
  const TITLE_ROW_RANGE = 'A1:B1';

  const spreadsheetId = process.env.STOCK_PRICE_HISTORY_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('STOCK_PRICE_HISTORY_SPREADSHEET_ID must be set');
  }

  const sheet = new GoogleSpreadSheet();
  await sheet.open(spreadsheetId);

  try {
    await sheet.updateDataRecords(
      SHEET_NAME,
      TITLE_ROW_RANGE,
      { values: [[input.date, input.usdToJpy]] },
      1
    );
  } finally {
    sheet.close();
  }
};
df.app.activity('updateExchangeRateSheet', { handler: updateExchangeRateSheet });

//------------------------------------------------------------------------------
// 為替レート履歴追記
//------------------------------------------------------------------------------
const appendExchangeRateHistory: ActivityHandler = async (
  input: ExchangeRateRecordData,
  context: InvocationContext
): Promise<void> => {
  const SHEET_NAME = '月次為替レート履歴';
  const TITLE_ROW_RANGE = 'A1:B1';

  const spreadsheetId = process.env.STOCK_PRICE_HISTORY_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('STOCK_PRICE_HISTORY_SPREADSHEET_ID must be set');
  }

  const sheet = new GoogleSpreadSheet();
  await sheet.open(spreadsheetId);

  try {
    const result = await sheet.appendDataRecords(SHEET_NAME, TITLE_ROW_RANGE, {
      values: [[input.date, input.usdToJpy]],
    });
    context.log(
      `Appended exchange rate history: range=${result.range}, rowCount=${result.rowCount}`
    );
  } finally {
    sheet.close();
  }
};
df.app.activity('appendExchangeRateHistory', { handler: appendExchangeRateHistory });

//------------------------------------------------------------------------------
// 保有株式情報取得
//------------------------------------------------------------------------------
interface StockPriceRecordData {
  date?: string; // 日付
  assetClass: string; // 資産クラス
  symbol: string; // 銘柄コード, ティッカー
  name: string; // 銘柄名
  currency: string; // 通貨 (JPY, USD)
  market?: string; // 市場 (TSE, NASDAQ, NYSE, etc.)
  securitiesCompanyName: string; // 証券会社名
  accountType: string; // 口座種別 (特定口座, 一般口座, NISA, etc.)
  accountName: string; // 口座名義
  holdingQuantity?: number; // 保有数量
  acquisitionUnitPrice?: number; // 取得単価
  currentUnitPrice?: number; // 現在単価
}

const LIST_DEFINITION_SHEET_NAME = 'リスト定義マスタ';
const LIST_DEFINITION_TITLE_ROW_RANGE = 'A1:B1';

function buildListDefinitionMap(rows: DataRecords['values']): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const listName = String(row[0] ?? '');
    const value = String(row[1] ?? '');
    if (!listName || !value) {
      continue;
    }
    const values = map.get(listName) ?? new Set<string>();
    values.add(value);
    map.set(listName, values);
  }
  return map;
}

function assertValidStockPriceRecordData(
  records: StockPriceRecordData[],
  listDefinitions: Map<string, Set<string>>
): void {
  const assetClasses = listDefinitions.get('資産クラス') ?? new Set<string>();
  const securitiesCompanyNames = listDefinitions.get('取次会社') ?? new Set<string>();
  const accountTypes = listDefinitions.get('口座種別') ?? new Set<string>();
  const accountNames = listDefinitions.get('名義') ?? new Set<string>();
  const currencies = listDefinitions.get('通貨') ?? new Set<string>();
  const markets = listDefinitions.get('市場') ?? new Set<string>();

  records.forEach((record, index) => {
    const rowLabel = `dataRows[${index}]`;

    if (!record.assetClass || !assetClasses.has(record.assetClass)) {
      throw new Error(`${rowLabel}: assetClass "${record.assetClass}" is invalid`);
    }
    if (
      !record.securitiesCompanyName ||
      !securitiesCompanyNames.has(record.securitiesCompanyName)
    ) {
      throw new Error(
        `${rowLabel}: securitiesCompanyName "${record.securitiesCompanyName}" is invalid`
      );
    }
    if (!record.accountType || !accountTypes.has(record.accountType)) {
      throw new Error(`${rowLabel}: accountType "${record.accountType}" is invalid`);
    }
    if (!record.accountName || !accountNames.has(record.accountName)) {
      throw new Error(`${rowLabel}: accountName "${record.accountName}" is invalid`);
    }
    if (!record.currency || !currencies.has(record.currency)) {
      throw new Error(`${rowLabel}: currency "${record.currency}" is invalid`);
    }
    if (record.market && !markets.has(record.market)) {
      throw new Error(`${rowLabel}: market "${record.market}" is invalid`);
    }
    if (!record.symbol) {
      throw new Error(`${rowLabel}: symbol must not be empty`);
    }
    if (!record.name) {
      throw new Error(`${rowLabel}: name must not be empty`);
    }
    if (record.acquisitionUnitPrice !== undefined && record.acquisitionUnitPrice < 0) {
      throw new Error(`${rowLabel}: acquisitionUnitPrice must not be negative`);
    }
    if (record.holdingQuantity !== undefined && record.holdingQuantity < 0) {
      throw new Error(`${rowLabel}: holdingQuantity must not be negative`);
    }
  });
}

const getTargetStockList: ActivityHandler = async (
  context: InvocationContext
): Promise<StockPriceRecordData[]> => {
  const SHEET_NAME = '当月資産状況';
  const TITLE_ROW_RANGE = 'A1:J1';

  const spreadsheetId = process.env.STOCK_PRICE_HISTORY_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('STOCK_PRICE_HISTORY_SPREADSHEET_ID must be set');
  }

  const sheet = new GoogleSpreadSheet();
  await sheet.open(spreadsheetId);

  let dataRows: DataRecords['values'];
  let listDefinitionRows: DataRecords['values'];
  try {
    const { values } = await sheet.readDataRecords(SHEET_NAME, TITLE_ROW_RANGE, 0);
    dataRows = values.slice(1);

    const { values: listDefinitionValues } = await sheet.readDataRecords(
      LIST_DEFINITION_SHEET_NAME,
      LIST_DEFINITION_TITLE_ROW_RANGE,
      0
    );
    listDefinitionRows = listDefinitionValues.slice(1);
  } finally {
    sheet.close();
  }

  const records = dataRows.map((row) => ({
    assetClass: String(row[0] ?? ''),
    securitiesCompanyName: String(row[1] ?? ''),
    symbol: String(row[2] ?? ''),
    name: String(row[3] ?? ''),
    market: String(row[4] ?? undefined),
    accountName: String(row[5] ?? ''),
    accountType: String(row[6] ?? ''),
    currency: String(row[7] ?? ''),
    holdingQuantity: Number(row[8] ?? undefined),
    acquisitionUnitPrice: Number(row[9] ?? undefined),
  }));

  const listDefinitions = buildListDefinitionMap(listDefinitionRows);
  assertValidStockPriceRecordData(records, listDefinitions);

  return records;
};

df.app.activity('getTargetStockList', { handler: getTargetStockList });

//------------------------------------------------------------------------------
// 株価更新
//------------------------------------------------------------------------------
const updateStockPrice: ActivityHandler = async (
  input: StockPriceRecordData,
  context: InvocationContext
): Promise<StockPriceRecordData> => {
  if (!input.market) {
    context.log(`Skipping price fetch: symbol=${input.symbol}, name=${input.name}`);
    return input;
  }

  if (!isMarket(input.market)) {
    throw new Error(`Unsupported market "${input.market}" for symbol "${input.symbol}"`);
  }

  const expectedCurrency = MARKET_CURRENCY[input.market];
  if (input.currency !== expectedCurrency) {
    throw new Error(
      `Currency mismatch for symbol "${input.symbol}": expected "${expectedCurrency}" for market "${input.market}", but got "${input.currency}"`
    );
  }

  const currentUnitPrice = await getStockPrice(input.market, input.symbol, context);
  context.log(
    `Fetched price: symbol=${input.symbol}, name=${input.name}, price=${currentUnitPrice}`
  );

  return { ...input, currentUnitPrice };
};
df.app.activity('updateStockPrice', { handler: updateStockPrice });

//------------------------------------------------------------------------------
// 株価シート更新
//------------------------------------------------------------------------------
/**
 * - A列: assetClass
 * - B列: securitiesCompanyName
 * - C列: symbol
 * - D列: name
 * - E列: market
 * - F列: accountName
 * - G列: accountType
 * - H列: currency
 * - I列: holdingQuantity
 * - J列: acquisitionUnitPrice
 * - K列: currentUnitPrice
 */
const updateStockPriceSheet: ActivityHandler = async (
  input: StockPriceRecordData[],
  context: InvocationContext
): Promise<void> => {
  const SHEET_NAME = '当月資産状況';
  const TITLE_ROW_RANGE = 'A1:K1';

  const spreadsheetId = process.env.STOCK_PRICE_HISTORY_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('STOCK_PRICE_HISTORY_SPREADSHEET_ID must be set');
  }

  const values = input.map((record) => [
    record.assetClass,
    record.securitiesCompanyName,
    record.symbol,
    record.name,
    record.market ?? null,
    record.accountName,
    record.accountType,
    record.currency,
    record.holdingQuantity ?? null,
    record.acquisitionUnitPrice ?? null,
    record.currentUnitPrice ?? null,
  ]);

  const sheet = new GoogleSpreadSheet();
  await sheet.open(spreadsheetId);

  try {
    const result = await sheet.updateDataRecords(SHEET_NAME, TITLE_ROW_RANGE, { values }, 1);
    context.log(`Updated stock price sheet: range=${result.range}, rowCount=${result.rowCount}`);
  } finally {
    sheet.close();
  }
};
df.app.activity('updateStockPriceSheet', { handler: updateStockPriceSheet });

//------------------------------------------------------------------------------
// 株価履歴シート追記
//------------------------------------------------------------------------------
const appendStockPriceHistory: ActivityHandler = async (
  input: StockPriceRecordData[],
  context: InvocationContext
): Promise<void> => {
  const SHEET_NAME = '月次資産状況履歴';
  const TITLE_ROW_RANGE = 'A1:L1';

  const spreadsheetId = process.env.STOCK_PRICE_HISTORY_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('STOCK_PRICE_HISTORY_SPREADSHEET_ID must be set');
  }

  const values = input.map((record) => [
    record.date ?? null,
    record.assetClass,
    record.securitiesCompanyName,
    record.symbol,
    record.name,
    record.market ?? null,
    record.accountName,
    record.accountType,
    record.currency,
    record.holdingQuantity ?? null,
    record.acquisitionUnitPrice ?? null,
    record.currentUnitPrice ?? null,
  ]);

  const sheet = new GoogleSpreadSheet();
  await sheet.open(spreadsheetId);

  try {
    const result = await sheet.appendDataRecords(SHEET_NAME, TITLE_ROW_RANGE, { values });
    context.log(`Appended stock price history: range=${result.range}, rowCount=${result.rowCount}`);
  } finally {
    sheet.close();
  }
};
df.app.activity('appendStockPriceHistory', { handler: appendStockPriceHistory });

//------------------------------------------------------------------------------
// オーケストレーター関数
//------------------------------------------------------------------------------
const recordStockPriceHistoryOrchestrator: OrchestrationHandler = function* (
  context: OrchestrationContext
) {
  //
  // 1. 為替レート更新
  //
  const now = context.df.currentUtcDateTime;
  const date = `${now.getUTCFullYear()}/${now.getUTCMonth() + 1}/${now.getUTCDate()}`;
  const exchangeRate: ExchangeRate = yield context.df.callActivity('getExchangeRate');
  yield context.df.callActivity('updateExchangeRateSheet', {
    date,
    usdToJpy: exchangeRate.rate,
  });

  //
  // 2. 株価更新
  //
  const targetStockList: StockPriceRecordData[] =
    yield context.df.callActivity('getTargetStockList');
  // fan-out / fan-in で株価一斉取得
  const updateStockPriceTasks = targetStockList.map((record) =>
    context.df.callActivity('updateStockPrice', record)
  );
  const updatedStockList: StockPriceRecordData[] = yield context.df.Task.all(updateStockPriceTasks);
  yield context.df.callActivity('updateStockPriceSheet', updatedStockList);

  //
  // 3. 月末処理
  //
  if (isLastDayOfMonth(now)) {
    yield context.df.callActivity('appendExchangeRateHistory', {
      date,
      usdToJpy: exchangeRate.rate,
    });
    const datedStockList = updatedStockList.map((record) => ({ ...record, date }));
    yield context.df.callActivity('appendStockPriceHistory', datedStockList);
  }

  return { date, exchangeRate };
};
df.app.orchestration('record-stock-price-history', recordStockPriceHistoryOrchestrator);

//------------------------------------------------------------------------------
// タイマートリガー
//------------------------------------------------------------------------------
const triggerTimeJst = process.env.STOCK_PRICE_HISTORY_TRIGGER_TIME_JST;
if (!triggerTimeJst) {
  throw new Error('STOCK_PRICE_HISTORY_TRIGGER_TIME_JST must be set');
}

const recordStockPriceHistoryTimerStart: TimerHandler = async (
  _myTimer: Timer,
  context: InvocationContext
): Promise<void> => {
  const client = df.getClient(context);
  const instanceId: string = await client.startNew('record-stock-price-history');

  context.log(`Started orchestration with ID = '${instanceId}'.`);
};

app.timer('recordStockPriceHistoryTimerStart', {
  schedule: jstTimeToUtcCronExpression(triggerTimeJst),
  extraInputs: [df.input.durableClient()],
  handler: recordStockPriceHistoryTimerStart,
});

//------------------------------------------------------------------------------
// HTTPエンドポイント
//------------------------------------------------------------------------------
const recordStockPriceHistoryHttpStart: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponse> => {
  const client = df.getClient(context);
  const body: unknown = await request.text();
  const instanceId: string = await client.startNew(request.params.orchestratorName, {
    input: body,
  });

  context.log(`Started orchestration with ID = '${instanceId}'.`);

  return client.createCheckStatusResponse(request, instanceId);
};

app.http('recordStockPriceHistoryHttpStart', {
  route: 'orchestrators/{orchestratorName}',
  extraInputs: [df.input.durableClient()],
  handler: recordStockPriceHistoryHttpStart,
});

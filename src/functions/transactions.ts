import { createHash } from 'crypto';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { GoogleSpreadSheet } from '../utils/googleSpreadSheet';

export const SUPPORTED_FORMATS = ['SBI'] as const;
export type TransactionFormat = (typeof SUPPORTED_FORMATS)[number];

export function isSupportedFormat(value: string): value is TransactionFormat {
  return (SUPPORTED_FORMATS as readonly string[]).includes(value);
}

const SECURITIES_COMPANY_NAME: Record<TransactionFormat, string> = {
  SBI: 'SBI証券',
};

const ACCOUNT_NAME_MAX_LENGTH = 20;

// 円貨明細の「区分」は"利金・配当金"、外貨明細の「区分」は"分配金"となる。それ以外(源泉徴収・振替等)は対象外。
const TARGET_TRANSACTION_TYPES = new Set(['利金・配当金', '分配金']);

const HEADER_SEARCH_MAX_ROWS = 15;
const TRANSACTION_DATE_COLUMN_NAME = '入出金日';

const DIVIDEND_HISTORY_SHEET_NAME = '配当履歴';
const DIVIDEND_HISTORY_TITLE_ROW_RANGE = 'A1:H1';

const STOCK_STATUS_SHEET_NAME = '当月資産状況';
const STOCK_STATUS_TITLE_ROW_RANGE = 'A1:J1';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export interface DividendRecord {
  id: string;
  date: string;
  securitiesCompanyName: string;
  symbol: string;
  name: string;
  account: string;
  amount: number;
  currency: 'JPY' | 'USD';
}

interface TransactionRow {
  rawLine: string;
  date: string;
  transactionType: string;
  description: string;
  amount: number;
}

// フィールドがダブルクォートで囲まれた単純なカンマ区切り形式であることを前提とした軽量パーサー。
function parseCsvLine(line: string): string[] {
  return line.split(',').map((field) => field.trim().replace(/^"|"$/g, ''));
}

export function splitCsvLines(csv: string): string[] {
  return csv.split(/\r\n|\r|\n/);
}

// リクエストボディのcsvはbase64エンコードされたutf8テキストとして渡される。
export function decodeBase64Csv(csv: string): string {
  return Buffer.from(csv, 'base64').toString('utf8');
}

export function detectCurrency(lines: string[]): 'JPY' | 'USD' {
  const titleLine = (lines[1] ?? '').trim();
  if (titleLine === '円貨入出金明細') {
    return 'JPY';
  }
  if (titleLine === '外貨入出金明細') {
    return 'USD';
  }
  throw new ValidationError(
    `2行目1列目は "円貨入出金明細" または "外貨入出金明細" である必要があります: "${titleLine}"`
  );
}

export function findTransactionHeaderRowIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, HEADER_SEARCH_MAX_ROWS); i++) {
    if (parseCsvLine(lines[i])[0] === TRANSACTION_DATE_COLUMN_NAME) {
      return i;
    }
  }
  throw new ValidationError(
    `"${TRANSACTION_DATE_COLUMN_NAME}" ヘッダー行が最初の${HEADER_SEARCH_MAX_ROWS}行以内に見つかりません`
  );
}

export function parseTransactionRows(lines: string[], headerRowIndex: number): TransactionRow[] {
  const header = parseCsvLine(lines[headerRowIndex]);
  const dateIndex = header.indexOf('入出金日');
  const typeIndex = header.indexOf('区分');
  const descriptionIndex = header.indexOf('摘要');
  const depositIndex = header.indexOf('入金額');

  const rows: TransactionRow[] = [];
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) {
      break;
    }
    const fields = parseCsvLine(rawLine);
    rows.push({
      rawLine,
      date: fields[dateIndex] ?? '',
      transactionType: fields[typeIndex] ?? '',
      description: fields[descriptionIndex] ?? '',
      amount: Number((fields[depositIndex] ?? '0').replace(/,/g, '')),
    });
  }
  return rows;
}

// 円貨: "株式配当金 XXX" → 銘柄名はXXX。銘柄IDは当月資産状況シートを銘柄名で検索して取得する。
// 外貨: " SHLD 銘柄名:GLX防衛テックETF" → 先頭トークンが銘柄ID(ティッカー)。銘柄名は当月資産状況シートをティッカーで検索して取得する。
export function extractNameAndSymbol(
  currency: 'JPY' | 'USD',
  description: string
): { name: string; symbol: string } {
  const cleanedDescription = description.replace(/（NISA：非課税）/g, '');
  if (currency === 'JPY') {
    const name = cleanedDescription.replace(/^株式配当金\s*/, '').trim();
    return { name, symbol: '' };
  }
  const match = cleanedDescription.trim().match(/^(\S+)\s+銘柄名:(.*)$/);
  if (!match) {
    return { name: '', symbol: '' };
  }
  return { name: '', symbol: match[1] };
}

export function generateId(rawLine: string): string {
  return createHash('sha256').update(rawLine).digest('hex');
}

async function lookupStockNameAndSymbol(
  spreadsheetId: string
): Promise<{ nameToSymbol: Map<string, string>; symbolToName: Map<string, string> }> {
  const sheet = new GoogleSpreadSheet();
  await sheet.open(spreadsheetId);
  let rows: (string | number | boolean | null)[][];
  try {
    const { values } = await sheet.readDataRecords(
      STOCK_STATUS_SHEET_NAME,
      STOCK_STATUS_TITLE_ROW_RANGE,
      0
    );
    rows = values.slice(1);
  } finally {
    sheet.close();
  }

  const nameToSymbol = new Map<string, string>();
  const symbolToName = new Map<string, string>();
  for (const row of rows) {
    const symbol = String(row[2] ?? '');
    const name = String(row[3] ?? '');
    if (symbol && name) {
      if (!nameToSymbol.has(name)) {
        nameToSymbol.set(name, symbol);
      }
      if (!symbolToName.has(symbol)) {
        symbolToName.set(symbol, name);
      }
    }
  }
  return { nameToSymbol, symbolToName };
}

async function appendNewDividendRecords(
  spreadsheetId: string,
  candidates: DividendRecord[]
): Promise<number> {
  if (candidates.length === 0) {
    return 0;
  }

  const sheet = new GoogleSpreadSheet();
  await sheet.open(spreadsheetId);
  try {
    const { values } = await sheet.readDataRecords(
      DIVIDEND_HISTORY_SHEET_NAME,
      DIVIDEND_HISTORY_TITLE_ROW_RANGE,
      0
    );
    const existingIds = new Set(values.slice(1).map((row) => String(row[0] ?? '')));

    const newRecords = candidates.filter((record) => !existingIds.has(record.id));
    if (newRecords.length === 0) {
      return 0;
    }

    await sheet.appendDataRecords(DIVIDEND_HISTORY_SHEET_NAME, DIVIDEND_HISTORY_TITLE_ROW_RANGE, {
      values: newRecords.map((record) => [
        record.id,
        record.date,
        record.securitiesCompanyName,
        record.symbol,
        record.name,
        record.account,
        record.amount,
        record.currency,
      ]),
    });

    return newRecords.length;
  } finally {
    sheet.close();
  }
}

function errorResponse(status: number, error: string): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error }),
  };
}

export async function transactions(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`);

  let body: { format?: string; account?: string; csv?: string };
  try {
    body = (await request.json()) as { format?: string; account?: string; csv?: string };
  } catch {
    return errorResponse(400, 'request body must be valid JSON');
  }

  const { format, account, csv } = body;

  if (!format || !isSupportedFormat(format)) {
    return errorResponse(400, `format must be one of: ${SUPPORTED_FORMATS.join(', ')}`);
  }
  if (!account || account.length < 1 || account.length > ACCOUNT_NAME_MAX_LENGTH) {
    return errorResponse(
      400,
      `account must be between 1 and ${ACCOUNT_NAME_MAX_LENGTH} characters`
    );
  }
  if (!csv) {
    return errorResponse(400, 'csv must not be empty');
  }

  const lines = splitCsvLines(decodeBase64Csv(csv));

  let currency: 'JPY' | 'USD';
  let headerRowIndex: number;
  try {
    currency = detectCurrency(lines);
    headerRowIndex = findTransactionHeaderRowIndex(lines);
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, error.message);
    }
    throw error;
  }

  const transactionRows = parseTransactionRows(lines, headerRowIndex).filter((row) =>
    TARGET_TRANSACTION_TYPES.has(row.transactionType)
  );

  const spreadsheetId = process.env.STOCK_PRICE_HISTORY_SPREADSHEET_ID;
  if (!spreadsheetId) {
    context.log('STOCK_PRICE_HISTORY_SPREADSHEET_ID must be set');
    return errorResponse(500, 'STOCK_PRICE_HISTORY_SPREADSHEET_ID must be set');
  }

  try {
    const { nameToSymbol, symbolToName } = await lookupStockNameAndSymbol(spreadsheetId);

    const candidates: DividendRecord[] = transactionRows.map((row) => {
      const extracted = extractNameAndSymbol(currency, row.description);
      const name = currency === 'JPY' ? extracted.name : (symbolToName.get(extracted.symbol) ?? '');
      const symbol =
        currency === 'JPY' ? (nameToSymbol.get(extracted.name) ?? '') : extracted.symbol;

      return {
        id: generateId(row.rawLine),
        date: row.date,
        securitiesCompanyName: SECURITIES_COMPANY_NAME[format],
        symbol,
        name,
        account,
        amount: row.amount,
        currency,
      };
    });

    const addedCount = await appendNewDividendRecords(spreadsheetId, candidates);

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addedCount }),
    };
  } catch (error) {
    context.log(`Error processing transactions: ${error}`);
    return errorResponse(500, error instanceof Error ? error.message : String(error));
  }
}

app.http('transactions', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: transactions,
});

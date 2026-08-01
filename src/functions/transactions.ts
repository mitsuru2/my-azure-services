import { createHash } from 'crypto';
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { GoogleSpreadSheet } from '../utils/googleSpreadSheet';

export const TRANSACTION_FORMAT_TYPE = ['SBI', 'SBI_BANK'] as const;
export type TransactionFormatType = (typeof TRANSACTION_FORMAT_TYPE)[number];

export const CURRENCY_TYPE = ['JPY', 'USD'] as const;
export type CurrencyType = (typeof CURRENCY_TYPE)[number];

export function isSupportedFormat(value: string): value is TransactionFormatType {
  return (TRANSACTION_FORMAT_TYPE as readonly string[]).includes(value);
}

const SECURITIES_COMPANY_NAME: Record<TransactionFormatType, string> = {
  SBI: 'SBI証券',
  SBI_BANK: 'ドコモSMTBネット銀行',
};

const ACCOUNT_NAME_MAX_LENGTH = 20;

// 円貨明細の「区分」は"利金・配当金"、外貨明細の「区分」は"分配金"となる。それ以外(源泉徴収・振替等)は対象外。
const TARGET_TRANSACTION_TYPES = new Set(['利金・配当金', '分配金', '入金', '出金']);

const HEADER_SEARCH_MAX_ROWS = 15;
const TRANSACTION_DATE_COLUMN_NAME: Record<TransactionFormatType, string> = {
  SBI: '入出金日',
  SBI_BANK: '日付',
};

const DIVIDEND_HISTORY_SHEET_NAME = '配当履歴';
const DIVIDEND_HISTORY_TITLE_ROW_RANGE = 'A1:H1';

const CASH_FLOW_HISTORY_SHEET_NAME = '入出金履歴';
const CASH_FLOW_HISTORY_TITLE_ROW_RANGE = 'A1:I1';

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
  currency: CurrencyType;
}

export interface CashFlowRecord {
  id: string;
  date: string;
  transactionType: string;
  securitiesCompanyName: string;
  accountHolderName: string;
  accountType: string;
  amount: number;
  currency: CurrencyType;
  note: string;
}

interface TransactionRow {
  rawLine: string;
  date: string;
  transactionType: string;
  description: string;
  amount: number;
}

// ダブルクォートで囲まれたフィールド内のカンマ(例: "4,000,000")を区切り文字として
// 誤分割しないようにするパーサー。クォート内の空白(例: " SHLD ...")はトリムしない。
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  const len = line.length;
  let i = 0;
  while (i <= len) {
    while (line[i] === ' ' || line[i] === '\t') {
      i++;
    }
    let field = '';
    if (line[i] === '"') {
      i++;
      while (i < len) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (line[i] === '"') {
          i++;
          break;
        } else {
          field += line[i];
          i++;
        }
      }
      while (line[i] === ' ' || line[i] === '\t') {
        i++;
      }
    } else {
      while (i < len && line[i] !== ',') {
        field += line[i];
        i++;
      }
      field = field.trim();
    }
    fields.push(field);
    if (line[i] === ',') {
      i++;
    } else {
      break;
    }
  }
  return fields;
}

export function splitCsvLines(csv: string): string[] {
  return csv.split(/\r\n|\r|\n/);
}

// リクエストボディのcsvはbase64エンコードされたutf8テキストとして渡される。
export function decodeBase64Csv(csv: string): string {
  return Buffer.from(csv, 'base64').toString('utf8');
}

export function detectCurrency(lines: string[], format: TransactionFormatType): CurrencyType {
  if (format == 'SBI') {
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
  } else if (format == 'SBI_BANK') {
    // 住信SBIネット銀行の場合は常に JPY を返す。
    return 'JPY';
  } else {
    throw new Error(`Logic error. Format validation doesn't work.`);
  }
}

export function findTransactionHeaderRowIndex(
  lines: string[],
  format: TransactionFormatType
): number {
  const pattern = TRANSACTION_DATE_COLUMN_NAME[format];

  for (let i = 0; i < Math.min(lines.length, HEADER_SEARCH_MAX_ROWS); i++) {
    if (parseCsvLine(lines[i])[0] === pattern) {
      return i;
    }
  }
  throw new ValidationError(
    `"${pattern}" ヘッダー行が最初の${HEADER_SEARCH_MAX_ROWS}行以内に見つかりません`
  );
}

export function parseTransactionRows(
  lines: string[],
  headerRowIndex: number,
  format: TransactionFormatType
): TransactionRow[] {
  if (format == 'SBI') {
    return parseTransactionRowsSBI(lines, headerRowIndex);
  } else if (format == 'SBI_BANK') {
    return parseTransactionRowsSBIBank(lines, headerRowIndex);
  } else {
    throw new Error(`Logic error. Format validation doesn't work.`);
  }
}

function parseTransactionRowsSBI(lines: string[], headerRowIndex: number): TransactionRow[] {
  const header = parseCsvLine(lines[headerRowIndex]);
  const dateIndex = header.indexOf(TRANSACTION_DATE_COLUMN_NAME.SBI);
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

function parseTransactionRowsSBIBank(
  lines: string[],
  headerRowIndex: number
): TransactionRow[] {
  const header = parseCsvLine(lines[headerRowIndex]);
  const dateIndex = header.indexOf(TRANSACTION_DATE_COLUMN_NAME.SBI_BANK);
  const outcomeIndex = header.indexOf('出金金額(円)');
  const incomeIndex = header.indexOf('入金金額(円)');
  const descriptionIndex = header.indexOf('内容');

  const rows: TransactionRow[] = [];
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) {
      break;
    }
    const fields = parseCsvLine(rawLine);

    // SBIハイブリッド預金への振替は除外
    if (fields[descriptionIndex] === 'ＳＢＩハイブリッド預金') {
      continue;
    }

    // 入出金タイプと金額を判定(未使用側の列が""ではなく"0"になっている明細もあるため、
    // 文字列の真偽値ではなく実際の金額で判定する)
    const outcomeAmount = Number((fields[outcomeIndex] ?? '0').replace(/,/g, '')) || 0;
    const incomeAmount = Number((fields[incomeIndex] ?? '0').replace(/,/g, '')) || 0;
    const transactionType = outcomeAmount !== 0 ? '出金' : '入金';
    const amount = transactionType === '出金' ? outcomeAmount : incomeAmount;

    rows.push({
      rawLine,
      date: fields[dateIndex] ?? '',
      transactionType,
      description: fields[descriptionIndex] ?? '',
      amount,
    });
  }
  return rows;
}

// 円貨: "株式配当金 XXX" → 銘柄名はXXX。銘柄IDは当月資産状況シートを銘柄名で検索して取得する。
// 外貨: " SHLD 銘柄名:GLX防衛テックETF" → 先頭トークンが銘柄ID(ティッカー)。銘柄名は当月資産状況シートをティッカーで検索して取得する。
export function extractNameAndSymbol(
  currency: CurrencyType,
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

async function appendNewRecords<T extends { id: string }>(
  spreadsheetId: string,
  sheetName: string,
  titleRowRange: string,
  candidates: T[],
  toRow: (record: T) => (string | number)[]
): Promise<number> {
  if (candidates.length === 0) {
    return 0;
  }

  const sheet = new GoogleSpreadSheet();
  await sheet.open(spreadsheetId);
  try {
    const { values } = await sheet.readDataRecords(sheetName, titleRowRange, 0);
    const existingIds = new Set(values.slice(1).map((row) => String(row[0] ?? '')));

    const newRecords = candidates.filter((record) => !existingIds.has(record.id));
    if (newRecords.length === 0) {
      return 0;
    }

    await sheet.appendDataRecords(sheetName, titleRowRange, {
      values: newRecords.map(toRow),
    });

    return newRecords.length;
  } finally {
    sheet.close();
  }
}

function appendNewDividendRecords(
  spreadsheetId: string,
  candidates: DividendRecord[]
): Promise<number> {
  return appendNewRecords(
    spreadsheetId,
    DIVIDEND_HISTORY_SHEET_NAME,
    DIVIDEND_HISTORY_TITLE_ROW_RANGE,
    candidates,
    (record) => [
      record.id,
      record.date,
      record.securitiesCompanyName,
      record.symbol,
      record.name,
      record.account,
      record.amount,
      record.currency,
    ]
  );
}

function appendNewCashFlowRecords(
  spreadsheetId: string,
  candidates: CashFlowRecord[]
): Promise<number> {
  return appendNewRecords(
    spreadsheetId,
    CASH_FLOW_HISTORY_SHEET_NAME,
    CASH_FLOW_HISTORY_TITLE_ROW_RANGE,
    candidates,
    (record) => [
      record.id,
      record.date,
      record.transactionType,
      record.securitiesCompanyName,
      record.accountHolderName,
      record.accountType,
      record.amount,
      record.currency,
      record.note,
    ]
  );
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
    return errorResponse(400, `format must be one of: ${TRANSACTION_FORMAT_TYPE.join(', ')}`);
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

  let currency: CurrencyType;
  let headerRowIndex: number;
  try {
    currency = detectCurrency(lines, format);
    headerRowIndex = findTransactionHeaderRowIndex(lines, format);
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(400, error.message);
    }
    throw error;
  }

  const transactionRows = parseTransactionRows(lines, headerRowIndex, format).filter((row) =>
    TARGET_TRANSACTION_TYPES.has(row.transactionType)
  );

  const spreadsheetId = process.env.STOCK_PRICE_HISTORY_SPREADSHEET_ID;
  if (!spreadsheetId) {
    context.log('STOCK_PRICE_HISTORY_SPREADSHEET_ID must be set');
    return errorResponse(500, 'STOCK_PRICE_HISTORY_SPREADSHEET_ID must be set');
  }

  try {
    let addedCount: number;

    if (format === 'SBI') {
      const { nameToSymbol, symbolToName } = await lookupStockNameAndSymbol(spreadsheetId);

      const candidates: DividendRecord[] = transactionRows.map((row) => {
        const extracted = extractNameAndSymbol(currency, row.description);
        const name =
          currency === 'JPY' ? extracted.name : (symbolToName.get(extracted.symbol) ?? '');
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

      addedCount = await appendNewDividendRecords(spreadsheetId, candidates);
    } else {
      const candidates: CashFlowRecord[] = transactionRows.map((row) => ({
        id: generateId(row.rawLine),
        date: row.date,
        transactionType: row.transactionType,
        securitiesCompanyName: 'SBI証券',
        accountHolderName: account,
        accountType: '一般',
        amount: row.amount,
        currency,
        note: '',
      }));

      addedCount = await appendNewCashFlowRecords(spreadsheetId, candidates);
    }

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

import { InvocationContext } from '@azure/functions';
import { dateStringToSheetsSerial } from './date';
import { AppendResult, DataRecords, GoogleSpreadSheet } from './googleSpreadSheet';

export interface StockPriceRecordData {
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
  evaluationAmount?: number; // 評価額
  evaluationProfitLoss?: number; // 評価損益
}

export const STOCK_PRICE_HISTORY_SHEET_NAME = '月次資産状況履歴';
export const STOCK_PRICE_HISTORY_TITLE_ROW_RANGE = 'A1:N1';

/**
 * 売却済みなど保有口数0の銘柄は履歴として不要なため除外する。
 * 空欄(NaN/undefined)の行は従来どおり履歴に残すため、明示的に 0 の行だけを対象とする。
 */
export function filterNonZeroHolding(records: StockPriceRecordData[]): StockPriceRecordData[] {
  return records.filter((record) => record.holdingQuantity !== 0);
}

/**
 * - A列: date
 * - B列: assetClass
 * - C列: securitiesCompanyName
 * - D列: symbol
 * - E列: name
 * - F列: market
 * - G列: accountName
 * - H列: accountType
 * - I列: currency
 * - J列: holdingQuantity
 * - K列: acquisitionUnitPrice
 * - L列: currentUnitPrice
 * - M列: evaluationAmount
 * - N列: evaluationProfitLoss
 */
export function buildStockPriceHistoryValues(
  records: StockPriceRecordData[]
): DataRecords['values'] {
  return records.map((record) => [
    record.date ? dateStringToSheetsSerial(record.date) : null,
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
    record.evaluationAmount ?? null,
    record.evaluationProfitLoss ?? null,
  ]);
}

/**
 * 月末処理で当月資産状況を月次資産状況履歴シートへ追記する。
 * 評価額/評価損益はオーケストレーター側で当月資産状況の行indexに合わせて結合済みのため、
 * index がずれないよう結合後のここでフィルタする。
 */
export async function appendMonthlyStockPriceHistory(
  sheet: Pick<GoogleSpreadSheet, 'appendDataRecords'>,
  records: StockPriceRecordData[],
  context: InvocationContext
): Promise<AppendResult> {
  const targetRecords = filterNonZeroHolding(records);
  const excludedCount = records.length - targetRecords.length;
  context.log(`Excluded zero-holding records from stock price history: count=${excludedCount}`);

  if (targetRecords.length === 0) {
    context.log('No stock price history records to append');
    return { range: '', rowCount: 0 };
  }

  return await sheet.appendDataRecords(
    STOCK_PRICE_HISTORY_SHEET_NAME,
    STOCK_PRICE_HISTORY_TITLE_ROW_RANGE,
    { values: buildStockPriceHistoryValues(targetRecords) }
  );
}

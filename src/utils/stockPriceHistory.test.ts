import { InvocationContext } from '@azure/functions';
import { describe, expect, it, vi } from 'vitest';
import { dateStringToSheetsSerial } from './date';
import {
  appendMonthlyStockPriceHistory,
  buildStockPriceHistoryValues,
  filterNonZeroHolding,
  StockPriceRecordData,
  STOCK_PRICE_HISTORY_SHEET_NAME,
  STOCK_PRICE_HISTORY_TITLE_ROW_RANGE,
} from './stockPriceHistory';

const DATE = '2026/10/31';

// Issue #21 で指定されたテスト用銘柄。保有口数・単価・評価額はダミー値。
function buildRecords(quantities: [number, number, number, number, number, number]) {
  const base: Omit<StockPriceRecordData, 'holdingQuantity'>[] = [
    {
      assetClass: '国内株式',
      securitiesCompanyName: 'SBI証券',
      symbol: '2198',
      name: 'アイ・ケイ・ケイホールディングス',
      market: 'TSE',
      accountName: '高橋充',
      accountType: '特定',
      currency: 'JPY',
      acquisitionUnitPrice: 800,
      currentUnitPrice: 900,
      evaluationAmount: 90000,
      evaluationProfitLoss: 10000,
    },
    {
      assetClass: '海外株式',
      securitiesCompanyName: 'SBI証券',
      symbol: '0331418A',
      name: 'ｅＭＡＸＩＳ　Ｓｌｉｍ　全世界株式（オール・カントリー）',
      market: 'JIAA',
      accountName: '高橋充',
      accountType: 'NISA',
      currency: 'JPY',
      acquisitionUnitPrice: 20000,
      currentUnitPrice: 30000,
      evaluationAmount: 300000,
      evaluationProfitLoss: 100000,
    },
    {
      assetClass: '海外株式',
      securitiesCompanyName: 'SBI証券',
      symbol: 'SPCX',
      name: 'スペースX A株',
      market: 'NASDAQ',
      accountName: '高橋充',
      accountType: '特定',
      currency: 'USD',
      acquisitionUnitPrice: 100,
      currentUnitPrice: 150,
      evaluationAmount: 1500,
      evaluationProfitLoss: 500,
    },
    {
      assetClass: '海外株式',
      securitiesCompanyName: 'SBI証券',
      symbol: '0331418A',
      name: 'ｅＭＡＸＩＳ　Ｓｌｉｍ　全世界株式（オール・カントリー）',
      market: 'JIAA',
      accountName: '高橋恵',
      accountType: 'NISA',
      currency: 'JPY',
      acquisitionUnitPrice: 21000,
      currentUnitPrice: 30000,
      evaluationAmount: 150000,
      evaluationProfitLoss: 45000,
    },
    {
      assetClass: '純金',
      securitiesCompanyName: '田中貴金属',
      symbol: 'GOLD',
      name: '純金',
      accountName: '高橋充',
      accountType: '一般',
      currency: 'JPY',
      acquisitionUnitPrice: 10000,
      evaluationAmount: 200000,
      evaluationProfitLoss: 50000,
    },
    {
      assetClass: '仮想通貨',
      securitiesCompanyName: 'SBI VCトレード',
      symbol: 'BTC',
      name: 'ビットコイン',
      accountName: '高橋充',
      accountType: '一般',
      currency: 'JPY',
      acquisitionUnitPrice: 5000000,
      evaluationAmount: 1000000,
      evaluationProfitLoss: 200000,
    },
  ];
  return base.map((record, index) => ({
    ...record,
    date: DATE,
    holdingQuantity: quantities[index],
  }));
}

function createContext(): InvocationContext {
  return new InvocationContext({ functionName: 'test', invocationId: 'test' });
}

function createSheet() {
  return {
    appendDataRecords: vi.fn(async () => ({ range: '月次資産状況履歴!A2:N4', rowCount: 3 })),
  };
}

function keyOf(row: unknown[]): string {
  // 銘柄ID(D列) + 名義(G列) で行を特定する
  return `${String(row[3])}/${String(row[6])}`;
}

describe('filterNonZeroHolding', () => {
  it('保有口数0の行だけを除外する', () => {
    const records = buildRecords([0, 10, 0, 5, 0, 1]);
    const result = filterNonZeroHolding(records);
    expect(result.map((r) => `${r.symbol}/${r.accountName}`)).toEqual([
      '0331418A/高橋充',
      '0331418A/高橋恵',
      'BTC/高橋充',
    ]);
  });

  it('保有口数が空欄(undefined/NaN)の行は現行どおり除外しない', () => {
    const [first, second] = buildRecords([1, 1, 1, 1, 1, 1]);
    const records = [
      { ...first, holdingQuantity: undefined },
      { ...second, holdingQuantity: NaN },
    ];
    expect(filterNonZeroHolding(records)).toHaveLength(2);
  });
});

describe('buildStockPriceHistoryValues', () => {
  it('14列の行を A〜N列の順序で生成する', () => {
    const [, , spcx, , gold] = buildRecords([1, 1, 3, 1, 2, 1]);
    expect(buildStockPriceHistoryValues([spcx, gold])).toEqual([
      [
        dateStringToSheetsSerial(DATE),
        '海外株式',
        'SBI証券',
        'SPCX',
        'スペースX A株',
        'NASDAQ',
        '高橋充',
        '特定',
        'USD',
        3,
        100,
        150,
        1500,
        500,
      ],
      [
        dateStringToSheetsSerial(DATE),
        '純金',
        '田中貴金属',
        'GOLD',
        '純金',
        null,
        '高橋充',
        '一般',
        'JPY',
        2,
        10000,
        null,
        200000,
        50000,
      ],
    ]);
  });
});

describe('appendMonthlyStockPriceHistory', () => {
  it('パターンA: 2198・SPCX・GOLDが0のとき、それ以外の3行だけを月次資産状況履歴に追記する', async () => {
    const records = buildRecords([0, 10, 0, 5, 0, 1]);
    const sheet = createSheet();

    await appendMonthlyStockPriceHistory(sheet, records, createContext());

    expect(sheet.appendDataRecords).toHaveBeenCalledTimes(1);
    const [sheetName, range, data] = sheet.appendDataRecords.mock.calls[0];
    expect(sheetName).toBe(STOCK_PRICE_HISTORY_SHEET_NAME);
    expect(range).toBe(STOCK_PRICE_HISTORY_TITLE_ROW_RANGE);
    expect(data.values.map(keyOf)).toEqual(['0331418A/高橋充', '0331418A/高橋恵', 'BTC/高橋充']);
    // 1以上の行は現行の変換結果と同一であること
    expect(data.values).toEqual(buildStockPriceHistoryValues([records[1], records[3], records[5]]));
  });

  it('パターンB: eMAXIS(高橋充・高橋恵)とBTCが0のとき、それ以外の3行だけを月次資産状況履歴に追記する', async () => {
    const records = buildRecords([100, 0, 2, 0, 3, 0]);
    const sheet = createSheet();

    await appendMonthlyStockPriceHistory(sheet, records, createContext());

    const [, , data] = sheet.appendDataRecords.mock.calls[0];
    expect(data.values.map(keyOf)).toEqual(['2198/高橋充', 'SPCX/高橋充', 'GOLD/高橋充']);
    expect(data.values).toEqual(buildStockPriceHistoryValues([records[0], records[2], records[4]]));
  });

  it('パターンC: 同一銘柄IDでも名義ごとに保有口数を判定する(高橋充のeMAXISのみ0)', async () => {
    const records = buildRecords([1, 0, 1, 7, 1, 1]);
    const sheet = createSheet();

    await appendMonthlyStockPriceHistory(sheet, records, createContext());

    const [, , data] = sheet.appendDataRecords.mock.calls[0];
    expect(data.values.map(keyOf)).toEqual([
      '2198/高橋充',
      'SPCX/高橋充',
      '0331418A/高橋恵',
      'GOLD/高橋充',
      'BTC/高橋充',
    ]);
  });

  it('全行が1以上のときは全6行を現行どおり追記する', async () => {
    const records = buildRecords([1, 2, 3, 4, 5, 6]);
    const sheet = createSheet();

    await appendMonthlyStockPriceHistory(sheet, records, createContext());

    const [, , data] = sheet.appendDataRecords.mock.calls[0];
    expect(data.values).toEqual(buildStockPriceHistoryValues(records));
  });

  it('全行が0のときは追記APIを呼ばない', async () => {
    const records = buildRecords([0, 0, 0, 0, 0, 0]);
    const sheet = createSheet();

    const result = await appendMonthlyStockPriceHistory(sheet, records, createContext());

    expect(sheet.appendDataRecords).not.toHaveBeenCalled();
    expect(result).toEqual({ range: '', rowCount: 0 });
  });
});

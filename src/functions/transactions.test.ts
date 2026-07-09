import { describe, expect, it } from 'vitest';
import {
  decodeBase64Csv,
  detectCurrency,
  extractNameAndSymbol,
  findTransactionHeaderRowIndex,
  generateId,
  isSupportedFormat,
  parseTransactionRows,
  splitCsvLines,
  ValidationError,
} from './transactions';

const JPY_CSV = [
  '',
  '円貨入出金明細',
  '',
  '指定期間,指定期間(開始),指定期間(終了),スィープ専用銀行口座 明細表示,指定取引区分,明細数',
  '"最新10明細","-","-","なし","入金：すべて、出金：すべて","10"',
  '',
  '出金額合計,うち振替出金,入金額合計,うち振替入金',
  '"19445","0","41164","0"',
  '',
  '入出金日,取引,区分,摘要,出金額,入金額',
  '"2026/06/30","入金","利金・配当金","株式配当金 東京海上ホールディングス","0","8966"',
  '"2026/06/23","出金","その他","譲渡益税源泉徴収金","19445","0"',
  '"2026/06/22","入金","利金・配当金","株式配当金 三菱商事","0","8766"',
].join('\n');

const USD_CSV = [
  '',
  '外貨入出金明細',
  '',
  '指定期間,指定期間(開始),指定期間(終了),指定取引区分,指定通貨,明細数',
  '"最新10明細","-","-","すべて","すべて","10"',
  '',
  '入出金日,取引,区分,通貨,摘要,出金額,入金額',
  '"2026/07/08","入金","分配金","米ドル"," SHLD 銘柄名:GLX防衛テックETF","0","11.02"',
  '"2026/05/11","入金","-","-","入出金振替","0","188636.00"',
].join('\n');

describe('isSupportedFormat', () => {
  it('accepts SBI', () => {
    expect(isSupportedFormat('SBI')).toBe(true);
  });

  it('rejects unsupported formats', () => {
    expect(isSupportedFormat('RAKUTEN')).toBe(false);
  });
});

describe('decodeBase64Csv', () => {
  it('decodes a base64-encoded utf8 CSV payload', () => {
    const encoded = Buffer.from(JPY_CSV, 'utf8').toString('base64');
    expect(decodeBase64Csv(encoded)).toBe(JPY_CSV);
  });

  it('decodes multi-byte Japanese characters correctly', () => {
    const encoded = Buffer.from('円貨入出金明細', 'utf8').toString('base64');
    expect(decodeBase64Csv(encoded)).toBe('円貨入出金明細');
  });
});

describe('detectCurrency', () => {
  it('detects JPY from a 円貨入出金明細 statement', () => {
    expect(detectCurrency(splitCsvLines(JPY_CSV))).toBe('JPY');
  });

  it('detects USD from a 外貨入出金明細 statement', () => {
    expect(detectCurrency(splitCsvLines(USD_CSV))).toBe('USD');
  });

  it('throws ValidationError when the title row does not match', () => {
    expect(() => detectCurrency(['', 'something else'])).toThrow(ValidationError);
  });
});

describe('findTransactionHeaderRowIndex', () => {
  it('finds the 入出金日 header row within the JPY statement', () => {
    expect(findTransactionHeaderRowIndex(splitCsvLines(JPY_CSV))).toBe(9);
  });

  it('finds the 入出金日 header row within the USD statement', () => {
    expect(findTransactionHeaderRowIndex(splitCsvLines(USD_CSV))).toBe(6);
  });

  it('throws ValidationError when no header row is found within 15 rows', () => {
    const lines = new Array(20).fill('"x","y"');
    expect(() => findTransactionHeaderRowIndex(lines)).toThrow(ValidationError);
  });
});

describe('parseTransactionRows', () => {
  it('parses JPY data rows including non-target rows', () => {
    const lines = splitCsvLines(JPY_CSV);
    const rows = parseTransactionRows(lines, findTransactionHeaderRowIndex(lines));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      date: '2026/06/30',
      transactionType: '利金・配当金',
      description: '株式配当金 東京海上ホールディングス',
      amount: 8966,
    });
    expect(rows[1]).toMatchObject({ transactionType: 'その他', amount: 0 });
  });

  it('parses USD data rows', () => {
    const lines = splitCsvLines(USD_CSV);
    const rows = parseTransactionRows(lines, findTransactionHeaderRowIndex(lines));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: '2026/07/08',
      transactionType: '分配金',
      description: ' SHLD 銘柄名:GLX防衛テックETF',
      amount: 11.02,
    });
  });

  it('stops at the first blank line after the header', () => {
    const lines = splitCsvLines(JPY_CSV + '\n\n"2026/01/01","入金","利金・配当金","x","0","1"');
    const rows = parseTransactionRows(lines, findTransactionHeaderRowIndex(lines));
    expect(rows).toHaveLength(3);
  });
});

describe('extractNameAndSymbol', () => {
  it('extracts the stock name for JPY descriptions', () => {
    expect(extractNameAndSymbol('JPY', '株式配当金 東京海上ホールディングス')).toEqual({
      name: '東京海上ホールディングス',
      symbol: '',
    });
  });

  it('extracts the ticker for USD descriptions', () => {
    expect(extractNameAndSymbol('USD', ' SHLD 銘柄名:GLX防衛テックETF')).toEqual({
      name: '',
      symbol: 'SHLD',
    });
  });

  it('returns blanks when a USD description does not match the expected pattern', () => {
    expect(extractNameAndSymbol('USD', '現地源泉税還付 iS テック')).toEqual({
      name: '',
      symbol: '',
    });
  });
});

describe('generateId', () => {
  it('is deterministic for the same raw CSV line', () => {
    const line =
      '"2026/06/30","入金","利金・配当金","株式配当金 東京海上ホールディングス","0","8966"';
    expect(generateId(line)).toBe(generateId(line));
  });

  it('differs for different raw CSV lines', () => {
    const a = '"2026/06/30","入金","利金・配当金","株式配当金 東京海上ホールディングス","0","8966"';
    const b = '"2026/06/22","入金","利金・配当金","株式配当金 三菱商事","0","8766"';
    expect(generateId(a)).not.toBe(generateId(b));
  });
});

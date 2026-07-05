import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_SPREADSHEET_ID = '1S8SraJt0VFfoiIWCTz0wsVZIiA7ETW025CmMTcU2wyU';

const {
  authorizeMock,
  JWTMock,
  sheetsMock,
  spreadsheetsGetMock,
  valuesGetMock,
  valuesAppendMock,
} = vi.hoisted(() => {
  const authorizeMock = vi.fn().mockResolvedValue(undefined);
  const JWTMock = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    options: Record<string, unknown>
  ) {
    Object.assign(this, options, { authorize: authorizeMock });
  });
  const spreadsheetsGetMock = vi.fn().mockResolvedValue({});
  const valuesGetMock = vi.fn().mockResolvedValue({ data: {} });
  const valuesAppendMock = vi.fn().mockResolvedValue({ data: {} });
  const sheetsMock = vi.fn().mockReturnValue({
    spreadsheets: {
      get: spreadsheetsGetMock,
      values: { get: valuesGetMock, append: valuesAppendMock },
    },
  });
  return {
    authorizeMock,
    JWTMock,
    sheetsMock,
    spreadsheetsGetMock,
    valuesGetMock,
    valuesAppendMock,
  };
});

vi.mock('googleapis', () => ({
  google: {
    auth: { JWT: JWTMock },
    sheets: sheetsMock,
  },
}));

import { GoogleSpreadSheet } from './googleSpreadSheet';

describe('GoogleSpreadSheet', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('open', () => {
    it('GOOGLE_CLIENT_EMAILが未設定の場合はエラーを投げる', async () => {
      delete process.env.GOOGLE_CLIENT_EMAIL;
      process.env.GOOGLE_PRIVATE_KEY = 'private-key';

      const sheet = new GoogleSpreadSheet();

      await expect(sheet.open('sheet-id')).rejects.toThrow(
        'GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY must be set'
      );
    });

    it('GOOGLE_PRIVATE_KEYが未設定の場合はエラーを投げる', async () => {
      process.env.GOOGLE_CLIENT_EMAIL = 'test@example.com';
      delete process.env.GOOGLE_PRIVATE_KEY;

      const sheet = new GoogleSpreadSheet();

      await expect(sheet.open('sheet-id')).rejects.toThrow(
        'GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY must be set'
      );
    });

    it('環境変数の認証情報でJWT認証を行い、Sheetsクライアントを初期化する', async () => {
      process.env.GOOGLE_CLIENT_EMAIL = 'test@example.com';
      process.env.GOOGLE_PRIVATE_KEY =
        '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n';

      const sheet = new GoogleSpreadSheet();
      await sheet.open(TEST_SPREADSHEET_ID);

      expect(JWTMock).toHaveBeenCalledWith({
        email: 'test@example.com',
        key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      expect(authorizeMock).toHaveBeenCalledOnce();
      expect(sheetsMock).toHaveBeenCalledWith({
        version: 'v4',
        auth: expect.anything(),
      });
      expect(spreadsheetsGetMock).toHaveBeenCalledWith({
        spreadsheetId: TEST_SPREADSHEET_ID,
      });
    });
  });

  describe('close', () => {
    it('open()を呼ばずにclose()を呼んでもエラーにならない', () => {
      const sheet = new GoogleSpreadSheet();

      expect(() => sheet.close()).not.toThrow();
    });

    it('open()の後にclose()を呼んでもエラーにならない', async () => {
      process.env.GOOGLE_CLIENT_EMAIL = 'test@example.com';
      process.env.GOOGLE_PRIVATE_KEY = 'private-key';

      const sheet = new GoogleSpreadSheet();
      await sheet.open('sheet-id');

      expect(() => sheet.close()).not.toThrow();
    });
  });

  describe('readDataRecords', () => {
    const SHEET_NAME = 'シート1';

    const openSheet = async (): Promise<GoogleSpreadSheet> => {
      process.env.GOOGLE_CLIENT_EMAIL = 'test@example.com';
      process.env.GOOGLE_PRIVATE_KEY = 'private-key';

      const sheet = new GoogleSpreadSheet();
      await sheet.open(TEST_SPREADSHEET_ID);
      return sheet;
    };

    it('open()を呼んでいない場合はエラーを投げる', async () => {
      const sheet = new GoogleSpreadSheet();

      await expect(sheet.readDataRecords(SHEET_NAME, 'A1:B1', 1)).rejects.toThrow(
        'GoogleSpreadSheet is not open. Call open() first'
      );
    });

    it('sheetNameが空文字列の場合はエラーを投げる', async () => {
      const sheet = await openSheet();

      await expect(sheet.readDataRecords('', 'A1:B1', 1)).rejects.toThrow(
        'sheetName must not be empty'
      );
    });

    it('titleRowRangeがA1形式でない場合はエラーを投げる', async () => {
      const sheet = await openSheet();

      await expect(sheet.readDataRecords(SHEET_NAME, 'invalid-range', 1)).rejects.toThrow(
        'titleRowRange must be a single row A1 notation range, e.g. "A1:D1"'
      );
    });

    it('titleRowRangeが複数行にまたがる場合はエラーを投げる', async () => {
      const sheet = await openSheet();

      await expect(sheet.readDataRecords(SHEET_NAME, 'A1:B2', 1)).rejects.toThrow(
        'titleRowRange must span exactly one row'
      );
    });

    it('readRowNumが負数の場合はエラーを投げる', async () => {
      const sheet = await openSheet();

      await expect(sheet.readDataRecords(SHEET_NAME, 'A1:B1', -1)).rejects.toThrow(
        'readRowNum must not be negative'
      );
    });

    it('指定したシートが存在しない場合はエラーを投げる', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: '別のシート' } }] },
      });

      await expect(sheet.readDataRecords(SHEET_NAME, 'A1:B1', 1)).rejects.toThrow(
        `Sheet "${SHEET_NAME}" does not exist`
      );
    });

    it('取得したデータが空の場合はエラーを投げる', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: SHEET_NAME } }] },
      });
      valuesGetMock.mockResolvedValueOnce({ data: {} });

      await expect(sheet.readDataRecords(SHEET_NAME, 'A1:B1', 1)).rejects.toThrow(
        /No data found for range/
      );
    });

    it('readRowNum=1の場合、タイトル行のみのレンジを取得する', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: SHEET_NAME } }] },
      });
      valuesGetMock.mockResolvedValueOnce({ data: { values: [['col1', 'col2']] } });

      const result = await sheet.readDataRecords(SHEET_NAME, 'A1:B1', 1);

      expect(valuesGetMock).toHaveBeenCalledWith({
        spreadsheetId: TEST_SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:B1`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
      expect(result).toEqual({ values: [['col1', 'col2']] });
    });

    it('readRowNum>1の場合、開始行からreadRowNum分のレンジを取得する', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: SHEET_NAME } }] },
      });
      valuesGetMock.mockResolvedValueOnce({
        data: { values: [['col1', 'col2'], ['a', 'b'], ['c', 'd']] },
      });

      await sheet.readDataRecords(SHEET_NAME, 'A1:B1', 3);

      expect(valuesGetMock).toHaveBeenCalledWith({
        spreadsheetId: TEST_SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:B3`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
    });

    it('readRowNumが非整数の場合は切り下げて整数として扱う', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: SHEET_NAME } }] },
      });
      valuesGetMock.mockResolvedValueOnce({ data: { values: [['col1', 'col2'], ['a', 'b']] } });

      await sheet.readDataRecords(SHEET_NAME, 'A1:B1', 2.9);

      expect(valuesGetMock).toHaveBeenCalledWith({
        spreadsheetId: TEST_SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:B2`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
    });

    it('readRowNum=0の場合、終了行を省略したオープンレンジを取得する', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: SHEET_NAME } }] },
      });
      valuesGetMock.mockResolvedValueOnce({ data: { values: [['col1', 'col2'], ['a', 'b']] } });

      await sheet.readDataRecords(SHEET_NAME, 'A1:B1', 0);

      expect(valuesGetMock).toHaveBeenCalledWith({
        spreadsheetId: TEST_SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:B`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });
    });

    it('空のセルがある行はタイトル行の列数に合わせてnullで埋める', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: SHEET_NAME } }] },
      });
      valuesGetMock.mockResolvedValueOnce({
        data: {
          values: [
            ['col1', 'col2', 'col3'],
            ['a'],
            ['b', 'c', 'd', 'e'],
          ],
        },
      });

      const result = await sheet.readDataRecords(SHEET_NAME, 'A1:C1', 3);

      expect(result).toEqual({
        values: [
          ['col1', 'col2', 'col3'],
          ['a', null, null],
          ['b', 'c', 'd'],
        ],
      });
    });
  });

  describe('appendDataRecords', () => {
    const SHEET_NAME = 'シート1';

    const openSheet = async (): Promise<GoogleSpreadSheet> => {
      process.env.GOOGLE_CLIENT_EMAIL = 'test@example.com';
      process.env.GOOGLE_PRIVATE_KEY = 'private-key';

      const sheet = new GoogleSpreadSheet();
      await sheet.open(TEST_SPREADSHEET_ID);
      return sheet;
    };

    it('open()を呼んでいない場合はエラーを投げる', async () => {
      const sheet = new GoogleSpreadSheet();

      await expect(
        sheet.appendDataRecords(SHEET_NAME, 'A1:B1', { values: [['a', 'b']] })
      ).rejects.toThrow('GoogleSpreadSheet is not open. Call open() first');
    });

    it('sheetNameが空文字列の場合はエラーを投げる', async () => {
      const sheet = await openSheet();

      await expect(
        sheet.appendDataRecords('', 'A1:B1', { values: [['a', 'b']] })
      ).rejects.toThrow('sheetName must not be empty');
    });

    it('titleRowRangeがA1形式でない場合はエラーを投げる', async () => {
      const sheet = await openSheet();

      await expect(
        sheet.appendDataRecords(SHEET_NAME, 'invalid-range', { values: [['a', 'b']] })
      ).rejects.toThrow('titleRowRange must be a single row A1 notation range, e.g. "A1:D1"');
    });

    it('titleRowRangeが複数行にまたがる場合はエラーを投げる', async () => {
      const sheet = await openSheet();

      await expect(
        sheet.appendDataRecords(SHEET_NAME, 'A1:B2', { values: [['a', 'b']] })
      ).rejects.toThrow('titleRowRange must span exactly one row');
    });

    it('data.valuesにundefinedのセルが含まれる場合はエラーを投げる', async () => {
      const sheet = await openSheet();

      await expect(
        sheet.appendDataRecords(SHEET_NAME, 'A1:B1', {
          values: [['a', undefined as unknown as string]],
        })
      ).rejects.toThrow('data.values must not contain undefined cells');
    });

    it('data.valuesが空配列の場合は何もせず終了する', async () => {
      const sheet = await openSheet();
      const spreadsheetsGetCallsAfterOpen = spreadsheetsGetMock.mock.calls.length;

      const result = await sheet.appendDataRecords(SHEET_NAME, 'A1:B1', { values: [] });

      expect(result).toEqual({ range: '', appendedRowCount: 0 });
      expect(spreadsheetsGetMock).toHaveBeenCalledTimes(spreadsheetsGetCallsAfterOpen);
      expect(valuesAppendMock).not.toHaveBeenCalled();
    });

    it('指定したシートが存在しない場合はエラーを投げる', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: '別のシート' } }] },
      });

      await expect(
        sheet.appendDataRecords(SHEET_NAME, 'A1:B1', { values: [['a', 'b']] })
      ).rejects.toThrow(`Sheet "${SHEET_NAME}" does not exist`);
    });

    it('APIレスポンスにupdatesが含まれない場合はエラーを投げる', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: SHEET_NAME } }] },
      });
      valuesAppendMock.mockResolvedValueOnce({ data: {} });

      await expect(
        sheet.appendDataRecords(SHEET_NAME, 'A1:B1', { values: [['a', 'b']] })
      ).rejects.toThrow('Failed to append data records: unexpected response from Sheets API');
    });

    it('終了行を省略したオープンレンジに対してRAW・OVERWRITEで追記する', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: SHEET_NAME } }] },
      });
      valuesAppendMock.mockResolvedValueOnce({
        data: { updates: { updatedRange: `${SHEET_NAME}!A3:B3`, updatedRows: 1 } },
      });

      const result = await sheet.appendDataRecords(SHEET_NAME, 'A1:B1', {
        values: [['a', 1]],
      });

      expect(valuesAppendMock).toHaveBeenCalledWith({
        spreadsheetId: TEST_SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:B`,
        valueInputOption: 'RAW',
        insertDataOption: 'OVERWRITE',
        requestBody: { values: [['a', 1]] },
      });
      expect(result).toEqual({ range: `${SHEET_NAME}!A3:B3`, appendedRowCount: 1 });
    });

    it('複数行のデータを一括で追記する', async () => {
      const sheet = await openSheet();
      spreadsheetsGetMock.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: SHEET_NAME } }] },
      });
      valuesAppendMock.mockResolvedValueOnce({
        data: { updates: { updatedRange: `${SHEET_NAME}!A3:B4`, updatedRows: 2 } },
      });

      const result = await sheet.appendDataRecords(SHEET_NAME, 'A1:B1', {
        values: [
          ['a', 1],
          ['b', 2],
        ],
      });

      expect(valuesAppendMock).toHaveBeenCalledWith({
        spreadsheetId: TEST_SPREADSHEET_ID,
        range: `${SHEET_NAME}!A1:B`,
        valueInputOption: 'RAW',
        insertDataOption: 'OVERWRITE',
        requestBody: {
          values: [
            ['a', 1],
            ['b', 2],
          ],
        },
      });
      expect(result).toEqual({ range: `${SHEET_NAME}!A3:B4`, appendedRowCount: 2 });
    });
  });
});

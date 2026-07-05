import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_SPREADSHEET_ID = '1S8SraJt0VFfoiIWCTz0wsVZIiA7ETW025CmMTcU2wyU';

const { authorizeMock, JWTMock, sheetsMock, spreadsheetsGetMock } = vi.hoisted(() => {
  const authorizeMock = vi.fn().mockResolvedValue(undefined);
  const JWTMock = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    options: Record<string, unknown>
  ) {
    Object.assign(this, options, { authorize: authorizeMock });
  });
  const spreadsheetsGetMock = vi.fn().mockResolvedValue({});
  const sheetsMock = vi.fn().mockReturnValue({
    spreadsheets: { get: spreadsheetsGetMock },
  });
  return { authorizeMock, JWTMock, sheetsMock, spreadsheetsGetMock };
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
});

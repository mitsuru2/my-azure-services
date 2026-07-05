import { describe, it, expect } from 'vitest';
import { GoogleSpreadSheet } from './googleSpreadSheet';

// googleSpreadSheet.test.ts の TEST_SPREADSHEET_ID と同じテスト用スプレッドシート
const TEST_SPREADSHEET_ID = '1S8SraJt0VFfoiIWCTz0wsVZIiA7ETW025CmMTcU2wyU';

const hasCredentials =
  Boolean(process.env.GOOGLE_CLIENT_EMAIL) && Boolean(process.env.GOOGLE_PRIVATE_KEY);

describe.skipIf(!hasCredentials)('GoogleSpreadSheet (integration)', () => {
  it('実際のGoogle APIを使って指定したスプレッドシートをオープンできる', async () => {
    const sheet = new GoogleSpreadSheet();

    await expect(sheet.open(TEST_SPREADSHEET_ID)).resolves.toBeUndefined();

    sheet.close();
  });
});

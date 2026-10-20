import { describe, it, expect } from 'vitest';
import dockerNames from 'docker-names';
import { google } from 'googleapis';
import { GoogleSpreadSheet } from './googleSpreadSheet';

// googleSpreadSheet.test.ts の TEST_SPREADSHEET_ID と同じテスト用スプレッドシート
const TEST_SPREADSHEET_ID = '1pnjJKg96MB0e4baO_SAjXbkJf6q8cFWGHdTX00qA5xw';

const hasCredentials =
  Boolean(process.env.GOOGLE_CLIENT_EMAIL) && Boolean(process.env.GOOGLE_PRIVATE_KEY);

describe.skipIf(!hasCredentials)('GoogleSpreadSheet (integration)', () => {
  it('実際のGoogle APIを使って指定したスプレッドシートをオープンできる', async () => {
    const sheet = new GoogleSpreadSheet();

    await expect(sheet.open(TEST_SPREADSHEET_ID)).resolves.toBeUndefined();

    sheet.close();
  });

  describe('readDataRecords', () => {
    // price_list シートのA1を起点に記録されているテストデータ
    // ID,名前,Name,Value
    // j7agtc,バナナ,banana,158
    // i3bm5c,りんご,apple,298
    // e36qr9,ライチ,lychee,600
    // k52mdf,キウイ,,158
    // y8kpdn,オレンジ,orange,498
    // s9u2kx,すいか,watermelon,550
    // '000945,ぶどう,grape,498
    // j89cqe,さくらんぼ,cherry,
    // p6thfj,レモン,lemon,258
    // s93eqb,もも,peach,698
    // ,,,
    // e5hvpr,トマト,tomato,178
    // r2b9qe,玉ねぎ,onion,298
    const SHEET_NAME = 'price_list';

    const openSheet = async (): Promise<GoogleSpreadSheet> => {
      const sheet = new GoogleSpreadSheet();
      await sheet.open(TEST_SPREADSHEET_ID);
      return sheet;
    };

    it('readRowNum=1でタイトル行のみを読み込める', async () => {
      const sheet = await openSheet();

      const result = await sheet.readDataRecords(SHEET_NAME, 'A1:D1', 1);

      expect(result).toEqual({ values: [['ID', '名前', 'Name', 'Value']] });

      sheet.close();
    });

    it('readRowNumで指定した行数分を読み込める', async () => {
      const sheet = await openSheet();

      const result = await sheet.readDataRecords(SHEET_NAME, 'A1:D1', 3);

      expect(result).toEqual({
        values: [
          ['ID', '名前', 'Name', 'Value'],
          ['j7agtc', 'バナナ', 'banana', 158],
          ['i3bm5c', 'りんご', 'apple', 298],
        ],
      });

      sheet.close();
    });

    it('readRowNum=0で空行の直前までを読み込み、欠けたセルはnullで埋められる', async () => {
      const sheet = await openSheet();

      const result = await sheet.readDataRecords(SHEET_NAME, 'A1:D1', 0);

      expect(result).toEqual({
        values: [
          ['ID', '名前', 'Name', 'Value'],
          ['j7agtc', 'バナナ', 'banana', 158],
          ['i3bm5c', 'りんご', 'apple', 298],
          ['e36qr9', 'ライチ', 'lychee', 600],
          ['k52mdf', 'キウイ', '', 158],
          ['y8kpdn', 'オレンジ', 'orange', 498],
          ['s9u2kx', 'すいか', 'watermelon', 550],
          ['000945', 'ぶどう', 'grape', 498],
          ['j89cqe', 'さくらんぼ', 'cherry', null],
          ['p6thfj', 'レモン', 'lemon', 258],
          ['s93eqb', 'もも', 'peach', 698],
        ],
      });

      sheet.close();
    });

    it('存在しないシート名を指定するとエラーになる', async () => {
      const sheet = await openSheet();

      await expect(sheet.readDataRecords('not_exist_sheet', 'A1:D1', 1)).rejects.toThrow(
        'Sheet "not_exist_sheet" does not exist'
      );

      sheet.close();
    });
  });

  describe('appendDataRecords', () => {
    // タイトル行: timestamp, name, value, text
    // 削除APIが無いため、テスト実行のたびに末尾へ行が追記されていく
    const SHEET_NAME = 'append_test';

    const openSheet = async (): Promise<GoogleSpreadSheet> => {
      const sheet = new GoogleSpreadSheet();
      await sheet.open(TEST_SPREADSHEET_ID);
      return sheet;
    };

    it('1行分のデータをテーブル末尾に追記できる', async () => {
      const sheet = await openSheet();

      const timestamp = new Date().toISOString();
      const name = dockerNames.getRandomName();
      const value = Math.floor(Math.random() * 1000);
      const text = String(value).padStart(3, '0');

      const result = await sheet.appendDataRecords(SHEET_NAME, 'A1:D1', {
        values: [[timestamp, name, value, text]],
      });

      expect(result.rowCount).toBe(1);
      expect(result.range).toMatch(new RegExp(`^${SHEET_NAME}!A\\d+:D\\d+$`));

      const allRows = await sheet.readDataRecords(SHEET_NAME, 'A1:D1', 0);
      expect(allRows.values[allRows.values.length - 1]).toEqual([timestamp, name, value, text]);

      sheet.close();
    });
  });

  describe('appendDataRecords (日付書式)', () => {
    // Issue #31: 空の sand_box シートに追記し、日付列に yyyy/M/d の表示形式が明示的に設定されることを確認する。
    // 空シートでは直前行の書式を引き継げないため、書式を明示的に設定しない限り数値のまま表示される。
    const SHEET_NAME = 'sand_box';

    // 表示形式は readDataRecords (UNFORMATTED_VALUE) では確認できないため、Sheets API で直接取得する
    const readCellFormat = async (
      range: string
    ): Promise<{
      formattedValue?: string | null;
      pattern?: string | null;
      type?: string | null;
    }> => {
      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: (process.env.GOOGLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
      const sheets = google.sheets({ version: 'v4', auth });
      const response = await sheets.spreadsheets.get({
        spreadsheetId: TEST_SPREADSHEET_ID,
        ranges: [range],
        includeGridData: true,
        fields: 'sheets.data.rowData.values(formattedValue,userEnteredFormat.numberFormat)',
      });
      const cell = response.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0];
      return {
        formattedValue: cell?.formattedValue,
        pattern: cell?.userEnteredFormat?.numberFormat?.pattern,
        type: cell?.userEnteredFormat?.numberFormat?.type,
      };
    };

    it('dateColumnsを指定して追記すると、日付列がyyyy/M/d形式で表示される', async () => {
      const sheet = new GoogleSpreadSheet();
      await sheet.open(TEST_SPREADSHEET_ID);

      // 2026/6/15 のシリアル値
      const serial = 46188;
      const name = dockerNames.getRandomName();

      const result = await sheet.appendDataRecords(
        SHEET_NAME,
        'A1:C1',
        { values: [[name, serial, 300000]] },
        { dateColumns: ['B'] }
      );
      sheet.close();

      expect(result.rowCount).toBe(1);
      const match = /!A(\d+):C\d+$/.exec(result.range);
      expect(match).not.toBeNull();

      const format = await readCellFormat(`${SHEET_NAME}!B${match?.[1]}`);
      expect(format).toEqual({ formattedValue: '2026/6/15', pattern: 'yyyy/M/d', type: 'DATE' });
    });
  });

  describe('updateDataRecords', () => {
    // タイトル行: Property, Value
    // Number, 0
    // Alphabet, a
    const SHEET_NAME = 'update_test';

    const openSheet = async (): Promise<GoogleSpreadSheet> => {
      const sheet = new GoogleSpreadSheet();
      await sheet.open(TEST_SPREADSHEET_ID);
      return sheet;
    };

    const incrementAlphabet = (alphabet: string): string =>
      alphabet === 'z' ? 'a' : String.fromCharCode(alphabet.charCodeAt(0) + 1);

    it('既存の数字とアルファベットを読み込み、インクリメントした値で上書きできる', async () => {
      const sheet = await openSheet();

      const before = await sheet.readDataRecords(SHEET_NAME, 'A1:B1', 0);
      const currentNumber = before.values[1][1] as number;
      const currentAlphabet = before.values[2][1] as string;

      const nextNumber = currentNumber + 1;
      const nextAlphabet = incrementAlphabet(currentAlphabet);

      const result = await sheet.updateDataRecords(
        SHEET_NAME,
        'A1:B1',
        {
          values: [
            ['Number', nextNumber],
            ['Alphabet', nextAlphabet],
          ],
        },
        1
      );

      expect(result.rowCount).toBe(2);
      expect(result.range).toBe(`${SHEET_NAME}!A2:B3`);

      const after = await sheet.readDataRecords(SHEET_NAME, 'A1:B1', 0);
      expect(after.values[1]).toEqual(['Number', nextNumber]);
      expect(after.values[2]).toEqual(['Alphabet', nextAlphabet]);

      sheet.close();
    });
  });
});

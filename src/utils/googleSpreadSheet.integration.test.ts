import { describe, it, expect } from 'vitest';
import dockerNames from 'docker-names';
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

      expect(result.appendedRowCount).toBe(1);
      expect(result.range).toMatch(new RegExp(`^${SHEET_NAME}!A\\d+:D\\d+$`));

      const allRows = await sheet.readDataRecords(SHEET_NAME, 'A1:D1', 0);
      expect(allRows.values[allRows.values.length - 1]).toEqual([timestamp, name, value, text]);

      sheet.close();
    });
  });
});

import { google, sheets_v4 } from 'googleapis';

type JWTClient = InstanceType<typeof google.auth.JWT>;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const TITLE_ROW_RANGE_PATTERN = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/;

export type DataRecords = {
  values: (string | number | boolean | null)[][];
};

export class GoogleSpreadSheet {
  private spreadsheetId: string | undefined;
  private auth: JWTClient | undefined;
  private sheets: sheets_v4.Sheets | undefined;

  async open(spreadsheetId: string): Promise<void> {
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      throw new Error('GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY must be set');
    }

    this.spreadsheetId = spreadsheetId;

    this.auth = new google.auth.JWT({
      email: clientEmail,
      // 環境変数では改行が "\n" というリテラル文字列として渡されるため、実際の改行に変換する
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: SCOPES,
    });
    await this.auth.authorize();

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });

    // 指定されたスプレッドシートが存在し、アクセス可能であることを確認する
    await this.sheets.spreadsheets.get({ spreadsheetId });
  }

  close(): void {
    this.spreadsheetId = undefined;
    this.auth = undefined;
    this.sheets = undefined;
  }

  async readDataRecords(
    sheetName: string,
    titleRowRange: string,
    readRowNum: number
  ): Promise<DataRecords> {
    if (!this.sheets || !this.spreadsheetId) {
      throw new Error('GoogleSpreadSheet is not open. Call open() first');
    }

    if (!sheetName) {
      throw new Error('sheetName must not be empty');
    }

    const match = TITLE_ROW_RANGE_PATTERN.exec(titleRowRange);
    if (!match) {
      throw new Error('titleRowRange must be a single row A1 notation range, e.g. "A1:D1"');
    }

    const [, startColumn, startRowText, endColumn, endRowText] = match;
    const startRow = Number(startRowText);
    const endRow = Number(endRowText);
    if (startRow !== endRow) {
      throw new Error('titleRowRange must span exactly one row');
    }

    if (readRowNum < 0) {
      throw new Error('readRowNum must not be negative');
    }
    const rowNum = Math.floor(readRowNum);
    const columnCount = columnLetterToIndex(endColumn) - columnLetterToIndex(startColumn) + 1;

    const range = buildRange(sheetName, startColumn, endColumn, startRow, rowNum);

    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets.properties.title',
    });
    const sheetExists = spreadsheet.data.sheets?.some((sheet) => sheet.properties?.title === sheetName);
    if (!sheetExists) {
      throw new Error(`Sheet "${sheetName}" does not exist`);
    }

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });

    const rawValues = response.data.values;
    if (!rawValues || rawValues.length === 0) {
      throw new Error(`No data found for range "${range}"`);
    }

    const trimmedValues = rowNum === 0 ? trimTrailingBlankRows(rawValues) : rawValues;

    const values = trimmedValues.map((row) => padRow(row, columnCount));

    return { values };
  }
}

function columnLetterToIndex(column: string): number {
  let index = 0;
  for (const char of column) {
    index = index * 26 + (char.charCodeAt(0) - 'A'.charCodeAt(0) + 1);
  }
  return index;
}

function buildRange(
  sheetName: string,
  startColumn: string,
  endColumn: string,
  startRow: number,
  rowNum: number
): string {
  if (rowNum === 1) {
    return `${sheetName}!${startColumn}${startRow}:${endColumn}${startRow}`;
  }
  if (rowNum === 0) {
    return `${sheetName}!${startColumn}${startRow}:${endColumn}`;
  }
  const endRow = startRow + rowNum - 1;
  return `${sheetName}!${startColumn}${startRow}:${endColumn}${endRow}`;
}

function trimTrailingBlankRows(rows: unknown[][]): unknown[][] {
  const firstBlankIndex = rows.findIndex((row) => {
    const primaryKey = row[0];
    return primaryKey === null || primaryKey === undefined || primaryKey === '';
  });
  return firstBlankIndex === -1 ? rows : rows.slice(0, firstBlankIndex);
}

function padRow(row: unknown[], columnCount: number): (string | number | boolean | null)[] {
  const padded: (string | number | boolean | null)[] = [];
  for (let i = 0; i < columnCount; i++) {
    const cell = row[i];
    padded.push(cell === undefined ? null : (cell as string | number | boolean | null));
  }
  return padded;
}

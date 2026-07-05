import { google, sheets_v4 } from 'googleapis';

type JWTClient = InstanceType<typeof google.auth.JWT>;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

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
}

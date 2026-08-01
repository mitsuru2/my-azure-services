export function isLastDayOfMonth(date: Date): boolean {
  const nextDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  );
  return nextDay.getUTCDate() === 1;
}

const JST_OFFSET_HOURS = 9;

/**
 * "HHmm" 形式のJST時刻 (例: "1800") を、毎日その時刻に発火するNCRONTAB式に変換する。
 * JSTはUTC+9で夏時間が無いため固定オフセットで変換する。
 */
export function jstTimeToUtcCronExpression(hhmm: string): string {
  if (!/^([01]\d|2[0-3])[0-5]\d$/.test(hhmm)) {
    throw new Error(`Invalid JST time "${hhmm}": expected "HHmm" format (e.g. "1800")`);
  }

  const jstHour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(2, 4));
  const utcHour = (jstHour - JST_OFFSET_HOURS + 24) % 24;

  return `0 ${minute} ${utcHour} * * *`;
}

// Google Sheetsのシリアル値は1899/12/30を0とする経過日数で表される。
const GOOGLE_SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * "YYYY/MM/DD" 形式の日付文字列をGoogle Sheetsのシリアル値に変換する。
 * valueInputOption: 'RAW' で書き込むと文字列のままでは日付として認識されないため、
 * 書き込み前にシリアル値へ変換する必要がある。
 */
export function dateStringToSheetsSerial(dateStr: string): number {
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date string "${dateStr}": expected "YYYY/MM/DD" format`);
  }
  const [, year, month, day] = match;
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day));
  return Math.round((utcMs - GOOGLE_SHEETS_EPOCH_UTC_MS) / MS_PER_DAY);
}

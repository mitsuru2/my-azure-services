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

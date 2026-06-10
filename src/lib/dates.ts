export interface MonthRange {
  end: Date;
  key: string;
  start: Date;
}

function getTimeZoneParts(date: Date, timeZone: string): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
}

function part(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((item) => item.type === type)?.value;
  return Number(value);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(
    part(parts, "year"),
    part(parts, "month") - 1,
    part(parts, "day"),
    part(parts, "hour"),
    part(parts, "minute"),
    part(parts, "second"),
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
  timeZone: string,
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const localAsUtc = Date.UTC(year, monthIndex, day, hour, minute, second);
  let utc = new Date(localAsUtc);

  for (let index = 0; index < 3; index += 1) {
    utc = new Date(localAsUtc - getTimeZoneOffsetMs(utc, timeZone));
  }

  return utc;
}

export function getMonthRange(date: Date, timeZone: string): MonthRange {
  const parts = getTimeZoneParts(date, timeZone);
  const year = part(parts, "year");
  const month = part(parts, "month");
  const start = zonedDateTimeToUtc(timeZone, year, month - 1, 1);
  const end = zonedDateTimeToUtc(timeZone, year, month, 1);

  return {
    end,
    key: `${year}-${String(month).padStart(2, "0")}`,
    start,
  };
}

export function monthRangeFromKey(monthKey: string, timeZone: string): MonthRange {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return getMonthRange(new Date(), timeZone);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) {
    return getMonthRange(new Date(), timeZone);
  }

  return {
    end: zonedDateTimeToUtc(timeZone, year, month, 1),
    key: `${year}-${String(month).padStart(2, "0")}`,
    start: zonedDateTimeToUtc(timeZone, year, month - 1, 1),
  };
}

export function formatDateTime(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${part(parts, "year")}-${String(part(parts, "month")).padStart(2, "0")}-${String(
    part(parts, "day"),
  ).padStart(2, "0")} ${String(part(parts, "hour")).padStart(2, "0")}:${String(
    part(parts, "minute"),
  ).padStart(2, "0")}`;
}

export function formatMonthDay(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${part(parts, "month")}月${part(parts, "day")}日`;
}

export function formatTime(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return `${String(part(parts, "hour")).padStart(2, "0")}:${String(part(parts, "minute")).padStart(
    2,
    "0",
  )}`;
}

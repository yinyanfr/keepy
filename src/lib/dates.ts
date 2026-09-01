export interface MonthRange {
  end: Date;
  key: string;
  start: Date;
}

export interface MonthKeyParts {
  month: number;
  year: number;
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
  const parts = parseMonthKey(monthKey);
  if (!parts) {
    return getMonthRange(new Date(), timeZone);
  }

  const { month, year } = parts;

  return {
    end: zonedDateTimeToUtc(timeZone, year, month, 1),
    key: `${year}-${String(month).padStart(2, "0")}`,
    start: zonedDateTimeToUtc(timeZone, year, month - 1, 1),
  };
}

export function parseMonthKey(monthKey: string): MonthKeyParts | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  return Number.isInteger(year) && year >= 1000 && month >= 1 && month <= 12
    ? { month, year }
    : null;
}

export function shiftMonthKey(monthKey: string, offset: number): string {
  const parts = parseMonthKey(monthKey);
  if (!parts || !Number.isInteger(offset)) {
    throw new Error("Invalid month key or offset.");
  }

  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthDistance(newerMonthKey: string, olderMonthKey: string): number {
  const newer = parseMonthKey(newerMonthKey);
  const older = parseMonthKey(olderMonthKey);
  if (!newer || !older) {
    throw new Error("Invalid month key.");
  }

  return (newer.year - older.year) * 12 + newer.month - older.month;
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

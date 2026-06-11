export interface TimeZoneOption {
  label: string;
  value: string;
}

export const defaultTimeZone = "Asia/Shanghai";

export const commonTimeZones: TimeZoneOption[] = [
  { label: "中国大陆 / 北京时间 (Asia/Shanghai)", value: "Asia/Shanghai" },
  { label: "台北 (Asia/Taipei)", value: "Asia/Taipei" },
  { label: "香港 (Asia/Hong_Kong)", value: "Asia/Hong_Kong" },
  { label: "东京 (Asia/Tokyo)", value: "Asia/Tokyo" },
  { label: "首尔 (Asia/Seoul)", value: "Asia/Seoul" },
  { label: "新加坡 (Asia/Singapore)", value: "Asia/Singapore" },
  { label: "UTC", value: "UTC" },
  { label: "伦敦 (Europe/London)", value: "Europe/London" },
  { label: "巴黎 / 中欧 (Europe/Paris)", value: "Europe/Paris" },
  { label: "纽约 / 美东 (America/New_York)", value: "America/New_York" },
  { label: "芝加哥 / 美中 (America/Chicago)", value: "America/Chicago" },
  { label: "丹佛 / 美山 (America/Denver)", value: "America/Denver" },
  { label: "洛杉矶 / 美西 (America/Los_Angeles)", value: "America/Los_Angeles" },
  { label: "悉尼 (Australia/Sydney)", value: "Australia/Sydney" },
];

const commonTimeZoneValues = new Set(commonTimeZones.map((option) => option.value));

export function isCommonTimeZone(value: string): boolean {
  return commonTimeZoneValues.has(value);
}

export function timeZoneLabel(value: string): string {
  return commonTimeZones.find((option) => option.value === value)?.label ?? value;
}

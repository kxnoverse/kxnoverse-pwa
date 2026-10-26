export const germanStates = [
  "BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV",
  "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH",
] as const;

export type GermanState = (typeof germanStates)[number];
export type RegionalDateType = "public" | "school";

export interface RegionalDate {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  type: RegionalDateType;
}

export interface RegionalDateCache {
  version: 1;
  fetchedAt: number;
  dates: RegionalDate[];
}

const failedRequestCooldowns = new Map<string, number>();

interface OpenHolidaysDate {
  id?: unknown;
  name?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  nationwide?: unknown;
  subdivisions?: unknown;
}

export function parseRegionalDateCache(value: string): RegionalDateCache | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (Array.isArray(parsed) && parsed.every(isRegionalDate)) {
    return { version: 1, fetchedAt: 0, dates: parsed };
  }
  if (
    typeof parsed !== "object" || parsed === null ||
    !("version" in parsed) || parsed.version !== 1 ||
    !("fetchedAt" in parsed) || typeof parsed.fetchedAt !== "number" ||
    !Number.isFinite(parsed.fetchedAt) || parsed.fetchedAt < 0 ||
    !("dates" in parsed) || !Array.isArray(parsed.dates) ||
    !parsed.dates.every(isRegionalDate)
  ) return null;
  return parsed as RegionalDateCache;
}

export function storeRegionalDateRequestFailure(key: string, now = Date.now()): void {
  failedRequestCooldowns.set(key, now + 60_000);
}

export function regionalDateRequestIsCoolingDown(key: string, now = Date.now()): boolean {
  const retryAt = failedRequestCooldowns.get(key);
  if (retryAt === undefined) return false;
  if (retryAt > now) return true;
  failedRequestCooldowns.delete(key);
  return false;
}

export function clearRegionalDateRequestFailure(key: string): void {
  failedRequestCooldowns.delete(key);
}

function localizedName(value: unknown, language: string): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const languageCode = language.startsWith("de") ? "DE" : "EN";
  const names = value.filter((item): item is { language?: string; text?: string } =>
    typeof item === "object" && item !== null,
  );
  return names.find((item) => item.language === languageCode)?.text ??
    names.find((item) => typeof item.text === "string")?.text;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function appliesToState(item: OpenHolidaysDate, state: GermanState | ""): boolean {
  if (!state) return item.nationwide === true;
  if (item.nationwide === true) return true;
  return Array.isArray(item.subdivisions) &&
    item.subdivisions.some((subdivision) =>
      typeof subdivision === "object" && subdivision !== null &&
      "code" in subdivision && subdivision.code === `DE-${state}`,
    );
}

function normalizeDates(
  value: unknown,
  type: RegionalDateType,
  state: GermanState | "",
  language: string,
): RegionalDate[] {
  if (!Array.isArray(value)) throw new Error("The holiday service returned invalid data.");
  return value.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null) return [];
    const item = entry as OpenHolidaysDate;
    const name = localizedName(item.name, language);
    if (
      typeof item.id !== "string" || !name ||
      !isValidDate(item.startDate) || !isValidDate(item.endDate) ||
      item.startDate > item.endDate || !appliesToState(item, state)
    ) return [];
    return [{
      id: `${type}-${item.id}-${index}`,
      name,
      startDate: item.startDate,
      endDate: item.endDate,
      type,
    }];
  });
}

async function fetchDateType(
  type: RegionalDateType,
  state: GermanState | "",
  year: number,
  language: string,
  signal: AbortSignal,
): Promise<RegionalDate[]> {
  const url = new URL(`https://openholidaysapi.org/${type === "public" ? "PublicHolidays" : "SchoolHolidays"}`);
  url.searchParams.set("countryIsoCode", "DE");
  url.searchParams.set("languageIsoCode", language.startsWith("de") ? "DE" : "EN");
  url.searchParams.set("validFrom", `${year}-01-01`);
  url.searchParams.set("validTo", `${year}-12-31`);
  if (state) url.searchParams.set("subdivisionCode", `DE-${state}`);

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Holiday service returned HTTP ${response.status}.`);
  return normalizeDates(await response.json(), type, state, language);
}

export async function fetchRegionalDates(
  state: GermanState | "",
  year: number,
  language: string,
  signal: AbortSignal,
): Promise<RegionalDate[]> {
  const publicDates = fetchDateType("public", state, year, language, signal);
  const schoolDates = state
    ? fetchDateType("school", state, year, language, signal)
    : Promise.resolve([]);
  const [publicResults, schoolResults] = await Promise.all([publicDates, schoolDates]);
  return [...publicResults, ...schoolResults].sort((a, b) =>
    a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name),
  );
}

export function isRegionalDate(value: unknown): value is RegionalDate {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<RegionalDate>;
  return typeof item.id === "string" && typeof item.name === "string" &&
    isValidDate(item.startDate) && isValidDate(item.endDate) &&
    item.startDate <= item.endDate &&
    (item.type === "public" || item.type === "school");
}

export function dateRangeContains(item: RegionalDate, date: string): boolean {
  return item.startDate <= date && item.endDate >= date;
}

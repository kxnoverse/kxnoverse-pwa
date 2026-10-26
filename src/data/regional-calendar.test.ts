import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearRegionalDateRequestFailure,
  dateRangeContains,
  fetchRegionalDates,
  isRegionalDate,
  parseRegionalDateCache,
  regionalDateRequestIsCoolingDown,
  storeRegionalDateRequestFailure,
} from "./regional-calendar";

afterEach(() => vi.unstubAllGlobals());

describe("regional calendar data", () => {
  it("requests state-specific public holidays and school holidays", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: "holiday-id",
        name: [{ language: "DE", text: "Neujahr" }],
        startDate: "2026-01-01",
        endDate: "2026-01-01",
        nationwide: true,
      }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: "school-id",
        name: [{ language: "DE", text: "Osterferien" }],
        startDate: "2026-03-30",
        endDate: "2026-04-11",
        nationwide: false,
        subdivisions: [{ code: "DE-NW" }],
      }])));
    vi.stubGlobal("fetch", fetchMock);

    const dates = await fetchRegionalDates("NW", 2026, "de", new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("subdivisionCode=DE-NW");
    expect(String(fetchMock.mock.calls[1][0])).toContain("SchoolHolidays");
    expect(dates).toEqual([
      { id: "public-holiday-id-0", name: "Neujahr", startDate: "2026-01-01", endDate: "2026-01-01", type: "public" },
      { id: "school-school-id-0", name: "Osterferien", startDate: "2026-03-30", endDate: "2026-04-11", type: "school" },
    ]);
  });

  it("shows only nationwide public holidays until a state is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: "national", name: [{ language: "EN", text: "New Year" }], startDate: "2026-01-01", endDate: "2026-01-01", nationwide: true },
      { id: "regional", name: [{ language: "EN", text: "Epiphany" }], startDate: "2026-01-06", endDate: "2026-01-06", nationwide: false, subdivisions: [{ code: "DE-BW" }] },
    ])));
    vi.stubGlobal("fetch", fetchMock);

    const dates = await fetchRegionalDates("", 2026, "en", new AbortController().signal);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("subdivisionCode");
    expect(dates.map((item) => item.name)).toEqual(["New Year"]);
  });

  it("validates cached records and matches multiday ranges inclusively", () => {
    const schoolHoliday = {
      id: "school-break",
      name: "Winter break",
      startDate: "2026-12-21",
      endDate: "2027-01-04",
      type: "school",
    } as const;

    expect(isRegionalDate(schoolHoliday)).toBe(true);
    expect(dateRangeContains(schoolHoliday, "2027-01-04")).toBe(true);
    expect(dateRangeContains(schoolHoliday, "2027-01-05")).toBe(false);
    expect(isRegionalDate({ ...schoolHoliday, type: "other" })).toBe(false);
  });

  it("reads versioned and legacy holiday caches but rejects corrupted entries", () => {
    const dates = [{
      id: "holiday",
      name: "New Year",
      startDate: "2026-01-01",
      endDate: "2026-01-01",
      type: "public",
    }];
    expect(parseRegionalDateCache(JSON.stringify(dates))).toMatchObject({ fetchedAt: 0, dates });
    expect(parseRegionalDateCache(JSON.stringify({ version: 1, fetchedAt: 123, dates }))).toEqual({
      version: 1,
      fetchedAt: 123,
      dates,
    });
    expect(parseRegionalDateCache("{broken")).toBeNull();
    expect(parseRegionalDateCache(JSON.stringify({ version: 2, fetchedAt: 123, dates }))).toBeNull();
    expect(parseRegionalDateCache(JSON.stringify({ version: 1, fetchedAt: 123, dates: [{ ...dates[0], startDate: "invalid" }] }))).toBeNull();
  });

  it("limits repeated failed requests and clears the delay after reconnection", () => {
    const key = "regionalCalendar:NW:2026:en";
    clearRegionalDateRequestFailure(key);
    storeRegionalDateRequestFailure(key, 1000);
    expect(regionalDateRequestIsCoolingDown(key, 2000)).toBe(true);
    expect(regionalDateRequestIsCoolingDown(key, 62_000)).toBe(false);
    storeRegionalDateRequestFailure(key, 1000);
    clearRegionalDateRequestFailure(key);
    expect(regionalDateRequestIsCoolingDown(key, 2000)).toBe(false);
  });
});

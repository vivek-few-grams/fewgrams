import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPinPlace, parseDirectory, placeCase } from "./india-post";

/* Trimmed from live data.gov.in responses, 23 Sep 2026. 560068 is one of
   the eight Bengaluru PINs whose post offices sit in two districts. */
const PIN_560001 = {
  total: 9,
  records: [
    { officename: "Dr. Ambedkar Veedhi S.O", pincode: "560001", district: "BENGALURU URBAN", statename: "KARNATAKA" },
    { officename: "Vidhana Soudha S.O", pincode: "560001", district: "BENGALURU URBAN", statename: "KARNATAKA" },
  ],
};

const SPLIT = {
  records: [
    { district: "BENGALURU RURAL", statename: "KARNATAKA" },
    { district: "BENGALURU URBAN", statename: "KARNATAKA" },
    { district: "BENGALURU URBAN", statename: "KARNATAKA" },
    { district: "BENGALURU URBAN", statename: "KARNATAKA" },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("placeCase", () => {
  it("turns the directory's capitals into a name", () => {
    expect(placeCase("BENGALURU URBAN")).toBe("Bengaluru Urban");
    expect(placeCase(" KARNATAKA ")).toBe("Karnataka");
  });

  it("keeps joining words lower-case, never the first word", () => {
    expect(placeCase("JAMMU AND KASHMIR")).toBe("Jammu and Kashmir");
    expect(placeCase("THE NILGIRIS")).toBe("The Nilgiris");
  });
});

describe("parseDirectory", () => {
  it("reads district and state from the post offices", () => {
    expect(parseDirectory(PIN_560001)).toEqual({ district: "Bengaluru Urban", state: "Karnataka" });
  });

  /* A split PIN has to be filled with something; the district most of its
     offices are in is the likeliest door. The field stays editable. */
  it("takes the district most of a split PIN's offices are in", () => {
    expect(parseDirectory(SPLIT)).toEqual({ district: "Bengaluru Urban", state: "Karnataka" });
  });

  it("is null for an unknown PIN or a body of the wrong shape", () => {
    expect(parseDirectory({ total: 0, records: [] })).toBeNull();
    expect(parseDirectory({ error: "Rate limit exceeded" })).toBeNull();
    expect(parseDirectory(null)).toBeNull();
    expect(parseDirectory({ records: [{ district: "", statename: "KARNATAKA" }] })).toBeNull();
  });
});

describe("fetchPinPlace", () => {
  it("asks for exactly one PIN and parses the answer", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(PIN_560001)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPinPlace("560001", "k")).resolves.toEqual({
      district: "Bengaluru Urban",
      state: "Karnataka",
    });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("filters[pincode]")).toBe("560001");
    expect(url.searchParams.get("api-key")).toBe("k");
  });

  /* A failure must throw, not return null: null means "the directory does
     not know this PIN", and only that is safe to act on. */
  it("throws when the directory does not answer properly", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response("", { status: 429 })));
    await expect(fetchPinPlace("560001", "k")).rejects.toThrow(/429/);
  });

  it("refuses to send anything that is not a PIN", async () => {
    await expect(fetchPinPlace("56000", "k")).rejects.toThrow();
  });
});

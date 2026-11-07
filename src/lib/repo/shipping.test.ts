import { describe, expect, it } from "vitest";
import { mergeOrigins, pickupNameClash, samePickupName, type Origin } from "./shipping";

const vendor = (id: string, name: string, pincode = "600078"): Origin => ({
  id,
  name,
  phone: "9876543210",
  address: "1 Industrial Estate",
  city: "Chennai",
  pincode,
});

describe("mergeOrigins — admin → delivery's save over the stored list", () => {
  const maker = vendor("loc-maker", "Rack Maker");
  const added = vendor("loc-new", "Added on admin → racks");

  it("keeps a vendor added elsewhere after the form loaded", () => {
    /* The form only ever showed the maker. */
    expect(mergeOrigins([maker, added], [maker], new Set())).toEqual([maker, added]);
  });

  it("lays the form's edits over the stored rows", () => {
    const renamed = { ...maker, name: "Rack Maker, Chennai" };
    expect(mergeOrigins([maker, added], [renamed], new Set())).toEqual([renamed, added]);
  });

  it("drops only what the form removed, and adds its new rows after", () => {
    const fresh = vendor("loc-fresh", "Typed on admin → delivery");
    expect(mergeOrigins([maker, added], [fresh], new Set(["loc-maker"]))).toEqual([added, fresh]);
  });
});

describe("pickup names", () => {
  it("are one name trimmed and in any case", () => {
    expect(samePickupName("Few Grams", "  few grams ")).toBe(true);
    expect(samePickupName("Few Grams", "Few Grams Chennai")).toBe(false);
  });

  it("finds two pickups going by one name", () => {
    const home = { id: "home", name: "Few Grams" };
    const chennai = vendor("loc-a", "few grams");
    expect(pickupNameClash([home, vendor("loc-b", "Rack Maker"), chennai])).toEqual([home, chennai]);
    expect(pickupNameClash([home, vendor("loc-b", "Rack Maker")])).toBeNull();
  });
});

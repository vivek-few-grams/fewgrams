import { describe, expect, it } from "vitest";
import {
  formatPhone,
  normalisePhone,
  formatPlace,
  validateAddress,
  validateProfile,
} from "./validation";

const served = "560034";

/* `checkDeliveryArea`'s two answers, without the directory: the area rule
   itself is `area.ts`'s and is tested there. */
const IN = { served: true, place: null };
const OUT = { served: false, place: null };

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const goodAddress = {
  recipient: "Vivek",
  phone: "9845012345",
  line1: "12, Green Court",
  district: "Bengaluru Urban",
  state: "Karnataka",
  pincode: served,
};

describe("normalisePhone", () => {
  it("accepts the three forms people actually type and stores one", () => {
    expect(normalisePhone("9845012345")).toBe("9845012345");
    expect(normalisePhone("+91 98450 12345")).toBe("9845012345");
    expect(normalisePhone("098450-12345")).toBe("9845012345");
  });

  it("rejects anything that is not a ten-digit mobile", () => {
    expect(normalisePhone("5845012345")).toBeNull(); // no Indian mobile starts 5
    expect(normalisePhone("98450123456")).toBeNull(); // one digit too many
    expect(normalisePhone("044 4123 4567")).toBeNull(); // Chennai landline
    expect(normalisePhone("1800 123 4567")).toBeNull(); // toll-free
    expect(normalisePhone("")).toBeNull();
  });

  /**
   * Pins the one case the format cannot resolve, so that nobody "fixes" it
   * later without reading why. `080-4123 4567` (a Bengaluru landline) and the
   * mobile `8041234567` are the same eleven digits once the dialling prefix
   * is stripped, because Bengaluru's STD code is 080 and 80xx is a live
   * mobile series. Accepting it is the documented choice — see normalisePhone.
   */
  it("cannot tell a Bengaluru landline from an 80xx mobile, and accepts it", () => {
    expect(normalisePhone("080 4123 4567")).toBe("8041234567");
  });

  it("formats for display without changing what is stored", () => {
    expect(formatPhone("9845012345")).toBe("98450 12345");
  });
});

describe("validateProfile", () => {
  it("requires a name and allows no phone", () => {
    expect(validateProfile(form({ name: "" })).ok).toBe(false);
    const r = validateProfile(form({ name: "  Vivek   Padikkal " }));
    expect(r).toEqual({ ok: true, value: { name: "Vivek Padikkal" } });
  });

  it("rejects a phone it cannot normalise rather than storing it raw", () => {
    const r = validateProfile(form({ name: "Vivek", phone: "12345" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ field: "phone", code: "phoneInvalid" });
  });
});

describe("formatPlace", () => {
  it("shows district, state and PIN", () => {
    expect(
      formatPlace({ district: "Bengaluru Urban", state: "Karnataka", pincode: "560034" }),
    ).toBe("Bengaluru Urban, Karnataka 560034");
  });

  /* Addresses saved before 23 Sep 2026 have a city and neither of the others. */
  it("falls back to the city an older address has", () => {
    expect(formatPlace({ city: "Bengaluru", pincode: "560034" })).toBe("Bengaluru 560034");
  });
});

describe("validateAddress", () => {
  it("accepts a complete address and defaults the label", () => {
    const r = validateAddress(form(goodAddress), IN);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.label).toBe("Home");
      expect(r.value.isDefault).toBe(false);
      expect(r.value.geo).toBeUndefined();
    }
  });

  /**
   * The load-bearing test. SPEC §7 and §8: a non-serviceable PIN must be
   * refused server-side, not merely hidden in the UI. An address saved with
   * an unserviceable PIN would pass a checkout gate that only re-reads the
   * saved address.
   */
  it("refuses a PIN code outside the service area", () => {
    const r = validateAddress(form({ ...goodAddress, pincode: "110001" }), OUT);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("pincodeNotServed");
      expect(r.error.values).toEqual({ pincode: "110001" });
    }
  });

  it("refuses a PIN that is not six digits", () => {
    const r = validateAddress(form({ ...goodAddress, pincode: "5600" }), IN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("pincodeInvalid");
  });

  it.each([
    ["recipient", "recipientRequired"],
    ["line1", "line1Required"],
    ["district", "districtRequired"],
    ["state", "stateRequired"],
  ])("requires %s", (field, code) => {
    const r = validateAddress(form({ ...goodAddress, [field]: "  " }), IN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ field, code });
  });

  /* The action passes India Post's answer only when the form sent a blank —
     no JavaScript, or a lookup that had not answered. */
  it("fills a blank district and state from the PIN's place", () => {
    const place = { district: "Bengaluru Urban", state: "Karnataka" };
    const r = validateAddress(
      form({ ...goodAddress, district: "", state: " " }),
      { served: true, place },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject(place);
  });

  /* On a PIN split between two districts the customer knows which side they
     are on and the directory does not, so what they typed wins. */
  it("keeps what the customer typed over the looked-up place", () => {
    const r = validateAddress(
      form({ ...goodAddress, district: "Bengaluru Rural" }),
      { served: true, place: { district: "Bengaluru Urban", state: "Karnataka" } },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.district).toBe("Bengaluru Rural");
  });

  it("refuses a district longer than any real one", () => {
    const r = validateAddress(form({ ...goodAddress, district: "x".repeat(61) }), IN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ field: "district", code: "placeTooLong" });
  });

  it("keeps a pinned location and rounds its accuracy", () => {
    const r = validateAddress(
      form({ ...goodAddress, lat: "12.9716", lng: "77.5946", accuracyM: "18.4" }),
      IN,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.geo).toEqual({ lat: 12.9716, lng: 77.5946, accuracyM: 18 });
  });

  it("rejects coordinates off the globe instead of storing them", () => {
    const r = validateAddress(form({ ...goodAddress, lat: "999", lng: "77.5946" }), IN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("locationInvalid");
  });
});

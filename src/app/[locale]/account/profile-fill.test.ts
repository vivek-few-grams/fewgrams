import { describe, expect, it } from "vitest";
import { profileFromAddress } from "./profile-fill";

const address = { recipient: "Asha Rao", phone: "9845012345" };

describe("profileFromAddress", () => {
  it("fills an empty profile from the first address", () => {
    expect(profileFromAddress(null, null, address)).toEqual({ name: "Asha Rao", phone: "9845012345" });
  });

  it("never overwrites a name or a number the customer set", () => {
    expect(profileFromAddress({ name: "Asha", phone: "9900011122" }, null, address)).toBeNull();
  });

  it("fills only the gap", () => {
    expect(profileFromAddress({ name: "Asha" }, null, address)).toEqual({
      name: "Asha",
      phone: "9845012345",
    });
    expect(profileFromAddress({ phone: "9900011122" }, null, address)).toEqual({
      name: "Asha Rao",
      phone: "9900011122",
    });
  });

  /* The provider's name is what the account pages show when the profile has
     none, so it is not a gap; the recipient may be someone else entirely. */
  it("keeps the sign-in provider's name rather than the recipient's", () => {
    expect(profileFromAddress(null, "Asha R", address)).toEqual({ phone: "9845012345" });
    expect(profileFromAddress({ phone: "9900011122" }, "Asha R", address)).toBeNull();
  });

  it("treats an empty string as a gap", () => {
    expect(profileFromAddress({ name: "", phone: "" }, null, address)).toEqual({
      name: "Asha Rao",
      phone: "9845012345",
    });
  });
});

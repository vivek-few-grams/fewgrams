import { describe, expect, it } from "vitest";
import { after, bestSelling } from "./related";

const items = ["a", "b", "c", "d", "e", "f"].map((key) => ({ key }));
const keys = (list: Array<{ key: string }>) => list.map((item) => item.key);

describe("after", () => {
  it("takes the next ones, wrapping round to the start", () => {
    expect(keys(after(items, "b", 4))).toEqual(["c", "d", "e", "f"]);
    expect(keys(after(items, "e", 4))).toEqual(["f", "a", "b", "c"]);
  });

  it("never suggests the page's own product, even when there are few", () => {
    expect(keys(after(items.slice(0, 3), "b", 4))).toEqual(["c", "a"]);
  });

  /* Every product is someone's neighbour, so each is linked from a page. */
  it("links every product from some other product's page", () => {
    const linked = new Set(items.flatMap((item) => keys(after(items, item.key, 1))));
    expect(linked).toEqual(new Set(keys(items)));
  });

  it("starts at the top for a product the list does not have", () => {
    expect(keys(after(items, "zz", 2))).toEqual(["a", "b"]);
  });
});

describe("bestSelling", () => {
  it("puts the most sold first and keeps the list's order between equals", () => {
    expect(keys(bestSelling(items, { d: 500, f: 200 }, 4))).toEqual(["d", "f", "a", "b"]);
  });

  it("is the list's own order before anything has sold", () => {
    expect(keys(bestSelling(items, {}, 3))).toEqual(["a", "b", "c"]);
  });
});

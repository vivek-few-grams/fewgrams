/**
 * A photo's blurred stand-in, as `next/image` takes it: an inline WebP painted
 * as the `<img>`'s background until the real file has loaded. Made by
 * `scripts/placeholders.mjs`, looked up on the server by `placeholderFor`.
 *
 * In its own file, apart from the lookup, so a client component can take the
 * type and `placeholderProps` without importing the manifest of every photo.
 */
export type Placeholder = `data:image/${string}`;

/**
 * Spread into `<Image>`. Nothing at all when there is no placeholder, so the
 * photo loads exactly as it did before.
 *
 * `objectFit` goes in `style` as well as in the `object-*` class: Next sizes
 * the placeholder from the `style` prop and cannot read a Tailwind class, so
 * with the class alone it falls back to `cover` — a cut-out's blur then
 * overfills the box the punnet is contained in, and the swap jumps.
 */
export function placeholderProps(
  placeholder: Placeholder | undefined,
  fit: "contain" | "cover",
): { placeholder?: Placeholder; style?: { objectFit: "contain" | "cover" } } {
  return placeholder ? { placeholder, style: { objectFit: fit } } : {};
}

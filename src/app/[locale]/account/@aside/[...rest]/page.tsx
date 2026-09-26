/**
 * Every other account page puts nothing above the menu. Needed as well as
 * `default.tsx`: on a client-side navigation a slot keeps what it last showed
 * unless the new URL matches one of its pages, so leaving an order for
 * Profile would otherwise keep that order's address on screen.
 */
export default function AsideElsewhere() {
  return null;
}

/** SPEC §5.2 — a month is four Saturdays, so a rotation is four weeks.
 *
 *  Its own module so the admin plans screen, the subscription schedule and
 *  the tray plan all read one number; one of them copying it is how a
 *  five-week rotation gets half-built. */
export const ROTATION_WEEKS = [1, 2, 3, 4] as const;

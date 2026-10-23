// When a position listing counts as open for applications. Imported by the
// submit-application Edge Function (Deno) and by the website (via the `@shared`
// alias in vite.config.ts / tsconfig.json), so — like eventStatus.ts and
// uniEmail.ts — it must stay plain TypeScript with no imports and no Deno or
// DOM APIs.
//
// This is the one place the predicate is written in TypeScript. It has to match
// the SQL in two other places, which cannot import it:
//   - the "public read event_questions for open positions" RLS policy, and
//   - submit_application's FOR SHARE lock,
// both in supabase/migrations/20261023114848_applications_target_positions.sql
// and 20261023114948_create_submit_application.sql. Change one, change all
// three.
//
// closes_at is optional: a listing without one stays open until an admin turns
// applications off or unpublishes it.

/** The listing fields the predicate needs. Deliberately structural, so both a
 * full row and a narrowed `select` satisfy it. */
export interface PositionOpenState {
  is_published: boolean;
  applications_open: boolean;
  closes_at: string | null;
}

export function hasPositionClosed(position: { closes_at: string | null }, now: number = Date.now()): boolean {
  return position.closes_at !== null && new Date(position.closes_at).getTime() <= now;
}

export function isPositionOpen(position: PositionOpenState, now: number = Date.now()): boolean {
  return position.is_published && position.applications_open && !hasPositionClosed(position, now);
}

/**
 * What a card or a detail page says about a listing's state. Three distinct
 * cases on purpose: a passed deadline, applications switched off while the
 * listing stays up, and an open listing with no deadline at all — each reads
 * differently, and none of them should be shown as another.
 */
export function positionStatusLabel(position: PositionOpenState, now: number = Date.now()): string {
  if (hasPositionClosed(position, now)) return "Applications closed";
  if (!position.applications_open) return "Applications not open yet";
  if (!position.closes_at) return "Open until filled";
  return `Closes ${new Date(position.closes_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

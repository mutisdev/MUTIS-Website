// When an event counts as over. Imported by the submit-form Edge Function
// (Deno) and by the website (via the `@shared` alias), so it must stay plain
// TypeScript with no imports and no Deno or DOM APIs.
//
// An event has ended once its ends_at passes. ends_at is optional; events
// without one fall back to 24h after their scheduled start.

const NO_END_GRACE_MS = 24 * 60 * 60 * 1000;

export function eventEndTime(event: { starts_at: string; ends_at: string | null }): number {
  return event.ends_at
    ? new Date(event.ends_at).getTime()
    : new Date(event.starts_at).getTime() + NO_END_GRACE_MS;
}

export function hasEventEnded(
  event: { starts_at: string; ends_at: string | null },
  now: number = Date.now(),
): boolean {
  return eventEndTime(event) <= now;
}

-- Reason: some events are run on someone else's platform — a partner firm's portal, Eventbrite, a Google Form — and for those the site should send people there instead of pretending to take a sign-up it never receives.
--
-- Purely additive. external_url defaults NULL, so every existing event keeps
-- the in-house sign-up (or application) it already has, and nothing about
-- event_signups, event_applications or the reminder emails changes.
--
-- An event with a URL here never collects anything locally: no sign-up row, no
-- application, so no confirmation email, no reminder and no CV. That is the
-- point of the mode — the other site owns the list.
alter table public.events
  add column external_url text;

-- https only, the same rule event_video_details takes (see
-- supabase/functions/_shared/eventVideo.ts): http would be downgraded by most
-- clients anyway, and every other scheme (mailto:, javascript:, a bare
-- www.) has no business being rendered as an outbound registration button.
-- Whitespace is rejected outright so the stored value is always a single URL
-- rather than a sentence with one in it; 2048 is the length every browser and
-- CDN agrees to carry.
alter table public.events
  add constraint events_external_url_shape check (
    external_url is null
    or (
      external_url ~ '^https://[^[:space:]]+$'
      and length(external_url) <= 2048
    )
  );

-- The two off-site modes are mutually exclusive by construction, not just by
-- admin-UI convention: an application is reviewed here, so an event cannot
-- both hand its sign-up to another site and collect CVs on this one. Enforced
-- here as well as in the drawer so no other write path can produce a row the
-- public page would have to guess about.
alter table public.events
  add constraint events_external_url_excludes_application check (
    external_url is null or requires_application = false
  );

# Forms Audit — Confirmation Messages & 404 Page

> **Update (reCAPTCHA):** every public form now also requires a reCAPTCHA v2 checkbox, and submissions
> go through the `submit-form` Edge Function (captcha verified server-side, then inserted with the
> service role) instead of direct client inserts. The honeypot is kept as an extra layer. See the
> "Spam protection" section in `README.md`.

Full inventory of every form on the site, its state before this pass, and what was fixed.
Companion doc to `design_brief.md`. See "Part 2" below for the 404 page.

## Method

Every `<form>` / `onSubmit` / `handleSubmit` occurrence under `application/app` was located and read in
full (not just grepped for keywords), for both the public site (`app/pages/`) and the admin panel
(`app/admin/pages/`). "Has a success message" / "has an error message" below means a message that is
actually rendered in the UI — a `console.error`/`console.log` alone does not count.

## What was already there

Before this pass, every form on the site already rendered *some* success/error text — there were no
forms with literally nothing. The gaps were about **consistency and accessibility**, not missing
messages outright:

- Four public forms (Contact, Sponsorship enquiry, Event signup, Attendance) each had the *same*
  success/error banner markup copy-pasted independently, using `role="alert"` / `role="status"` but no
  explicit `aria-live`, and no shared clearing behaviour (an error only cleared on the next submit
  attempt, not as soon as the visitor started correcting the field).
- Two admin auth forms (Login, SetPassword) had their own copy-pasted inline `<p role="alert">` /
  `<p role="status">` blocks, again without explicit `aria-live`.
- The admin CRUD forms already routed every success/error through a shared `useToast()` /
  `<ToastProvider>` (`app/admin/components/Toast.tsx`) with a 4s auto-dismiss — this was in good shape
  and needed only an explicit `aria-live` attribute added for stronger screen-reader compliance.

## Fix: two shared, reusable feedback components

1. **`app/hooks/useFormStatus.ts`** + **`app/components/FormFeedback.tsx`** — new shared primitive for
   every public-facing form. `useFormStatus()` is a small state machine (`idle` / `submitting` / `sent`
   / `error`) with `fail()`, `succeed()`, `submitting()`, `reset()`, and `onFormInput` (wired to the
   `<form>`'s `onInput`, it clears a stale `error` state the moment the visitor edits any field again —
   `form.reset()` doesn't fire `input` events, so this doesn't clobber a just-shown success message).
   `<FormFeedback>` renders the message using the site's existing `.form-status` / `.form-error` /
   `.form-success` classes (already defined in `mutis-subpage.css` / `mutis-light.css` per
   `design_brief.md` §6 "Form inputs") with explicit `role` + `aria-live` + `aria-atomic`.
2. **`app/admin/components/FormMessage.tsx`** — same idea for the two admin auth screens that
   intentionally use a persistent inline message rather than a transient toast (a login error should
   stay put while the admin retypes, not auto-dismiss after 4s like a toast would).

Existing admin `Toast` component (`app/admin/components/Toast.tsx`) was kept as-is architecturally
(it was already the shared mechanism for all CRUD forms) and only gained explicit
`aria-live="assertive"|"polite"` + `aria-atomic="true"` alongside its existing `role`.

---

## Public-facing forms

| Form | File | Before | After |
|---|---|---|---|
| Contact form | `app/pages/Contact.tsx` | Success + error banners, copy-pasted markup, no explicit `aria-live`, error only cleared on re-submit | Uses `useFormStatus` + `<FormFeedback>`; error clears on next keystroke |
| Sponsorship enquiry | `app/pages/Sponsors.tsx` | Same pattern as Contact, independently duplicated | Uses `useFormStatus` + `<FormFeedback>` |
| Event signup (in the event details modal) | `app/pages/Events.tsx` (`EventSignupForm`) | Same pattern, third duplicate; success replaced the whole form with a plain `<p>` | Uses `useFormStatus` + `<FormFeedback>` |
| Attendance / event feedback form | `app/pages/Attendance.tsx` | Same pattern, fourth duplicate; had a "submit another response" reset button already | Uses `useFormStatus` + `<FormFeedback>`; reset button now calls the shared `reset()` |
| Newsletter / mailing list signup | — | **Does not exist.** `Join.tsx` links out to the Students' Union external signup page and to `/contact`; there is no on-site mailing-list form to fix. | No change — noted as out of scope, not a silent gap |

All four forms already validate required fields client-side (native `required` + a manual check before
insert) and distinguish a **field-validation failure** ("Please fill in your name and email.") from a
**submission/API failure** ("Something went wrong… email us at …") as two different `fail()` calls —
this distinction existed before and was preserved.

Two things intentionally were **not** changed:
- The honeypot bot-field short-circuit (`succeed()` immediately, no request sent) — this is deliberate
  spam mitigation, not a bug.
- Event signup's duplicate-email case (`insertError.code === "23505"` → "You've already signed up for
  this event with that email.") — already a distinct, correctly-worded error case.

## Admin panel forms

All of the following already used the shared `useToast()` (`app/admin/components/Toast.tsx`) for both
success and error paths, confirmed by reading each file (not just presence of the import): create/edit
drawer forms, publish-toggle switches, drag-reorder saves, and delete confirmations all call
`toast.success(...)` or `toast.error(...)`. Only the `Toast` component itself needed a change
(explicit `aria-live`, see above) — no per-page logic changes were needed.

| Area | File | Notes |
|---|---|---|
| Sponsors | `app/admin/pages/Sponsors.tsx` | create/edit/delete/reorder/publish-toggle all toast |
| Committee | `app/admin/pages/Committee.tsx` | same pattern |
| Events | `app/admin/pages/Events.tsx` | same pattern |
| Alumni | `app/admin/pages/Alumni.tsx` | same pattern |
| Previous Presidents | `app/admin/pages/PreviousPresidents.tsx` | same pattern |
| Articles | `app/admin/pages/Articles.tsx` | same pattern (rich text editor content) |
| Gallery | `app/admin/pages/Gallery.tsx` | same pattern (image upload) |
| Recordings | `app/admin/pages/Recordings.tsx` | same pattern |
| Past Speakers | `app/admin/pages/PastSpeakers.tsx` | same pattern |
| Fund Managers | `app/admin/pages/FundManagers.tsx` | same pattern |
| Home Programs | `app/admin/pages/HomePrograms.tsx` | same pattern |
| Sponsorship Packages | `app/admin/pages/SponsorshipPackages.tsx` | same pattern |
| Documents | `app/admin/pages/Documents.tsx` | same pattern (PDF upload) |
| Podcast Settings | `app/admin/pages/PodcastSettings.tsx` | same pattern |
| Site Settings | `app/admin/pages/SiteSettings.tsx` | single settings form, toast on save/load |
| Integrations (eToro keys) | `app/admin/pages/Integrations.tsx` | toast on save + on manual portfolio refresh, including a distinct "eToro rejected the request" case |
| Manage Admins + invite flow | `app/admin/pages/ManageAdmins.tsx` | invite-by-email calls an Edge Function; both function-level errors and the generic fallback are toasted; success message includes the invited email |
| Submissions (inbox for all public-form entries) | `app/admin/pages/Submissions.tsx` | not a create form — status-update and delete actions toast; delete additionally has a confirm dialog |
| Audit Log | `app/admin/pages/AuditLog.tsx` | read-only, no form — load failures toast |
| Dashboard | `app/admin/pages/Dashboard.tsx` | read-only, no form |
| Login (sign-in + forgot-password) | `app/admin/pages/Login.tsx` | **Fixed**: replaced two copy-pasted inline message blocks with shared `<FormMessage>` (explicit `aria-live`) |
| Set/Reset password | `app/admin/pages/SetPassword.tsx` | **Fixed**: same `<FormMessage>` swap |

### Design rationale for two feedback mechanisms, not one

The public site and the admin panel are visually two different systems (dark cinematic /
`.subpage-light` custom CSS vs. Tailwind-utility admin shell — see `design_brief.md`), so a single
component couldn't serve both without fighting one system's styling. Each side now has exactly **one**
shared component instead of copy-pasted per-form markup: `<FormFeedback>` for the public site,
`<Toast>` (CRUD forms) / `<FormMessage>` (persistent inline, auth forms) for the admin panel.

---

## Part 2 — 404 page

- **Route**: already wired as the catch-all (`{ path: "*", Component: NotFound }` in `app/routes.tsx`) —
  this existed before this pass.
- **Component**: `app/pages/NotFound.tsx`, styled with the same `.page-hero` / `.page-title` /
  `.page-sub` classes as every other page (per `design_brief.md` §6 "Subpage hero") — not a generic
  browser or hosting-provider error page.
- **Fixed**: added a clear `Back to home` primary button and a `Contact us` secondary button (previously
  only a single inline text link inside the paragraph) so a visitor who lands here isn't left with just
  prose to parse.
- **`noindex`**: already correctly wired, not something newly added — `resolveRouteMeta()` in
  `app/hooks/usePageMeta.ts` falls through to `NOT_FOUND_META` (`noindex: true`, `noCanonical: true`)
  for any pathname not in the known route table, and `<PageMeta>` renders that into
  `<meta name="robots" content="noindex, follow">`. Verified this fires correctly for the wildcard route.
- **HTTP-status caveat — flagged, not silently worked around**: the site's Vercel SPA rewrite
  (`vercel.json`) rewrites every unmatched path to `/index.html` with an HTTP 200. That means the
  *server* response for a bad URL is still `200 OK`; only once the JS bundle loads and React Router
  matches the wildcard route does the visitor (or a JS-executing crawler) see the actual 404 UI. This
  is a structural limitation of client-side routing on a rewrite-based host, not a bug this pass can
  fix without a Vercel Edge Middleware/Function — it's documented as a code comment at the top of
  `app/pages/NotFound.tsx`, rather than presented as a full technical 404.

---

## Left unfixed / out of scope

- **Newsletter/mailing-list form** — doesn't exist on the site (see table above); nothing to fix.
- **True HTTP 404 status** — architecturally out of reach on the current Vercel SPA-rewrite setup
  without adding Edge Middleware; documented above, not silently ignored.
- No form was found with a missing backend endpoint or a genuinely broken submit path — every form
  already inserts into a real Supabase table or Edge Function that exists in `supabase/migrations` /
  `supabase/functions`.

## Build verification

- `pnpm build` — succeeds (pre-existing large-chunk warnings only, unrelated to this change).
- `npx tsc --noEmit` — no type errors.

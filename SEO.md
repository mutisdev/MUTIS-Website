# SEO

## What's implemented

### Static (`index.html`)
- `<title>`, `<meta name="description">`, canonical link, Open Graph, and Twitter Card tags
  as a non-JS fallback (mainly relevant for the homepage — see Limitations below).
- `theme-color`, favicon, and `preconnect` to `fonts.googleapis.com` / `fonts.gstatic.com`.

### Per-route (`application/app/components/PageMeta.tsx` + `application/app/hooks/usePageMeta.ts`)
Meta is now managed with `react-helmet-async`. `usePageMeta.ts` holds the data
(`ROUTE_META`, keyed by pathname) and `<PageMeta pathname={...} override={...} />` renders it
via `<Helmet>`: `document.title`, `meta[name="description"]`, `meta[name="robots"]`,
canonical, `og:title/description/url/image`, `twitter:title/description/image`.

`<PageMeta>` is rendered once from the router's `Root()` for every route, and a second time
(nested, overriding) from `ArticleDetail.tsx` once an article loads, with the real article
title/description/image. Unknown paths fall back to a noindexed "Page not found" entry with
no canonical.

**Important gotcha if you touch this again:** `react-helmet-async` only ever manages tags it
added itself — it never removes pre-existing tags in `index.html`. `PageMeta.tsx` removes the
static per-route tags from the DOM once, on first mount, so there's exactly one copy of each
once JS runs. If you add a new head tag to `index.html` that also gets set per-route via
Helmet, add its selector to `STATIC_TAG_SELECTORS` in `PageMeta.tsx` too, or you'll end up
with silent duplicate tags (browsers/crawlers will just read whichever comes first in the DOM).

### Structured data
- `application/app/components/OrganizationJsonLd.tsx` — sitewide `Organization` JSON-LD,
  sourced from `useSiteSettings` (the `site_settings` table). Rendered from `Root()`.
- `Event` JSON-LD on `Events.tsx`, built from the page's own Supabase `events` query. There's
  no `/events/:id` route, so each entry's `url` points at `/events` itself, which is a known
  limitation.

### Crawlability
- [`public/robots.txt`](public/robots.txt) — allows all except `/admin`, points to the sitemap.
- [`public/sitemap.xml`](public/sitemap.xml) — generated at build time by
  `scripts/generate-sitemap.mjs` (`pnpm build` runs it automatically; `pnpm sitemap` runs it
  standalone). Combines the static public route list with published articles pulled live from
  Supabase. Degrades to static-routes-only if Supabase credentials aren't available at build
  time — check the build log for a warning if that happens unexpectedly.

## Configure your domain

The production domain is `https://www.mutisfinancesociety.com`. If it ever changes, update it in:
- `index.html` (canonical + `og:url` + `og:image`/`twitter:image`)
- `usePageMeta.ts` (`SITE_URL`)
- `public/robots.txt`
- `scripts/generate-sitemap.mjs` (`SITE_URL`)
- `supabase/functions/admin-add-by-email/index.ts` (`SITE_URL`) — requires redeploying that Edge Function

## Limitations & recommendations

- **Client-side rendering**: metadata is still set with JavaScript after load — moving to
  `react-helmet-async` fixed per-route *coverage and correctness* for anything that executes
  JS (Googlebot included), but didn't change *when* the tags are set. Non-JS crawlers and some
  social-share scrapers still only ever see `index.html`'s static tags (i.e. the homepage's).
  The real fix is prerendering (e.g. a build-time static-HTML-per-route step) or migrating to
  SSR (Next.js, or react-router's framework/SSR mode) — a meaningful engineering investment,
  not a drop-in change.
- Generate a real social share image (`og:image`) sized 1200×630 instead of the logo.
- No `BreadcrumbList` JSON-LD yet — judged low-value relative to cost given the site's shallow
  navigation depth; revisit if the site grows deeper nesting.

## How to verify

- Lighthouse → SEO on each route.
- Use the Facebook Sharing Debugger / Twitter Card Validator against the deployed URL.
- `view-source:` the deployed page to confirm the static tags, then inspect the live DOM
  `<head>` after navigation to confirm per-route updates — and confirm there's only **one**
  copy of each tag (canonical, description, og:image), not two.

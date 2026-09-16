# MUTIS Website

The official website for the **Manchester University Trading & Investment Society (MUTIS)** - one of the UK's largest student finance societies with 4,000+ members.

Built with React + TypeScript + Vite, with a Supabase backend (database, auth, storage, and edge functions) powering the content and the `/admin` panel. Hosted on Vercel.

---

## What's on the site

| Page | URL | What it shows |
|------|-----|---------------|
| Home | `/` | Cinematic landing with stats, society overview, and CTAs |
| About | `/about` | Who we are + committee roster |
| Events | `/events` | Flagship events + past-event photo gallery |
| MEIF | `/meif` | Manchester Ethical Investment Fund |
| Articles | `/articles` | Member research (empty until articles are published) |
| Sponsors | `/sponsors` | Partner firms with logos and careers links |
| Join | `/join` | Membership sign-up funnel |
| Contact | `/contact` | Contact form (submits to Supabase) |
| Alumni | `/alumni` | Alumni destinations (alias for Articles) |

---

## Running it locally

You'll need [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io) installed.

```bash
pnpm install       # install dependencies (first time only)
pnpm dev           # start dev server → http://localhost:5173
pnpm build         # production build → dist/
pnpm exec tsc --noEmit   # type-check without building
```

---

## Project layout

```
MUTIS-merged/
├── application/              # All source code lives here
│   ├── main.tsx              # App entry point
│   ├── app/
│   │   ├── routes.tsx        # Page routing
│   │   ├── components/       # Shared UI: Header, Footer, BackToTop, ScrollProgressBar
│   │   ├── pages/            # One file per page (Home, About, Events, etc.)
│   │   ├── hooks/            # Reusable logic: animations, SEO, scroll effects
│   │   └── data/
│   │       └── siteData.ts   # All static content: sponsors, events, stats
│   ├── assets/
│   │   ├── logos/            # Sponsor logo images
│   │   └── events/           # Past-event photos (shown in gallery on /events)
│   └── styles/
│       ├── index.css         # Imports everything below
│       ├── tailwind.css      # Tailwind v4 entry
│       ├── theme.css         # Design tokens (colours, spacing, fonts)
│       ├── fonts.css         # Web font declarations
│       ├── mutis-base.css    # Nav, hero, buttons, responsive, accessibility
│       ├── mutis-scroll.css  # Homepage scroll animations
│       └── mutis-subpage.css # Inner page styles (cards, forms, committee grid)
│
├── public/                   # Static files served as-is
│   ├── favicon.svg
│   ├── mutislogo.jpg         # Logo used in the nav bar
│   ├── WebsiteMainbg.webp    # Homepage hero background
│   ├── eventsbg.jpg          # Events page hero background
│   ├── robots.txt
│   └── sitemap.xml
│
├── index.html                # HTML shell (SEO meta)
├── vercel.json                # Vercel SPA rewrite config
├── vite.config.ts            # Vite config
├── tsconfig.json             # TypeScript config (strict mode)
└── package.json
```

---

## Updating content

Almost everything you'd want to change is in one place: **`application/app/data/siteData.ts`**

- **Statistics** (members count, partner count, events count) - `stats` array
- **Sponsor logos and careers links** - `sponsors` array
- **Industry events list** - `industryEvents` array

For page-specific content (committee members, MEIF details, articles), edit the relevant page file in `application/app/pages/`.

### Adding event photos
Drop images into `application/assets/events/` - they'll automatically appear in the gallery on `/events`. Any `.jpg`, `.jpeg`, `.png`, or `.webp` works.

### Adding sponsor logos
Add the image to `application/assets/logos/`, then reference it in `siteData.ts`:
```ts
const LOCAL_LOGOS = {
  "New Firm": new URL("../../assets/logos/new-firm.jpeg", import.meta.url).href,
  // ...
};
```

---

## Tech stack

| What | Tool |
|------|------|
| UI framework | React 18 |
| Language | TypeScript (strict) |
| Build tool | Vite 6 |
| Router | React Router 7 |
| Styling | Tailwind CSS v4 + custom CSS design system |
| Icons | lucide-react |
| Animations | motion (Framer Motion) |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Forms | `submit-form` Edge Function (verifies reCAPTCHA, then inserts) |
| Hosting | Vercel |
| Package manager | pnpm |

---

## Spam protection (reCAPTCHA)

Every public form (Contact, Sponsorship enquiry, Event signup, Attendance, Membership sign-up, Alumni registration) shows a Google **reCAPTCHA v2 "I'm not a robot" checkbox**. Forms don't write to the database directly: they send the data plus the captcha token to the `submit-form` Edge Function (`supabase/functions/submit-form`), which checks the token with Google and only then saves the submission. The database no longer lets visitors insert into those tables themselves, so the captcha can't be skipped.

### Keys

| Key | Where it goes | Secret? |
|-----|---------------|---------|
| Site key → `VITE_RECAPTCHA_SITE_KEY` | `.env.local` for local dev, and Vercel → Project Settings → Environment Variables | No (it's in the public bundle) |
| Secret key → `RECAPTCHA_SECRET_KEY` | `supabase secrets set RECAPTCHA_SECRET_KEY=...` **only** | **Yes, never commit it or put it in any `VITE_` variable** |

Optional: `RECAPTCHA_ALLOWED_HOSTNAMES` (comma-separated), a Supabase secret that overrides the default hostname allowlist (`mutisfinancesociety.com`, `www.mutisfinancesociety.com`, `localhost`).

### First-time setup / handing over to a new committee

1. Go to the [reCAPTCHA admin console](https://www.google.com/recaptcha/admin) with the society Google account and create a **v2 → "I'm not a robot" Checkbox** key.
2. Under **Domains**, add `mutisfinancesociety.com` and `localhost`.
3. Put the site key in `.env.local` and in Vercel, then redeploy the site.
4. Set the secret: `supabase secrets set RECAPTCHA_SECRET_KEY=<secret>`.
5. Deploy the function: `supabase functions deploy submit-form` (JWT verification is turned off for it in `supabase/config.toml`, because visitors aren't logged in).

**Deploy order matters:** deploy the function and the new frontend *before* applying the migration `20260917120000_lock_down_public_form_inserts.sql`. That migration removes direct inserts, so any older frontend still live at that point will stop submitting.

### Testing locally

Google publishes test keys that always pass: site key `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`, secret `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe`. Put the secret in `supabase/functions/.env` (gitignored) with `RECAPTCHA_ALLOWED_HOSTNAMES=localhost,testkey.google.com`, then run `supabase functions serve submit-form --env-file supabase/functions/.env`. Don't use the test keys in production.

---

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full Vercel setup guide.

The short version: push to your main branch and Vercel auto-deploys. The build command is `pnpm build` and the output directory is `dist`.

---

## What's not done yet

- **Articles** - the `/articles` page is built and ready; it just needs content added to the `articles` array in `siteData.ts`
- **Committee headshots** - set `headshot_url` per committee member in `About.tsx` to show photos instead of initials
- **MEIF documents** - PDF links and coverage notes are marked "coming soon" in `MEIF.tsx`
- **Event photo optimisation** - the photos in `application/assets/events/` are raw exports; converting to WebP would improve load times (see `PERFORMANCE.md`)

---

## Other docs

- [DEPLOYMENT.md](DEPLOYMENT.md) - how to deploy to Vercel
- [ACCESSIBILITY.md](ACCESSIBILITY.md) - accessibility features and how to maintain them
- [SEO.md](SEO.md) - how SEO is set up (per-route meta, sitemap, Open Graph)
- [PERFORMANCE.md](PERFORMANCE.md) - performance tips and image optimisation guide

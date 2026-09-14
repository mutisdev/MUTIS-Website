const SITE_NAME = "MUTIS Finance Society";
export const SITE_URL = "https://www.mutisfinancesociety.com";
export const DEFAULT_DESCRIPTION =
  "MUTIS is the University of Manchester's largest trading and investment society: events, the student-run Ethical Investment Fund (MEIF), member research, and industry partnerships.";
export const DEFAULT_IMAGE = `${SITE_URL}/mutislogo.jpg`;

export type Meta = {
  title: string;
  description: string;
  /** Absolute image URL for og:image/twitter:image. Defaults to DEFAULT_IMAGE. */
  image?: string;
  /** True for pages that should never be indexed (e.g. a redirect stub). */
  noindex?: boolean;
  /** Overrides the canonical path (defaults to the current pathname). */
  canonicalPath?: string;
  /** Omits the canonical tag entirely — only for genuine 404s, where no correct target exists. */
  noCanonical?: boolean;
};

/**
 * Per-route SEO metadata. Keys are pathnames. Consumed by <PageMeta> in
 * routes.tsx. Dynamic routes (e.g. /articles/:id) render their own
 * page-specific <Helmet> instead, which overrides these defaults.
 */
export const ROUTE_META: Record<string, Meta> = {
  "/": {
    title: "MUTIS Finance Society",
    description: DEFAULT_DESCRIPTION,
  },
  "/about": {
    title: "About | MUTIS Finance Society",
    description:
      "Who we are: a student-run finance society at the University of Manchester with 5,000+ members, a real investment fund, and a committee across events, research, and operations.",
  },
  "/team": {
    title: "Team | MUTIS Finance Society",
    description:
      "Meet the MUTIS committee: our Co-Presidents, Executive Committee, and the tech, sponsorships, operations, and Women in Finance teams who run the society.",
  },
  "/events": {
    title: "Events | MUTIS Finance Society",
    description:
      "Flagship conferences, the UK Student Finance Summit, the M&A Challenge, and partner sessions that put MUTIS members in the room with the firms hiring them.",
  },
  "/meif": {
    title: "MEIF: Manchester Ethical Investment Fund | MUTIS Finance Society",
    description:
      "The MUTIS Ethical Investment Fund is a student-managed global equity fund with five equity coverage desks and a macro team, screened against ethical criteria.",
  },
  "/wif": {
    title: "Women in Finance (WiF) | MUTIS Finance Society",
    description:
      "Women in Finance (WiF) is MUTIS's dedicated sub-committee supporting women and gender minorities pursuing careers in finance, with its own events, mentorship, and networking.",
  },
  "/articles": {
    title: "Articles | MUTIS Finance Society Member Research",
    description:
      "Original notes, deep-dives, and market commentary from MUTIS analysts and MEIF coverage teams.",
  },
  "/sponsors": {
    title: "Sponsors & Partners | MUTIS Finance Society",
    description:
      "MUTIS partner firms across investment banking, markets, wealth management, and education underwrite events, host workshops, and meet members ahead of recruitment.",
  },
  "/join": {
    title: "Join MUTIS Finance Society: Become a Member",
    description:
      "Membership is open to every University of Manchester student. Sign up via the Students' Union, come to a weekly meeting, and apply to MEIF, IBC, or a sub-committee.",
  },
  "/signup": {
    title: "Sign Up | MUTIS Finance Society",
    description:
      "Become a MUTIS member: fill in your name, university email, course, and year of study to sign up.",
  },
  "/contact": {
    title: "Contact | MUTIS Finance Society",
    description:
      "Get in touch with MUTIS: membership, partnerships and sponsorship, MEIF applications, or press enquiries.",
  },
  "/previous-presidents": {
    title: "Previous Presidents | MUTIS Finance Society",
    description:
      "The presidents who have led MUTIS through each academic year since its founding, and the leadership that has shaped the society.",
  },
  "/network": {
    title: "Our Network | MUTIS Finance Society",
    description:
      "Past MUTIS members now working across investment banking, markets, asset management, and consulting — and the placements that got them there.",
  },
  "/past-speakers": {
    title: "Past Speakers | MUTIS Finance Society",
    description:
      "Senior professionals from across banking, markets, and asset management who have shared their insight with MUTIS members.",
  },
  "/media": {
    title: "Media | MUTIS Finance Society",
    description:
      "Photos, recordings, and our podcast — everything from the MUTIS year in one place.",
  },
  "/gallery": {
    title: "Gallery | MUTIS Finance Society",
    description:
      "Conferences, socials, simulations, and speaker nights — a look back at the people and events that make up the society.",
  },
  "/recordings": {
    title: "Recordings | MUTIS Finance Society",
    description:
      "Missed a talk or panel? Recordings of selected MUTIS events, published for members to catch up in their own time.",
  },
  // Client-side redirect stub (see SEO-AUDIT.md 2.5) — points crawlers at the
  // real destination instead of letting them index an empty transitional page.
  "/alumni": {
    title: "Our Network | MUTIS Finance Society",
    description:
      "Past MUTIS members now working across investment banking, markets, asset management, and consulting — and the placements that got them there.",
    noindex: true,
    canonicalPath: "/network",
  },
  // Unlisted, QR-code-only utility page for logging in-person attendance —
  // no search intent to serve, so it's excluded from indexing and the sitemap.
  "/attendance": {
    title: "Log Attendance | MUTIS Finance Society",
    description: "Log your attendance at a MUTIS event.",
    noindex: true,
  },
  // Utility form page, reached via the CTA on /network — no independent
  // search intent, same reasoning as /attendance above.
  "/alumni/register": {
    title: "Register | MUTIS Alumni Network",
    description: "Add your details to the MUTIS alumni network directory.",
    noindex: true,
  },
  "/privacy": {
    title: "Privacy Notice | MUTIS Finance Society",
    description: "What MUTIS collects through this site's forms, why, and how to request access or deletion.",
  },
};

export const NOT_FOUND_META: Meta = {
  title: `Page not found | ${SITE_NAME}`,
  description: DEFAULT_DESCRIPTION,
  noindex: true,
  noCanonical: true,
};

/**
 * Fallback shown for the /articles/:id path while ArticleDetail's own
 * <PageMeta override={...}> loads (or if it never mounts one at all).
 * noCanonical because react-helmet-async only overrides a tag a nested
 * Helmet actually re-renders — if this fallback asserted a canonical for
 * the raw dynamic path, an error/loading state that omits its own canonical
 * wouldn't be able to suppress it (there'd be nothing to override it with).
 */
export const ARTICLE_LOADING_META: Meta = {
  ...ROUTE_META["/articles"],
  noCanonical: true,
};

export function resolveRouteMeta(pathname: string): Meta {
  if (pathname in ROUTE_META) {
    return ROUTE_META[pathname];
  }
  if (pathname.startsWith("/articles/")) {
    return ARTICLE_LOADING_META;
  }
  return NOT_FOUND_META;
}

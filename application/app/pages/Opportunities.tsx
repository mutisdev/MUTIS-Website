import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Helmet } from "react-helmet-async";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackground } from "@/app/hooks/usePageBackgrounds";
import { PageHeroBackdrop } from "@/app/components/PageHeroBackdrop";
import { htmlToExcerpt } from "@/app/lib/htmlExcerpt";
import { SITE_URL } from "@/app/hooks/usePageMeta";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { isPositionOpen, positionStatusLabel } from "@shared/positionStatus";

type PositionRow = Tables<"positions">;

export function Opportunities() {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadPositions = async () => {
      setIsLoading(true);
      setLoadError("");

      // All published listings; they're split into open and closed at render
      // time (see isPositionOpen), so a round closes the moment its deadline
      // passes with no cron job — the same approach the Events page takes.
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .eq("is_published", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load positions", error);
        setLoadError("We could not load opportunities right now. Please refresh the page.");
        setPositions([]);
        setIsLoading(false);
        return;
      }

      setPositions(data ?? []);
      setIsLoading(false);
    };

    void loadPositions();

    return () => {
      cancelled = true;
    };
  }, []);

  const now = Date.now();
  const open = positions.filter((p) => isPositionOpen(p, now));
  const closed = positions.filter((p) => !isPositionOpen(p, now));

  // Open listings grouped by category, in the order their categories first
  // appear — so the admin's display_order decides the section order too, with
  // no second field to keep in step.
  const categories: { name: string; items: PositionRow[] }[] = [];
  for (const position of open) {
    const existing = categories.find((group) => group.name === position.category);
    if (existing) existing.items.push(position);
    else categories.push({ name: position.category, items: [position] });
  }

  useReveal([positions.length, isLoading, loadError]);
  const heroBackground = usePageBackground("opportunities");

  // JobPosting JSON-LD, built live from the same query above. Only open
  // listings: a closed round isn't something anyone can still apply to, and
  // marking one up as a live posting would be misleading.
  const jobsJsonLd =
    open.length > 0
      ? {
          "@context": "https://schema.org",
          "@graph": open.map((p) => ({
            "@type": "JobPosting",
            title: p.title,
            description: htmlToExcerpt(p.description, 300),
            datePosted: p.created_at,
            validThrough: p.closes_at ?? undefined,
            employmentType: "VOLUNTEER",
            hiringOrganization: {
              "@type": "Organization",
              name: "MUTIS Finance Society",
              sameAs: SITE_URL,
            },
            jobLocation: {
              "@type": "Place",
              address: {
                "@type": "PostalAddress",
                addressLocality: "Manchester",
                addressCountry: "GB",
              },
            },
            url: `${SITE_URL}/opportunities/${p.id}`,
          })),
        }
      : null;

  return (
    <>
      {jobsJsonLd && (
        <Helmet>
          <script type="application/ld+json">{JSON.stringify(jobsJsonLd)}</script>
        </Helmet>
      )}
      <section className="page-hero">
        <PageHeroBackdrop {...heroBackground} />
        <div className="page-hero-inner">
          <div>
            <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><span>Opportunities</span></div>
            <h1 className="page-title r-up"><span className="accent">Opportunities</span></h1>
          </div>
          <p className="page-sub r-up">Positions and schemes you can apply for across the society.</p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Open now</div>
          {isLoading ? (
            <p className="lede r-up" role="status">Loading opportunities…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : open.length === 0 ? (
            <>
              <h2 className="r-up">Nothing open right now</h2>
              <p className="lede r-up">
                Applications open at the start of each semester. Check back soon, or{" "}
                <Link to="/contact">get in touch</Link> if you want to be told when they do.
              </p>
            </>
          ) : (
            categories.map((group) => (
              <div key={group.name} style={{ marginBottom: 48 }}>
                <h2 className="r-up">{group.name}</h2>
                <div className="card-grid">
                  {group.items.map((p) => (
                    <PositionCard key={p.id} position={p} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {closed.length > 0 && (
        <section className="page-section" style={{ background: "var(--base)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="inner">
            <div className="page-eyebrow r-up"><span className="bar" />Closed</div>
            <h2 className="r-up">Previously open</h2>
            <p className="lede r-up">
              Kept here so you can see what we recruit for and when, and be ready for the next round.
            </p>
            <div className="card-grid">
              {closed.map((p) => (
                <PositionCard key={p.id} position={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function PositionCard({ position }: { position: PositionRow }) {
  const open = isPositionOpen(position);
  return (
    <div className="dark-card r-up">
      <h3>{position.title}</h3>
      <div className="tag-list">
        <span className="tag-badge">{position.category}</span>
      </div>
      <p className="excerpt">{htmlToExcerpt(position.description)}</p>
      <div className="foot">
        <span>{positionStatusLabel(position)}</span>
        <Link to={`/opportunities/${position.id}`} className="more" style={{ textDecoration: "none" }}>
          {open ? "View and apply →" : "View details →"}
        </Link>
      </div>
    </div>
  );
}

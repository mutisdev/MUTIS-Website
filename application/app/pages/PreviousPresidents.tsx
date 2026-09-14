import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type PresidentRow = Tables<"presidents">;

function presidentPhotoUrl(id: string) {
  return supabase.storage.from("president_photos").getPublicUrl(`${id}.jpeg`).data.publicUrl;
}

function PresidentPortrait({ name, id }: { name: string; id: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span aria-hidden="true">{name.charAt(0)}</span>;
  }

  return (
    <img
      src={presidentPhotoUrl(id)}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function PreviousPresidents() {
  const { settings } = useSiteSettings();
  const [presidents, setPresidents] = useState<PresidentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadPresidents = async () => {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("presidents")
        .select("*")
        .eq("is_published", true)
        .order("start_year", { ascending: false });

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load presidents", error);
        setLoadError("We could not load this page right now. Please refresh the page.");
        setPresidents([]);
        setIsLoading(false);
        return;
      }

      setPresidents(data ?? []);
      setIsLoading(false);
    };

    void loadPresidents();

    return () => {
      cancelled = true;
    };
  }, []);

  useReveal([presidents.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("previous-presidents");

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link>
              <span>/</span>
              <Link to="/about">About</Link>
              <span>/</span>
              <span>Previous Presidents</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />History</div>
            <h1 className="page-title r-up">
              Previous<br /><span className="accent">Presidents</span>
            </h1>
          </div>
          <p className="page-sub r-up">
            MUTIS has been shaped by each year&apos;s leadership. This page records the presidents who led the society through each academic year since its founding in {settings.founding_year}.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Leadership Record</div>
          <h2 className="r-up">Society Presidents</h2>

          {isLoading ? (
            <p className="lede r-up" role="status">Loading…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : presidents.length === 0 ? (
            <p className="lede r-up" style={{ color: "var(--ink-soft)" }}>
              We&apos;re building out this historical record.{" "}
              <Link to="/contact" style={{ color: "var(--pm-accent-2)" }}>Know a name we're missing? Let us know</Link>.
            </p>
          ) : (
            <div className="network-grid r-up">
              {presidents.map((p) => (
                <article className="network-card" key={p.id}>
                  <div className="network-portrait">
                    <PresidentPortrait name={p.name} id={p.id} />
                  </div>
                  <div
                    className="network-role"
                    style={{ color: "var(--pm-accent-2)", marginTop: 0, marginBottom: 8 }}
                  >
                    {p.year_label}
                  </div>
                  <div className="network-name">{p.name}</div>
                  {p.notes && <div className="network-firm">{p.notes}</div>}
                  {p.linkedin_url && (
                    <a className="network-linkedin" href={p.linkedin_url} target="_blank" rel="noreferrer">
                      LinkedIn →
                    </a>
                  )}
                </article>
              ))}
            </div>
          )}

          {presidents.length > 0 && (
            <p
              style={{
                marginTop: "48px",
                fontSize: "13px",
                lineHeight: 1.6,
                color: "var(--dim)",
              }}
            >
              Know a name we&apos;re missing?{" "}
              <Link to="/contact" style={{ color: "var(--pm-accent-2)", textDecoration: "underline" }}>
                Let us know
              </Link>
              .
            </p>
          )}
        </div>
      </section>
    </>
  );
}

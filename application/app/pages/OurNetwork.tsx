import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type AlumniRow = Tables<"alumni">;
type NetworkLogoRow = Tables<"network_logos">;

function initialsFromName(name: string) {
  const initials = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "CO";
}

function NetworkLogoBubble({ logo }: { logo: NetworkLogoRow }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 96,
        height: 56,
        padding: "8px 14px",
        border: "1px solid var(--hair)",
        borderRadius: 999,
        background: "rgba(255,255,255,0.02)",
      }}
      title={logo.company_name}
    >
      {failed ? (
        <span style={{ fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {initialsFromName(logo.company_name)}
        </span>
      ) : (
        <img
          src={logo.logo_url}
          alt={logo.company_name}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
        />
      )}
    </span>
  );
}

function alumniPhotoUrl(id: string) {
  return supabase.storage.from("alumni_photos").getPublicUrl(`${id}.jpeg`).data.publicUrl;
}

function NetworkCard({ m }: { m: AlumniRow }) {
  return (
    <article className="network-card">
      <div className="network-portrait">
        <NetworkPortrait name={m.name} id={m.id} />
      </div>
      <div className="network-name">{m.name}</div>
      <div className="network-firm">{m.firm}</div>
      <div className="network-role">{m.role} · {m.cohort}</div>
      {m.degree_course && <div className="network-meta">{m.degree_course}</div>}
      {m.industry && <div className="network-meta">{m.industry}</div>}
      {m.mutis_position && <div className="network-meta">{m.mutis_position}</div>}
      {m.location && (
        <div style={{ fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-soft)", marginTop: 4 }}>{m.location}</div>
      )}
      {m.linkedin_url && (
        <a className="network-linkedin" href={m.linkedin_url} target="_blank" rel="noreferrer">
          LinkedIn →
        </a>
      )}
    </article>
  );
}

function NetworkPortrait({ name, id }: { name: string; id: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span aria-hidden="true">{name.charAt(0)}</span>;
  }

  return (
    <img
      src={alumniPhotoUrl(id)}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function distinct(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort();
}

export function OurNetwork() {
  const [members, setMembers] = useState<AlumniRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [logos, setLogos] = useState<NetworkLogoRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("network_logos")
      .select("*")
      .eq("is_published", true)
      .order("display_order")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load network logos", error);
        setLogos(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAlumni = async () => {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("alumni")
        .select("*")
        .eq("is_published", true)
        .order("cohort", { ascending: false })
        .order("name");

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load alumni", error);
        setLoadError("We could not load the network directory right now. Please refresh the page.");
        setMembers([]);
        setIsLoading(false);
        return;
      }

      setMembers(data ?? []);
      setIsLoading(false);
    };

    void loadAlumni();

    return () => {
      cancelled = true;
    };
  }, []);

  const [filterRole, setFilterRole]       = useState("");
  const [filterFirm, setFilterFirm]       = useState("");
  const [filterLocation, setFilterLocation] = useState("");

  const roles     = distinct(members.map((m) => m.role));
  const firms     = distinct(members.map((m) => m.firm));
  const locations = distinct(members.map((m) => m.location).filter((l): l is string => Boolean(l)));

  const filtered = members.filter((m) => {
    if (filterRole     && m.role     !== filterRole)     return false;
    if (filterFirm     && m.firm     !== filterFirm)     return false;
    if (filterLocation && m.location !== filterLocation) return false;
    return true;
  });

  const hasFilters = filterRole || filterFirm || filterLocation;

  useReveal([members.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("network");

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><span>Our Network</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Our Network</div>
            <h1 className="page-title r-up">
              Members who<br />made the <span className="accent">leap</span>
            </h1>
          </div>
          <p className="page-sub r-up">
            Past MUTIS members now working across investment banking, markets, asset
            management, and consulting — and the placements that got them there.
          </p>
        </div>
      </section>

      {/* Company destinations — logo bubble section */}
      <section className="page-section" style={{ borderBottom: "1px solid var(--hair)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Destinations</div>
          <h2 className="r-up">Where MUTIS members go</h2>
          <p className="lede r-up">
            Graduate and internship destinations for MUTIS members across recent years.
            This list is indicative, not exhaustive.
          </p>

          {logos.length === 0 ? (
            <p className="lede r-up" style={{ marginTop: 24, color: "var(--ink-soft)" }}>
              We&apos;re building out this list — check back soon.
            </p>
          ) : (
            <div className="r-up" style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 32 }}>
              {logos.map((logo) => (
                <NetworkLogoBubble logo={logo} key={logo.id} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Member directory with filters */}
      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Placements</div>
          <h2 className="r-up">Individual profiles</h2>

          {/* Filter bar */}
          <div className="r-up" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28, marginBottom: 36 }}>
            <div className="field" style={{ minWidth: 180, marginBottom: 0 }}>
              <label htmlFor="filter-role" style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" }}>Role</label>
              <select
                id="filter-role"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                disabled={roles.length === 0}
              >
                <option value="">All roles</option>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="field" style={{ minWidth: 180, marginBottom: 0 }}>
              <label htmlFor="filter-firm" style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" }}>Company</label>
              <select
                id="filter-firm"
                value={filterFirm}
                onChange={(e) => setFilterFirm(e.target.value)}
                disabled={firms.length === 0}
              >
                <option value="">All companies</option>
                {firms.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="field" style={{ minWidth: 180, marginBottom: 0 }}>
              <label htmlFor="filter-location" style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase" }}>Location</label>
              <select
                id="filter-location"
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                disabled={locations.length === 0}
              >
                <option value="">All locations</option>
                {locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            {hasFilters && (
              <button
                className="btn btn-ghost"
                style={{ alignSelf: "flex-end", fontSize: 12 }}
                onClick={() => { setFilterRole(""); setFilterFirm(""); setFilterLocation(""); }}
              >
                Clear filters
              </button>
            )}
          </div>

          {isLoading ? (
            <p className="lede r-up" role="status">Loading network directory…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : members.length === 0 ? (
            <p className="lede r-up">
              We&apos;re building out our network directory. If you&apos;re a former member
              who secured a placement and would like to be featured,{" "}
              <Link to="/contact" style={{ color: "var(--accent)" }}>get in touch</Link>.
            </p>
          ) : filtered.length === 0 ? (
            <p className="lede r-up" style={{ color: "var(--ink-soft)" }}>
              No members match the current filters.{" "}
              <button
                style={{ background: "none", border: "none", color: "var(--pm-accent)", cursor: "pointer", fontSize: "inherit", padding: 0 }}
                onClick={() => { setFilterRole(""); setFilterFirm(""); setFilterLocation(""); }}
              >
                Clear filters →
              </button>
            </p>
          ) : (
            <div className="network-grid r-up">
              {filtered.map((m) => (
                <NetworkCard m={m} key={m.id} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Alumni submission — native form */}
      <section className="page-section" style={{ borderTop: "1px solid var(--hair)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Get featured</div>
          <h2 className="r-up">Are you a MUTIS alumnus?</h2>
          <p className="lede r-up">
            Help us grow the network directory above. Share your details, career journey,
            and a short piece of advice for current members — it only takes a couple of
            minutes.
          </p>
          <Link to="/alumni/register" className="btn btn-primary r-up" style={{ marginTop: 28, textDecoration: "none" }}>
            Register your details
            <span className="arrow" />
          </Link>
        </div>
      </section>
    </>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// Company destinations — shown as logo bubbles. A bubble uses the firm's logo
// when a published sponsor row has a matching name; otherwise a monogram.
const DESTINATION_GROUPS = [
  {
    category: "Investment Banking",
    firms: ["Goldman Sachs", "JPMorgan", "Morgan Stanley", "Houlihan Lokey", "Rothschild & Co", "UBS", "Bank of America"],
  },
  {
    category: "Markets & Asset Management",
    firms: ["BlackRock", "Barclays", "Invesco", "BNY"],
  },
  {
    category: "Advisory & Consulting",
    firms: ["Deloitte", "KPMG", "PwC"],
  },
];

type AlumniRow = Tables<"alumni">;

const normalizeFirm = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

// "Goldman Sachs" → GS, "Bank of America" → BA, "JPMorgan" → JPM, "KPMG" → KPMG.
function firmMonogram(name: string) {
  const words = name.split(/[^A-Za-z0-9]+/).filter((w) => /^[A-Z]/.test(w));
  if (words.length > 1) return words.slice(0, 2).map((w) => w[0]).join("");
  const word = words[0] ?? name;
  if (word.length <= 4) return word;
  const capitals = word.replace(/[^A-Z]/g, "");
  return capitals.length >= 2 ? capitals.slice(0, 3) : word[0];
}

function LogoBubble({ firm, logo }: { firm: string; logo?: string }) {
  const [failed, setFailed] = useState(false);
  const monogram = firmMonogram(firm);
  return (
    <div className="logo-bubble">
      <div className={"logo-bubble-circle" + (monogram.length >= 4 ? " logo-bubble-circle--long" : "")}>
        {logo && !failed ? (
          <img src={logo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
        ) : (
          <span aria-hidden="true">{monogram}</span>
        )}
      </div>
      <div className="logo-bubble-name">{firm}</div>
    </div>
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

  // Read-only lookup of existing sponsor logos for the destination bubbles.
  const [logosByFirm, setLogosByFirm] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("sponsors")
      .select("name, logo_url")
      .eq("is_published", true)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load sponsor logos for network bubbles", error);
        const map: Record<string, string> = {};
        for (const row of data ?? []) {
          if (row.logo_url) map[normalizeFirm(row.name)] = row.logo_url;
        }
        setLogosByFirm(map);
      });
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

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><span>Network</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Network</div>
            <h1 className="page-title r-up">
              Members who<br />made the <span className="accent">leap</span>
            </h1>
          </div>
          <p className="page-sub r-up">
            Former members now in banking, markets, asset management, and consulting.
          </p>
        </div>
      </section>

      {/* Company destinations — logo bubble section */}
      <section className="page-section" style={{ borderBottom: "1px solid var(--hair)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Destinations</div>
          <h2 className="r-up">Where our alumni go</h2>
          <p className="lede r-up">Recent graduate and internship destinations.</p>

          {DESTINATION_GROUPS.map((group) => (
            <div key={group.category} className="r-up" style={{ marginTop: 36 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 18 }}>
                {group.category}
              </div>
              <div className="logo-bubbles">
                {group.firms.map((firm) => (
                  <LogoBubble key={firm} firm={firm} logo={logosByFirm[normalizeFirm(firm)]} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Member directory with filters */}
      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Placements</div>
          <h2 className="r-up">Alumni profiles</h2>

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
              Directory coming soon. Former member?{" "}
              <Link to="/alumni/register" style={{ color: "var(--accent)" }}>Get featured</Link>.
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
            Tell us where MUTIS took you. It takes a couple of minutes.
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

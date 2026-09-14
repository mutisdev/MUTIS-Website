import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type CommitteeRow = Tables<"committee_members">;

function committeePhotoUrl(id: string, updatedAt: string) {
  const url = supabase.storage.from("committee_photos").getPublicUrl(`${id}.jpeg`).data.publicUrl;
  return `${url}?v=${new Date(updatedAt).getTime()}`;
}

function CommitteeGridSkeleton() {
  return (
    <div className="committee-grid committee-grid--4col" style={{ marginTop: 44 }} aria-busy="true" aria-live="polite">
      {Array.from({ length: 8 }).map((_, index) => (
        <div className="member" key={index} aria-hidden="true">
          <div className="portrait portrait-fallback" style={{ opacity: 0.35 }}>
            <span>--</span>
          </div>
          <div style={{ height: 14, width: "72%", background: "rgba(255,255,255,0.08)", margin: "18px auto 10px", borderRadius: 999 }} />
          <div style={{ height: 10, width: "46%", background: "rgba(255,255,255,0.06)", margin: "0 auto" }} />
        </div>
      ))}
    </div>
  );
}

function MemberPortrait({
  name,
  initials,
  headshotUrl,
}: {
  name: string;
  initials: string | null;
  headshotUrl: string | null;
}) {
  const [failed, setFailed] = useState(false);
  const fallbackText = initials || name.charAt(0).toUpperCase() || "·";

  if (!headshotUrl || failed) {
    return (
      <div className="portrait portrait-fallback" aria-hidden="true">
        <span>{fallbackText}</span>
      </div>
    );
  }

  return (
    <img
      className="portrait"
      src={headshotUrl}
      alt={name}
      loading="lazy"
      decoding="async"
      style={{ objectFit: "cover", objectPosition: "top center" }}
      onError={() => setFailed(true)}
    />
  );
}

export function Team() {
  const [committee, setCommittee] = useState<CommitteeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadCommittee = async () => {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("committee_members")
        .select("*")
        .order("display_order");

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load committee", error);
        setLoadError("We could not load the committee list right now. Please refresh the page.");
        setCommittee([]);
        setIsLoading(false);
        return;
      }

      setCommittee(data ?? []);
      setIsLoading(false);
    };

    void loadCommittee();

    return () => {
      cancelled = true;
    };
  }, []);

  useReveal([committee.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("team");

  const renderMember = (m: CommitteeRow) => {
    const inner = (
      <>
        <MemberPortrait name={m.name} initials={null} headshotUrl={committeePhotoUrl(m.id, m.updated_at)} />
        <div className="name">{m.name}</div>
        <div className="role">{m.role}</div>
      </>
    );
    return m.linkedin_url ? (
      <a key={m.id} className="member" href={m.linkedin_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit", display: "block" }}>
        {inner}
      </a>
    ) : (
      <div key={m.id} className="member">{inner}</div>
    );
  };

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><span>Team</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />The Committee</div>
            <h1 className="page-title r-up">The people<br />behind<br /><span className="accent">MUTIS</span></h1>
          </div>
          <p className="page-sub r-up">
            Run entirely by students, led by our Co-Presidents and Executive Committee.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow"><span className="bar" />Team</div>
          <h2 className="r-up">Meet the committee</h2>

          {isLoading ? (
            <>
              <p className="lede r-up" role="status">Loading committee members…</p>
              <CommitteeGridSkeleton />
            </>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : committee.length === 0 ? (
            <p className="lede r-up" role="status" style={{ color: "var(--ink-soft)" }}>
              No committee members are published yet.
            </p>
          ) : (
            <div className="committee-grid committee-grid--4col" style={{ marginTop: 44 }}>
              {committee.map(renderMember)}
            </div>
          )}
        </div>
      </section>

      <section className="page-section" style={{ borderTop: "1px solid var(--hair)" }}>
        <div className="inner" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link to="/about" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            About MUTIS →
          </Link>
          <Link to="/previous-presidents" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Previous Presidents →
          </Link>
          <Link to="/network" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Our Network →
          </Link>
        </div>
      </section>
    </>
  );
}

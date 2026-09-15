import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type SpeakerRow = Tables<"past_speakers">;

function speakerPhotoUrl(id: string) {
  return supabase.storage.from("speaker_photos").getPublicUrl(`${id}.jpeg`).data.publicUrl;
}

function SpeakerPhoto({ name, id }: { name: string; id: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span aria-hidden="true">{name.charAt(0)}</span>;
  }

  return (
    <img
      src={speakerPhotoUrl(id)}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

export function PastSpeakers() {
  const [speakers, setSpeakers] = useState<SpeakerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadSpeakers = async () => {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("past_speakers")
        .select("*")
        .eq("is_published", true)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Failed to load past speakers", error);
        setLoadError("We could not load this page right now. Please refresh the page.");
        setSpeakers([]);
        setIsLoading(false);
        return;
      }

      setSpeakers(data ?? []);
      setIsLoading(false);
    };

    void loadSpeakers();

    return () => {
      cancelled = true;
    };
  }, []);

  useReveal([speakers.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("past-speakers");

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><span>Past Speakers</span>
            </div>
            <h1 className="page-title r-up">Past<br /><span className="accent">Speakers</span></h1>
          </div>
          <p className="page-sub r-up">
            Senior professionals from banking, markets, and asset management.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Speaker Archive</div>
          <h2 className="r-up">Previous speakers</h2>

          {isLoading ? (
            <p className="lede r-up" role="status">Loading…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : speakers.length === 0 ? (
            <p className="lede r-up">
              Speaker archive coming soon.
            </p>
          ) : (
            <div className="speaker-grid r-up">
              {speakers.map((s) => (
                <article className="speaker-card" key={s.id}>
                  <div className="speaker-photo">
                    <SpeakerPhoto name={s.name} id={s.id} />
                  </div>
                  <div className="speaker-name">{s.name}</div>
                  <div className="speaker-role">{s.role}</div>
                  <div className="speaker-firm">{s.firm}</div>
                  <div className="speaker-event">{s.event}</div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

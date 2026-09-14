import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type RecordingRow = Tables<"recordings">;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

export function Recordings() {
  const { settings } = useSiteSettings();
  const [recordings, setRecordings] = useState<RecordingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadRecordings = async () => {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("recordings")
        .select("*")
        .eq("is_published", true)
        .order("event_date", { ascending: false });

      if (cancelled) return;

      if (error) {
        console.error("Failed to load recordings", error);
        setLoadError("We could not load this page right now. Please refresh the page.");
        setRecordings([]);
        setIsLoading(false);
        return;
      }

      setRecordings(data ?? []);
      setIsLoading(false);
    };

    void loadRecordings();

    return () => {
      cancelled = true;
    };
  }, []);

  useReveal([recordings.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("recordings");

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><span>Media</span><span>/</span><span>Recordings</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Media</div>
            <h1 className="page-title r-up">Watch events<br /><span className="accent">on demand</span></h1>
          </div>
          <p className="page-sub r-up">
            Missed a talk or panel? Catch up here.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Recorded Events</div>
          <h2 className="r-up">Talks &amp; panels</h2>

          {isLoading ? (
            <p className="lede r-up" role="status">Loading…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : recordings.length === 0 ? (
            <p className="lede r-up">
              Recordings of recent talks and panels will be published here soon. Follow us on{" "}
              <a href={settings.instagram_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Instagram</a>{" "}
              for announcements.
            </p>
          ) : (
            <div className="card-grid">
              {recordings.map((r) =>
                r.recording_url ? (
                  <a
                    key={r.id}
                    className="dark-card r-up"
                    href={r.recording_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <div className="num">▶ Watch</div>
                    <h3>{r.title}</h3>
                    <div className="meta"><span>{r.speaker ?? "MUTIS"}</span><span>·</span><span>{formatDate(r.event_date)}</span></div>
                    <div className="foot"><span>Recording</span><span className="more">Play →</span></div>
                  </a>
                ) : (
                  <div key={r.id} className="dark-card r-up">
                    <div className="num">▶ Watch</div>
                    <h3>{r.title}</h3>
                    <div className="meta"><span>{r.speaker ?? "MUTIS"}</span><span>·</span><span>{formatDate(r.event_date)}</span></div>
                    <div className="foot"><span>Recording</span></div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

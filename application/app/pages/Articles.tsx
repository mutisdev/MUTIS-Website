import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type ArticleRow = Tables<"articles">;

const formatDate = (isoString: string | null) =>
  isoString
    ? new Date(isoString).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "";

export function Articles() {
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadArticles = async () => {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load articles", error);
        setLoadError("We could not load articles right now. Please refresh the page.");
        setArticles([]);
        setIsLoading(false);
        return;
      }

      setArticles(data ?? []);
      setIsLoading(false);
    };

    void loadArticles();

    return () => {
      cancelled = true;
    };
  }, []);

  useReveal([articles.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("articles");

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><span>Articles</span></div>
            <div className="page-eyebrow r-up"><span className="bar" />Articles</div>
            <h1 className="page-title r-up">Member<br /><span className="accent">research</span></h1>
          </div>
          <p className="page-sub r-up">Notes, deep-dives, and market commentary from MUTIS analysts.</p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Latest</div>
          <h2 className="r-up">Latest research</h2>

          {isLoading ? (
            <p className="lede r-up" role="status">Loading articles…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : articles.length === 0 ? (
            <p className="lede r-up">
              First notes of the year are on the way. Follow us on{" "}
              <a href="https://instagram.com/mutisfinancesoc" target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Instagram</a>{" "}
              or <Link to="/contact" style={{ color: "var(--accent)" }}>get in touch</Link> to be notified.
            </p>
          ) : (
            <div className="card-grid">
              {articles.map((a) => (
                <Link key={a.id} className="dark-card r-up" to={`/articles/${a.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                  {a.cover_image_url && (
                    <img src={a.cover_image_url} alt={a.title} className="article-thumb" loading="lazy" decoding="async" />
                  )}
                  <div className="num">{a.tag}</div>
                  <h3>{a.title}</h3>
                  <div className="meta"><span>{a.author_name}</span><span>·</span><span>{formatDate(a.published_at)}</span></div>
                  <div className="foot"><span>Member Research</span><span className="more">Read more →</span></div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

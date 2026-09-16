import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import DOMPurify from "dompurify";
import { useReveal } from "@/app/hooks/useReveal";
import { htmlToExcerpt } from "@/app/lib/htmlExcerpt";
import { PageMeta } from "@/app/components/PageMeta";
import { DEFAULT_DESCRIPTION } from "@/app/hooks/usePageMeta";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { DocumentViewer } from "@/app/components/DocumentViewer";

type ArticleRow = Tables<"articles">;

const formatDate = (isoString: string | null) =>
  isoString
    ? new Date(isoString).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "";

export function ArticleDetail() {
  const { id } = useParams();
  const [article, setArticle] = useState<ArticleRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadArticle = async () => {
      if (!id) {
        setArticle(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("id", id)
        .eq("status", "published")
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load article", error);
        setLoadError("We could not load this article right now. Please refresh the page.");
        setArticle(null);
        setIsLoading(false);
        return;
      }

      setArticle(data);
      setIsLoading(false);
    };

    void loadArticle();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useReveal([article?.id, isLoading, loadError]);

  if (isLoading) {
    return (
      <section className="page-section">
        <div className="inner">
          <p className="lede r-up" role="status">Loading article…</p>
        </div>
      </section>
    );
  }

  if (loadError || !article) {
    return (
      <section className="page-section">
        <PageMeta
          pathname={`/articles/${id ?? ""}`}
          override={{
            title: `Article not found | MUTIS Finance Society`,
            description: DEFAULT_DESCRIPTION,
            noindex: true,
            noCanonical: true,
          }}
        />
        <div className="inner">
          <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><Link to="/articles">Articles</Link></div>
          <h1 className="page-title r-up" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
            {loadError ? "Something went wrong" : "Article not found"}
          </h1>
          <p className="lede r-up" style={{ color: "var(--ink-soft)", marginTop: 16 }}>
            {loadError || "This article may have been unpublished or the link is incorrect."}
          </p>
          <Link to="/articles" className="btn btn-ghost" style={{ textDecoration: "none", marginTop: 24, display: "inline-flex" }}>
            ← Back to Articles
          </Link>
        </div>
      </section>
    );
  }

  const articlePath = `/articles/${article.id}`;
  const description = article.body_html ? htmlToExcerpt(article.body_html, 155) : DEFAULT_DESCRIPTION;

  return (
    <>
      <PageMeta
        pathname={articlePath}
        override={{
          title: `${article.title} | MUTIS Finance Society`,
          description,
          image: article.cover_image_url ?? undefined,
        }}
      />
      <section
        className="page-hero page-hero-article"
        style={
          article.cover_image_url
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(2,5,13,0.5) 0%, rgba(2,5,13,0.85) 100%), url(${article.cover_image_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div className="page-hero-inner" style={{ gridTemplateColumns: "1fr" }}>
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><Link to="/articles">Articles</Link><span>/</span><span>{article.title}</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />{article.tag}</div>
            <h1 className="page-title r-up">{article.title}</h1>
            <p className="page-sub r-up" style={{ maxWidth: "none", marginTop: 20 }}>
              By {article.author_name} · {formatDate(article.published_at)}
            </p>
          </div>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          {article.article_type === "pdf" && article.pdf_url ? (
            <div className="r-up">
              <DocumentViewer url={article.pdf_url} title={article.title} variant="inline" />
            </div>
          ) : article.body_html ? (
            <div className="article-body r-up" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(article.body_html) }} />
          ) : null}

          <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid var(--hair)" }}>
            <Link to="/articles" className="btn btn-ghost" style={{ textDecoration: "none" }}>
              ← Back to Articles
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

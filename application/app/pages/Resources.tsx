import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";

/**
 * Resources — curated guides, templates, and reading for members (technical
 * primers, recruitment guides, reading lists, etc.).
 *
 * PENDING: real resource entries. Each may link out to a hosted file/page.
 */
type Resource = {
  id: string;
  category: string;
  title: string;
  description: string;
  url: string | null;
};

const RESOURCES: Resource[] = [
  // { id: "1", category: "Technical", title: "DCF Primer", description: "...", url: null },
];

export function Resources() {
  useReveal([RESOURCES.length]);

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><span>Resources</span>
            </div>
            <h1 className="page-title r-up"><span className="accent">Resources</span></h1>
          </div>
          <p className="page-sub r-up">
            Guides, templates, and reading curated by the committee to help members
            prepare for applications, interviews, and the markets.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Library</div>
          <h2 className="r-up">Member resources</h2>

          {RESOURCES.length === 0 ? (
            <p className="lede r-up">
              {/* PENDING: add curated resources to RESOURCES. */}
              We&apos;re curating a library of guides and templates for members. Check back
              soon, or <Link to="/contact" style={{ color: "var(--accent)" }}>suggest a resource</Link>.
            </p>
          ) : (
            <div className="card-grid">
              {RESOURCES.map((r) => {
                const inner = (
                  <>
                    <div className="num">{r.category}</div>
                    <h3>{r.title}</h3>
                    <p>{r.description}</p>
                    <div className="foot"><span>Resource</span><span className="more">Open →</span></div>
                  </>
                );
                return r.url ? (
                  <a key={r.id} className="dark-card r-up" href={r.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>{inner}</a>
                ) : (
                  <div key={r.id} className="dark-card r-up">{inner}</div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

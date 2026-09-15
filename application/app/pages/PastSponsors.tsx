import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";

/**
 * Past Sponsors — firms that have supported MUTIS in previous years but are not
 * current partners. Content to be modelled on older Instagram posts.
 *
 * PENDING: confirmed list of past sponsors (name, logo, year, optional link).
 */
type PastSponsor = {
  name: string;
  logo: string;
  years: string;
  url: string | null;
};

const PAST_SPONSORS: PastSponsor[] = [
  // { name: "Firm", logo: "", years: "2022–2023", url: null },
];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "CO";
}

export function PastSponsors() {
  useReveal([PAST_SPONSORS.length]);

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><Link to="/sponsors">Sponsors</Link><span>/</span><span>Past Sponsors</span>
            </div>
            <h1 className="page-title r-up">Past<br /><span className="accent">Sponsors</span></h1>
          </div>
          <p className="page-sub r-up">
            We&apos;re grateful to every firm that has supported MUTIS over the years.
            These are partners from previous seasons.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Previous Partners</div>
          <h2 className="r-up">Past sponsors &amp; partners</h2>

          {PAST_SPONSORS.length === 0 ? (
            <p className="lede r-up">
              {/* PENDING: populate PAST_SPONSORS from older Instagram posts. */}
              We&apos;re putting together a record of the firms that have supported the
              society in previous years. Check back soon.
            </p>
          ) : (
            <div className="sponsor-grid r-up">
              {PAST_SPONSORS.map((s) => (
                <div className="sponsor-cell" key={s.name}>
                  <div>
                    <div className="sponsor-logo-wrap">
                      {s.logo ? (
                        <img className="sponsor-logo" src={s.logo} alt={s.name} loading="lazy" decoding="async" />
                      ) : (
                        <div className="sponsor-logo-fallback" aria-hidden="true">{initials(s.name)}</div>
                      )}
                    </div>
                    <div className="name">{s.name}</div>
                    <div className="role">{s.years}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

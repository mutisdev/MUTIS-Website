import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import { CoreValues } from "@/app/components/CoreValues";

export function About() {
  const { settings } = useSiteSettings();
  const yearsRunning = new Date().getFullYear() - settings.founding_year;

  useReveal();
  const bgImage = usePageBackgroundImage("about");

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><span>About</span>
            </div>
            <h1 className="page-title r-up"><span className="accent">About</span></h1>
          </div>
          <p className="page-sub r-up">
            Run by students, funded by partners, accountable to members.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="split">
            <div className="split-text"><h2 className="r-up">What MUTIS Does</h2></div>
            <div className="split-text r-up">
              <p><strong>One of the largest finance societies at the University of Manchester</strong>, with {settings.member_count_label} members from every faculty.</p>
              <p>Weekly meetings cover DCFs, LBOs, portfolio theory, and macro. Partner workshops go deeper into modelling and interviews.</p>
              <p>The MUTIS Ethical Investment Fund (MEIF) puts real capital in members&apos; hands.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section" style={{ background: "var(--surface-alt)", borderTop: "1px solid var(--hair)" }}>
        <div className="inner">
          <div className="split">
            <div className="split-text">
              <div className="page-eyebrow"><span className="bar" />Our History</div>
              <h2 className="r-up">{yearsRunning} years of MUTIS</h2>
            </div>
            <div className="split-text r-up">
              {/* PENDING: full history write-up from Bhawat & Alex. */}
              <p>
                <strong>Over {yearsRunning} years at the University of Manchester</strong>, growing
                from a small group into one of the largest finance societies in the UK.
              </p>
              <p>
                {/* PENDING: replace with the confirmed history narrative. */}
                The full story is coming soon.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CoreValues />

      <section className="page-section" style={{ background: "var(--surface-alt)", borderTop: "1px solid var(--hair)" }}>
        <div className="inner" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link to="/team" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Meet the Team →
          </Link>
          <Link to="/previous-presidents" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Previous Presidents →
          </Link>
          <Link to="/network" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Network →
          </Link>
        </div>
      </section>
    </>
  );
}

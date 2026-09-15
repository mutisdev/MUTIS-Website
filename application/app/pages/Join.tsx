import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";

export function Join() {
  useReveal();
  const bgImage = usePageBackgroundImage("join");
  const { settings } = useSiteSettings();
  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><span>Join</span></div>
            <h1 className="page-title r-up">Join<br /><span className="accent">MUTIS</span></h1>
          </div>
          <p className="page-sub r-up">Open to every University of Manchester student. Sign up via the Students' Union, then come to a weekly meeting.</p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />How it works</div>
          <h2 className="r-up">Three steps to get involved</h2>
          <div className="numlist">
            <Link to="/signup" className="numlist-item r-up" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="n">01</div>
              <div>
                <div className="t">Sign Up</div>
                <div className="d">Membership runs the full academic year: weekly meetings, workshops, and partner events.</div>
              </div>
              <div className="arrow">→</div>
            </Link>
            <div className="numlist-item r-up">
              <div className="n">02</div>
              <div>
                <div className="t">Come to a weekly meeting</div>
                <div className="d">{settings.weekly_meeting_info} — no prep needed.</div>
              </div>
              <div className="arrow">→</div>
            </div>
            <div className="numlist-item r-up">
              <div className="n">03</div>
              <div>
                <div className="t">Apply to MEIF, IBC, or a sub-committee</div>
                <div className="d">
                  Keep an eye on our{" "}
                  <a href={settings.instagram_url} target="_blank" rel="noreferrer">Instagram</a>{" "}
                  for when committee positions open up. You don't need experience  -  you need to want to do the work.
                </div>
              </div>
              <div className="arrow">→</div>
            </div>
          </div>

          <div className="r-up" style={{ marginTop: 32, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Link to="/signup" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Sign Up <span className="arrow" />
            </Link>
            <Link to="/contact" className="btn btn-ghost" style={{ textDecoration: "none" }}>
              Get in touch <span className="arrow" />
            </Link>
            <a
              className="btn btn-ghost"
              href={settings.su_signup_url}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "none" }}
            >
              Students' Union <span className="arrow" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}

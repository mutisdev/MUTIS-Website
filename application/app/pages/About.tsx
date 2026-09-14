import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import { CoreValues } from "@/app/components/CoreValues";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

const WIF_LOGO = new URL("../../assets/wif-logo.svg", import.meta.url).href;

function formatNameList(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** WiF leadership is derived from committee_members rather than hardcoded, using the
 * "WIF | <Role>" prefix convention already used across the roster (see /team). */
function wifLeadershipSentence(members: Tables<"committee_members">[]) {
  const wif = members.filter((m) => m.role.startsWith("WIF | "));
  const roleSuffix = (m: Tables<"committee_members">) => m.role.slice("WIF | ".length);
  const directors = wif.filter((m) => roleSuffix(m) === "Director").map((m) => m.name);
  const coHeads = wif.filter((m) => roleSuffix(m) === "Co-Head").map((m) => m.name);

  if (directors.length && coHeads.length) {
    return `The committee is led by ${formatNameList(directors)} (Director) and ${formatNameList(coHeads)} (Co-Heads).`;
  }
  if (directors.length) {
    return `The committee is led by ${formatNameList(directors)} (Director).`;
  }
  if (coHeads.length) {
    return `The committee is led by ${formatNameList(coHeads)} (Co-Heads).`;
  }
  return "";
}

export function About() {
  const { settings } = useSiteSettings();
  const yearsRunning = new Date().getFullYear() - settings.founding_year;
  const [wifMembers, setWifMembers] = useState<Tables<"committee_members">[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("committee_members")
      .select("*")
      .eq("is_active", true)
      .order("display_order")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load committee members", error);
        setWifMembers(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useReveal([wifMembers.length]);
  const bgImage = usePageBackgroundImage("about");

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><span>About</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />About the Society</div>
            <h1 className="page-title r-up">Built for<br />the next<br /><span className="accent">generation</span></h1>
          </div>
          <p className="page-sub r-up">
            MUTIS exists to give Manchester students a real edge in the most competitive corner of finance recruitment. We are run by students, funded by partners, and accountable to our members.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="split">
            <div className="split-text"><h2 className="r-up">What MUTIS Does</h2></div>
            <div className="split-text r-up">
              <p><strong>MUTIS is one of the largest business and finance societies at the University of Manchester</strong>, with {settings.member_count_label} members from every faculty. We bridge the gap between academic theory and the live market.</p>
              <p>Weekly meetings cover the building blocks  -  DCFs, LBOs, portfolio theory, macro frameworks. Workshops with sponsor banks go deeper into modelling, market structure, and the interview process itself.</p>
              <p>The MUTIS Ethical Investment Fund (MEIF) gives members hands-on responsibility for capital  -  the kind of experience that actually shows up in interviews.</p>
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
                <strong>MUTIS has been part of life at the University of Manchester for
                over {yearsRunning} years</strong>, growing from a small group of students into one of
                the largest finance societies in the UK.
              </p>
              <p>
                {/* PENDING: replace with the confirmed history narrative. */}
                A fuller account of the society&apos;s history — its founding, milestones,
                and the people who built it — is coming soon.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CoreValues />

      <section className="page-section" style={{ borderTop: "1px solid var(--hair)" }}>
        <div className="inner">
          <div className="split">
            <div className="split-text">
              <div className="page-eyebrow"><span className="bar" />Women in Finance</div>
              <div className="wif-logo-slot">
                <img src={WIF_LOGO} alt="Women in Finance — MUTIS" />
              </div>
              <h2 className="r-up">Women in Finance</h2>
            </div>
            <div className="split-text r-up">
              <p>Women in Finance (WiF) is MUTIS&apos;s dedicated sub-committee supporting women and gender minorities pursuing careers in finance. WiF runs its own events, mentorship programmes, and networking sessions alongside MUTIS&apos;s main calendar.</p>
              <p>WiF partners with sponsor firms to deliver targeted insight days, panels, and early-career access for members who are underrepresented in the industry.</p>
              <p>
                All MUTIS members are welcome at WiF events.{" "}
                {wifLeadershipSentence(wifMembers) || "Meet the current committee on the Team page."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="page-section" style={{ background: "var(--surface-alt)", borderTop: "1px solid var(--hair)" }}>
        <div className="inner" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Link to="/team" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Meet the Team →
          </Link>
          <Link to="/previous-presidents" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            View Previous Presidents →
          </Link>
          <Link to="/network" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Our Network →
          </Link>
          <Link to="/alumni" className="btn btn-ghost" style={{ textDecoration: "none" }}>
            Alumni →
          </Link>
        </div>
      </section>
    </>
  );
}

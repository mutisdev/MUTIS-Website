import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// Past event photos for the sponsorship showcase belt.
const eventImageModules = import.meta.glob(
  "../../assets/events/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}",
  { eager: true, import: "default" },
) as Record<string, string>;
const PAST_EVENT_IMAGES = Object.entries(eventImageModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, src]) => src)
  .slice(0, 14);

type SponsorRow = Tables<"sponsors">;

function initialsFromName(name: string) {
  const initials = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "CO";
}

function SponsorLogo({ name, logo }: { name: string; logo: string }) {
  const [failed, setFailed] = useState(false);
  const logoStyle = logo.includes("barclays.svg") ? { maxWidth: "126%" } : undefined;

  if (!logo || failed) {
    return (
      <div className="sponsor-logo-fallback" aria-hidden="true">
        {initialsFromName(name)}
      </div>
    );
  }

  return (
    <img
      src={logo}
      alt={name}
      className="sponsor-logo"
      loading="lazy"
      decoding="async"
      style={logoStyle}
      onError={() => setFailed(true)}
    />
  );
}

function SponsorCard({ firm }: { firm: SponsorRow }) {
  const card = (
    <div>
      <div className="sponsor-logo-wrap">
        <SponsorLogo name={firm.name} logo={firm.logo_url ?? ""} />
      </div>
      <div className="name">{firm.name}</div>
      <div className="role">{firm.sector ?? "Partner"}</div>
    </div>
  );

  return firm.link_url ? (
    <a className="sponsor-cell" href={firm.link_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
      {card}
      <div className="vac">Open Vacancies →</div>
    </a>
  ) : (
    <div className="sponsor-cell">
      {card}
      <div className="vac">Open Vacancies →</div>
    </div>
  );
}

function SponsorGridSkeleton() {
  return (
    <div className="sponsor-grid r-up" aria-busy="true" aria-live="polite">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="sponsor-cell" key={index} aria-hidden="true">
          <div>
            <div className="sponsor-logo-wrap" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="sponsor-logo-fallback" style={{ opacity: 0.35 }}>--</div>
            </div>
            <div style={{ height: 14, width: "72%", background: "rgba(255,255,255,0.08)", margin: "18px auto 10px", borderRadius: 999 }} />
            <div style={{ height: 10, width: "46%", background: "rgba(255,255,255,0.06)", margin: "0 auto" }} />
          </div>
          <div className="vac" style={{ opacity: 0.55 }}>Loading →</div>
        </div>
      ))}
    </div>
  );
}

export function Sponsors() {
  const { settings } = useSiteSettings();
  const { status, error, submitting, fail, succeed, onFormInput } = useFormStatus();
  const [sponsors, setSponsors] = useState<SponsorRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadSponsors = async () => {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("sponsors")
        .select("*")
        .eq("is_published", true)
        .order("display_order");

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load sponsors", error);
        setLoadError("We could not load the sponsor list right now. Please refresh the page.");
        setSponsors([]);
        setIsLoading(false);
        return;
      }

      setSponsors(data ?? []);
      setIsLoading(false);
    };

    void loadSponsors();

    return () => {
      cancelled = true;
    };
  }, []);

  // Tiers are still stored per sponsor (and managed in the admin panel), but
  // the public page shows every current partner in one flat grid, in
  // display_order, with equal visual weight. "past" stays its own section.
  const currentSponsors = sponsors.filter((row) => row.tier !== "past");
  const pastSponsors = sponsors.filter((row) => row.tier === "past");

  useReveal([currentSponsors.length, pastSponsors.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("sponsors");

  const onSponsorSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if ((form.elements.namedItem("bot-field") as HTMLInputElement)?.value) {
      succeed();
      return;
    }
    const data = {
      company: (form.elements.namedItem("company") as HTMLInputElement).value.trim(),
      name: (form.elements.namedItem("name") as HTMLInputElement).value.trim(),
      email: (form.elements.namedItem("email") as HTMLInputElement).value.trim(),
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value.trim(),
    };
    const consentPrivacy = (form.elements.namedItem("consent-privacy") as HTMLInputElement).checked;
    if (!data.company || !data.name || !data.email || !data.message || !consentPrivacy) {
      fail("Please fill in your company, name, email, and a message, and agree to the Privacy Policy.");
      return;
    }
    submitting();

    const { error: insertError } = await supabase.from("sponsorship_enquiries").insert(data);

    if (insertError) {
      console.error("Failed to submit sponsorship enquiry", insertError);
      fail(`Something went wrong. Please email us directly at ${settings.contact_email}.`);
      return;
    }

    succeed();
    form.reset();
  };

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><span>Sponsors</span></div>
            <div className="page-eyebrow r-up"><span className="bar" />Sponsors</div>
            <h1 className="page-title r-up">Our<br /><span className="accent">partners</span></h1>
          </div>
          <div className="sponsor-hero-cta r-up">
            <a href="#enquire" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Enquire about Sponsorship
              <span className="arrow" />
            </a>
          </div>
        </div>
      </section>

      {/* Current partners — one flat grid, no tiers */}
      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Partners</div>
          <h2 className="r-up">Who we work with</h2>

          {isLoading ? (
            <>
              <p className="lede r-up" role="status">Loading sponsor partners…</p>
              <SponsorGridSkeleton />
            </>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : currentSponsors.length === 0 ? (
            <p className="lede r-up" role="status" style={{ color: "var(--ink-soft)" }}>
              No sponsors are published yet.
            </p>
          ) : (
            <div className="sponsor-grid r-up" style={{ marginTop: 36 }}>
              {currentSponsors.map((firm) => (
                <SponsorCard key={firm.id} firm={firm} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Past Sponsors */}
      <section className="page-section" style={{ borderTop: "1px solid var(--hair)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Previous Partners</div>
          <h2 className="r-up">Past sponsors</h2>
          {pastSponsors.length === 0 ? (
            <p className="lede r-up" style={{ color: "var(--ink-soft)" }}>
              Coming soon.
            </p>
          ) : (
            <div className="sponsor-grid r-up">
              {pastSponsors.map((firm) => (
                <SponsorCard key={firm.id} firm={firm} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Past events showcase */}
      {PAST_EVENT_IMAGES.length > 0 && (
        <section className="page-section" style={{ background: "var(--base)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="inner">
            <div className="page-eyebrow r-up"><span className="bar" />In Action</div>
            <h2 className="r-up">Where sponsorship goes</h2>
            <p className="lede r-up">The events and workshops our members show up for.</p>
            <div className="image-belt r-up" aria-label="Past event photos">
              <div className="image-track">
                {[...PAST_EVENT_IMAGES, ...PAST_EVENT_IMAGES].map((src, i) => {
                  const dupe = i >= PAST_EVENT_IMAGES.length;
                  return (
                    <div className="image-cell" key={src + i} aria-hidden={dupe || undefined}>
                      <img src={src} alt={dupe ? "" : "MUTIS event photo"} width={220} height={130} loading="lazy" decoding="async" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Sponsorship enquiry form — target of the nav dropdown and hero CTA */}
      <section className="page-section" id="enquire">
        <div className="inner">
          <div className="contact-grid">
            <div>
              <div className="page-eyebrow r-up"><span className="bar" />Become a Partner</div>
              <h2 className="r-up">Enquire about sponsorship</h2>
              <p className="lede r-up">
                Reach {settings.member_count_label} Manchester finance students. Tell us about your firm.
              </p>
              <form
                className="contact-form r-up"
                name="sponsorship"
                onSubmit={onSponsorSubmit}
                onInput={onFormInput}
                noValidate
              >
                <p className="hidden-field">
                  <label>Don't fill this out if you're human: <input name="bot-field" tabIndex={-1} autoComplete="off" /></label>
                </p>
                <div className="field">
                  <label htmlFor="sp-company">Company</label>
                  <input id="sp-company" name="company" type="text" placeholder="Firm name" required />
                </div>
                <div className="field">
                  <label htmlFor="sp-name">Contact name</label>
                  <input id="sp-name" name="name" type="text" placeholder="First and last" autoComplete="name" required />
                </div>
                <div className="field">
                  <label htmlFor="sp-email">Work email</label>
                  <input id="sp-email" name="email" type="email" placeholder="you@firm.com" autoComplete="email" required />
                </div>
                <div className="field">
                  <label htmlFor="sp-message">Message</label>
                  <textarea id="sp-message" name="message" placeholder="What are you interested in?" required />
                </div>

                <PrivacyConsent id="sp-consent-privacy" />

                <FormFeedback
                  status={status}
                  error={error}
                  successMessage="Thanks — your enquiry is on its way. We'll be in touch soon."
                />

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={status === "submitting"}
                  aria-busy={status === "submitting"}
                  style={{ alignSelf: "flex-start", marginTop: 8 }}
                >
                  {status === "submitting" ? "Sending…" : status === "sent" ? "Sent · Thanks" : "Send Enquiry"}
                  <span className="arrow" />
                </button>
              </form>
            </div>

            <div className="contact-info r-up">
              <div className="row"><div className="l">Sponsorship</div><div className="v"><a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a></div></div>
              <div className="row"><div className="l">Reach</div><div className="v">{settings.member_count_label} Members</div></div>
              <div className="row"><div className="l">Channels</div><div className="v">Events · Workshops · MEIF · Media</div></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

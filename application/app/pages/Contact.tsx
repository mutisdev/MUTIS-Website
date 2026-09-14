import { type FormEvent } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import { supabase } from "@/lib/supabase";

export function Contact() {
  useReveal();
  const bgImage = usePageBackgroundImage("contact");
  const { settings } = useSiteSettings();
  const { status, error, submitting, fail, succeed, onFormInput } = useFormStatus();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    // Honeypot: if a bot filled the hidden field, silently succeed.
    if ((form.elements.namedItem("bot-field") as HTMLInputElement)?.value) {
      succeed();
      return;
    }

    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value.trim(),
      email: (form.elements.namedItem("email") as HTMLInputElement).value.trim(),
      reason: "General enquiry",
      message: (form.elements.namedItem("message") as HTMLTextAreaElement).value.trim(),
    };
    const consentPrivacy = (form.elements.namedItem("consent-privacy") as HTMLInputElement).checked;

    if (!data.name || !data.email || !data.message || !consentPrivacy) {
      fail("Please fill in your name, email, and a message, and agree to the Privacy Policy.");
      return;
    }

    submitting();

    const { error: insertError } = await supabase.from("contact_submissions").insert(data);

    if (insertError) {
      console.error("Failed to submit contact message", insertError);
      fail(`Something went wrong sending your message. Please email us directly at ${settings.contact_email}.`);
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
            <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><span>Contact</span></div>
            <div className="page-eyebrow r-up"><span className="bar" />Contact</div>
            <h1 className="page-title r-up">Get in<br /><span className="accent">touch</span></h1>
          </div>
          <p className="page-sub r-up">Members, prospective members, partners, and journalists  -  use the form or email us directly.</p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="contact-grid">
            <div>
              <div className="page-eyebrow r-up"><span className="bar" />Section 01  -  Get in touch</div>
              <h2 className="r-up">Drop us a line</h2>
              <p className="lede r-up">Members, prospective members, partners, and sponsors  -  use the form, or email us directly.</p>

              <form
                className="contact-form r-up"
                name="contact"
                onSubmit={onSubmit}
                onInput={onFormInput}
                noValidate
              >
                <p className="hidden-field">
                  <label>
                    Don’t fill this out if you’re human: <input name="bot-field" tabIndex={-1} autoComplete="off" />
                  </label>
                </p>
                <div className="field">
                  <label htmlFor="contact-name">Name</label>
                  <input id="contact-name" name="name" type="text" placeholder="First and last" autoComplete="name" required />
                </div>
                <div className="field">
                  <label htmlFor="contact-email">Email</label>
                  <input id="contact-email" name="email" type="email" placeholder="you@manchester.ac.uk" autoComplete="email" required />
                </div>
                <div className="field">
                  <label htmlFor="contact-message">Message</label>
                  <textarea id="contact-message" name="message" placeholder="Tell us a bit more…" required />
                </div>

                <PrivacyConsent id="contact-consent-privacy" />

                <FormFeedback
                  status={status}
                  error={error}
                  successMessage="Thanks, your message is on its way. We’ll be in touch soon."
                />

                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={status === "submitting"}
                  aria-busy={status === "submitting"}
                  style={{ alignSelf: "flex-start", marginTop: 8 }}
                >
                  {status === "submitting" ? "Sending…" : status === "sent" ? "Sent · Thanks" : "Send Message"}
                  <span className="arrow" />
                </button>
              </form>
            </div>

            <div className="contact-info r-up">
              <div className="row"><div className="l">Email</div><div className="v"><a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a></div></div>
              <div className="row"><div className="l">Address</div><div className="v">Alliance Manchester Business School<br />Booth Street West, M15 6PB</div></div>
              <div className="row"><div className="l">Instagram</div><div className="v"><a href={settings.instagram_url} target="_blank" rel="noreferrer">@mutisfinancesoc</a></div></div>
              <div className="row"><div className="l">LinkedIn</div><div className="v"><a href={settings.linkedin_url} target="_blank" rel="noreferrer">MUTIS LinkedIn</a></div></div>
              <div className="row"><div className="l">Students' Union</div><div className="v"><a href={settings.su_signup_url} target="_blank" rel="noreferrer">Manchester Students' Union</a></div></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

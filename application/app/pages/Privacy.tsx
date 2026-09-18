import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";

export function Privacy() {
  useReveal();
  const { settings } = useSiteSettings();

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><span>Privacy</span></div>
            <div className="page-eyebrow r-up"><span className="bar" />Legal</div>
            <h1 className="page-title r-up">Privacy<br /><span className="accent">notice</span></h1>
          </div>
          <p className="page-sub r-up">A plain-language explanation of what we collect through this site and why.</p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner" style={{ maxWidth: 760 }}>
          <div className="article-body r-up">
            <p>
              <em>
                This is a short, plain-language notice written by the committee, not a formal legal document. If
                you have questions about how your data is handled, contact us at{" "}
                <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a>.
              </em>
            </p>

            <h2>What we collect</h2>
            <p>
              MUTIS collects information you submit directly through forms on this site — the membership sign-up,
              event sign-ups, event feedback, the contact form, sponsorship enquiries, and the alumni directory
              registration. Each form only asks for what it needs to do its job (e.g. the alumni form asks for your
              career details so we can feature you in the network directory).
            </p>

            <h2>Why we collect it</h2>
            <p>
              We use this information to run the society: to keep a list of members, manage event registrations,
              see which members come to our events, respond to enquiries, evaluate sponsorship proposals, and —
              where you've explicitly agreed — to publish your details in the alumni network directory on this
              website and on MUTIS social media.
            </p>

            <h2>Membership sign-up</h2>
            <p>
              We store your name, University of Manchester email, course and year of study, and whether you agreed
              to your details being shared with partner firms. This is your membership record; you can ask us to
              correct or delete it at any time.
            </p>

            <h2>Diversity questions</h2>
            <p>
              The diversity and widening-participation questions on the membership form are added straight to
              anonymous totals (for example, "12 members said yes"). Your individual answers are not stored against
              your name, your email or your membership record, so they can't be traced back to you. Because they
              aren't linked to you, the totals stay the same if your membership record is later deleted. We only ever
              share these totals, never individual answers.
            </p>

            <h2>Event sign-ups</h2>
            <p>
              Signing up for an event needs your name and University of Manchester email. We match sign-ups to
              membership records by email, so we can see how many events each member has signed up for — including
              events you signed up for before becoming a member. We also count how many sign-ups come from people
              who aren't members yet, as a single number.
            </p>

            <h2>Event feedback</h2>
            <p>
              Event feedback is anonymous. We store which event it's about, your rating and any comments — no name,
              no email, and only the date it was sent, not the time. If you tell us you're a MUTIS member and give
              your university email, we record that you attended that event in a separate list that is not linked to
              your feedback, so we can't tell which rating or comment was yours. At a small event where very few
              people leave feedback, it may still be possible to guess who wrote something, so please don't include
              your name or contact details in comments.
            </p>

            <h2>Publishing your details</h2>
            <p>
              Nothing you submit through the alumni registration form is published automatically. A committee member
              reviews every submission before it appears on the site, and we only publish what you've explicitly
              consented to via the "Permission to Publish" checkbox on that form.
            </p>

            <h2>Who can see it</h2>
            <p>
              Submitted data is stored in our database and is only accessible to committee members with admin access
              to the site, via a password-protected admin panel. We use Supabase as our database and hosting
              provider, which processes data on our behalf under its own security practices.
            </p>

            <h2>Your rights</h2>
            <p>
              You can ask us at any time what information we hold about you, ask us to correct it, or ask us to
              delete it — email <a href={`mailto:${settings.contact_email}`}>{settings.contact_email}</a> and we'll
              action your request. If you're featured in the alumni directory and want to be removed, the same
              applies.
            </p>

            <h2>Cookies and tracking</h2>
            <p>
              This site does not use advertising cookies. To stop spam, our forms use Google reCAPTCHA, which sets
              its own cookies and sends information such as your IP address and browser details to Google to check
              that you're a person. For event feedback we don't pass your IP address to Google ourselves. We also
              use Vercel Web Analytics to count page visits; it doesn't use cookies or identify you.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

import { Link } from "react-router";
import { Instagram, Linkedin, Mail } from "lucide-react";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";

// Grouped sitemap. Kept separate from Header's navLinks because the footer
// surfaces pages the nav doesn't (Alumni, Resources-style sub-pages, Attendance).
const COLUMNS: { heading: string; links: { to: string; label: string }[] }[] = [
  {
    heading: "Society",
    links: [
      { to: "/about", label: "About" },
      { to: "/team", label: "Team" },
      { to: "/previous-presidents", label: "Previous Presidents" },
      { to: "/network", label: "Our Network" },
      { to: "/alumni", label: "Alumni" },
    ],
  },
  {
    heading: "Programmes",
    links: [
      { to: "/events", label: "Events" },
      { to: "/past-speakers", label: "Past Speakers" },
      { to: "/meif", label: "MEIF" },
      { to: "/wif", label: "Women in Finance" },
      { to: "/articles", label: "Articles" },
    ],
  },
  {
    heading: "Get Involved",
    links: [
      { to: "/join", label: "Join MUTIS" },
      { to: "/sponsors", label: "Sponsors" },
      { to: "/attendance", label: "Event feedback" },
      { to: "/media", label: "Media" },
      { to: "/contact", label: "Contact" },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  const { settings } = useSiteSettings();

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="footer-logo" style={{ textDecoration: "none" }}>
            <img src="/mutislogo.jpg" alt="MUTIS home" />
          </Link>
          <p className="footer-tagline">
            Manchester University Trading &amp; Investment Society — connecting students with the
            people and firms shaping finance since {settings.founding_year}.
          </p>
          <a href={`mailto:${settings.contact_email}`} className="footer-email">
            <Mail size={14} strokeWidth={1.8} aria-hidden="true" />
            {settings.contact_email}
          </a>
          <div className="footer-socials">
            <a href={settings.instagram_url} target="_blank" rel="noreferrer" aria-label="MUTIS on Instagram">
              <Instagram size={16} strokeWidth={1.8} aria-hidden="true" />
            </a>
            <a href={settings.linkedin_url} target="_blank" rel="noreferrer" aria-label="MUTIS on LinkedIn">
              <Linkedin size={16} strokeWidth={1.8} aria-hidden="true" />
            </a>
          </div>
        </div>

        <nav className="footer-columns" aria-label="Footer">
          {COLUMNS.map((col) => (
            <div key={col.heading} className="footer-col">
              <h2 className="footer-heading">{col.heading}</h2>
              <ul>
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="footer-bottom">
        <div>© {year} MUTIS · University of Manchester</div>
        <div className="footer-legal">
          <Link to="/privacy">Privacy</Link>
        </div>
      </div>
    </footer>
  );
}

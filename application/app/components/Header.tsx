import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Instagram, Linkedin, X } from "lucide-react";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";

type NavItem = { to: string; label: string; children?: { to: string; label: string }[] };

const navLinks: NavItem[] = [
  {
    to: "/about",
    label: "About",
    children: [
      { to: "/team", label: "Team" },
      { to: "/previous-presidents", label: "Previous Presidents" },
    ],
  },
  { to: "/network", label: "Network" },
  { to: "/events", label: "Events" },
  { to: "/past-speakers", label: "Past Speakers" },
  { to: "/meif", label: "MEIF" },
  { to: "/wif", label: "WIF" },
  {
    to: "/sponsors",
    label: "Sponsors",
    children: [{ to: "/sponsors#enquire", label: "Enquire about Sponsorship" }],
  },
  { to: "/articles", label: "Articles" },
  {
    to: "/media",
    label: "Media",
    children: [
      { to: "/gallery", label: "Gallery" },
      { to: "/recordings", label: "Recordings" },
    ],
  },
  { to: "/contact", label: "Contact" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { settings } = useSiteSettings();
  const closeMenu = () => setMenuOpen(false);

  const SOCIALS = [
    { label: "MUTIS on Instagram", href: settings.instagram_url, Icon: Instagram },
    { label: "MUTIS on LinkedIn", href: settings.linkedin_url, Icon: Linkedin },
  ];

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 60);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])'
        ) ?? []
      );
    focusable()[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setMenuOpen(false); return; }
      if (e.key === "Tab") {
        const items = focusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      (previouslyFocused ?? toggleRef.current)?.focus();
    };
  }, [menuOpen]);

  return (
    <>
      <nav className={"pm-nav" + (scrolled ? " pm-nav--scrolled" : "")}>
        <Link to="/" className="pm-nav-logo" style={{ textDecoration: "none" }}>
          <img src="/mutislogo.jpg" alt="MUTIS home" className="pm-nav-logo-img" />
        </Link>

        {/* Desktop nav: top-level links, with a hover/focus dropdown where an
            item has children. Every child is also listed in the mobile panel. */}
        <div className="pm-nav-links">
          {navLinks.map((link) => (
            <div key={link.to} className="pm-nav-item">
              <NavLink
                to={link.to}
                className={({ isActive }) => "pm-nav-link" + (isActive ? " pm-nav-link--active" : "")}
              >
                {link.label}
              </NavLink>
              {link.children && (
                <div className="pm-nav-dropdown">
                  {link.children.map((c) => (
                    <Link key={c.to} to={c.to} className="pm-nav-dropdown-link">
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="pm-nav-right">
          <div className="pm-nav-socials">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a key={href} href={href} target="_blank" rel="noreferrer" aria-label={label} className="pm-nav-social">
                <Icon size={17} strokeWidth={1.6} aria-hidden="true" />
              </a>
            ))}
          </div>
          <Link to="/join" className="pm-nav-cta" style={{ textDecoration: "none" }}>
            Join MUTIS
          </Link>
        </div>

        <button
          ref={toggleRef}
          type="button"
          className={"pm-nav-burger" + (menuOpen ? " pm-nav-burger--open" : "")}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </nav>

      {/* Overlay + mobile panel live OUTSIDE <nav> so the scrolled nav's
          backdrop-filter doesn't trap their position: fixed. */}
      <div
        className={"pm-nav-overlay" + (menuOpen ? " pm-nav-overlay--show" : "")}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
      />

      <div
        id="mobile-nav"
        ref={panelRef}
        className={"pm-mobile-nav" + (menuOpen ? " pm-mobile-nav--show" : "")}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        aria-hidden={!menuOpen}
      >
        <div className="pm-mobile-nav-topbar">
          <span className="pm-mobile-nav-topbar-label">Menu</span>
          <button
            type="button"
            className="pm-mobile-nav-close"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        {/* Every link closes the panel on tap. The pathname effect above can't
            cover same-page links like /sponsors#enquire while on /sponsors. */}
        <div className="pm-mobile-nav-links">
          {navLinks.map((link) => (
            <div key={link.to}>
              <NavLink
                to={link.to}
                onClick={closeMenu}
                className={({ isActive }) =>
                  "pm-mobile-link" + (isActive ? " pm-mobile-link--active" : "")
                }
              >
                {link.label}
              </NavLink>
              {link.children?.map((c) => (
                <Link
                  key={c.to}
                  to={c.to}
                  onClick={closeMenu}
                  className={
                    "pm-mobile-link pm-mobile-link--sub" + (pathname === c.to ? " pm-mobile-link--active" : "")
                  }
                >
                  {c.label}
                </Link>
              ))}
            </div>
          ))}
          <NavLink
            to="/join"
            onClick={closeMenu}
            className={({ isActive }) =>
              "pm-mobile-link pm-mobile-link--join" + (isActive ? " pm-mobile-link--active" : "")
            }
          >
            Join MUTIS
          </NavLink>
          <div className="pm-mobile-socials">
            {SOCIALS.map(({ label, href, Icon }) => (
              <a key={href} href={href} target="_blank" rel="noreferrer" aria-label={label} className="pm-nav-social">
                <Icon size={20} strokeWidth={1.6} aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

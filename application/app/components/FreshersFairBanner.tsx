import { useState } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";

const DISMISS_KEY = "mutis:dismissed-freshers-fair-banner";

export function FreshersFairBanner() {
  const { settings } = useSiteSettings();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  if (!settings.freshers_fair_banner_enabled || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="pm-event-banner" role="complementary" aria-label="Freshers Fair">
      <div className="pm-event-banner-body">
        <p className="pm-event-banner-text">
          <span className="pm-event-banner-eyebrow">Freshers Fair</span>
          Come find us at the Freshers Fair on Friday 25 September — meet the committee and sign up on the day.
        </p>
        <Link to="/signup" className="pm-event-banner-cta" style={{ textDecoration: "none" }}>
          Sign up to MUTIS →
        </Link>
      </div>
      <button type="button" className="pm-event-banner-close" onClick={dismiss} aria-label="Dismiss">
        <X style={{ width: 14, height: 14 }} aria-hidden="true" />
      </button>
    </div>
  );
}

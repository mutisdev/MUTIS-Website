import { useEffect, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type SiteSettings = Tables<"site_settings">;

const FALLBACK: SiteSettings = {
  id: 1,
  member_count_label: "1,000+",
  founding_year: 2005,
  contact_email: "mutis@manchesterstudentsunion.com",
  instagram_url: "https://instagram.com/mutisfinancesoc",
  linkedin_url: "https://www.linkedin.com/company/manchester-university-trading-&-investment-society/",
  su_signup_url: "https://manchesterstudentsunion.com/activities/view/mutis",
  weekly_meeting_info: "Tuesdays at Alliance MBS",
  freshers_fair_banner_enabled: false,
  updated_at: "",
};

/** Site-wide values (member count, founding year, contact email, social links) that
 * used to be hardcoded independently across Header/Footer/Contact/Sponsors/Home/etc.
 * Falls back to their last-known hardcoded values if the row can't be loaded, so a
 * transient fetch failure never blanks out this copy on the public site. */
export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>(FALLBACK);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load site settings", error);
        if (data) setSettings(data);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, isLoading };
}

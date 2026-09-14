import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useToast } from "../components/Toast";
import { PublishToggle } from "../components/StatusBadge";
import { usePageCache, hasCached } from "../usePageCache";

type SiteSettingsRow = Database["public"]["Tables"]["site_settings"]["Row"];

type FormState = {
  member_count_label: string;
  founding_year: string;
  contact_email: string;
  instagram_url: string;
  linkedin_url: string;
  su_signup_url: string;
  weekly_meeting_info: string;
  freshers_fair_banner_enabled: boolean;
};

export function SiteSettings() {
  const toast = useToast();
  const [row, setRow] = usePageCache<SiteSettingsRow | null>("admin:siteSettings:row", null);
  const [loading, setLoading] = useState(!hasCached("admin:siteSettings:row"));
  const [form, setForm] = usePageCache<FormState | null>("admin:siteSettings:form", null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("site_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error("Could not load site settings.");
        else if (data) {
          setRow(data);
          // Only populate the form on first load — a background refetch on
          // revisit shouldn't clobber an in-progress edit the admin hasn't saved yet.
          setForm(
            (prev) =>
              prev ?? {
                member_count_label: data.member_count_label,
                founding_year: String(data.founding_year),
                contact_email: data.contact_email,
                instagram_url: data.instagram_url,
                linkedin_url: data.linkedin_url,
                su_signup_url: data.su_signup_url,
                weekly_meeting_info: data.weekly_meeting_info,
                freshers_fair_banner_enabled: data.freshers_fair_banner_enabled,
              }
          );
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form || !row) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("site_settings")
      .update({
        member_count_label: form.member_count_label.trim(),
        founding_year: Number(form.founding_year),
        contact_email: form.contact_email.trim(),
        instagram_url: form.instagram_url.trim(),
        linkedin_url: form.linkedin_url.trim(),
        su_signup_url: form.su_signup_url.trim(),
        weekly_meeting_info: form.weekly_meeting_info.trim(),
        freshers_fair_banner_enabled: form.freshers_fair_banner_enabled,
      })
      .eq("id", 1)
      .select()
      .single();
    setSaving(false);
    if (error) {
      toast.error("Could not save site settings.");
      return;
    }
    setRow(data);
    toast.success("Site settings updated.");
  };

  return (
    <div className="mx-auto max-w-[640px] px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Settings</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Site settings</h1>
      <p className="mt-[8px] text-[13px] leading-[1.6] text-muted-foreground">
        These values feed the public site's header, footer, contact page, and hero stats — edit them once
        here instead of hunting down every place they used to be hardcoded.
      </p>

      {loading || !form ? (
        <div className="mt-[32px] flex items-center justify-center py-[48px] text-muted-foreground">
          <Loader2 className="h-[18px] w-[18px] animate-spin" />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-[24px] flex flex-col gap-[20px]">
          <Field label="Member count label">
            <input
              type="text"
              placeholder="1,000+"
              value={form.member_count_label}
              onChange={(e) => setForm({ ...form, member_count_label: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Founding year">
            <input
              type="number"
              value={form.founding_year}
              onChange={(e) => setForm({ ...form, founding_year: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Contact email">
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Instagram URL">
            <input
              type="url"
              value={form.instagram_url}
              onChange={(e) => setForm({ ...form, instagram_url: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="LinkedIn URL">
            <input
              type="url"
              value={form.linkedin_url}
              onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Students' Union sign-up URL">
            <input
              type="url"
              value={form.su_signup_url}
              onChange={(e) => setForm({ ...form, su_signup_url: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Weekly meeting time/location">
            <input
              type="text"
              placeholder="Tuesdays at Alliance MBS"
              value={form.weekly_meeting_info}
              onChange={(e) => setForm({ ...form, weekly_meeting_info: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <div className="flex items-center justify-between rounded-[12px] border border-border px-[16px] py-[14px]">
            <span className="text-[13px] font-medium text-foreground">Show Freshers Fair banner</span>
            <PublishToggle
              checked={form.freshers_fair_banner_enabled}
              onChange={(v) => setForm({ ...form, freshers_fair_banner_enabled: v })}
            />
          </div>

          <div className="mt-[8px] flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[12px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

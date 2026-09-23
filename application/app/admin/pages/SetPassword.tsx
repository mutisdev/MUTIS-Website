import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../AuthProvider";
import { FormMessage } from "../components/FormMessage";

type Status = "idle" | "submitting" | "error" | "done";

export function SetPassword() {
  const { session, adminName, isLoading, setAdminName } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Supabase appends `?type=invite` or `?type=recovery` to the redirect URL —
  // both land here since they work identically once the magic link has
  // established a session; only the copy differs. `welcome` is set by
  // create-invite so that someone who already had an account and has just been
  // made an admin is greeted as a new admin rather than told to reset a
  // password they may never have had.
  const isInvite = searchParams.get("type") === "invite" || searchParams.get("welcome") === "1";

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  // An invited admin has no name yet; someone here to reset a password
  // usually does, so prefill it rather than making them retype it. adminName
  // arrives asynchronously, hence the effect rather than a lazy initialiser.
  useEffect(() => {
    if (adminName) setName((current) => current || adminName);
  }, [adminName]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Please enter your name.");
      setStatus("error");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      setStatus("error");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setError("");

    const fullName = name.trim();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName },
    });

    if (updateError) {
      setError(updateError.message);
      setStatus("error");
      return;
    }

    // The name shown around the admin panel comes from admin_users, not from
    // auth metadata, so it has to be written there too. The password is
    // already saved at this point, so a failure here must not block sign-in —
    // it just leaves the name unset, which every display falls back on.
    const { error: nameError } = await supabase
      .from("admin_users")
      .update({ full_name: fullName })
      .eq("user_id", session!.user.id);
    if (nameError) {
      console.error("Failed to save admin name", nameError);
    } else {
      setAdminName(fullName);
    }

    setStatus("done");
    setTimeout(() => navigate("/admin", { replace: true }), 1200);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[14px] text-muted-foreground">
        Loading…
      </div>
    );
  }

  // The magic link establishes a session automatically on load
  // (detectSessionInUrl). No session here means the link is invalid,
  // already used, or expired.
  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-[24px] text-center">
        <p className="max-w-[360px] text-[14px] leading-[1.6] text-muted-foreground">
          This link is invalid or has expired. Ask a current admin to send you a new invite, or use
          "Forgot password" on the login page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-[24px]">
      <div className="w-full max-w-[400px]">
        <div className="mb-[32px] text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">MUTIS</p>
          <h1 className="mt-[8px] text-[22px] font-medium text-foreground">
            {isInvite ? "Set up your account" : "Reset your password"}
          </h1>
          <p className="mt-[8px] text-[13px] text-muted-foreground">Signed in as {session.user.email}</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-[20px] rounded-[16px] border border-border bg-card p-[32px]">
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="set-name" className="text-[12px] font-medium text-muted-foreground">
              Your name
            </label>
            <input
              id="set-name"
              type="text"
              required
              autoComplete="name"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
            <p className="text-[12px] leading-[1.5] text-muted-foreground">
              This is what other admins see next to your activity in the dashboard.
            </p>
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="set-password" className="text-[12px] font-medium text-muted-foreground">
              New password
            </label>
            <input
              id="set-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="set-password-confirm" className="text-[12px] font-medium text-muted-foreground">
              Confirm password
            </label>
            <input
              id="set-password-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </div>

          {status === "error" && <FormMessage kind="error">{error}</FormMessage>}
          {status === "done" && <FormMessage kind="success">Password set — redirecting…</FormMessage>}

          <button
            type="submit"
            disabled={status === "submitting" || status === "done"}
            className="w-full rounded-[10px] bg-primary px-[20px] py-[12px] text-[14px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {status === "submitting" ? "Saving…" : "Save & continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

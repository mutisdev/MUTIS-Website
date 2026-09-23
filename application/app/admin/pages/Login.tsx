import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "../AuthProvider";
import { FormMessage } from "../components/FormMessage";

type Mode = "signin" | "forgot";
type Status = "idle" | "submitting" | "error" | "sent";

export function Login() {
  const { session, isLoading } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  if (!isLoading && session) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/admin";
    return <Navigate to={redirectTo} replace />;
  }

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus("idle");
    setError("");
  };

  const onSubmitSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : signInError.message
      );
      setStatus("error");
      return;
    }
    // AuthProvider's onAuthStateChange listener picks up the new session;
    // the redirect above fires on the next render once `session` updates.
  };

  const onSubmitForgot = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("submitting");
    setError("");

    // Goes through Brevo rather than supabase.auth.resetPasswordForEmail, which
    // uses Supabase's own mailer and its 2 emails/hour cap.
    await supabase.functions.invoke("send-reset-link", { body: { email: email.trim() } });
    // Deliberately generic regardless of whether the email matches an
    // account, so this doesn't leak which emails are registered admins. The
    // function returns the same 200 for the same reason.
    setStatus("sent");
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[14px] text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-[24px]">
      <div className="relative w-full max-w-[400px]">
        <div className="mb-[32px] text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">MUTIS</p>
          <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Admin sign in</h1>
        </div>

        {mode === "signin" ? (
          <form onSubmit={onSubmitSignIn} className="flex flex-col gap-[20px] rounded-[16px] border border-border bg-card p-[32px]">
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="login-email" className="text-[12px] font-medium text-muted-foreground">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
              />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="login-password" className="text-[12px] font-medium text-muted-foreground">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
              />
            </div>

            {status === "error" && <FormMessage kind="error">{error}</FormMessage>}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full rounded-[10px] bg-primary px-[20px] py-[12px] text-[14px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {status === "submitting" ? "Signing in…" : "Sign in"}
            </button>

            <button
              type="button"
              onClick={() => switchMode("forgot")}
              className="text-[12px]! text-muted-foreground transition-colors hover:text-foreground"
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitForgot} className="flex flex-col gap-[20px] rounded-[16px] border border-border bg-card p-[32px]">
            <p className="text-[13px] leading-[1.6] text-muted-foreground">
              Enter your email and, if it belongs to an admin account, we'll send a link to reset your
              password.
            </p>
            <div className="flex flex-col gap-[6px]">
              <label htmlFor="forgot-email" className="text-[12px] font-medium text-muted-foreground">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
              />
            </div>

            {status === "sent" && (
              <FormMessage kind="success">
                If that email has an admin account, a reset link is on its way.
              </FormMessage>
            )}

            <button
              type="submit"
              disabled={status === "submitting" || status === "sent"}
              className="w-full rounded-[10px] bg-primary px-[20px] py-[12px] text-[14px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {status === "submitting" ? "Sending…" : "Send reset link"}
            </button>

            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="text-[12px]! text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to sign in
            </button>
          </form>
        )}

        <p className="mt-[16px] text-center text-[12px] text-muted-foreground">
          Admin accounts are invite-only. Ask a current admin if you need access.
        </p>
      </div>
    </div>
  );
}

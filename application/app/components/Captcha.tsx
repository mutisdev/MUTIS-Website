import { forwardRef, useImperativeHandle, useRef } from "react";
import ReCAPTCHA from "react-google-recaptcha";

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

export interface CaptchaHandle {
  reset: () => void;
}

interface CaptchaProps {
  onChange: (token: string | null) => void;
  onExpired: () => void;
  onErrored: () => void;
  theme?: "light" | "dark";
}

/**
 * reCAPTCHA v2 checkbox shared by every public form. The token it produces is
 * single-use and verified server-side by the `submit-form` Edge Function, so
 * forms must call `reset()` after every submission attempt.
 */
export const Captcha = forwardRef<CaptchaHandle, CaptchaProps>(function Captcha(
  { onChange, onExpired, onErrored, theme = "light" },
  ref
) {
  const widgetRef = useRef<ReCAPTCHA>(null);
  useImperativeHandle(ref, () => ({ reset: () => widgetRef.current?.reset() }), []);

  if (!SITE_KEY) {
    return (
      <p className="form-status form-error" role="alert">
        Captcha is not configured (missing VITE_RECAPTCHA_SITE_KEY).
      </p>
    );
  }

  // The widget is a fixed 304px iframe; let it scroll rather than overflow
  // the page on very narrow screens.
  return (
    <div style={{ maxWidth: "100%", overflowX: "auto" }}>
      <ReCAPTCHA
        ref={widgetRef}
        sitekey={SITE_KEY}
        theme={theme}
        onChange={onChange}
        onExpired={onExpired}
        onErrored={onErrored}
      />
    </div>
  );
});

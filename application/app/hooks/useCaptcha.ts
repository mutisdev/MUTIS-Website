import { useCallback, useRef, useState } from "react";
import type { CaptchaHandle } from "@/app/components/Captcha";

export const CAPTCHA_FAILED_MESSAGE = "Captcha check failed — please tick the box again.";

/**
 * Token state + widget ref for a form's <Captcha>. `fail` is the form's
 * useFormStatus().fail, so expiry/load errors show in the same banner as
 * every other form error. Call `resetCaptcha()` after every submit attempt:
 * tokens are single-use.
 */
export function useCaptcha(fail: (message: string) => void) {
  const captchaRef = useRef<CaptchaHandle>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const resetCaptcha = useCallback(() => {
    captchaRef.current?.reset();
    setCaptchaToken(null);
  }, []);

  const captchaProps = {
    ref: captchaRef,
    onChange: setCaptchaToken,
    onExpired: () => {
      setCaptchaToken(null);
      fail("Your captcha expired — please tick the box again.");
    },
    onErrored: () => {
      setCaptchaToken(null);
      fail("Couldn't load the captcha. Check your connection and try again.");
    },
  };

  return { captchaToken, resetCaptcha, captchaProps };
}

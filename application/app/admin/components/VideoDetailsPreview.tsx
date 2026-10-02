import { Fragment } from "react";
import { tokenizeVideoDetails } from "@shared/eventVideo";

/**
 * How the joining block will look in the confirmation and reminder emails.
 *
 * Built from the same tokenizer the emails use (`tokenizeVideoDetails`), so what
 * an admin sees here is what gets sent: the text is plain text, only https links
 * become links, and a pasted <a>, a mailto: or a bare www. stays inert. That is
 * the point of the preview — an admin who pastes a Teams blurb needs to see
 * which part of it will actually be clickable before anyone receives it.
 *
 * Light-on-white inside the dark admin panel on purpose: it is a picture of an
 * email, not a panel component, and the colours are the email's exactly
 * (#0c6a8a on #f4f9fc is 5.75:1, #333333 on it 11.9:1, #0B2545 on it 14.5:1 —
 * all AA for normal text).
 * Rendered as React nodes rather than dangerouslySetInnerHTML so the admin's own
 * text can't become markup even here.
 */
export function VideoDetailsPreview({ bodyText }: { bodyText: string }) {
  const text = bodyText.trim();

  return (
    <div className="flex flex-col gap-[8px]">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Email preview</p>
      <div className="overflow-hidden rounded-[10px] bg-white p-[16px]">
        {text ? (
          <div className="border-l-[4px] border-[#0c6a8a] bg-[#f4f9fc] px-[18px] py-[14px]">
            <h4 className="text-[15px] font-semibold text-[#0B2545]">Joining online</h4>
            <p className="mt-[8px] whitespace-pre-line break-words text-[13px] leading-[1.7] text-[#333333]">
              {tokenizeVideoDetails(text).map((token, i) =>
                token.type === "link" ? (
                  <a
                    key={i}
                    href={token.value}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[#0c6a8a] underline"
                  >
                    {token.value}
                  </a>
                ) : (
                  <Fragment key={i}>{token.value}</Fragment>
                )
              )}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-[#666666]">
            Nothing to show yet — paste the joining link and any meeting ID or passcode above.
          </p>
        )}
      </div>
    </div>
  );
}

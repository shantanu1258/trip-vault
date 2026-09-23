import { Check, Clipboard } from "lucide-react";
import { LocalQrCode } from "./LocalQrCode";

export function InvitationCodePanel({
  code,
  joinUrl,
  copied,
  onCopy,
  onCreateAnother
}: {
  code: string;
  joinUrl: string;
  copied: boolean;
  onCopy: (value: string) => void;
  onCreateAnother: () => void;
}) {
  return (
    <div className="mt-7 text-center">
      <LocalQrCode value={joinUrl} />
      <p className="mt-5 text-sm text-muted">
        Scan this QR or open the private link. Sign in or create an account, then confirm the
        prefilled code. The code expires after 14 days and cannot be reused.
      </p>
      <button
        onClick={() => onCopy(code)}
        type="button"
        aria-label={copied ? "Invitation copied" : "Copy invitation code"}
        className="mt-5 inline-flex max-w-full items-center justify-center gap-2 rounded-2xl bg-brand px-3 py-4 font-mono text-sm font-black tracking-wider text-surface sm:gap-3 sm:px-5 sm:text-xl"
      >
        <span className="break-all">{code}</span>
        {copied ? <Check className="size-5 shrink-0" /> : <Clipboard className="size-5 shrink-0" />}
      </button>
      <div className="mx-auto mt-3 grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" className="secondary-button w-full" onClick={() => onCopy(joinUrl)}>
          <Clipboard className="size-4 shrink-0" /> Copy private link
        </button>
        <button type="button" className="secondary-button w-full" onClick={onCreateAnother}>
          Create another code
        </button>
      </div>
    </div>
  );
}

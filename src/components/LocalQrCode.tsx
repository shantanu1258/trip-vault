import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

/** Loads only the encoder code from a pinned public module; the QR value never leaves this browser. */
export function LocalQrCode({ value }: { value: string }) {
  const [image, setImage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const moduleUrl = "https://esm.sh/qrcode@1.5.4";
    void import(/* @vite-ignore */ moduleUrl)
      .then(
        (module: {
          toDataURL: (text: string, options: Record<string, unknown>) => Promise<string>;
        }) =>
          module.toDataURL(value, {
            width: 256,
            margin: 2,
            errorCorrectionLevel: "M",
            color: { dark: "#142f31", light: "#ffffff" }
          })
      )
      .then((dataUrl) => {
        if (active) setImage(dataUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [value]);
  if (image)
    return (
      <img
        className="mx-auto size-56 rounded-2xl bg-white p-2"
        src={image}
        alt="Scan to open the private trip invitation"
      />
    );
  if (failed)
    return (
      <p className="rounded-2xl bg-warning/10 p-4 text-sm text-warning">
        QR preview could not load. Copy the private link or code below instead.
      </p>
    );
  return (
    <span className="mx-auto grid size-56 place-items-center rounded-2xl bg-white">
      <Loader2 className="size-6 animate-spin text-brand" aria-label="Generating QR code" />
    </span>
  );
}

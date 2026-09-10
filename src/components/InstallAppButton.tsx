import { Download, EllipsisVertical, Share2, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ModalSheet } from "./ModalSheet";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const OPEN_INSTALL_HELP = "trip-vault:open-install-help";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function deviceType() {
  const ipad = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) || ipad) return "ios";
  if (/android/i.test(navigator.userAgent)) return "android";
  return "other";
}

export function openInstallHelp() {
  window.dispatchEvent(new Event(OPEN_INSTALL_HELP));
}

export function InstallAppButton({ className = "secondary-button" }: { className?: string }) {
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const markInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", markInstalled);
    return () => window.removeEventListener("appinstalled", markInstalled);
  }, []);

  if (installed) {
    return <span className="inline-flex items-center gap-2 text-sm font-bold text-success"><Smartphone className="size-4" /> Installed on this device</span>;
  }

  return <button type="button" className={className} onClick={openInstallHelp}><Download className="size-4" /> Install Trip Vault</button>;
}

export function InstallAppManager() {
  const promptRef = useRef<InstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [platform] = useState(deviceType);

  useEffect(() => {
    const rememberPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallPromptEvent;
      setCanPrompt(true);
    };
    const markInstalled = () => {
      promptRef.current = null;
      setCanPrompt(false);
      setShowHelp(false);
    };
    const openHelp = () => setShowHelp(true);

    window.addEventListener("beforeinstallprompt", rememberPrompt);
    window.addEventListener("appinstalled", markInstalled);
    window.addEventListener(OPEN_INSTALL_HELP, openHelp);
    return () => {
      window.removeEventListener("beforeinstallprompt", rememberPrompt);
      window.removeEventListener("appinstalled", markInstalled);
      window.removeEventListener(OPEN_INSTALL_HELP, openHelp);
    };
  }, []);

  const installNow = async () => {
    const prompt = promptRef.current;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    promptRef.current = null;
    setCanPrompt(false);
    if (choice.outcome === "accepted") setShowHelp(false);
  };

  if (!showHelp) return null;

  return (
    <ModalSheet eyebrow="Trip Vault mobile app" title="Add Trip Vault to your Home Screen" onClose={() => setShowHelp(false)}>
      <p className="mt-4 text-sm leading-6 text-muted">
        {platform === "ios" ? "You are on an Apple mobile device. Use Safari and the Share menu." : platform === "android" ? "You are on Android. Chrome may install Trip Vault directly." : "Open this page on your phone and follow the matching steps below."}
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-line bg-elevated p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><Share2 className="size-4" /></span>
          <p className="eyebrow mt-4">iPhone & iPad</p>
          <h3 className="mt-1 font-display text-lg font-black">Install using Safari</h3>
          <ol className="mt-3 grid list-decimal gap-2 pl-5 text-sm leading-6 text-muted">
            <li>Open Trip Vault in Safari.</li>
            <li>Tap Share—the square with an upward arrow.</li>
            <li>Choose Add to Home Screen, then tap Add.</li>
          </ol>
        </section>
        <section className="rounded-2xl border border-line bg-elevated p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><EllipsisVertical className="size-4" /></span>
          <p className="eyebrow mt-4">Android</p>
          <h3 className="mt-1 font-display text-lg font-black">Install using Chrome</h3>
          <ol className="mt-3 grid list-decimal gap-2 pl-5 text-sm leading-6 text-muted">
            <li>Open Trip Vault in Chrome.</li>
            <li>Tap the three-dot menu.</li>
            <li>Choose Install app or Add to Home screen.</li>
          </ol>
        </section>
      </div>
      <p className="mt-4 rounded-2xl border border-line bg-brand-soft p-4 text-xs leading-5 text-muted">After installation, Trip Vault opens from your Home Screen like an app and uses the same signed-in account and prepared offline trips.</p>
      <div className="mt-5 flex justify-end gap-3">
        <button type="button" className="secondary-button" onClick={() => setShowHelp(false)}>Close</button>
        {canPrompt && <button type="button" className="primary-button" onClick={() => void installNow()}><Download className="size-4" /> Install now</button>}
      </div>
    </ModalSheet>
  );
}

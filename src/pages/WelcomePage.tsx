import { ArrowRight, FileCheck2, Plane, ShieldCheck, UsersRound, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { InstallAppButton } from "../components/InstallAppButton";

const welcomeSteps = [
  { title: "Create a new trip", text: "Choose a destination and dates." },
  { title: "Add your plans", text: "Keep events, travelers, and documents together." },
  { title: "Take it with you", text: "Prepare your trip offline before you leave." }
];

export function WelcomePage() {
  return (
    <div className="min-h-dvh overflow-hidden bg-canvas text-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <Brand />
        <ThemeToggle />
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-8 sm:px-8 md:min-h-[70dvh] md:grid-cols-[1.05fr_.95fr] md:pb-24 md:pt-12">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-xs font-bold text-brand shadow-sm">
              <ShieldCheck className="size-4 text-success" aria-hidden="true" />
              Personal, private, and ready offline
            </div>
            <h1 className="font-display text-[clamp(3rem,8vw,6.4rem)] font-black leading-[0.91] tracking-[-0.065em]">
              Your whole trip,
              <span className="block text-coral">right when</span>
              you need it.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-muted sm:text-xl">
              Keep bookings, itinerary, people, and travel documents together. Open the app and the
              next important thing is already waiting.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/preview"
                className="tap-target inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-6 py-3.5 font-extrabold text-surface shadow-soft hover:scale-[1.015] motion-reduce:hover:scale-100"
              >
                Explore the demo trip
                <ArrowRight className="size-5" aria-hidden="true" />
              </Link>
              <Link
                to="/sign-in"
                className="tap-target inline-flex items-center justify-center rounded-2xl border border-line bg-surface px-6 py-3.5 font-extrabold text-ink hover:bg-elevated"
              >
                Sign in
              </Link>
            </div>
            <div className="mt-4">
              <InstallAppButton />
            </div>
          </div>

          <div
            className="relative mx-auto w-full max-w-lg"
            aria-label="Trip Vault interface preview"
          >
            <div
              className="absolute -left-10 top-20 size-40 rounded-full border-[28px] border-coral/15"
              aria-hidden="true"
            />
            <div className="surface-card relative ml-auto max-w-md overflow-hidden p-5 sm:p-7">
              <div className="flex items-start justify-between">
                <div>
                  <p className="eyebrow">Current trip</p>
                  <h2 className="mt-2 font-display text-3xl font-black tracking-[-0.04em]">
                    Mediterranean Summer
                  </h2>
                  <p className="mt-1 text-sm text-muted">Rome · Florence · Venice</p>
                </div>
                <span className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand">
                  Ready offline
                </span>
              </div>
              <div className="mt-7 rounded-3xl bg-brand p-5 text-surface">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] opacity-70">
                  <span>DEL</span>
                  <Plane className="size-4" aria-hidden="true" />
                  <span>FCO</span>
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-black">06:40</p>
                    <p className="mt-1 text-xs opacity-70">Gate 22B</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-coral">Boarding in 48 min</p>
                    <p className="mt-1 text-xs opacity-70">Aster Air AV 218</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-line bg-elevated p-4">
                  <FileCheck2 className="size-5 text-success" />
                  <p className="mt-3 text-sm font-extrabold">Boarding pass</p>
                  <p className="mt-1 text-xs text-muted">Available offline</p>
                </div>
                <div className="rounded-2xl border border-line bg-elevated p-4">
                  <UsersRound className="size-5 text-coral" />
                  <p className="mt-3 text-sm font-extrabold">5 travelers</p>
                  <p className="mt-1 text-xs text-muted">1 helper</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-surface/50">
          <ol className="mx-auto max-w-5xl space-y-8 px-5 py-14 sm:px-8">
            {welcomeSteps.map(({ title, text }, index) => (
              <li key={title} className="flex items-start gap-5">
                <span className="text-3xl font-bold text-brand" aria-hidden="true">
                  {index + 1}.
                </span>
                <div>
                  <h2 className="font-display text-xl font-extrabold">{title}</h2>
                  <p className="mt-1 text-base text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}

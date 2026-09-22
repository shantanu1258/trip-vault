import { ArrowRight, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { InstallAppButton } from "../components/InstallAppButton";
import { WelcomeBookingPreview } from "../components/WelcomeBookingPreview";

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

          <WelcomeBookingPreview />
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

import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { rememberDeviceProfile } from "../lib/auth/deviceSession";
import { isSupabaseConfigured, supabase } from "../lib/supabase/client";

export function SignInPage({ admin = false }: { admin?: boolean }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = typeof location.state === "object" && location.state && "from" in location.state ? String(location.state.from) : "/home";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const displayName = name.trim();
    if (mode === "sign-up" && displayName.length < 2) {
      setError("Enter the name you want your travel companions to see.");
      return;
    }
    if (mode === "sign-up" && password !== confirmPassword) {
      setError("Passwords do not match. Please enter the same password twice.");
      return;
    }
    if (!supabase) {
      setError("Supabase is not configured yet. Add the two browser-safe values from .env.example, or explore the demo trip now.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "sign-up" && !admin) {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
        if (authError) throw authError;
        if (!data.session) setMessage("Account created. Your Supabase project currently requires an email confirmation before sign-in.");
        else {
          rememberDeviceProfile(data.session.user.id);
          navigate(requestedPath, { replace: true });
        }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;

        if (admin) {
          const { data: adminRow, error: adminError } = await supabase
            .from("app_admins")
            .select("user_id")
            .eq("user_id", data.user.id)
            .eq("status", "active")
            .maybeSingle();
          if (adminError || !adminRow) {
            await supabase.auth.signOut();
            throw new Error("This account is not authorized for the administrator console.");
          }
          navigate("/admin");
        } else {
          rememberDeviceProfile(data.user.id);
          navigate(requestedPath, { replace: true });
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><Brand /><ThemeToggle /></header>
      <main className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-16 pt-6 sm:px-8 md:min-h-[75dvh] md:grid-cols-2">
        <section>
          <Link to="/" className="inline-flex items-center gap-2 rounded-lg text-sm font-bold text-muted hover:text-ink"><ArrowLeft className="size-4" /> Back</Link>
          <div className="mt-10 grid size-14 place-items-center rounded-2xl bg-brand text-surface"><LockKeyhole className="size-6" /></div>
          <p className="eyebrow mt-6">{admin ? "Restricted entry" : "Private travel space"}</p>
          <h1 className="mt-3 font-display text-4xl font-black tracking-[-0.045em] sm:text-5xl">{admin ? "Administrator sign in" : mode === "sign-up" ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-4 max-w-md leading-7 text-muted">{admin ? "Configuration access is separate from trip access. Administrator status never reveals private traveler data." : "Sign in to synchronize your trips. Your prepared local copy remains available when the network disappears."}</p>
          {!admin && <Link to="/preview" className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-brand">Explore the safe demo instead <span aria-hidden="true">→</span></Link>}
        </section>

        <section className="surface-card p-5 sm:p-8">
          {!isSupabaseConfigured && (
            <div className="mb-5 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
              <p className="font-extrabold text-warning">Demo-only mode</p>
              <p className="mt-1 leading-6 text-muted">Live sign-in activates after the Supabase URL and publishable key are added locally.</p>
            </div>
          )}
          <form onSubmit={submit} className="space-y-5">
            {mode === "sign-up" && (
              <div>
                <label htmlFor="display-name" className="text-sm font-extrabold">Your name</label>
                <div className="relative mt-2"><UserRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" /><input id="display-name" type="text" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Name shown to your travel group" className="h-[3.25rem] w-full rounded-2xl border border-line bg-elevated py-3 pl-12 pr-4 text-ink placeholder:text-muted/60" /></div>
              </div>
            )}
            <div>
              <label htmlFor="email" className="text-sm font-extrabold">Email address</label>
              <div className="relative mt-2"><Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" /><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter the email you will use for Trip Vault" className="h-[3.25rem] w-full rounded-2xl border border-line bg-elevated py-3 pl-12 pr-4 text-ink placeholder:text-muted/60" /></div>
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-extrabold">Password</label>
              <div className="relative mt-2">
                <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
                <input id="password" type={showPassword ? "text" : "password"} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" className="h-[3.25rem] w-full rounded-2xl border border-line bg-elevated py-3 pl-12 pr-14 text-ink placeholder:text-muted/60" />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="tap-target absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-xl text-muted hover:text-ink">
                  {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                </button>
              </div>
            </div>
            {mode === "sign-up" && (
              <div>
                <label htmlFor="confirm-password" className="text-sm font-extrabold">Confirm password</label>
                <div className="relative mt-2">
                  <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
                  <input id="confirm-password" type={showConfirmation ? "text" : "password"} autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter the same password again" className="h-[3.25rem] w-full rounded-2xl border border-line bg-elevated py-3 pl-12 pr-14 text-ink placeholder:text-muted/60" />
                  <button type="button" onClick={() => setShowConfirmation((visible) => !visible)} aria-label={showConfirmation ? "Hide confirmed password" : "Show confirmed password"} aria-pressed={showConfirmation} className="tap-target absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-xl text-muted hover:text-ink">
                    {showConfirmation ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                  </button>
                </div>
              </div>
            )}
            {error && <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm font-semibold text-danger">{error}</div>}
            {message && <div role="status" className="rounded-2xl border border-success/30 bg-success/10 p-4 text-sm font-semibold text-success">{message}</div>}
            <button disabled={busy} type="submit" className="tap-target inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 font-extrabold text-surface disabled:cursor-not-allowed disabled:opacity-60">
              {busy ? <Loader2 className="size-5 animate-spin motion-reduce:animate-none" /> : <ShieldCheck className="size-5" />}
              {busy ? "Please wait" : admin ? "Open administrator console" : mode === "sign-up" ? "Create account" : "Sign in"}
            </button>
          </form>
          {!admin && (
            <button type="button" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setName(""); setConfirmPassword(""); setShowPassword(false); setShowConfirmation(false); setError(null); setMessage(null); }} className="tap-target mt-4 w-full rounded-xl text-sm font-bold text-muted hover:text-ink">
              {mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          )}
        </section>
      </main>
    </div>
  );
}

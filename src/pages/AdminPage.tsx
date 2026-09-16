import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Database,
  History,
  Inbox,
  Loader2,
  Palette,
  Pencil,
  Plane,
  Plus,
  RotateCcw,
  Save,
  ServerOff,
  ShieldCheck,
  Store,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { TimeZoneAutocomplete } from "../components/TimeZoneAutocomplete";
import {
  createConfigDraft,
  defaultDarkTokens,
  defaultLightTokens,
  deleteAirline,
  deleteAirport,
  getAdminAudit,
  getThemePalette,
  isCurrentUserAdmin,
  listAirlines,
  listAirports,
  listCatalogSuggestions,
  listConfigReleases,
  listVendors,
  listDefaults,
  publishRelease,
  rollbackRelease,
  saveAirline,
  saveAirport,
  saveDefault,
  saveThemePalette,
  deleteVendor,
  reviewCatalogSuggestion,
  saveVendor,
  uploadCatalogAsset,
  type ConfigRelease,
  type ThemeTokens
} from "../features/admin/api";
import {
  validateActionUrl,
  validateCatalogAssetPath,
  validateThemeTokens
} from "../features/admin/validation";
import { getErrorMessage } from "../features/trips/presentation";
import { isValidTimeZone } from "../features/trips/validation";
import { isSupabaseConfigured, supabase } from "../lib/supabase/client";

export type AdminSection =
  | "overview"
  | "airlines"
  | "airports"
  | "vendors"
  | "suggestions"
  | "defaults"
  | "appearance"
  | "releases";

const navigation: { section: AdminSection; label: string; icon: typeof Plane; path: string }[] = [
  { section: "overview", label: "Overview", icon: ShieldCheck, path: "/admin" },
  { section: "airlines", label: "Airlines", icon: Plane, path: "/admin/airlines" },
  { section: "airports", label: "Airports", icon: Database, path: "/admin/airports" },
  { section: "vendors", label: "Booking vendors", icon: Store, path: "/admin/vendors" },
  { section: "suggestions", label: "Suggestions", icon: Inbox, path: "/admin/suggestions" },
  { section: "defaults", label: "Defaults", icon: Save, path: "/admin/defaults" },
  { section: "appearance", label: "Appearance", icon: Palette, path: "/admin/appearance" },
  { section: "releases", label: "Releases", icon: History, path: "/admin/releases" }
];

function AdminShell({ online, children }: { online: boolean; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Brand />
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-brand-soft px-3 py-2 text-xs font-bold text-brand sm:inline">
              Administrator
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8 lg:px-8">
        <aside className="py-5 lg:py-8">
          <nav className="flex gap-2 overflow-auto lg:block lg:space-y-1">
            {navigation.map(({ label, icon: Icon, path }) => (
              <NavLink
                end={path === "/admin"}
                key={path}
                to={path}
                className={({ isActive }) =>
                  `tap-target flex shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold lg:w-full ${isActive ? "bg-brand text-surface" : "text-muted hover:bg-surface"}`
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-5 pb-12 lg:px-0 lg:pt-8">
          {!online && (
            <div className="mb-5 flex gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
              <ServerOff className="size-5 shrink-0 text-warning" />
              <div>
                <p className="font-extrabold">Read-only while offline</p>
                <p className="mt-1 text-sm text-muted">Admin changes are never queued.</p>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

export function AdminPage({ section = "overview" }: { section?: AdminSection }) {
  const navigate = useNavigate();
  const [online, setOnline] = useState(navigator.onLine);
  const access = useQuery({
    queryKey: ["admin-access"],
    queryFn: isCurrentUserAdmin,
    enabled: isSupabaseConfigured,
    retry: false
  });
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate("/admin/sign-in", { replace: true });
    });
  }, [navigate]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  if (access.isLoading)
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <Loader2
          className="size-7 animate-spin text-brand"
          aria-label="Checking administrator access"
        />
      </div>
    );
  if (!isSupabaseConfigured || !access.data)
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-5 text-ink">
        <section className="surface-card max-w-md p-7 text-center">
          <ServerOff className="mx-auto size-9 text-warning" />
          <h1 className="mt-5 font-display text-2xl font-black">
            Administrator console unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Sign in with the dedicated account that was added to the application-administrator
            allowlist.
          </p>
          <Link to="/admin/sign-in" className="primary-button mt-6">
            Administrator sign in
          </Link>
        </section>
      </div>
    );
  return (
    <AdminShell online={online}>
      <AdminContent section={section} online={online} />
    </AdminShell>
  );
}

function AdminContent({ section, online }: { section: AdminSection; online: boolean }) {
  const releases = useQuery({ queryKey: ["config-releases"], queryFn: listConfigReleases });
  const draft = releases.data?.find((release) => release.status === "draft");
  const published = releases.data?.find((release) => release.status === "published");
  const editableRelease = draft ?? published;
  if (releases.isLoading)
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading configuration
      </p>
    );
  if (releases.error) return <AdminError error={releases.error} />;
  if (section === "overview")
    return (
      <Overview
        online={online}
        releases={releases.data ?? []}
        draft={draft}
        published={published}
      />
    );
  if (section === "releases") return <Releases online={online} releases={releases.data ?? []} />;
  if (section === "suggestions") return <Suggestions online={online} />;
  if (!editableRelease)
    return (
      <section className="surface-card p-7">
        <h1 className="font-display text-2xl font-black">Create a draft first</h1>
        <p className="mt-2 text-sm text-muted">
          The first draft provides a safe place for browser-editable configuration.
        </p>
        <Link className="secondary-button mt-5" to="/admin">
          Go to overview
        </Link>
      </section>
    );
  if (section === "airlines") return <Airlines online={online} release={editableRelease} />;
  if (section === "airports") return <Airports online={online} release={editableRelease} />;
  if (section === "vendors") return <Vendors online={online} release={editableRelease} />;
  if (section === "defaults") return <Defaults online={online} release={editableRelease} />;
  return <Appearance online={online} release={editableRelease} />;
}

function Header({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <header>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-black tracking-[-.04em]">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
    </header>
  );
}
function AdminError({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-2xl bg-danger/10 p-4 text-sm font-bold text-danger">
      {getErrorMessage(error)}
    </p>
  );
}

function Overview({
  online,
  releases,
  draft,
  published
}: {
  online: boolean;
  releases: ConfigRelease[];
  draft?: ConfigRelease;
  published?: ConfigRelease;
}) {
  const client = useQueryClient();
  const [note, setNote] = useState("");
  const mutation = useMutation({
    mutationFn: () => createConfigDraft(note),
    onSuccess: () => client.invalidateQueries({ queryKey: ["config-releases"] })
  });
  return (
    <>
      <Header
        eyebrow="Application configuration"
        title="Admin overview"
        text="Configuration authority is separate from trip access. Every change is online-only and release-based."
      />
      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <Stat label="Published" value={published ? `v${published.version_number}` : "None"} />
        <Stat label="Open draft" value={draft ? "Ready to edit" : "None"} />
        <Stat label="Release history" value={String(releases.length)} />
      </section>
      <section className="surface-card mt-5 p-6">
        <h2 className="font-display text-xl font-black">
          {draft ? "Continue the draft" : "Start a configuration draft"}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {draft
            ? "Edit catalogs, defaults, and both themes; then publish them atomically."
            : "A draft begins from the currently published release when one exists."}
        </p>
        {!draft && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <input
              className="form-input mt-0"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What will this release change?"
            />
            <button
              disabled={!online || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="primary-button shrink-0"
            >
              <Plus className="size-4" /> Create draft
            </button>
          </div>
        )}
        {mutation.error && <AdminError error={mutation.error} />}
        {draft && (
          <Link to="/admin/airlines" className="primary-button mt-5">
            Edit draft
          </Link>
        )}
      </section>
    </>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 font-display text-xl font-black">{value}</p>
    </div>
  );
}

function Airlines({ online, release }: { online: boolean; release: ConfigRelease }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-airlines", release.id],
    queryFn: () => listAirlines(release.id)
  });
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Awaited<ReturnType<typeof listAirlines>>[number] | null>(
    null
  );
  const save = useMutation({
    mutationFn: async ({
      entry,
      logoFile,
      bannerFile
    }: {
      entry: Parameters<typeof saveAirline>[0];
      logoFile?: File;
      bannerFile?: File;
    }) => {
      const [logoPath, bannerPath] = await Promise.all([
        logoFile
          ? uploadCatalogAsset(logoFile, release.id, entry.stable_key, "logo")
          : Promise.resolve(entry.logo_asset_path),
        bannerFile
          ? uploadCatalogAsset(bannerFile, release.id, entry.stable_key, "banner")
          : Promise.resolve(entry.banner_asset_path)
      ]);
      await saveAirline({ ...entry, logo_asset_path: logoPath, banner_asset_path: bannerPath });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["admin-airlines", release.id] });
      setMessage("");
      setEditing(null);
    }
  });
  const remove = useMutation({
    mutationFn: deleteAirline,
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-airlines", release.id] })
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const stable = String(form.get("stableKey") ?? "")
      .trim()
      .toLowerCase();
    const urls = ["checkIn", "manage", "status", "tracker"].map((key) =>
      String(form.get(key) ?? "").trim()
    );
    const iata = String(form.get("iata") ?? "")
      .trim()
      .toUpperCase();
    const icao = String(form.get("icao") ?? "")
      .trim()
      .toUpperCase();
    const logo = String(form.get("logo") ?? "").trim();
    const banner = String(form.get("banner") ?? "").trim();
    const rawLogoFile = form.get("logoFile");
    const rawBannerFile = form.get("bannerFile");
    const logoFile = rawLogoFile instanceof File && rawLogoFile.name ? rawLogoFile : undefined;
    const bannerFile =
      rawBannerFile instanceof File && rawBannerFile.name ? rawBannerFile : undefined;
    if (!name || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(stable)) {
      setMessage("Add a name and a lowercase stable key.");
      return;
    }
    if ((iata && !/^[A-Z0-9]{2}$/.test(iata)) || (icao && !/^[A-Z0-9]{3}$/.test(icao))) {
      setMessage("Use a 2-character IATA code and 3-character ICAO code.");
      return;
    }
    if (urls.some((url) => url && !validateActionUrl(url))) {
      setMessage("Every action must be a safe HTTPS template with allowed placeholders.");
      return;
    }
    if (!validateCatalogAssetPath(logo) || !validateCatalogAssetPath(banner)) {
      setMessage("Asset paths must be safe PNG, JPEG, or WebP paths from the catalog bucket.");
      return;
    }
    if (
      [logoFile, bannerFile].some(
        (file) =>
          file &&
          (file.size > 2_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type))
      )
    ) {
      setMessage("Logo and banner uploads must be PNG, JPEG, or WebP files no larger than 2 MB.");
      return;
    }
    save.mutate({
      entry: {
        id: editing?.id,
        config_release_id: release.id,
        stable_key: stable,
        name,
        iata_code: iata || null,
        icao_code: icao || null,
        aliases: String(form.get("aliases") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        check_in_url_template: urls[0] || null,
        manage_booking_url_template: urls[1] || null,
        status_url_template: urls[2] || null,
        tracker_url_template: urls[3] || null,
        brand_color: String(form.get("color") ?? "").trim() || null,
        logo_asset_path: logo || null,
        banner_asset_path: banner || null,
        is_enabled: form.get("enabled") === "on",
        sort_order: Number(form.get("sortOrder") ?? query.data?.length ?? 0)
      },
      logoFile,
      bannerFile
    });
  };
  return (
    <>
      <Header
        eyebrow={`Release ${release.status}`}
        title="Airline catalog"
        text="Add or edit names, codes, aliases, safe action links, assets, ordering, enabled state, and card color."
      />
      <form
        key={editing?.id ?? "new"}
        onSubmit={submit}
        className="surface-card mt-6 grid gap-3 p-5 sm:grid-cols-2"
      >
        <div className="flex items-center justify-between sm:col-span-2">
          <h2 className="font-display text-lg font-black">
            {editing ? `Edit ${editing.name}` : "Add airline"}
          </h2>
          {editing && (
            <button
              type="button"
              className="tap-target grid size-9 place-items-center"
              onClick={() => setEditing(null)}
              aria-label="Cancel editing"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <input
          className="form-input mt-0"
          name="name"
          placeholder="Airline name"
          defaultValue={editing?.name}
          required
        />
        <input
          className="form-input mt-0"
          name="stableKey"
          placeholder="stable-key"
          defaultValue={editing?.stable_key}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            className="form-input mt-0 uppercase"
            name="iata"
            maxLength={2}
            placeholder="IATA"
            defaultValue={editing?.iata_code ?? ""}
          />
          <input
            className="form-input mt-0 uppercase"
            name="icao"
            maxLength={3}
            placeholder="ICAO"
            defaultValue={editing?.icao_code ?? ""}
          />
        </div>
        <input
          className="form-input mt-0"
          name="aliases"
          placeholder="Aliases, comma separated"
          defaultValue={editing?.aliases.join(", ")}
        />
        <input
          className="form-input mt-0"
          name="checkIn"
          placeholder="Check-in https://..."
          defaultValue={editing?.check_in_url_template ?? ""}
        />
        <input
          className="form-input mt-0"
          name="manage"
          placeholder="Manage booking https://..."
          defaultValue={editing?.manage_booking_url_template ?? ""}
        />
        <input
          className="form-input mt-0"
          name="status"
          placeholder="Official status https://..."
          defaultValue={editing?.status_url_template ?? ""}
        />
        <input
          className="form-input mt-0"
          name="tracker"
          placeholder="Tracker https://.../{flightNumber}"
          defaultValue={editing?.tracker_url_template ?? ""}
        />
        <input
          className="form-input mt-0"
          name="logo"
          placeholder="Existing logo asset path (optional)"
          defaultValue={editing?.logo_asset_path ?? ""}
        />
        <input
          className="form-input mt-0"
          name="banner"
          placeholder="Existing banner asset path (optional)"
          defaultValue={editing?.banner_asset_path ?? ""}
        />
        <label className="form-label">
          Upload logo
          <input
            className="form-input file:mr-2 file:rounded-lg file:border-0 file:bg-brand-soft file:px-2 file:py-1 file:font-bold"
            type="file"
            name="logoFile"
            accept="image/png,image/jpeg,image/webp"
          />
        </label>
        <label className="form-label">
          Upload banner
          <input
            className="form-input file:mr-2 file:rounded-lg file:border-0 file:bg-brand-soft file:px-2 file:py-1 file:font-bold"
            type="file"
            name="bannerFile"
            accept="image/png,image/jpeg,image/webp"
          />
        </label>
        <p className="-mt-1 text-xs text-muted sm:col-span-2">
          Uploaded catalog artwork is public, immutable, and limited to 2 MB. Never upload personal
          trip images here.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="form-input mt-0"
            name="color"
            placeholder="#142f31"
            defaultValue={editing?.brand_color ?? ""}
          />
          <input
            className="form-input mt-0"
            name="sortOrder"
            type="number"
            min="0"
            defaultValue={editing?.sort_order ?? query.data?.length ?? 0}
          />
        </div>
        <label className="flex items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold">
          <input type="checkbox" name="enabled" defaultChecked={editing?.is_enabled ?? true} />{" "}
          Enabled in pickers
        </label>
        {(message || save.error) && (
          <p role="alert" className="text-sm font-bold text-danger sm:col-span-2">
            {message || getErrorMessage(save.error)}
          </p>
        )}
        <button
          disabled={!online || release.status !== "draft" || save.isPending}
          className="primary-button sm:col-span-2"
        >
          <Save className="size-4" />{" "}
          {save.isPending ? "Saving…" : editing ? "Save airline" : "Add airline"}
        </button>
      </form>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {query.data?.map((item) => (
          <article
            className={`surface-card flex items-start gap-3 p-5 ${item.is_enabled ? "" : "opacity-60"}`}
            key={item.id}
          >
            <span
              className="grid size-11 shrink-0 place-items-center rounded-xl text-xs font-black text-white"
              style={{ backgroundColor: item.brand_color ?? "#142f31" }}
            >
              {item.iata_code || item.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-black">{item.name}</h2>
              <p className="text-xs text-muted">
                {item.stable_key} · {item.is_enabled ? "enabled" : "disabled"}
              </p>
            </div>
            <button
              disabled={!online || release.status !== "draft"}
              onClick={() => setEditing(item)}
              className="tap-target grid size-10 place-items-center text-muted hover:text-brand"
              aria-label={`Edit ${item.name}`}
            >
              <Pencil className="size-4" />
            </button>
            <button
              disabled={!online || release.status !== "draft"}
              onClick={() =>
                window.confirm(`Delete ${item.name} from this draft?`) && remove.mutate(item.id)
              }
              className="tap-target grid size-10 place-items-center text-muted hover:text-danger"
              aria-label={`Delete ${item.name}`}
            >
              <Trash2 className="size-4" />
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function Airports({ online, release }: { online: boolean; release: ConfigRelease }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-airports", release.id],
    queryFn: () => listAirports(release.id)
  });
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Awaited<ReturnType<typeof listAirports>>[number] | null>(
    null
  );
  const save = useMutation({
    mutationFn: saveAirport,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["admin-airports", release.id] });
      setEditing(null);
      setMessage("");
    }
  });
  const remove = useMutation({
    mutationFn: deleteAirport,
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-airports", release.id] })
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const timezone = String(form.get("timezone") ?? "").trim();
    const stable = String(form.get("stableKey") ?? "")
      .trim()
      .toLowerCase();
    const iata = String(form.get("iata") ?? "")
      .trim()
      .toUpperCase();
    const icao = String(form.get("icao") ?? "")
      .trim()
      .toUpperCase();
    const country = String(form.get("country") ?? "")
      .trim()
      .toUpperCase();
    const latitude = String(form.get("latitude") ?? "").trim();
    const longitude = String(form.get("longitude") ?? "").trim();
    if (!isValidTimeZone(timezone)) {
      setMessage("Enter a supported IANA time zone.");
      return;
    }
    if (
      !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(stable) ||
      (iata && !/^[A-Z0-9]{3}$/.test(iata)) ||
      (icao && !/^[A-Z0-9]{4}$/.test(icao)) ||
      !/^[A-Z]{2}$/.test(country)
    ) {
      setMessage("Check the stable key, airport codes, and two-letter country code.");
      return;
    }
    if (
      Boolean(latitude) !== Boolean(longitude) ||
      (latitude &&
        (Number(latitude) < -90 ||
          Number(latitude) > 90 ||
          Number(longitude) < -180 ||
          Number(longitude) > 180))
    ) {
      setMessage("Enter both valid latitude and longitude values, or leave both empty.");
      return;
    }
    save.mutate({
      id: editing?.id,
      config_release_id: release.id,
      stable_key: stable,
      iata_code: iata || null,
      icao_code: icao || null,
      name: String(form.get("name") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      country_code: country,
      timezone,
      aliases: String(form.get("aliases") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      latitude: latitude ? Number(latitude) : null,
      longitude: longitude ? Number(longitude) : null,
      is_enabled: form.get("enabled") === "on",
      sort_order: Number(form.get("sortOrder") ?? query.data?.length ?? 0)
    });
  };
  return (
    <>
      <Header
        eyebrow={`Release ${release.status}`}
        title="Airport catalog"
        text="Add or edit names, codes, aliases, coordinates, ordering, enabled state, and IANA time zones."
      />
      <form
        key={editing?.id ?? "new"}
        onSubmit={submit}
        className="surface-card mt-6 grid gap-3 p-5 sm:grid-cols-2"
      >
        <div className="flex items-center justify-between sm:col-span-2">
          <h2 className="font-display text-lg font-black">
            {editing ? `Edit ${editing.name}` : "Add airport"}
          </h2>
          {editing && (
            <button
              type="button"
              className="tap-target grid size-9 place-items-center"
              onClick={() => setEditing(null)}
              aria-label="Cancel editing"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <input
          className="form-input mt-0"
          name="name"
          placeholder="Airport name"
          defaultValue={editing?.name}
          required
        />
        <input
          className="form-input mt-0"
          name="city"
          placeholder="City"
          defaultValue={editing?.city}
          required
        />
        <input
          className="form-input mt-0"
          name="stableKey"
          placeholder="stable-key"
          defaultValue={editing?.stable_key}
          required
        />
        <input
          className="form-input mt-0"
          name="aliases"
          placeholder="Aliases, comma separated"
          defaultValue={editing?.aliases.join(", ")}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            className="form-input mt-0 uppercase"
            name="iata"
            placeholder="IATA"
            maxLength={3}
            defaultValue={editing?.iata_code ?? ""}
          />
          <input
            className="form-input mt-0 uppercase"
            name="icao"
            placeholder="ICAO"
            maxLength={4}
            defaultValue={editing?.icao_code ?? ""}
          />
        </div>
        <input
          className="form-input mt-0 uppercase"
          name="country"
          placeholder="IN"
          maxLength={2}
          defaultValue={editing?.country_code}
          required
        />
        <TimeZoneAutocomplete
          className="form-input mt-0 sm:col-span-2"
          name="timezone"
          defaultValue={editing?.timezone}
          required
          aria-label="Airport time zone"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            className="form-input mt-0"
            name="latitude"
            type="number"
            step="any"
            placeholder="Latitude"
            defaultValue={editing?.latitude ?? ""}
          />
          <input
            className="form-input mt-0"
            name="longitude"
            type="number"
            step="any"
            placeholder="Longitude"
            defaultValue={editing?.longitude ?? ""}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="form-input mt-0"
            name="sortOrder"
            type="number"
            min="0"
            defaultValue={editing?.sort_order ?? query.data?.length ?? 0}
          />
          <label className="flex items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold">
            <input type="checkbox" name="enabled" defaultChecked={editing?.is_enabled ?? true} />{" "}
            Enabled
          </label>
        </div>
        {message && <p className="text-sm font-bold text-danger sm:col-span-2">{message}</p>}
        <button
          disabled={!online || release.status !== "draft" || save.isPending}
          className="primary-button sm:col-span-2"
        >
          {editing ? "Save airport" : "Add airport"}
        </button>
      </form>
      <div className="mt-5 space-y-3">
        {query.data?.map((item) => (
          <article
            key={item.id}
            className={`surface-card flex items-center gap-4 p-5 ${item.is_enabled ? "" : "opacity-60"}`}
          >
            <strong className="font-mono text-lg">{item.iata_code || "—"}</strong>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{item.name}</p>
              <p className="text-xs text-muted">
                {item.city} · {item.timezone} · {item.is_enabled ? "enabled" : "disabled"}
              </p>
            </div>
            <button
              disabled={!online || release.status !== "draft"}
              onClick={() => setEditing(item)}
              className="tap-target grid size-10 place-items-center text-muted hover:text-brand"
              aria-label={`Edit ${item.name}`}
            >
              <Pencil className="size-4" />
            </button>
            <button
              disabled={!online || release.status !== "draft"}
              onClick={() =>
                window.confirm(`Delete ${item.name} from this draft?`) && remove.mutate(item.id)
              }
              className="tap-target grid size-10 place-items-center text-muted hover:text-danger"
              aria-label={`Delete ${item.name}`}
            >
              <Trash2 className="size-4" />
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function Vendors({ online, release }: { online: boolean; release: ConfigRelease }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-vendors", release.id],
    queryFn: () => listVendors(release.id)
  });
  const [editing, setEditing] = useState<Awaited<ReturnType<typeof listVendors>>[number] | null>(
    null
  );
  const [message, setMessage] = useState("");
  const save = useMutation({
    mutationFn: async ({
      entry,
      logoFile
    }: {
      entry: Parameters<typeof saveVendor>[0];
      logoFile?: File;
    }) => {
      const logo = logoFile
        ? await uploadCatalogAsset(logoFile, release.id, entry.stable_key, "logo")
        : entry.logo_asset_path;
      await saveVendor({ ...entry, logo_asset_path: logo });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["admin-vendors", release.id] });
      setEditing(null);
      setMessage("");
    }
  });
  const remove = useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-vendors", release.id] })
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const stable = String(form.get("stableKey") ?? "")
      .trim()
      .toLowerCase();
    const website = String(form.get("website") ?? "").trim();
    const logo = String(form.get("logo") ?? "").trim();
    const fileValue = form.get("logoFile");
    const logoFile = fileValue instanceof File && fileValue.name ? fileValue : undefined;
    if (!name || !/^[a-z0-9][a-z0-9_-]{1,79}$/.test(stable)) {
      setMessage("Add a name and lowercase stable key.");
      return;
    }
    if (
      website &&
      (!website.startsWith("https://") ||
        (() => {
          try {
            new URL(website);
            return false;
          } catch {
            return true;
          }
        })())
    ) {
      setMessage("Website must be a valid HTTPS address.");
      return;
    }
    if (!validateCatalogAssetPath(logo)) {
      setMessage("Use a safe catalog asset path.");
      return;
    }
    save.mutate({
      entry: {
        id: editing?.id,
        config_release_id: release.id,
        stable_key: stable,
        name,
        aliases: String(form.get("aliases") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        website_url: website || null,
        logo_asset_path: logo || null,
        brand_color: String(form.get("color") ?? "").trim() || null,
        is_enabled: form.get("enabled") === "on",
        sort_order: Number(form.get("sortOrder") ?? query.data?.length ?? 0)
      },
      logoFile
    });
  };
  return (
    <>
      <Header
        eyebrow={`Release ${release.status}`}
        title="Booking-vendor catalog"
        text="Keep the service provider separate from the website or agent used to make the booking."
      />
      <form
        key={editing?.id ?? "new"}
        onSubmit={submit}
        className="surface-card mt-6 grid gap-3 p-5 sm:grid-cols-2"
      >
        <div className="flex items-center justify-between sm:col-span-2">
          <h2 className="font-display text-lg font-black">
            {editing ? `Edit ${editing.name}` : "Add booking vendor"}
          </h2>
          {editing && (
            <button
              type="button"
              className="tap-target grid size-9 place-items-center"
              onClick={() => setEditing(null)}
              aria-label="Cancel editing"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <input
          required
          className="form-input mt-0"
          name="name"
          placeholder="Booking.com"
          defaultValue={editing?.name}
        />
        <input
          required
          className="form-input mt-0"
          name="stableKey"
          placeholder="booking-com"
          defaultValue={editing?.stable_key}
        />
        <input
          className="form-input mt-0"
          name="aliases"
          placeholder="Aliases, comma separated"
          defaultValue={editing?.aliases.join(", ")}
        />
        <input
          className="form-input mt-0"
          name="website"
          type="url"
          placeholder="https://..."
          defaultValue={editing?.website_url ?? ""}
        />
        <input
          className="form-input mt-0"
          name="logo"
          placeholder="Existing logo asset path"
          defaultValue={editing?.logo_asset_path ?? ""}
        />
        <label className="form-label">
          Upload logo
          <input
            className="form-input"
            name="logoFile"
            type="file"
            accept="image/png,image/jpeg,image/webp"
          />
        </label>
        <input
          className="form-input mt-0"
          name="color"
          placeholder="#003b95"
          defaultValue={editing?.brand_color ?? ""}
        />
        <input
          className="form-input mt-0"
          name="sortOrder"
          type="number"
          min="0"
          defaultValue={editing?.sort_order ?? query.data?.length ?? 0}
        />
        <label className="flex items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold">
          <input type="checkbox" name="enabled" defaultChecked={editing?.is_enabled ?? true} />{" "}
          Enabled in pickers
        </label>
        {(message || save.error) && (
          <p role="alert" className="text-sm font-bold text-danger sm:col-span-2">
            {message || getErrorMessage(save.error)}
          </p>
        )}
        <button
          disabled={!online || release.status !== "draft" || save.isPending}
          className="primary-button sm:col-span-2"
        >
          <Save className="size-4" /> Save vendor
        </button>
      </form>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {query.data?.map((vendor) => (
          <article className="surface-card flex items-center gap-3 p-5" key={vendor.id}>
            <span
              className="grid size-10 place-items-center rounded-xl text-xs font-black text-white"
              style={{ backgroundColor: vendor.brand_color ?? "#142f31" }}
            >
              {vendor.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{vendor.name}</p>
              <p className="truncate text-xs text-muted">{vendor.website_url ?? "No website"}</p>
            </div>
            <button
              disabled={!online || release.status !== "draft"}
              onClick={() => setEditing(vendor)}
              className="tap-target grid size-9 place-items-center"
              aria-label={`Edit ${vendor.name}`}
            >
              <Pencil className="size-4" />
            </button>
            <button
              disabled={!online || release.status !== "draft"}
              onClick={() =>
                window.confirm(`Delete ${vendor.name} from this draft?`) && remove.mutate(vendor.id)
              }
              className="tap-target grid size-9 place-items-center text-danger"
              aria-label={`Delete ${vendor.name}`}
            >
              <Trash2 className="size-4" />
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

function Suggestions({ online }: { online: boolean }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["catalog-suggestions"], queryFn: listCatalogSuggestions });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "promoted" | "merged" | "rejected" }) =>
      reviewCatalogSuggestion(id, status),
    onSuccess: () => client.invalidateQueries({ queryKey: ["catalog-suggestions"] })
  });
  return (
    <>
      <Header
        eyebrow="Privacy-safe review"
        title="Catalog suggestions"
        text="Only the entered public provider, airline, airport, or vendor metadata appears here—never trip names, dates, PNRs, travelers, or documents."
      />
      {query.error && <AdminError error={query.error} />}
      <div className="mt-6 space-y-3">
        {query.data?.map((item) => (
          <article
            className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center"
            key={item.id}
          >
            <div className="min-w-0 flex-1">
              <div className="flex gap-2">
                <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-black capitalize text-brand">
                  {item.suggestion_type.replaceAll("_", " ")}
                </span>
                <span className="rounded-full bg-elevated px-2 py-1 text-xs font-bold capitalize text-muted">
                  {item.status}
                </span>
              </div>
              <h2 className="mt-3 font-display text-lg font-black">{item.display_value}</h2>
              <p className="mt-1 text-xs text-muted">
                Suggested {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
            {item.status === "pending" && (
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={!online || review.isPending}
                  onClick={() => review.mutate({ id: item.id, status: "promoted" })}
                  className="secondary-button"
                >
                  Promoted
                </button>
                <button
                  disabled={!online || review.isPending}
                  onClick={() => review.mutate({ id: item.id, status: "merged" })}
                  className="secondary-button"
                >
                  Merged
                </button>
                <button
                  disabled={!online || review.isPending}
                  onClick={() => review.mutate({ id: item.id, status: "rejected" })}
                  className="secondary-button text-danger"
                >
                  Reject
                </button>
              </div>
            )}
          </article>
        ))}
        {query.data?.length === 0 && (
          <p className="surface-card border-dashed p-7 text-sm text-muted">No suggestions yet.</p>
        )}
      </div>
    </>
  );
}

function Defaults({ online, release }: { online: boolean; release: ConfigRelease }) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-defaults", release.id],
    queryFn: () => listDefaults(release.id)
  });
  const [message, setMessage] = useState("");
  const save = useMutation({
    mutationFn: saveDefault,
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-defaults", release.id] })
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      save.mutate({
        config_release_id: release.id,
        namespace: String(form.get("namespace")),
        key: String(form.get("key")),
        value: JSON.parse(String(form.get("value")))
      });
    } catch {
      setMessage("Value must be valid JSON.");
    }
  };
  return (
    <>
      <Header
        eyebrow={`Release ${release.status}`}
        title="Travel defaults"
        text="Only code-defined namespaces and JSON values are accepted; no executable configuration or secrets."
      />
      <form onSubmit={submit} className="surface-card mt-6 space-y-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="form-input mt-0" name="namespace">
            <option>booking</option>
            <option>document</option>
            <option>readiness</option>
            <option>alerts</option>
            <option>external_links</option>
          </select>
          <input
            className="form-input mt-0"
            name="key"
            placeholder="reminder.days_before"
            required
          />
        </div>
        <textarea className="form-input mt-0 min-h-28 font-mono" name="value" defaultValue="{}" />
        {message && <p className="text-sm font-bold text-danger">{message}</p>}
        <button disabled={!online || release.status !== "draft"} className="primary-button">
          Save default
        </button>
      </form>
      <div className="mt-5 space-y-2">
        {query.data?.map((item) => (
          <div className="surface-card p-4" key={`${item.namespace}.${item.key}`}>
            <p className="font-mono text-sm font-bold">
              {item.namespace}.{item.key}
            </p>
            <pre className="mt-2 overflow-auto text-xs text-muted">
              {JSON.stringify(item.value, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </>
  );
}

function Appearance({ online, release }: { online: boolean; release: ConfigRelease }) {
  const query = useQuery({
    queryKey: ["admin-theme", release.id],
    queryFn: () => getThemePalette(release.id)
  });
  const [light, setLight] = useState(defaultLightTokens);
  const [dark, setDark] = useState(defaultDarkTokens);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (query.data) {
      setLight(query.data.light);
      setDark(query.data.dark);
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: () => saveThemePalette(release.id, light, dark),
    onSuccess: () => setMessage("Palette saved to the draft.")
  });
  const submit = () => {
    const issue = validateThemeTokens(light) || validateThemeTokens(dark);
    if (issue) {
      setMessage(issue);
      return;
    }
    save.mutate();
  };
  return (
    <>
      <Header
        eyebrow={`Release ${release.status}`}
        title="Light & dark appearance"
        text="Only allowlisted semantic colors are saved. Contrast is checked before the draft can be published."
      />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <TokenEditor title="Light" tokens={light} onChange={setLight} />
        <TokenEditor title="Dark" tokens={dark} onChange={setDark} />
      </div>
      {message && (
        <p
          role="status"
          className={`mt-4 text-sm font-bold ${message.includes("saved") ? "text-success" : "text-danger"}`}
        >
          {message}
        </p>
      )}
      <button
        disabled={!online || release.status !== "draft" || save.isPending}
        onClick={submit}
        className="primary-button mt-5"
      >
        <Palette className="size-4" /> Save both palettes
      </button>
    </>
  );
}
function TokenEditor({
  title,
  tokens,
  onChange
}: {
  title: string;
  tokens: ThemeTokens;
  onChange: (tokens: ThemeTokens) => void;
}) {
  return (
    <section className="surface-card p-5">
      <h2 className="font-display text-xl font-black">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Object.entries(tokens).map(([key, value]) => (
          <label className="form-label capitalize" key={key}>
            {key}
            <span className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={value}
                onChange={(event) => onChange({ ...tokens, [key]: event.target.value })}
                className="size-11 rounded-lg border border-line bg-transparent p-1"
              />
              <input
                className="form-input mt-0 font-mono"
                value={value}
                onChange={(event) =>
                  onChange({ ...tokens, [key]: event.target.value } as ThemeTokens)
                }
              />
            </span>
          </label>
        ))}
      </div>
      <div
        className="mt-5 rounded-2xl border p-4"
        style={{ background: tokens.surface, borderColor: tokens.line, color: tokens.ink }}
      >
        <p className="font-bold">Preview card</p>
        <p className="mt-1 text-sm" style={{ color: tokens.muted }}>
          Important information remains readable.
        </p>
        <span
          className="mt-3 inline-block rounded-lg px-3 py-2 text-xs font-bold"
          style={{ background: tokens.brand, color: tokens.surface }}
        >
          Primary action preview
        </span>
      </div>
    </section>
  );
}

function Releases({ online, releases }: { online: boolean; releases: ConfigRelease[] }) {
  const client = useQueryClient();
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: getAdminAudit });
  const publish = useMutation({
    mutationFn: publishRelease,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["config-releases"] });
      client.invalidateQueries({ queryKey: ["admin-audit"] });
    }
  });
  const rollback = useMutation({
    mutationFn: rollbackRelease,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["config-releases"] });
      client.invalidateQueries({ queryKey: ["admin-audit"] });
    }
  });
  return (
    <>
      <Header
        eyebrow="Immutable history"
        title="Releases"
        text="Publish a complete draft atomically or roll a prior version forward as a new audited release."
      />
      <div className="mt-6 space-y-3">
        {releases.map((release) => (
          <article
            key={release.id}
            className="surface-card flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-black capitalize ${release.status === "published" ? "bg-success/10 text-success" : "bg-brand-soft text-brand"}`}
                >
                  {release.status}
                </span>
                <strong>
                  {release.version_number
                    ? `Version ${release.version_number}`
                    : "Unpublished draft"}
                </strong>
              </div>
              <p className="mt-2 text-sm text-muted">
                {release.change_note || "No change note"} ·{" "}
                {new Date(release.created_at).toLocaleString()}
              </p>
            </div>
            {release.status === "draft" ? (
              <button
                disabled={!online || publish.isPending}
                onClick={() => publish.mutate(release.id)}
                className="primary-button"
              >
                Publish
              </button>
            ) : release.version_number && release.status !== "published" ? (
              <button
                disabled={!online || rollback.isPending}
                onClick={() => rollback.mutate(release.id)}
                className="secondary-button"
              >
                <RotateCcw className="size-4" /> Roll back to this
              </button>
            ) : (
              <CheckCircle2 className="size-6 text-success" />
            )}
          </article>
        ))}
      </div>
      {(publish.error || rollback.error) && <AdminError error={publish.error || rollback.error} />}
      <section className="mt-8">
        <h2 className="font-display text-xl font-black">Audit history</h2>
        <div className="mt-3 space-y-2">
          {audit.data?.map((event) => (
            <div className="rounded-2xl border border-line bg-surface p-4" key={event.id}>
              <p className="text-sm font-bold capitalize">{event.action.replace("_", " ")}</p>
              <p className="mt-1 text-xs text-muted">
                {new Date(String(event.created_at)).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

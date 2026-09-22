import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BusFront,
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
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useConfirmDialog } from "../components/ConfirmDialogProvider";
import { TimeZoneAutocomplete } from "../components/TimeZoneAutocomplete";
import { ProgressiveList } from "../components/ProgressiveList";
import {
  createConfigDraft,
  discardConfigDraft,
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
import {
  mergeAdminAirlines,
  mergeAdminAirports,
  mergeAdminVendors,
  type AdminAirlineEntry,
  type AdminAirportEntry,
  type AdminVendorEntry,
  type CatalogEntrySource
} from "../features/admin/catalogEntries";
import {
  AdminField,
  AdminCatalogSearch,
  AdminFormIntro,
  AdminPageHeader,
  AdminQueryState,
  AdminShell,
  type AdminNavigationItem
} from "../features/admin/AdminUi";
import { getErrorMessage } from "../features/trips/presentation";
import { isValidTimeZone } from "../features/trips/validation";
import { isSupabaseConfigured, supabase } from "../lib/supabase/client";
import starterJourneyOperators from "../features/metadata/starter-journey-operators.json";
import { AppearancePreview } from "../features/admin/AppearancePreview";
import { ReleaseChangesPanel } from "../features/admin/ReleaseChangesPanel";

export type AdminSection =
  | "overview"
  | "airlines"
  | "airports"
  | "vendors"
  | "operators"
  | "suggestions"
  | "defaults"
  | "appearance"
  | "releases";

const navigation: Array<AdminNavigationItem & { section: AdminSection }> = [
  {
    section: "overview",
    label: "Overview",
    icon: ShieldCheck,
    path: "/admin"
  },
  {
    section: "airlines",
    label: "Airlines",
    icon: Plane,
    path: "/admin/airlines"
  },
  {
    section: "airports",
    label: "Airports",
    icon: Database,
    path: "/admin/airports"
  },
  {
    section: "vendors",
    label: "Booking vendors",
    icon: Store,
    path: "/admin/vendors"
  },
  {
    section: "operators",
    label: "Journey operators",
    icon: BusFront,
    path: "/admin/operators"
  },
  {
    section: "suggestions",
    label: "Suggestions",
    icon: Inbox,
    path: "/admin/suggestions"
  },
  {
    section: "defaults",
    label: "Defaults",
    icon: Save,
    path: "/admin/defaults"
  },
  {
    section: "appearance",
    label: "Appearance",
    icon: Palette,
    path: "/admin/appearance"
  },
  {
    section: "releases",
    label: "Releases",
    icon: History,
    path: "/admin/releases"
  }
];

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
    <AdminShell online={online} navigation={navigation}>
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
  if (section === "operators") return <JourneyOperators />;
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
  const content =
    section === "airlines" ? (
      <Airlines key={editableRelease.id} online={online} release={editableRelease} />
    ) : section === "airports" ? (
      <Airports key={editableRelease.id} online={online} release={editableRelease} />
    ) : section === "vendors" ? (
      <Vendors key={editableRelease.id} online={online} release={editableRelease} />
    ) : section === "defaults" ? (
      <Defaults key={editableRelease.id} release={editableRelease} />
    ) : (
      <Appearance key={editableRelease.id} online={online} release={editableRelease} />
    );
  return (
    <>
      {section !== "defaults" && <ReleaseContext release={editableRelease} />}
      {content}
    </>
  );
}

function AdminError({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-2xl bg-danger/10 p-4 text-sm font-bold text-danger">
      {getErrorMessage(error)}
    </p>
  );
}

function revealAdminEditor() {
  window.requestAnimationFrame(() => {
    const editor = document.querySelector<HTMLElement>("[data-admin-editor]");
    if (typeof editor?.scrollIntoView !== "function") return;
    editor.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

function ReleaseContext({ release }: { release: ConfigRelease }) {
  const editable = release.status === "draft";
  return (
    <div
      className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${editable ? "border-success/30 bg-success/10" : "border-warning/30 bg-warning/10"}`}
    >
      <p className={editable ? "text-success" : "text-warning"}>
        {editable ? "Draft · Changes go live when published" : "Published · Read-only"}
      </p>
      {!editable && (
        <Link to="/admin" className="secondary-button shrink-0 justify-center">
          Create a draft
        </Link>
      )}
    </div>
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
      <AdminPageHeader title="Admin overview" />
      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <Stat label="Published" value={published ? `v${published.version_number}` : "None"} />
        <Stat label="Open draft" value={draft ? "Ready to edit" : "None"} />
        <Stat label="Release history" value={String(releases.length)} />
      </section>
      <section className="surface-card mt-5 p-6">
        <h2 className="font-display text-xl font-black">
          {draft ? "Continue the draft" : "Start a configuration draft"}
        </h2>
        {!draft && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <AdminField className="flex-1" label="Draft summary">
              <input
                className="form-input"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="For example: add India travel catalogs"
              />
            </AdminField>
            <button
              disabled={!online || mutation.isPending}
              onClick={() => mutation.mutate()}
              className="primary-button shrink-0 sm:self-start sm:mt-7"
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
      <section className="mt-7">
        <h2 className="font-display text-xl font-black">What you can manage</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {navigation.slice(1).map(({ path, label, section, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className="surface-card group flex min-w-0 items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block break-words">{label}</strong>
                {(section === "operators" || section === "defaults") && (
                  <span className="mt-1 block text-xs text-muted">Read-only</span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <Link
        to="/preview"
        className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-brand"
      >
        View the current demo
      </Link>
      <details className="mt-3 border-t border-line pt-3 text-sm text-muted">
        <summary className="min-h-11 cursor-pointer py-3 font-bold">About admin</summary>
        <p className="mt-2">
          Create a draft, edit, then publish. Changes require an internet connection and are
          recorded in release history.
        </p>
        <p className="mt-2">
          Admin access does not reveal private trips or documents. App icons, event colours,
          database setup and push secrets are managed in code or deployment.
        </p>
      </details>
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

function CatalogSourceBadge({ source }: { source: CatalogEntrySource }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[0.65rem] font-black uppercase tracking-wide ${source === "release" ? "bg-success/10 text-success" : "bg-brand-soft text-brand"}`}
    >
      {source === "release" ? "Release" : "Built in"}
    </span>
  );
}

function Airlines({ online, release }: { online: boolean; release: ConfigRelease }) {
  const client = useQueryClient();
  const confirm = useConfirmDialog();
  const query = useQuery({
    queryKey: ["admin-airlines", release.id],
    queryFn: () => listAirlines(release.id)
  });
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAirlineEntry | null>(null);
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
      setEditorOpen(false);
    }
  });
  const remove = useMutation({
    mutationFn: deleteAirline,
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-airlines", release.id] })
  });
  const allAirlines = useMemo(
    () => mergeAdminAirlines(query.data ?? [], release.id),
    [query.data, release.id]
  );
  const visibleAirlines = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return allAirlines;
    return allAirlines.filter((item) =>
      [item.name, item.stable_key, item.iata_code, item.icao_code, ...item.aliases]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [allAirlines, search]);
  const editAirline = (item: AdminAirlineEntry) => {
    setEditing(item);
    setEditorOpen(true);
    revealAdminEditor();
  };
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
        id: editing?.catalog_source === "release" ? editing.id : undefined,
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
      <AdminPageHeader
        title="Airline catalog"
        action={
          release.status === "draft" ? (
            <button
              type="button"
              className="primary-button"
              aria-expanded={editorOpen}
              aria-controls="airline-editor"
              onClick={() => {
                setEditing(null);
                setMessage("");
                setEditorOpen(true);
                revealAdminEditor();
              }}
            >
              <Plus className="size-4" /> Add airline
            </button>
          ) : undefined
        }
      />
      {release.status === "draft" && editorOpen && (
        <form
          id="airline-editor"
          data-admin-editor
          key={editing ? `${editing.catalog_source}:${editing.id}` : "new"}
          onSubmit={submit}
          className="surface-card mt-6 grid scroll-mt-28 gap-4 p-5 sm:grid-cols-2"
        >
          <AdminFormIntro
            title={
              editing?.catalog_source === "built_in"
                ? `Customize ${editing.name}`
                : editing
                  ? `Edit ${editing.name}`
                  : "Add airline"
            }
            description={
              editing?.catalog_source === "built_in"
                ? "Saves a draft copy; the built-in entry stays unchanged."
                : undefined
            }
            onCancel={() => {
              setEditing(null);
              setMessage("");
              setEditorOpen(false);
            }}
          />
          <AdminField label="Airline name" required>
            <input
              className="form-input"
              name="name"
              placeholder="For example: Air India"
              defaultValue={editing?.name}
              required
            />
          </AdminField>
          <AdminField
            label="Stable key"
            required
            hint="Permanent lowercase identifier; use letters, numbers, hyphens, or underscores."
          >
            <input
              className="form-input"
              name="stableKey"
              placeholder="air-india"
              defaultValue={editing?.stable_key}
              required
            />
          </AdminField>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="IATA code">
              <input
                className="form-input uppercase"
                name="iata"
                maxLength={2}
                placeholder="AI"
                defaultValue={editing?.iata_code ?? ""}
              />
            </AdminField>
            <AdminField label="ICAO code">
              <input
                className="form-input uppercase"
                name="icao"
                maxLength={3}
                placeholder="AIC"
                defaultValue={editing?.icao_code ?? ""}
              />
            </AdminField>
          </div>
          <AdminField label="Aliases" hint="Separate alternative names with commas.">
            <input
              className="form-input"
              name="aliases"
              placeholder="AirIndia, Indian Airlines"
              defaultValue={editing?.aliases.join(", ")}
            />
          </AdminField>
          <AdminField label="Check-in link template">
            <input
              className="form-input"
              name="checkIn"
              placeholder="https://..."
              defaultValue={editing?.check_in_url_template ?? ""}
            />
          </AdminField>
          <AdminField label="Manage-booking link template">
            <input
              className="form-input"
              name="manage"
              placeholder="https://..."
              defaultValue={editing?.manage_booking_url_template ?? ""}
            />
          </AdminField>
          <AdminField label="Official status link template">
            <input
              className="form-input"
              name="status"
              placeholder="https://..."
              defaultValue={editing?.status_url_template ?? ""}
            />
          </AdminField>
          <AdminField
            label="Flight tracker link template"
            hint="May use supported placeholders such as {flightNumber}."
          >
            <input
              className="form-input"
              name="tracker"
              placeholder="https://.../{flightNumber}"
              defaultValue={editing?.tracker_url_template ?? ""}
            />
          </AdminField>
          <AdminField label="Existing logo asset path">
            <input
              className="form-input"
              name="logo"
              placeholder="catalog/releases/..."
              defaultValue={editing?.logo_asset_path ?? ""}
            />
          </AdminField>
          <AdminField label="Existing banner asset path">
            <input
              className="form-input"
              name="banner"
              placeholder="catalog/releases/..."
              defaultValue={editing?.banner_asset_path ?? ""}
            />
          </AdminField>
          <AdminField label="Upload logo">
            <input
              className="form-input file:mr-2 file:rounded-lg file:border-0 file:bg-brand-soft file:px-2 file:py-1 file:font-bold"
              type="file"
              name="logoFile"
              accept="image/png,image/jpeg,image/webp"
            />
          </AdminField>
          <AdminField label="Upload banner">
            <input
              className="form-input file:mr-2 file:rounded-lg file:border-0 file:bg-brand-soft file:px-2 file:py-1 file:font-bold"
              type="file"
              name="bannerFile"
              accept="image/png,image/jpeg,image/webp"
            />
          </AdminField>
          <p className="-mt-1 text-xs text-muted sm:col-span-2">
            Uploaded catalog artwork is public, immutable, and limited to 2 MB. Never upload
            personal trip images here.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Brand color">
              <input
                className="form-input"
                name="color"
                placeholder="#142f31"
                defaultValue={editing?.brand_color ?? ""}
              />
            </AdminField>
            <AdminField label="Picker order">
              <input
                className="form-input"
                name="sortOrder"
                type="number"
                min="0"
                defaultValue={editing?.sort_order ?? query.data?.length ?? 0}
              />
            </AdminField>
          </div>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold">
            <input type="checkbox" name="enabled" defaultChecked={editing?.is_enabled ?? true} />{" "}
            Enabled in pickers
          </label>
          {(message || save.error) && (
            <p role="alert" className="text-sm font-bold text-danger sm:col-span-2">
              {message || getErrorMessage(save.error)}
            </p>
          )}
          <button
            disabled={!online || save.isPending}
            className="primary-button w-full sm:col-span-2"
          >
            <Save className="size-4" />{" "}
            {save.isPending ? "Saving…" : editing ? "Save airline" : "Add airline"}
          </button>
        </form>
      )}
      <AdminQueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && !query.error && allAirlines.length === 0}
        emptyMessage="No airlines are available."
      />
      {allAirlines.length > 0 && (
        <AdminCatalogSearch
          value={search}
          onChange={setSearch}
          count={visibleAirlines.length}
          label="airlines"
        />
      )}
      <ProgressiveList
        items={visibleAirlines}
        initialCount={12}
        itemLabel="airlines"
        getKey={(item) => `${item.catalog_source}:${item.id}`}
        className="mt-5 grid gap-3 sm:grid-cols-2"
        renderItem={(item) => (
          <article
            className={`surface-card flex h-full min-w-0 items-start gap-3 p-4 sm:p-5 ${item.is_enabled ? "" : "opacity-60"}`}
          >
            <span
              className="grid size-11 shrink-0 place-items-center rounded-xl text-xs font-black text-white"
              style={{ backgroundColor: item.brand_color ?? "#142f31" }}
            >
              {item.iata_code || item.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="break-words font-display text-lg font-black [overflow-wrap:anywhere]">
                  {item.name}
                </h2>
                <CatalogSourceBadge source={item.catalog_source} />
              </div>
              {!item.is_enabled && <p className="text-xs text-muted">Disabled</p>}
            </div>
            <button
              disabled={!online || release.status !== "draft"}
              onClick={() => editAirline(item)}
              className="tap-target inline-flex min-w-10 items-center justify-center gap-1.5 px-2 text-xs font-bold text-muted hover:text-brand"
              aria-label={`${item.catalog_source === "release" ? "Edit" : "Customize"} ${item.name}`}
            >
              <Pencil className="size-4" />
              <span className="hidden sm:inline">
                {item.catalog_source === "release" ? "Edit" : "Customize"}
              </span>
            </button>
            {item.catalog_source === "release" && (
              <button
                disabled={!online || release.status !== "draft"}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete ${item.name}?`,
                      message:
                        "This removes the release copy. The built-in fallback may become available again.",
                      confirmLabel: "Delete airline",
                      tone: "danger"
                    })
                  )
                    remove.mutate(item.id);
                }}
                className="tap-target inline-flex min-w-10 items-center justify-center gap-1.5 px-2 text-xs font-bold text-muted hover:text-danger"
                aria-label={`Delete ${item.name}`}
              >
                <Trash2 className="size-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
          </article>
        )}
      />
      {search && visibleAirlines.length === 0 && (
        <p className="surface-card mt-3 border-dashed p-5 text-sm text-muted">
          No airlines match “{search}”.
        </p>
      )}
      {remove.error && <AdminError error={remove.error} />}
    </>
  );
}

function Airports({ online, release }: { online: boolean; release: ConfigRelease }) {
  const client = useQueryClient();
  const confirm = useConfirmDialog();
  const query = useQuery({
    queryKey: ["admin-airports", release.id],
    queryFn: () => listAirports(release.id)
  });
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAirportEntry | null>(null);
  const save = useMutation({
    mutationFn: saveAirport,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["admin-airports", release.id] });
      setEditing(null);
      setMessage("");
      setEditorOpen(false);
    }
  });
  const remove = useMutation({
    mutationFn: deleteAirport,
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-airports", release.id] })
  });
  const allAirports = useMemo(
    () => mergeAdminAirports(query.data ?? [], release.id),
    [query.data, release.id]
  );
  const visibleAirports = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return allAirports;
    return allAirports.filter((item) =>
      [
        item.name,
        item.city,
        item.country_code,
        item.stable_key,
        item.iata_code,
        item.icao_code,
        item.timezone,
        ...item.aliases
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [allAirports, search]);
  const editAirport = (item: AdminAirportEntry) => {
    setEditing(item);
    setEditorOpen(true);
    revealAdminEditor();
  };
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
      id: editing?.catalog_source === "release" ? editing.id : undefined,
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
      <AdminPageHeader
        title="Airport catalog"
        action={
          release.status === "draft" ? (
            <button
              type="button"
              className="primary-button"
              aria-expanded={editorOpen}
              aria-controls="airport-editor"
              onClick={() => {
                setEditing(null);
                setMessage("");
                setEditorOpen(true);
                revealAdminEditor();
              }}
            >
              <Plus className="size-4" /> Add airport
            </button>
          ) : undefined
        }
      />
      {release.status === "draft" && editorOpen && (
        <form
          id="airport-editor"
          data-admin-editor
          key={editing ? `${editing.catalog_source}:${editing.id}` : "new"}
          onSubmit={submit}
          className="surface-card mt-6 grid scroll-mt-28 gap-4 p-5 sm:grid-cols-2"
        >
          <AdminFormIntro
            title={
              editing?.catalog_source === "built_in"
                ? `Customize ${editing.name}`
                : editing
                  ? `Edit ${editing.name}`
                  : "Add airport"
            }
            description={
              editing?.catalog_source === "built_in"
                ? "Saves a draft copy; the built-in entry stays unchanged."
                : undefined
            }
            onCancel={() => {
              setEditing(null);
              setMessage("");
              setEditorOpen(false);
            }}
          />
          <AdminField label="Airport name" required>
            <input
              className="form-input"
              name="name"
              placeholder="For example: Indira Gandhi International Airport"
              defaultValue={editing?.name}
              required
            />
          </AdminField>
          <AdminField label="City" required>
            <input
              className="form-input"
              name="city"
              placeholder="New Delhi"
              defaultValue={editing?.city}
              required
            />
          </AdminField>
          <AdminField label="Stable key" required>
            <input
              className="form-input"
              name="stableKey"
              placeholder="del-indira-gandhi"
              defaultValue={editing?.stable_key}
              required
            />
          </AdminField>
          <AdminField label="Aliases" hint="Separate alternative names with commas.">
            <input
              className="form-input"
              name="aliases"
              placeholder="Delhi Airport, IGI"
              defaultValue={editing?.aliases.join(", ")}
            />
          </AdminField>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="IATA code">
              <input
                className="form-input uppercase"
                name="iata"
                placeholder="DEL"
                maxLength={3}
                defaultValue={editing?.iata_code ?? ""}
              />
            </AdminField>
            <AdminField label="ICAO code">
              <input
                className="form-input uppercase"
                name="icao"
                placeholder="VIDP"
                maxLength={4}
                defaultValue={editing?.icao_code ?? ""}
              />
            </AdminField>
          </div>
          <AdminField label="Country code" required hint="Use the two-letter ISO code.">
            <input
              className="form-input uppercase"
              name="country"
              placeholder="IN"
              maxLength={2}
              defaultValue={editing?.country_code}
              required
            />
          </AdminField>
          <AdminField label="Airport time zone" required className="sm:col-span-2">
            <TimeZoneAutocomplete
              className="form-input"
              name="timezone"
              defaultValue={editing?.timezone}
              required
              aria-label="Airport time zone"
            />
          </AdminField>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Latitude">
              <input
                className="form-input"
                name="latitude"
                type="number"
                step="any"
                placeholder="28.5562"
                defaultValue={editing?.latitude ?? ""}
              />
            </AdminField>
            <AdminField label="Longitude">
              <input
                className="form-input"
                name="longitude"
                type="number"
                step="any"
                placeholder="77.1000"
                defaultValue={editing?.longitude ?? ""}
              />
            </AdminField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminField label="Picker order">
              <input
                className="form-input"
                name="sortOrder"
                type="number"
                min="0"
                defaultValue={editing?.sort_order ?? query.data?.length ?? 0}
              />
            </AdminField>
            <label className="flex min-h-11 items-center gap-2 self-end rounded-xl border border-line px-3 text-sm font-bold">
              <input type="checkbox" name="enabled" defaultChecked={editing?.is_enabled ?? true} />{" "}
              Enabled
            </label>
          </div>
          {message && <p className="text-sm font-bold text-danger sm:col-span-2">{message}</p>}
          <button
            disabled={!online || save.isPending}
            className="primary-button w-full sm:col-span-2"
          >
            {editing ? "Save airport" : "Add airport"}
          </button>
        </form>
      )}
      <AdminQueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && !query.error && allAirports.length === 0}
        emptyMessage="No airports are available."
      />
      {allAirports.length > 0 && (
        <AdminCatalogSearch
          value={search}
          onChange={setSearch}
          count={visibleAirports.length}
          label="airports"
        />
      )}
      <ProgressiveList
        items={visibleAirports}
        initialCount={16}
        itemLabel="airports"
        getKey={(item) => `${item.catalog_source}:${item.id}`}
        className="mt-5 space-y-3"
        renderItem={(item) => (
          <article
            className={`surface-card flex min-w-0 items-start gap-3 p-4 sm:items-center sm:gap-4 sm:p-5 ${item.is_enabled ? "" : "opacity-60"}`}
          >
            <strong className="shrink-0 font-mono text-lg">{item.iata_code || "—"}</strong>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="break-words font-bold [overflow-wrap:anywhere]">{item.name}</p>
                <CatalogSourceBadge source={item.catalog_source} />
              </div>
              <p className="mt-1 break-words text-xs leading-5 text-muted [overflow-wrap:anywhere]">
                {item.city} · {item.country_code} · {item.timezone} ·{" "}
                {item.is_enabled ? "available" : "disabled"}
              </p>
            </div>
            <button
              disabled={!online || release.status !== "draft"}
              onClick={() => editAirport(item)}
              className="tap-target inline-flex min-w-10 items-center justify-center gap-1.5 px-2 text-xs font-bold text-muted hover:text-brand"
              aria-label={`${item.catalog_source === "release" ? "Edit" : "Customize"} ${item.name}`}
            >
              <Pencil className="size-4" />
              <span className="hidden sm:inline">
                {item.catalog_source === "release" ? "Edit" : "Customize"}
              </span>
            </button>
            {item.catalog_source === "release" && (
              <button
                disabled={!online || release.status !== "draft"}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete ${item.name}?`,
                      message:
                        "This removes the release copy. The built-in fallback may become available again.",
                      confirmLabel: "Delete airport",
                      tone: "danger"
                    })
                  )
                    remove.mutate(item.id);
                }}
                className="tap-target inline-flex min-w-10 items-center justify-center gap-1.5 px-2 text-xs font-bold text-muted hover:text-danger"
                aria-label={`Delete ${item.name}`}
              >
                <Trash2 className="size-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
          </article>
        )}
      />
      {search && visibleAirports.length === 0 && (
        <p className="surface-card mt-3 border-dashed p-5 text-sm text-muted">
          No airports match “{search}”.
        </p>
      )}
      {(save.error || remove.error) && <AdminError error={save.error || remove.error} />}
    </>
  );
}

function Vendors({ online, release }: { online: boolean; release: ConfigRelease }) {
  const client = useQueryClient();
  const confirm = useConfirmDialog();
  const query = useQuery({
    queryKey: ["admin-vendors", release.id],
    queryFn: () => listVendors(release.id)
  });
  const [editing, setEditing] = useState<AdminVendorEntry | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
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
      setEditorOpen(false);
    }
  });
  const remove = useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => client.invalidateQueries({ queryKey: ["admin-vendors", release.id] })
  });
  const allVendors = useMemo(
    () => mergeAdminVendors(query.data ?? [], release.id),
    [query.data, release.id]
  );
  const visibleVendors = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return allVendors;
    return allVendors.filter((item) =>
      [item.name, item.stable_key, item.website_url, ...item.aliases]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    );
  }, [allVendors, search]);
  const editVendor = (item: AdminVendorEntry) => {
    setEditing(item);
    setEditorOpen(true);
    revealAdminEditor();
  };
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
        id: editing?.catalog_source === "release" ? editing.id : undefined,
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
      <AdminPageHeader
        title="Booking-vendor catalog"
        action={
          release.status === "draft" ? (
            <button
              type="button"
              className="primary-button"
              aria-expanded={editorOpen}
              aria-controls="vendor-editor"
              onClick={() => {
                setEditing(null);
                setMessage("");
                setEditorOpen(true);
                revealAdminEditor();
              }}
            >
              <Plus className="size-4" /> Add vendor
            </button>
          ) : undefined
        }
      />
      {release.status === "draft" && editorOpen && (
        <form
          id="vendor-editor"
          data-admin-editor
          key={editing ? `${editing.catalog_source}:${editing.id}` : "new"}
          onSubmit={submit}
          className="surface-card mt-6 grid scroll-mt-28 gap-4 p-5 sm:grid-cols-2"
        >
          <AdminFormIntro
            title={
              editing?.catalog_source === "built_in"
                ? `Customize ${editing.name}`
                : editing
                  ? `Edit ${editing.name}`
                  : "Add booking vendor"
            }
            description={
              editing?.catalog_source === "built_in"
                ? "Saves a draft copy; the built-in entry stays unchanged."
                : "The seller or booking website, not the service provider."
            }
            onCancel={() => {
              setEditing(null);
              setMessage("");
              setEditorOpen(false);
            }}
          />
          <AdminField label="Vendor name" required>
            <input
              required
              className="form-input"
              name="name"
              placeholder="For example: Booking.com"
              defaultValue={editing?.name}
            />
          </AdminField>
          <AdminField label="Stable key" required>
            <input
              required
              className="form-input"
              name="stableKey"
              placeholder="booking-com"
              defaultValue={editing?.stable_key}
            />
          </AdminField>
          <AdminField label="Aliases" hint="Separate alternative names with commas.">
            <input
              className="form-input"
              name="aliases"
              placeholder="Booking, Booking.com"
              defaultValue={editing?.aliases.join(", ")}
            />
          </AdminField>
          <AdminField label="Official website">
            <input
              className="form-input"
              name="website"
              type="url"
              placeholder="https://..."
              defaultValue={editing?.website_url ?? ""}
            />
          </AdminField>
          <AdminField label="Existing logo asset path">
            <input
              className="form-input"
              name="logo"
              placeholder="catalog/releases/..."
              defaultValue={editing?.logo_asset_path ?? ""}
            />
          </AdminField>
          <AdminField label="Upload logo">
            <input
              className="form-input"
              name="logoFile"
              type="file"
              accept="image/png,image/jpeg,image/webp"
            />
          </AdminField>
          <AdminField label="Brand color">
            <input
              className="form-input"
              name="color"
              placeholder="#003b95"
              defaultValue={editing?.brand_color ?? ""}
            />
          </AdminField>
          <AdminField label="Picker order">
            <input
              className="form-input"
              name="sortOrder"
              type="number"
              min="0"
              defaultValue={editing?.sort_order ?? query.data?.length ?? 0}
            />
          </AdminField>
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold">
            <input type="checkbox" name="enabled" defaultChecked={editing?.is_enabled ?? true} />{" "}
            Enabled in pickers
          </label>
          {(message || save.error) && (
            <p role="alert" className="text-sm font-bold text-danger sm:col-span-2">
              {message || getErrorMessage(save.error)}
            </p>
          )}
          <button
            disabled={!online || save.isPending}
            className="primary-button w-full sm:col-span-2"
          >
            <Save className="size-4" /> Save vendor
          </button>
        </form>
      )}
      <AdminQueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && !query.error && allVendors.length === 0}
        emptyMessage="No booking vendors are available."
      />
      {allVendors.length > 0 && (
        <AdminCatalogSearch
          value={search}
          onChange={setSearch}
          count={visibleVendors.length}
          label="vendors"
        />
      )}
      <ProgressiveList
        items={visibleVendors}
        initialCount={12}
        itemLabel="booking vendors"
        getKey={(vendor) => `${vendor.catalog_source}:${vendor.id}`}
        className="mt-5 grid gap-3 sm:grid-cols-2"
        renderItem={(vendor) => (
          <article className="surface-card flex h-full min-w-0 items-start gap-3 p-4 sm:items-center sm:p-5">
            <span
              className="grid size-10 place-items-center rounded-xl text-xs font-black text-white"
              style={{ backgroundColor: vendor.brand_color ?? "#142f31" }}
            >
              {vendor.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="break-words font-bold [overflow-wrap:anywhere]">{vendor.name}</p>
                <CatalogSourceBadge source={vendor.catalog_source} />
              </div>
              <p className="mt-1 break-all text-xs text-muted">
                {vendor.website_url ?? "No website"}
              </p>
            </div>
            <button
              disabled={!online || release.status !== "draft"}
              onClick={() => editVendor(vendor)}
              className="tap-target inline-flex min-w-10 items-center justify-center gap-1.5 px-2 text-xs font-bold text-muted hover:text-brand"
              aria-label={`${vendor.catalog_source === "release" ? "Edit" : "Customize"} ${vendor.name}`}
            >
              <Pencil className="size-4" />
              <span className="hidden sm:inline">
                {vendor.catalog_source === "release" ? "Edit" : "Customize"}
              </span>
            </button>
            {vendor.catalog_source === "release" && (
              <button
                disabled={!online || release.status !== "draft"}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete ${vendor.name}?`,
                      message:
                        "This removes the release copy. The built-in fallback may become available again.",
                      confirmLabel: "Delete vendor",
                      tone: "danger"
                    })
                  )
                    remove.mutate(vendor.id);
                }}
                className="tap-target inline-flex min-w-10 items-center justify-center gap-1.5 px-2 text-xs font-bold text-muted hover:text-danger"
                aria-label={`Delete ${vendor.name}`}
              >
                <Trash2 className="size-4" />
                <span className="hidden sm:inline">Delete</span>
              </button>
            )}
          </article>
        )}
      />
      {search && visibleVendors.length === 0 && (
        <p className="surface-card mt-3 border-dashed p-5 text-sm text-muted">
          No booking vendors match “{search}”.
        </p>
      )}
      {remove.error && <AdminError error={remove.error} />}
    </>
  );
}

type JourneyOperatorMode = "all" | "train" | "bus" | "ferry" | "cab";

function JourneyOperators() {
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<JourneyOperatorMode>("all");
  const visibleOperators = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return starterJourneyOperators.filter(
      (operator) =>
        (mode === "all" || operator.mode === mode) &&
        (!needle ||
          [operator.name, operator.mode, operator.region, operator.aliases].some((value) =>
            value.toLocaleLowerCase().includes(needle)
          ))
    );
  }, [mode, search]);
  return (
    <>
      <AdminPageHeader
        title="Journey operator catalog"
        text="Read-only · Built-in train, bus, ferry and cab providers."
      />
      <div className="surface-card mt-6 grid min-w-0 gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:p-5">
        <AdminField label="Search journey operators">
          <input
            className="form-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, region, or alias"
          />
        </AdminField>
        <AdminField label="Journey type">
          <select
            className="form-input"
            value={mode}
            onChange={(event) => setMode(event.target.value as JourneyOperatorMode)}
          >
            <option value="all">All journey types</option>
            <option value="train">Train</option>
            <option value="bus">Bus</option>
            <option value="ferry">Ferry</option>
            <option value="cab">Cab</option>
          </select>
        </AdminField>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-muted">
        <span>
          {visibleOperators.length} {visibleOperators.length === 1 ? "operator" : "operators"}
        </span>
        <CatalogSourceBadge source="built_in" />
      </div>
      <ProgressiveList
        items={visibleOperators}
        initialCount={16}
        itemLabel="journey operators"
        getKey={(operator) => `${operator.mode}:${operator.name}`}
        className="mt-4 grid gap-3 sm:grid-cols-2"
        empty={
          <p className="surface-card mt-4 border-dashed p-5 text-sm text-muted">
            No journey operators match these filters.
          </p>
        }
        renderItem={(operator) => (
          <article className="surface-card h-full min-w-0 p-4 sm:p-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="break-words font-display text-lg font-black [overflow-wrap:anywhere]">
                {operator.name}
              </h2>
              <span className="rounded-full bg-elevated px-2 py-1 text-[0.65rem] font-black uppercase tracking-wide text-muted">
                {operator.mode}
              </span>
            </div>
            <p className="mt-2 break-words text-sm text-muted [overflow-wrap:anywhere]">
              {operator.region}
            </p>
            {operator.aliases && (
              <p className="mt-2 break-words text-xs leading-5 text-muted [overflow-wrap:anywhere]">
                Also found as {operator.aliases}
              </p>
            )}
          </article>
        )}
      />
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
      <AdminPageHeader
        title="Catalog suggestions"
        text="Public metadata only; private trip details are excluded."
      />
      <AdminQueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && !query.error && query.data?.length === 0}
        emptyMessage="No catalog suggestions need review."
      />
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
              <details className="mt-3 rounded-xl bg-elevated p-3 text-xs">
                <summary className="cursor-pointer font-bold text-brand">
                  Review submitted details
                </summary>
                <p className="mt-2 break-all text-muted">Normalized: {item.normalized_value}</p>
                <pre className="mt-2 max-w-full overflow-auto whitespace-pre-wrap break-words text-muted">
                  {JSON.stringify(item.proposed_data, null, 2)}
                </pre>
              </details>
            </div>
            {item.status === "pending" && (
              <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
                <button
                  disabled={!online || review.isPending}
                  onClick={() => review.mutate({ id: item.id, status: "promoted" })}
                  className="secondary-button"
                >
                  Promote
                </button>
                <button
                  disabled={!online || review.isPending}
                  onClick={() => review.mutate({ id: item.id, status: "merged" })}
                  className="secondary-button"
                >
                  Merge
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
      </div>
      {review.error && <AdminError error={review.error} />}
    </>
  );
}

function Defaults({ release }: { release: ConfigRelease }) {
  const query = useQuery({
    queryKey: ["admin-defaults", release.id],
    queryFn: () => listDefaults(release.id)
  });
  return (
    <>
      <AdminPageHeader
        title="Travel defaults"
        text="Read-only · Stored values are not currently used by the app."
      />
      <AdminQueryState
        loading={query.isLoading}
        error={query.error}
        empty={!query.isLoading && !query.error && query.data?.length === 0}
        emptyMessage="No stored defaults in this release."
      />
      <div className="mt-4 space-y-2">
        {query.data?.map((item) => (
          <details className="surface-card p-3" key={item.namespace + "." + item.key}>
            <summary className="cursor-pointer break-words text-sm font-bold">
              {item.namespace}.{item.key}
            </summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs text-muted">
              {JSON.stringify(item.value, null, 2)}
            </pre>
          </details>
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
      <AdminPageHeader
        title="Light & dark appearance"
        text="Contrast is checked before publishing."
      />
      <AdminQueryState
        loading={query.isLoading}
        error={query.error}
        empty={false}
        emptyMessage=""
      />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <TokenEditor
          title="Light"
          tokens={light}
          onChange={setLight}
          disabled={
            !online || release.status !== "draft" || query.isLoading || Boolean(query.error)
          }
        />
        <TokenEditor
          title="Dark"
          tokens={dark}
          onChange={setDark}
          disabled={
            !online || release.status !== "draft" || query.isLoading || Boolean(query.error)
          }
        />
      </div>
      {message && (
        <p
          role="status"
          className={`mt-4 text-sm font-bold ${message.includes("saved") ? "text-success" : "text-danger"}`}
        >
          {message}
        </p>
      )}
      {save.error && <AdminError error={save.error} />}
      <button
        disabled={
          !online ||
          release.status !== "draft" ||
          save.isPending ||
          query.isLoading ||
          Boolean(query.error)
        }
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
  onChange,
  disabled = false
}: {
  title: string;
  tokens: ThemeTokens;
  onChange: (tokens: ThemeTokens) => void;
  disabled?: boolean;
}) {
  return (
    <section className="surface-card p-5">
      <h2 className="font-display text-xl font-black">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Object.entries(tokens).map(([key, value]) => (
          <label className="form-label capitalize" key={key}>
            {key === "coral" ? "Current event / accent" : key}
            <span className="mt-2 grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2">
              <input
                type="color"
                aria-label={`${title} ${key === "coral" ? "current event accent" : key} colour`}
                disabled={disabled}
                value={value}
                onChange={(event) => onChange({ ...tokens, [key]: event.target.value })}
                className="size-11 rounded-lg border border-line bg-transparent p-1"
              />
              <input
                disabled={disabled}
                className="form-input mt-0 min-w-0 font-mono"
                aria-label={`${title} ${key === "coral" ? "current event accent" : key} hex`}
                value={value}
                onChange={(event) =>
                  onChange({ ...tokens, [key]: event.target.value } as ThemeTokens)
                }
              />
            </span>
          </label>
        ))}
      </div>
      <AppearancePreview tokens={tokens} mode={title === "Dark" ? "dark" : "light"} />
    </section>
  );
}

function Releases({ online, releases }: { online: boolean; releases: ConfigRelease[] }) {
  const client = useQueryClient();
  const confirm = useConfirmDialog();
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: getAdminAudit });
  const discard = useMutation({
    mutationFn: discardConfigDraft,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["config-releases"] });
      client.invalidateQueries({ queryKey: ["admin-audit"] });
      client.invalidateQueries({ queryKey: ["admin-release-changes"] });
    }
  });
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
      <AdminPageHeader title="Releases" />
      {releases.length === 0 && (
        <p className="surface-card mt-6 border-dashed p-6 text-sm text-muted">
          No releases exist yet. Return to Overview and create the first configuration draft.
        </p>
      )}
      <div className="mt-6 space-y-3">
        {releases.map((release) => (
          <article key={release.id} className="surface-card p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
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
                <p className="mt-2 break-words text-sm text-muted [overflow-wrap:anywhere]">
                  {release.change_note || "No change note"} ·{" "}
                  {new Date(release.created_at).toLocaleString()}
                </p>
              </div>
              {release.status === "draft" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      !online || discard.isPending || publish.isPending || rollback.isPending
                    }
                    className="secondary-button justify-center text-danger"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Delete this draft?",
                          message:
                            "Discard this unpublished draft and its changes. The live configuration is unaffected. Its audit record is retained, but it cannot be restored from this screen.",
                          confirmLabel: "Delete draft",
                          tone: "danger"
                        })
                      )
                        discard.mutate(release.id);
                    }}
                  >
                    <Trash2 className="size-4" /> Delete draft
                  </button>
                  <button
                    disabled={
                      !online || publish.isPending || discard.isPending || rollback.isPending
                    }
                    onClick={async () => {
                      if (
                        await confirm({
                          title: "Publish this configuration?",
                          message:
                            "Airlines, airports, booking vendors, and both themes in this draft will become live together. Stored defaults are retained unchanged.",
                          confirmLabel: "Publish release"
                        })
                      )
                        publish.mutate(release.id);
                    }}
                    className="primary-button"
                  >
                    Publish
                  </button>
                </div>
              ) : release.version_number && release.status !== "published" ? (
                <button
                  disabled={!online || rollback.isPending || discard.isPending || publish.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Roll forward version ${release.version_number}?`,
                        message:
                          "This creates a new audited release from the selected historical version; it does not erase history.",
                        confirmLabel: "Create rollback release"
                      })
                    )
                      rollback.mutate(release.id);
                  }}
                  className="secondary-button w-full justify-center sm:w-auto"
                >
                  <RotateCcw className="size-4" /> Roll back to this
                </button>
              ) : (
                <CheckCircle2 className="size-6 text-success" />
              )}
            </div>
            <ReleaseChangesPanel release={release} releases={releases} />
          </article>
        ))}
      </div>
      {(publish.error || rollback.error || discard.error) && (
        <AdminError error={publish.error || rollback.error || discard.error} />
      )}
      <section className="mt-8">
        <h2 className="font-display text-xl font-black">Audit history</h2>
        <AdminQueryState
          loading={audit.isLoading}
          error={audit.error}
          empty={!audit.isLoading && !audit.error && audit.data?.length === 0}
          emptyMessage="No administrator actions have been recorded yet."
        />
        <div className="mt-3 space-y-2">
          {audit.data?.map((event) => (
            <div className="rounded-2xl border border-line bg-surface p-4" key={event.id}>
              <p className="text-sm font-bold capitalize">
                {event.safe_summary?.discarded_draft
                  ? "Draft deleted"
                  : event.action.replaceAll("_", " ")}
              </p>
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

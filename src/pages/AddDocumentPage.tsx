import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { FileDropzone } from "../components/FileDropzone";
import { PageHeader } from "../components/TripUi";
import { localProfileId } from "../features/sync/localSync";
import { listTrips } from "../features/trips/api";
import { getErrorMessage } from "../features/trips/presentation";
import { listMembers, listTravelers, stageAccountDocument } from "../features/workspace/api";
import { personalDocumentKinds } from "../features/workspace/PersonalDocuments";
import { UploadDocumentForm } from "../features/workspace/WorkspaceForms";
import type { AccountDocumentUpload } from "../features/workspace/types";
import { discardIncomingShare, readIncomingShare } from "../lib/pwa/incomingShare";

const shareErrors: Record<string, string> = {
  size: "Choose a non-empty PDF or image smaller than 5 MB.",
  count: "Share one document at a time. No files were saved.",
  type: "Use a PDF, JPEG, PNG, or WebP file.",
  busy: "There are several unfinished shares. Finish one or try again in 15 minutes.",
  unavailable: "The shared file could not be received. Choose it below or try sharing again."
};

export function AddDocumentPage() {
  const [params] = useSearchParams();
  const shareId = params.get("id");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<NonNullable<AccountDocumentUpload["personal_kind"]>>("other");
  const [label, setLabel] = useState("");
  const [destination, setDestination] = useState("personal");
  const [tripId, setTripId] = useState("");
  const [reviewTrip, setReviewTrip] = useState(false);
  const [message, setMessage] = useState(shareErrors[params.get("error") ?? ""] ?? "");
  const [loadingShare, setLoadingShare] = useState(Boolean(shareId));
  const trips = useQuery({
    queryKey: ["trips"],
    queryFn: () => listTrips(),
    enabled: destination === "trip"
  });
  const travelers = useQuery({
    queryKey: ["travelers", tripId],
    queryFn: () => listTravelers(tripId),
    enabled: Boolean(tripId)
  });
  const members = useQuery({
    queryKey: ["members", tripId],
    queryFn: () => listMembers(tripId),
    enabled: Boolean(tripId)
  });
  const profile = useQuery({ queryKey: ["local-profile-id"], queryFn: localProfileId });
  const role = members.data?.find((member) => member.user_id === profile.data)?.role;
  const selectedTrip = trips.data?.find((trip) => trip.id === tripId);
  useEffect(() => {
    if (!shareId) return;
    let active = true;
    setLoadingShare(true);
    void readIncomingShare(shareId)
      .then((received) => {
        if (active) {
          setFile(received);
          setTitle(received.name);
        }
      })
      .catch((error) => {
        if (active) setMessage(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingShare(false);
      });
    return () => {
      active = false;
    };
  }, [shareId]);
  const finish = async (personal: boolean) => {
    if (shareId) await discardIncomingShare(shareId);
    await queryClient.invalidateQueries({ queryKey: ["account-document-uploads"] });
    navigate(personal ? "/vault?section=personal" : "/vault", { replace: true });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose a file first.");
      return stageAccountDocument(file, undefined, { title, kind, label });
    },
    onSuccess: () => finish(true)
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!file) {
      setMessage("Choose a PDF or image first.");
      return;
    }
    if (destination === "personal") save.mutate();
    else if (selectedTrip) setReviewTrip(true);
    else setMessage("Choose a trip.");
  };
  const cancel = async () => {
    if (shareId) await discardIncomingShare(shareId);
    navigate("/vault");
  };
  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          eyebrow="Document Vault"
          title={shareId ? "Save shared document" : "Add document"}
        />
        <p className="mt-3 text-sm text-muted">
          Keep a personal file private, or choose a trip and review its document fields. Nothing is
          uploaded until you save.
        </p>
        <form className="surface-card mt-4 space-y-4 p-4" onSubmit={submit}>
          {loadingShare && <p role="status">Opening shared file…</p>}
          <FileDropzone
            name="document"
            label="PDF or image under 5 MB"
            file={file}
            onFileChange={(next) => {
              setFile(next);
              if (!title) setTitle(next?.name ?? "");
            }}
            busy={save.isPending || loadingShare}
          />
          <label className="form-label">
            Save to
            <select
              className="form-input"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={save.isPending}
            >
              <option value="personal">Personal documents · Only me</option>
              <option value="trip">A trip</option>
            </select>
          </label>
          {destination === "personal" ? (
            <>
              <label className="form-label">
                Document type
                <select
                  className="form-input"
                  value={kind}
                  disabled={save.isPending}
                  onChange={(e) => setKind(e.target.value as typeof kind)}
                >
                  {personalDocumentKinds.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Document name
                <input
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                  disabled={save.isPending}
                />
              </label>
              <label className="form-label">
                Label (optional)
                <input
                  className="form-input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={200}
                  placeholder="For example: My passport"
                  disabled={save.isPending}
                />
              </label>
              <p className="rounded-xl bg-brand-soft p-3 text-sm">
                Only your account can access this file. Trip members cannot see it. No identity
                number is required.
              </p>
            </>
          ) : (
            <>
              <label className="form-label">
                Trip
                <select
                  className="form-input"
                  value={tripId}
                  onChange={(e) => setTripId(e.target.value)}
                  required
                >
                  <option value="">Choose a trip</option>
                  {trips.data?.map((trip) => (
                    <option value={trip.id} key={trip.id}>
                      {trip.title}
                    </option>
                  ))}
                </select>
              </label>
              {trips.isPending && <p role="status">Loading trips…</p>}
              {trips.data?.length === 0 && (
                <p className="text-sm">
                  No trips yet. Save privately, or{" "}
                  <Link className="text-brand underline" to="/trips/new">
                    create a trip
                  </Link>
                  .
                </p>
              )}
            </>
          )}
          {(message || save.error || trips.error || travelers.error || members.error) && (
            <p role="alert" className="text-sm text-danger">
              {message ||
                getErrorMessage(save.error || trips.error || travelers.error || members.error)}
            </p>
          )}
          <div className="flex gap-2">
            <button
              className="primary-button flex-1"
              disabled={
                save.isPending ||
                loadingShare ||
                (destination === "trip" &&
                  (!tripId ||
                    travelers.isPending ||
                    members.isPending ||
                    profile.isPending ||
                    !!travelers.error ||
                    !!members.error))
              }
            >
              {save.isPending
                ? "Saving…"
                : destination === "personal"
                  ? "Save privately"
                  : "Review trip document"}
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={save.isPending}
              onClick={() => void cancel()}
            >
              Cancel
            </button>
          </div>
        </form>
        {reviewTrip && selectedTrip && file && (
          <UploadDocumentForm
            trip={selectedTrip}
            travelers={travelers.data ?? []}
            members={members.data ?? []}
            privateOnly={role !== "owner" && role !== "editor"}
            initialFile={file}
            initialFileContext="shared"
            initialVisibility="private"
            onClose={() => setReviewTrip(false)}
            onUploaded={() => finish(false)}
          />
        )}
      </div>
    </AppShell>
  );
}

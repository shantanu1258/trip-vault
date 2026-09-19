import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { requirementTimelineSchedule } from "../timeline/model";
import type { ItineraryItem } from "../trips/types";
import { archiveRequirement, updateRequirementStatus } from "../workspace/api";
import type { Requirement } from "../workspace/types";

export function RequirementDetailsSheet({
  requirement,
  itinerary,
  timezone,
  audience,
  editable,
  manageHistory = true,
  onClose,
  onEdit
}: {
  requirement: Requirement;
  itinerary: ItineraryItem[];
  timezone: string;
  audience?: string;
  editable: boolean;
  manageHistory?: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState("");
  const schedule = requirementTimelineSchedule(requirement, itinerary, timezone);
  const done = ["complete", "not_required"].includes(requirement.status);
  const refreshRequirementData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["requirements", requirement.trip_id] }),
      queryClient.invalidateQueries({ queryKey: ["alerts"] }),
      queryClient.invalidateQueries({ queryKey: ["archived-trip-items", requirement.trip_id] })
    ]);
  };
  const statusMutation = useMutation({
    mutationFn: () =>
      updateRequirementStatus(requirement.id, done ? "to_check" : "complete", requirement.trip_id),
    onMutate: () => setActionError(""),
    onSuccess: async () => {
      await refreshRequirementData();
      onClose();
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : "The task could not be updated.")
  });
  const archiveMutation = useMutation({
    mutationFn: () => archiveRequirement(requirement),
    onMutate: () => setActionError(""),
    onSuccess: async () => {
      await refreshRequirementData();
      onClose();
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : "The task could not be archived.")
  });
  const actionPending = statusMutation.isPending || archiveMutation.isPending;
  return (
    <ModalSheet
      eyebrow="Readiness task"
      title={requirement.title}
      onClose={onClose}
      manageHistory={manageHistory}
    >
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-xl bg-elevated p-3">
        <div className="pr-2">
          <p className="text-xs text-muted">Status</p>
          <p className="mt-1 text-sm font-bold capitalize">
            {requirement.status.replaceAll("_", " ")}
          </p>
        </div>
        <div className="min-w-0 border-l border-line pl-3">
          <p className="text-xs text-muted">When</p>
          <p className="mt-1 text-sm font-bold">{schedule?.label ?? "No date or event set"}</p>
        </div>
        {audience && (
          <div className="col-span-2 border-t border-line pt-2 text-xs">
            <span className="text-muted">For </span>
            <strong>{audience}</strong>
          </div>
        )}
      </div>
      {requirement.notes && (
        <div className="mt-3 rounded-xl border border-line p-3">
          <p className="eyebrow">Notes</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-muted">
            {requirement.notes}
          </p>
        </div>
      )}
      {actionError && (
        <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
          {actionError}
        </p>
      )}
      {editable && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="primary-button col-span-2"
            disabled={actionPending}
            onClick={() => statusMutation.mutate()}
          >
            {done ? <RotateCcw className="size-4" /> : <Check className="size-4" />}
            {done ? "Mark as not done" : "Mark as done"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={actionPending}
            onClick={onEdit}
          >
            <Pencil className="size-4" /> Edit task
          </button>
          <button
            type="button"
            className="secondary-button text-danger"
            disabled={actionPending}
            onClick={async () => {
              if (
                await confirm({
                  title: "Archive task?",
                  message: `Archive ${requirement.title}?`,
                  confirmLabel: "Archive",
                  tone: "danger"
                })
              )
                archiveMutation.mutate();
            }}
          >
            <Archive className="size-4" /> Archive
          </button>
        </div>
      )}
    </ModalSheet>
  );
}

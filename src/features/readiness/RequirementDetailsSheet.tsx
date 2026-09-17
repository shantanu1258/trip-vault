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
  onClose,
  onEdit
}: {
  requirement: Requirement;
  itinerary: ItineraryItem[];
  timezone: string;
  audience?: string;
  editable: boolean;
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
    <ModalSheet eyebrow="Readiness task" title={requirement.title} onClose={onClose}>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-elevated p-4">
          <p className="eyebrow">Status</p>
          <p className="mt-2 font-bold capitalize">{requirement.status.replaceAll("_", " ")}</p>
        </div>
        <div className="rounded-2xl bg-elevated p-4">
          <p className="eyebrow">When</p>
          <p className="mt-2 font-bold">{schedule?.label ?? "No date or event set"}</p>
        </div>
        {audience && (
          <div className="rounded-2xl bg-elevated p-4 sm:col-span-2">
            <p className="eyebrow">For</p>
            <p className="mt-2 font-bold">{audience}</p>
          </div>
        )}
      </div>
      <div className="mt-4 rounded-2xl border border-line p-4">
        <p className="eyebrow">Notes</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
          {requirement.notes || "No notes added."}
        </p>
      </div>
      {actionError && (
        <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
          {actionError}
        </p>
      )}
      {editable && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="primary-button sm:col-span-2"
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

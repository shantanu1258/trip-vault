import { Pencil } from "lucide-react";
import { ModalSheet } from "../../components/ModalSheet";
import { requirementTimelineSchedule } from "../timeline/model";
import type { ItineraryItem } from "../trips/types";
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
  const schedule = requirementTimelineSchedule(requirement, itinerary, timezone);
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
      {editable && (
        <button type="button" className="secondary-button mt-4 w-full" onClick={onEdit}>
          <Pencil className="size-4" /> Edit task
        </button>
      )}
    </ModalSheet>
  );
}

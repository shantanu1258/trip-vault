import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  MessageSquareText,
  Pencil,
  Plus,
  UsersRound
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ErrorCard, LoadingCard } from "../components/TripUi";
import { RequirementDetailsSheet } from "../features/readiness/RequirementDetailsSheet";
import { requirementTimelineSchedule } from "../features/timeline/model";
import {
  archiveRequirement,
  listTripRequirementAssignees,
  updateRequirementStatus
} from "../features/workspace/api";
import { AddRequirementForm } from "../features/workspace/WorkspaceForms";
import { type Requirement, type RequirementStatus } from "../features/workspace/types";
import { localProfileId } from "../features/sync/localSync";
import {
  readTravelerFocus,
  requirementAudienceLabel,
  requirementMatchesTraveler
} from "../features/workspace/travelerFocus";
import { tripReturnNavigation } from "../features/trips/navigation";
import { useConfirmDialog } from "../components/ConfirmDialogProvider";
import { tripQueries } from "../features/queries/tripQueries";

export function ReadinessPage() {
  const confirm = useConfirmDialog();
  const { tripId = "" } = useParams();
  const locationState = useLocation().state;
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTaskId = searchParams.get("task");
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [selectedTask, setViewing] = useState<Requirement | null>(null);
  const [userId, setUserId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  useEffect(() => {
    void localProfileId().then((profileId) => setUserId(profileId ?? ""));
  }, []);
  const tripQuery = useQuery({ ...tripQueries.trip(tripId), enabled: Boolean(tripId) });
  const query = useQuery({ ...tripQueries.requirements(tripId), enabled: Boolean(tripId) });
  // Resolve only from this trip's authorized data, including after async loading.
  const viewing = requestedTaskId
    ? (query.data?.find((item) => item.id === requestedTaskId) ?? null)
    : selectedTask;
  const closeTaskDetails = () => {
    setViewing(null);
    if (requestedTaskId) {
      const next = new URLSearchParams(searchParams);
      next.delete("task");
      setSearchParams(next, { replace: true, state: locationState });
    }
  };
  const itineraryQuery = useQuery({ ...tripQueries.itinerary(tripId), enabled: Boolean(tripId) });
  const travelersQuery = useQuery({ ...tripQueries.travelers(tripId), enabled: Boolean(tripId) });
  const membersQuery = useQuery({ ...tripQueries.members(tripId), enabled: Boolean(tripId) });
  const focusedTravelerId = readTravelerFocus(tripId);
  const requirementIds = (query.data ?? []).map((item) => item.id);
  const assigneesQuery = useQuery({
    queryKey: ["requirement-assignees", tripId, requirementIds],
    queryFn: () => listTripRequirementAssignees(tripId, requirementIds),
    enabled: Boolean(tripId) && query.isSuccess
  });
  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequirementStatus }) =>
      updateRequirementStatus(id, status, tripId),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["requirements", tripId] });
      const previous = queryClient.getQueryData<Requirement[]>(["requirements", tripId]);
      queryClient.setQueryData<Requirement[]>(["requirements", tripId], (items = []) =>
        items.map((item) => (item.id === id ? { ...item, status } : item))
      );
      return { previous };
    },
    onError: (_error, _input, context) =>
      queryClient.setQueryData(["requirements", tripId], context?.previous),
    onSuccess: (_data, input) => {
      const item = query.data?.find((candidate) => candidate.id === input.id);
      setStatusMessage(
        input.status === "complete"
          ? `${item?.title ?? "Task"} marked done. It will no longer be highlighted on the timeline.`
          : `${item?.title ?? "Task"} reopened and will be highlighted when it is due.`
      );
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requirements", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] })
      ]);
    }
  });
  const trip = tripQuery.data;
  const visibleRequirements = focusedTravelerId
    ? assigneesQuery.isSuccess
      ? (query.data ?? []).filter((item) =>
          requirementMatchesTraveler(item.id, focusedTravelerId, assigneesQuery.data)
        )
      : []
    : (query.data ?? []);
  const resolved = visibleRequirements.filter((item) =>
    ["complete", "not_required"].includes(item.status)
  ).length;
  const role = membersQuery.data?.find((member) => member.user_id === userId)?.role;
  const editable = role === "owner" || role === "editor";
  const returnNavigation = tripReturnNavigation(locationState, tripId);
  const viewingAudience = viewing
    ? requirementAudienceLabel(viewing.id, assigneesQuery.data ?? [], travelersQuery.data ?? [])
    : "";
  const archive = useMutation({
    mutationFn: archiveRequirement,
    onSuccess: async (_data, item) => {
      setStatusMessage(
        `${item.title} archived. Restore it from Trip details → Archived trip items.`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requirements", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["archived-trip-items", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] })
      ]);
    }
  });
  return (
    <AppShell compactTop>
      <div className="mx-auto max-w-4xl">
        <header className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-2 py-1">
          <Link
            className="tap-target grid place-items-center text-muted"
            aria-label="Back to trip"
            to={returnNavigation.href}
            state={returnNavigation.state}
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">Tasks & readiness</h1>
            <p className="mt-0.5 truncate text-xs text-muted" title={trip?.title}>
              {trip?.title ?? "Trip"}
            </p>
          </div>
        </header>
        {query.isLoading && <LoadingCard label="Loading checklist" />}
        {query.error && <ErrorCard error={query.error} />}
        {requestedTaskId && query.isSuccess && !viewing && (
          <div role="status" className="mt-4 rounded-xl border border-line p-3 text-sm text-muted">
            This task is no longer available in this trip.
            <button
              type="button"
              className="tap-target ml-2 font-bold text-brand"
              onClick={closeTaskDetails}
            >
              Show task list
            </button>
          </div>
        )}
        {statusMessage && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-success/10 p-3 text-sm font-bold text-success"
          >
            {statusMessage}
          </p>
        )}
        {query.data && (
          <section className="surface-card mt-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 sm:px-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <h2 className="font-display text-lg font-black">Tasks</h2>
                <p className="text-xs font-medium text-muted">
                  {resolved} of {visibleRequirements.length} done
                </p>
              </div>
              {editable && (
                <button
                  type="button"
                  className="tap-target inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 text-xs font-extrabold text-brand hover:bg-elevated"
                  onClick={() => setAdding(true)}
                >
                  <Plus className="size-3.5" /> Add task
                </button>
              )}
            </div>
            {visibleRequirements.length > 0 ? (
              <ul className="divide-y divide-line">
                {visibleRequirements.map((item) => {
                  const done = ["complete", "not_required"].includes(item.status);
                  const schedule = trip
                    ? requirementTimelineSchedule(
                        item,
                        itineraryQuery.data ?? [],
                        trip.primary_timezone
                      )
                    : null;
                  const audience = requirementAudienceLabel(
                    item.id,
                    assigneesQuery.data ?? [],
                    travelersQuery.data ?? []
                  );
                  return (
                    <li key={item.id} className="flex items-center gap-1 px-2 py-1 sm:px-3">
                      <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 hover:bg-elevated">
                        <input
                          type="checkbox"
                          className="size-5 shrink-0 accent-brand"
                          checked={done}
                          disabled={!editable || mutation.isPending}
                          aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${item.title}`}
                          onChange={(event) =>
                            mutation.mutate({
                              id: item.id,
                              status: event.target.checked ? "complete" : "to_check"
                            })
                          }
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-brand"
                          onClick={() => setViewing(item)}
                          aria-label={`View details for ${item.title}`}
                        >
                          <strong
                            className={`block truncate text-sm leading-5 ${done ? "text-muted line-through" : "text-ink"}`}
                          >
                            {item.title}
                          </strong>
                          <span className="flex min-w-0 items-center gap-2 overflow-hidden text-[0.7rem] leading-4 text-muted">
                            <span
                              className={`shrink-0 font-bold ${done ? "text-success" : "text-muted"}`}
                            >
                              {done ? "Done" : "Not done"}
                            </span>
                            {audience && (
                              <span
                                className="inline-flex min-w-0 items-center gap-1"
                                title={audience}
                              >
                                <UsersRound aria-hidden="true" className="size-3 shrink-0" />
                                <span className="truncate">{audience}</span>
                              </span>
                            )}
                            {schedule && (
                              <time
                                className="inline-flex shrink-0 items-center gap-1"
                                dateTime={schedule.startsAt}
                              >
                                <CalendarDays aria-hidden="true" className="size-3" />{" "}
                                {schedule.label}
                              </time>
                            )}
                            {item.notes && (
                              <span
                                className="inline-flex min-w-0 items-center gap-1"
                                title={item.notes}
                              >
                                <MessageSquareText aria-hidden="true" className="size-3 shrink-0" />
                                <span className="truncate">{item.notes}</span>
                              </span>
                            )}
                          </span>
                        </button>
                      </div>
                      {editable && (
                        <div
                          className="flex shrink-0"
                          role="group"
                          aria-label={`Actions for ${item.title}`}
                        >
                          <button
                            type="button"
                            className="tap-target grid size-11 place-items-center rounded-xl text-muted hover:bg-elevated hover:text-ink"
                            onClick={() => setEditing(item)}
                            aria-label={`Edit ${item.title}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="tap-target grid size-11 place-items-center rounded-xl text-muted hover:bg-danger/10 hover:text-danger"
                            disabled={archive.isPending}
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: "Archive task?",
                                  message: `Archive ${item.title}?`,
                                  confirmLabel: "Archive",
                                  tone: "danger"
                                })
                              )
                                archive.mutate(item);
                            }}
                            aria-label={`Archive ${item.title}`}
                          >
                            <Archive className="size-4" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="p-5 text-center text-sm text-muted">
                {editable
                  ? focusedTravelerId
                    ? "No tasks for this traveler yet. Use Add task to create one."
                    : "No tasks yet. Use Add task to create one."
                  : "No tasks yet."}
              </p>
            )}
          </section>
        )}
        {adding && trip && (
          <AddRequirementForm
            trip={trip}
            travelers={travelersQuery.data ?? []}
            preferredTravelerId={focusedTravelerId ?? undefined}
            onClose={() => setAdding(false)}
          />
        )}
        {viewing && trip && (
          <RequirementDetailsSheet
            requirement={viewing}
            itinerary={itineraryQuery.data ?? []}
            timezone={trip.primary_timezone}
            audience={viewingAudience}
            editable={editable}
            manageHistory={!requestedTaskId}
            onClose={closeTaskDetails}
            onEdit={() => {
              closeTaskDetails();
              setEditing(viewing);
            }}
          />
        )}
        {editing && trip && (
          <AddRequirementForm
            trip={trip}
            requirement={editing}
            travelers={travelersQuery.data ?? []}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </AppShell>
  );
}

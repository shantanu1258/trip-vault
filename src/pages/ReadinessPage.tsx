import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, CalendarDays, MessageSquareText, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ErrorCard, LoadingCard, PageHeader } from "../components/TripUi";
import { getTrip } from "../features/trips/api";
import { archiveRequirement, listMembers, listRequirements, listTravelers, listTripRequirementAssignees, updateRequirementStatus } from "../features/workspace/api";
import { AddRequirementForm } from "../features/workspace/WorkspaceForms";
import { type Requirement, type RequirementStatus } from "../features/workspace/types";
import { localProfileId } from "../features/sync/localSync";
import { readTravelerFocus } from "../features/workspace/travelerFocus";
import { tripReturnNavigation } from "../features/trips/navigation";

export function ReadinessPage() {
  const { tripId = "" } = useParams(); const locationState = useLocation().state; const queryClient = useQueryClient(); const [adding, setAdding] = useState(false); const [editing, setEditing] = useState<Requirement | null>(null); const [userId, setUserId] = useState("");
  useEffect(() => { void localProfileId().then((profileId) => setUserId(profileId ?? "")); }, []);
  const tripQuery = useQuery({ queryKey: ["trip", tripId], queryFn: () => getTrip(tripId), enabled: Boolean(tripId) });
  const query = useQuery({ queryKey: ["requirements", tripId], queryFn: () => listRequirements(tripId), enabled: Boolean(tripId) });
  const travelersQuery = useQuery({ queryKey: ["travelers", tripId], queryFn: () => listTravelers(tripId), enabled: Boolean(tripId) });
  const membersQuery = useQuery({ queryKey: ["members", tripId], queryFn: () => listMembers(tripId), enabled: Boolean(tripId) });
  const focusedTravelerId = readTravelerFocus(tripId); const requirementIds = (query.data ?? []).map((item) => item.id);
  const assigneesQuery = useQuery({ queryKey: ["requirement-assignees", tripId, requirementIds], queryFn: () => listTripRequirementAssignees(tripId, requirementIds), enabled: Boolean(tripId) && query.isSuccess });
  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RequirementStatus }) => updateRequirementStatus(id, status, tripId),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["requirements", tripId] });
      const previous = queryClient.getQueryData<Requirement[]>(["requirements", tripId]);
      queryClient.setQueryData<Requirement[]>(["requirements", tripId], (items = []) => items.map((item) => item.id === id ? { ...item, status } : item));
      return { previous };
    },
    onError: (_error, _input, context) => queryClient.setQueryData(["requirements", tripId], context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["requirements", tripId] })
  });
  const trip = tripQuery.data; const visibleRequirements = focusedTravelerId ? (query.data ?? []).filter((item) => assigneesQuery.data?.some((row) => row.requirement_id === item.id && row.traveler_id === focusedTravelerId)) : query.data ?? []; const resolved = visibleRequirements.filter((item) => ["complete", "not_required"].includes(item.status)).length;
  const role = membersQuery.data?.find((member) => member.user_id === userId)?.role; const editable = role === "owner" || role === "editor";
  const returnNavigation = tripReturnNavigation(locationState, tripId);
  const archive = useMutation({ mutationFn: archiveRequirement, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requirements", tripId] }) });
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <Link className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted" to={returnNavigation.href} state={returnNavigation.state}>
          <ArrowLeft className="size-4" /> Back to trip
        </Link>
        <div className="mt-5">
          <PageHeader
            eyebrow={trip?.title ?? "Trip"}
            title="Readiness checklist"
            text={focusedTravelerId ? "Tasks for the selected traveler. Check each one off when it is done." : "Keep a simple list of everything that needs to be done before the trip."}
          />
        </div>
        {query.isLoading && <LoadingCard label="Loading checklist" />}
        {query.error && <ErrorCard error={query.error} />}
        {query.data && (
          <section className="surface-card mt-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 sm:px-4">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <h2 className="font-display text-lg font-black">Tasks</h2>
                <p className="text-xs font-medium text-muted">{resolved} of {visibleRequirements.length} done</p>
              </div>
              {editable && (
                <button type="button" className="tap-target inline-flex shrink-0 items-center gap-1 rounded-xl px-2.5 text-xs font-extrabold text-brand hover:bg-elevated" onClick={() => setAdding(true)}>
                  <Plus className="size-3.5" /> Add task
                </button>
              )}
            </div>
            {visibleRequirements.length > 0 ? (
              <ul className="divide-y divide-line">
                {visibleRequirements.map((item) => {
                  const done = ["complete", "not_required"].includes(item.status);
                  return (
                    <li key={item.id} className="flex items-center gap-1 px-2 py-1 sm:px-3">
                      <label className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 hover:bg-elevated ${editable ? "cursor-pointer" : "cursor-default"}`}>
                        <input
                          type="checkbox"
                          className="size-5 shrink-0 accent-brand"
                          checked={done}
                          disabled={!editable || mutation.isPending}
                          aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${item.title}`}
                          onChange={(event) => mutation.mutate({ id: item.id, status: event.target.checked ? "complete" : "to_check" })}
                        />
                        <span className="min-w-0 flex-1">
                          <strong className={`block truncate text-sm leading-5 ${done ? "text-muted line-through" : "text-ink"}`}>{item.title}</strong>
                          <span className="flex min-w-0 items-center gap-2 overflow-hidden text-[0.7rem] leading-4 text-muted">
                            <span className={`shrink-0 font-bold ${done ? "text-success" : "text-muted"}`}>{done ? "Done" : "Not done"}</span>
                            {item.due_date && (
                              <time className="inline-flex shrink-0 items-center gap-1" dateTime={item.due_date}>
                                <CalendarDays aria-hidden="true" className="size-3" /> Due {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${item.due_date}T00:00:00`))}
                              </time>
                            )}
                            {item.notes && (
                              <span className="inline-flex min-w-0 items-center gap-1" title={item.notes}>
                                <MessageSquareText aria-hidden="true" className="size-3 shrink-0" />
                                <span className="truncate">{item.notes}</span>
                              </span>
                            )}
                          </span>
                        </span>
                      </label>
                      {editable && (
                        <div className="flex shrink-0" role="group" aria-label={`Actions for ${item.title}`}>
                          <button type="button" className="tap-target grid size-11 place-items-center rounded-xl text-muted hover:bg-elevated hover:text-ink" onClick={() => setEditing(item)} aria-label={`Edit ${item.title}`}>
                            <Pencil className="size-4" />
                          </button>
                          <button type="button" className="tap-target grid size-11 place-items-center rounded-xl text-muted hover:bg-danger/10 hover:text-danger" disabled={archive.isPending} onClick={() => window.confirm(`Archive ${item.title}?`) && archive.mutate(item)} aria-label={`Archive ${item.title}`}>
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
                {editable ? (focusedTravelerId ? "No tasks for this traveler yet. Use Add task to create one." : "No tasks yet. Use Add task to create one.") : "No tasks yet."}
              </p>
            )}
          </section>
        )}
        {adding && trip && <AddRequirementForm trip={trip} travelers={travelersQuery.data ?? []} preferredTravelerId={focusedTravelerId ?? undefined} onClose={() => setAdding(false)} />}
        {editing && trip && <AddRequirementForm trip={trip} requirement={editing} travelers={travelersQuery.data ?? []} onClose={() => setEditing(null)} />}
      </div>
    </AppShell>
  );
}

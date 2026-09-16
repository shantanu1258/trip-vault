import { ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import { CostTotals } from "../../components/TripUi";
import type { Booking, Traveler } from "../workspace/types";
import { splitExpenseEqually, type TravelerBalance } from "./expenses";
import { formatMoney } from "./presentation";
import type { ItineraryItem, TripCost } from "./types";

export function CostDetailsSheet({ cost, travelers, itinerary, bookings = [], editable, onClose, onEdit, onArchive }: { cost: TripCost; travelers: Traveler[]; itinerary: ItineraryItem[]; bookings?: Booking[]; editable: boolean; onClose: () => void; onEdit: () => void; onArchive: () => void }) {
  const paidBy = travelers.find((traveler) => traveler.id === cost.paid_by_traveler_id)?.display_name;
  const sourceParticipants = cost.participants ?? [];
  const explicitShares = sourceParticipants.length > 0 && sourceParticipants.every((participant) => participant.share_amount_minor !== null);
  const equalShares = explicitShares ? new Map<string, number>() : splitExpenseEqually(cost.amount_minor, sourceParticipants.map((participant) => participant.traveler_id));
  const participants = sourceParticipants.map((participant) => ({
    name: travelers.find((traveler) => traveler.id === participant.traveler_id)?.display_name ?? "Traveler",
    share: explicitShares ? participant.share_amount_minor : equalShares.get(participant.traveler_id) ?? null
  }));
  const linkedEvent = itinerary.find((item) => item.id === cost.itinerary_item_id || Boolean(cost.booking_id && item.booking_id === cost.booking_id));
  const linkedBooking = bookings.find((booking) => booking.id === cost.booking_id);

  return <ModalSheet eyebrow="Trip expense" title={cost.title} onClose={onClose}>
    <div className="mt-5 rounded-2xl bg-brand p-5 text-surface"><p className="text-xs font-black uppercase tracking-[.14em] text-surface/60">Amount</p><p className="mt-2 font-display text-3xl font-black">{cost.amount_minor === 0 ? "Free" : formatMoney(cost.amount_minor, cost.currency_code)}</p></div>
    <dl className="mt-5 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-elevated p-3"><dt className="text-xs font-bold text-muted">Payment status</dt><dd className="mt-1 font-extrabold capitalize">{cost.payment_status}</dd></div>
      <div className="rounded-xl bg-elevated p-3"><dt className="text-xs font-bold text-muted">Category</dt><dd className="mt-1 font-extrabold capitalize">{cost.category}</dd></div>
      <div className="rounded-xl bg-elevated p-3"><dt className="text-xs font-bold text-muted">Paid by</dt><dd className="mt-1 font-extrabold">{paidBy ?? "Not recorded yet"}</dd></div>
      <div className="rounded-xl bg-elevated p-3"><dt className="text-xs font-bold text-muted">Connected to</dt><dd className="mt-1 font-extrabold">{linkedEvent?.title ?? linkedBooking?.title ?? "General trip expense"}</dd></div>
    </dl>
    <div className="mt-3 rounded-xl bg-elevated p-3"><p className="text-xs font-bold text-muted">Included travelers</p>{participants.length ? <ul className="mt-2 space-y-1.5">{participants.map((participant, index) => <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm" key={`${participant.name}:${index}`}><strong className="truncate">{participant.name}</strong><span className="text-right text-muted">{participant.share === null ? "Equal share" : formatMoney(participant.share, cost.currency_code)}</span></li>)}</ul> : <p className="mt-1 text-sm font-extrabold">No travelers selected</p>}</div>
    {cost.notes && <div className="mt-3 rounded-xl bg-elevated p-3"><p className="text-xs font-bold text-muted">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{cost.notes}</p></div>}
    {editable && <div className="mt-6 grid grid-cols-1 gap-3 border-t border-line pt-5 sm:grid-cols-2"><button type="button" className="secondary-button" onClick={onEdit}><Pencil className="size-4" /> Edit expense</button><button type="button" className="secondary-button text-danger" onClick={onArchive}><Trash2 className="size-4" /> Archive</button></div>}
  </ModalSheet>;
}

export function TripExpensesContent({ costs, balances, travelers, onViewCost, expenseSplittingControl }: { costs: TripCost[]; balances: TravelerBalance[]; travelers: Traveler[]; onViewCost: (cost: TripCost) => void; expenseSplittingControl?: ReactNode }) {
  const [showBalances, setShowBalances] = useState(false);
  const balancesId = useId();

  return <>
    <CostTotals costs={costs} />
    <div className="mt-3 overflow-hidden rounded-2xl border border-line bg-surface">
      <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 p-4 text-sm"><span><strong className="block">Show balances</strong><span className="mt-1 block text-xs leading-5 text-muted">See what each traveler owes or should receive.</span></span><input aria-label="Show balances" className="size-5 shrink-0 accent-brand" type="checkbox" checked={showBalances} aria-controls={balancesId} onChange={(event) => setShowBalances(event.target.checked)} /></label>
      {expenseSplittingControl && <div className="border-t border-line">{expenseSplittingControl}</div>}
    </div>
    {showBalances && <div id={balancesId} className="mt-4 rounded-2xl border border-line p-4"><p className="eyebrow">Balances by currency</p>{balances.length > 0 ? <><div className="mt-3 grid gap-2 sm:grid-cols-2">{balances.map((balance) => <div key={`${balance.currencyCode}:${balance.travelerId}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-elevated px-3 py-2 text-sm"><span className="truncate">{travelers.find((traveler) => traveler.id === balance.travelerId)?.display_name ?? "Traveler"}</span><strong className={`whitespace-nowrap text-right ${balance.amountMinor > 0 ? "text-success" : "text-warning"}`}>{balance.amountMinor > 0 ? "gets " : "owes "}{formatMoney(Math.abs(balance.amountMinor), balance.currencyCode)}</strong></div>)}</div><p className="mt-3 text-xs text-muted">Positive means this traveler should receive money; negative means they owe money. Different currencies are never silently combined.</p></> : <p className="mt-3 text-sm text-muted">No balances to settle yet.</p>}</div>}
    <div className="mt-5"><p className="eyebrow">Itemized expenses</p><div className="mt-3 space-y-2">{costs.map((cost) => {
      const paidBy = travelers.find((traveler) => traveler.id === cost.paid_by_traveler_id)?.display_name;
      const participantCount = cost.participants?.length ?? 0;
      return <button type="button" onClick={() => onViewCost(cost)} className="group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-xl bg-elevated p-3 text-left text-sm transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:ring-2 focus-visible:ring-brand motion-reduce:hover:translate-y-0" key={cost.id} aria-label={`View details for ${cost.title}`}><span className="min-w-0"><span className="block truncate font-bold">{cost.title}</span><span className="mt-0.5 block truncate text-xs capitalize text-muted">{paidBy ? `Paid by ${paidBy} · ` : ""}{cost.category.replaceAll("_", " ")} · {cost.payment_status.replaceAll("_", " ")}{participantCount ? ` · ${participantCount} traveler${participantCount === 1 ? "" : "s"}` : ""}</span></span><span className="flex items-center gap-2"><strong className="whitespace-nowrap">{cost.amount_minor === 0 ? "Free" : formatMoney(cost.amount_minor, cost.currency_code)}</strong><ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" /></span></button>;
    })}{costs.length === 0 && <p className="rounded-xl bg-elevated p-4 text-sm text-muted">No expenses have been added yet.</p>}</div></div>
  </>;
}

export function TripExpensesSheet({ title = "Trip expenses", costs, balances, travelers, onClose, onViewCost, expenseSplittingControl }: { title?: string; costs: TripCost[]; balances: TravelerBalance[]; travelers: Traveler[]; onClose: () => void; onViewCost: (cost: TripCost) => void; expenseSplittingControl?: ReactNode }) {
  return <ModalSheet eyebrow="Money" title={title} onClose={onClose}>
    <p className="mt-3 text-sm leading-6 text-muted">Review every expense and choose whether traveler balances should be calculated.</p>
    <div className="mt-6"><TripExpensesContent costs={costs} balances={balances} travelers={travelers} onViewCost={onViewCost} expenseSplittingControl={expenseSplittingControl} /></div>
  </ModalSheet>;
}

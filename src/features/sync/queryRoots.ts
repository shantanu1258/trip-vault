const realtimeQueryRoots: Record<string, string[]> = {
  trips: ["trips", "trip"],
  trip_members: ["trips", "trip", "members"],
  travelers: ["travelers"],
  traveler_accounts: ["travelers", "members", "associated-accounts", "current-traveler-accounts"],
  bookings: ["bookings", "booking"],
  booking_travelers: ["booking-travelers", "booking-traveler-ids"],
  trip_airlines: ["trip-airlines"],
  flight_legs: ["flights", "flight"],
  flight_leg_travelers: ["flight-travelers"],
  journey_legs: ["journey-legs", "journey-leg"],
  journey_leg_travelers: ["journey-leg-travelers"],
  cab_stops: ["cab-stops"],
  itinerary_items: ["itinerary", "archived-trip-items"],
  itinerary_participants: ["itinerary-participants"],
  trip_costs: ["costs", "archived-trip-items"],
  trip_cost_participants: ["costs"],
  trip_requirements: ["requirements", "alerts", "archived-trip-items"],
  requirement_assignees: ["requirement-assignees", "requirement-assignee-ids"],
  documents: ["documents", "account-document-uploads"],
  document_versions: ["documents", "account-document-uploads"],
  document_travelers: ["documents"],
  document_access: ["documents"],
  itinerary_item_documents: ["documents", "event-documents", "trip-event-documents"],
  account_document_uploads: ["account-document-uploads"],
  notes: ["notes"],
  trip_invitations: ["invitations"],
  trip_membership_offers: ["pending-trip-offers"],
  alert_states: ["alerts", "alert-states"],
  reminders: ["alerts", "reminders"]
};

export function queryRootsForRealtimeTable(table: string) {
  return realtimeQueryRoots[table] ?? ["*"];
}

export function queryRootsForChangedTables(tables: string[]) {
  const roots = new Set(tables.flatMap(queryRootsForRealtimeTable));
  return roots.has("*") ? ["*"] : [...roots];
}

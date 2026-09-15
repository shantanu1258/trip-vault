import boardingPassUrl from "../../output/pdf/demo-boarding-pass.pdf?url";
import flightTicketUrl from "../../output/pdf/demo-flight-ticket.pdf?url";
import hotelConfirmationUrl from "../../output/pdf/demo-hotel-confirmation.pdf?url";
import insuranceUrl from "../../output/pdf/demo-insurance-summary.pdf?url";
import museumTicketUrl from "../../output/pdf/demo-museum-ticket.pdf?url";
import waiverUrl from "../../output/pdf/demo-entry-waiver.pdf?url";
import type { DemoDocument, DemoEvent, DemoPhase, DemoTask, DemoTraveler } from "./types";

export const demoDocuments: DemoDocument[] = [
  {
    id: "flight-ticket",
    title: "Aster Air e-ticket",
    purpose: "Flight ticket",
    format: "PDF",
    sizeLabel: "3 KB",
    visibility: "Selected travelers",
    url: flightTicketUrl
  },
  {
    id: "boarding-pass",
    title: "Boarding pass - Sam",
    purpose: "Boarding pass",
    format: "PDF",
    sizeLabel: "3 KB",
    visibility: "Traveler and manager",
    url: boardingPassUrl
  },
  {
    id: "hotel-confirmation",
    title: "Casa Bellora confirmation",
    purpose: "Hotel confirmation",
    format: "PDF",
    sizeLabel: "3 KB",
    visibility: "Whole trip",
    url: hotelConfirmationUrl
  },
  {
    id: "insurance",
    title: "Travel cover summary",
    purpose: "Insurance summary",
    format: "PDF",
    sizeLabel: "3 KB",
    visibility: "Selected members",
    url: insuranceUrl
  },
  {
    id: "museum-ticket",
    title: "Colosseum entry ticket",
    purpose: "Activity ticket",
    format: "PDF",
    sizeLabel: "3 KB",
    visibility: "Selected travelers",
    url: museumTicketUrl
  },
  {
    id: "entry-waiver",
    title: "Evening tour waiver",
    purpose: "Activity waiver",
    format: "PDF",
    sizeLabel: "3 KB",
    visibility: "Selected travelers",
    url: waiverUrl
  }
];

export const demoTravelers: DemoTraveler[] = [
  { id: "sam", initials: "SS", name: "Sam Shah", role: "Owner - traveler", color: "#e8785b" },
  { id: "mia", initials: "MK", name: "Mia Kapoor", role: "Editor - traveler", color: "#486f73" },
  { id: "noah", initials: "NR", name: "Noah Rao", role: "Viewer - traveler", color: "#a87442" },
  { id: "leela", initials: "LD", name: "Leela Devi", role: "Managed parent", color: "#7f6aa8" },
  { id: "ari", initials: "AS", name: "Ari Shah", role: "Managed child", color: "#3c8574" },
  { id: "jo", initials: "JM", name: "Jo Menon", role: "Non-travelling collaborator", color: "#996571" }
];

export const demoEvents: DemoEvent[] = [
  {
    id: "flight-out",
    type: "flight",
    dayLabel: "Day 1",
    dateLabel: "18 Jun",
    timeLabel: "06:40",
    endTimeLabel: "12:10",
    title: "Fly to Rome",
    eyebrow: "Aster Air AV 218",
    location: "DEL T3 -> FCO T1",
    note: "Boarding at 05:55. Gate 22B. Two checked bags.",
    travelerIds: ["sam", "mia", "noah", "leela", "ari"],
    documentIds: ["boarding-pass", "flight-ticket"]
  },
  {
    id: "hotel-rome",
    type: "hotel",
    dayLabel: "Day 1",
    dateLabel: "18 Jun",
    timeLabel: "15:00",
    title: "Check in at Casa Bellora",
    eyebrow: "Stay - 3 nights",
    location: "Via delle Stelle 8, Rome",
    note: "Two rooms. Late arrival noted. Breakfast included.",
    travelerIds: ["sam", "mia", "noah", "leela", "ari"],
    documentIds: ["hotel-confirmation", "insurance"]
  },
  {
    id: "colosseum",
    type: "activity",
    dayLabel: "Day 2",
    dateLabel: "19 Jun",
    timeLabel: "16:30",
    endTimeLabel: "19:00",
    title: "Colosseum evening tour",
    eyebrow: "Guided activity",
    location: "Piazza del Colosseo, Rome",
    note: "Meet by the north entrance 20 minutes early. Photo ID requested.",
    travelerIds: ["sam", "mia", "noah", "ari"],
    documentIds: ["museum-ticket", "entry-waiver"]
  },
  {
    id: "train-florence",
    type: "train",
    dayLabel: "Day 4",
    dateLabel: "21 Jun",
    timeLabel: "09:10",
    endTimeLabel: "10:46",
    title: "Train to Florence",
    eyebrow: "High-speed rail",
    location: "Roma Termini -> Firenze SMN",
    note: "Coach 5. Seats are recorded per traveler.",
    travelerIds: ["sam", "mia", "noah", "leela", "ari"],
    documentIds: []
  },
  {
    id: "venice-walk",
    type: "activity",
    dayLabel: "Day 7",
    dateLabel: "24 Jun",
    timeLabel: "18:00",
    endTimeLabel: "20:00",
    title: "Venice sunset walk",
    eyebrow: "Self-guided plan",
    location: "Rialto Bridge, Venice",
    note: "Offline address saved. Water-bus route copied into notes.",
    travelerIds: ["sam", "mia", "noah", "leela", "ari"],
    documentIds: []
  }
];

export const demoTasks: DemoTask[] = [
  {
    id: "passports",
    title: "Check passports and visas",
    status: "complete",
    travelerIds: [],
    anchorEventId: "flight-out",
    scheduleLabel: "3 days before Fly to Rome"
  },
  {
    id: "leela-medicine",
    title: "Pack Leela's medicines",
    status: "to_check",
    travelerIds: ["leela"],
    anchorEventId: "flight-out",
    scheduleLabel: "1 day before Fly to Rome"
  },
  {
    id: "photo-ids",
    title: "Keep photo IDs ready",
    status: "to_check",
    travelerIds: [],
    anchorEventId: "colosseum",
    scheduleLabel: "2 hours before Colosseum evening tour"
  }
];

export const demoPhaseCopy: Record<DemoPhase, { label: string; sublabel: string; activeEventId: string | null }> = {
  planning: { label: "Planning", sublabel: "42 days to departure", activeEventId: "flight-out" },
  predeparture: { label: "Tomorrow", sublabel: "Ready offline - checked 8 min ago", activeEventId: "flight-out" },
  travelday: { label: "Travel day", sublabel: "Boarding in 48 minutes", activeEventId: "flight-out" },
  intrip: { label: "In Rome", sublabel: "Next activity in 1 hr 20 min", activeEventId: "colosseum" },
  completed: { label: "Completed", sublabel: "A beautiful trip, safely archived", activeEventId: null }
};

export const documentById = new Map(demoDocuments.map((document) => [document.id, document]));

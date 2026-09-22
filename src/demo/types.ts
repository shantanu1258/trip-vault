import type { DocumentCategory } from "../features/workspace/types";

export type DemoPhase = "planning" | "predeparture" | "travelday" | "intrip" | "completed";

export type DemoDocument = {
  category: DocumentCategory;
  id: string;
  title: string;
  purpose: string;
  format: "PDF";
  sizeLabel: string;
  visibility: string;
  url: string;
};

export type DemoEvent = {
  id: string;
  type: "flight" | "hotel" | "activity" | "train";
  dayLabel: string;
  dateLabel: string;
  timeLabel: string;
  endTimeLabel?: string;
  title: string;
  eyebrow: string;
  location: string;
  note: string;
  travelerIds: string[];
  documentIds: string[];
};

export type DemoTraveler = {
  id: string;
  initials: string;
  name: string;
  role: string;
  color: string;
};

export type DemoTask = {
  id: string;
  title: string;
  status: "to_check" | "complete";
  travelerIds: string[];
  anchorEventId: string;
  scheduleLabel: string;
};

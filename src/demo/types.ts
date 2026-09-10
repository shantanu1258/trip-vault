export type DemoPhase = "planning" | "predeparture" | "travelday" | "intrip" | "completed";

export type DemoDocument = {
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

import { act, createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TripTimeline, type TimelineHandle } from "./TripTimeline";
import type { TripTimelineEntry } from "./model";
import type { TimelineEventType } from "../trips/types";
import { eventTypeChoices } from "./eventTypeChoices";

function entry(id: string, day = "01", type: TimelineEventType = "activity"): TripTimelineEntry {
  const startsAt = `2026-10-${day}T09:00:00Z`;
  return {
    kind: "event",
    id,
    startsAt,
    timezone: "UTC",
    item: {
      id,
      trip_id: "trip",
      title: id,
      starts_at: startsAt,
      ends_at: null,
      timezone: "UTC",
      event_type: type,
      location: null,
      notes: null,
      applies_to_all_travelers: true,
      created_at: startsAt
    }
  };
}
const entries = [entry("Flight"), entry("Check out", "02")];
const taskEntry: TripTimelineEntry = {
  kind: "requirement",
  id: "requirement:visa",
  startsAt: "2026-09-01T00:00:00Z",
  timezone: "UTC",
  scheduleLabel: "Due Sep 1, 2026",
  requirement: {
    id: "visa",
    trip_id: "trip",
    type: "visa",
    title: "Bali eVisa",
    status: "to_check",
    due_date: "2026-09-01",
    destination_country_code: null,
    visa_type: null,
    issued_on: null,
    expires_on: null,
    validity_buffer_days: null,
    official_guidance_url: null,
    guidance_checked_at: null,
    linked_document_id: null,
    notes: null
  }
};
const renderDetail = (event: TripTimelineEntry) => <p>{event.id} details</p>;
function setup(storageKey = "test-outline", data = entries) {
  const ref = createRef<TimelineHandle>();
  const props = {
    ref,
    storageKey,
    entries: data,
    activeId: "Flight",
    onJump: (id: string) => ref.current?.reveal(id),
    renderDetail
  };
  return { ref, props, ...render(<TripTimeline {...props} />) };
}
async function viewOption(name: string) {
  await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
  if (name === "Reset view") await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  else {
    await userEvent.click(screen.getByRole("button", { name: /Display/ }));
    const group = screen.getByRole("group", {
      name: name.endsWith("dates") ? "Date groups" : "Event details"
    });
    await userEvent.click(
      within(group).getByRole("radio", {
        name: name.startsWith("Expand") ? "All expanded" : "All collapsed"
      })
    );
  }
  await userEvent.click(screen.getByRole("button", { name: /^Apply/ }));
}
describe("compact trip timeline", () => {
  beforeEach(() => sessionStorage.clear());
  it("keeps ordinary borders neutral while preserving event-colored icons and the next-event indicator", () => {
    setup("colored-borders", [
      entry("Flight", "01", "flight"),
      entry("Hotel", "01", "hotel_check_in"),
      entry("Taxi", "01", "cab"),
      entry("Museum")
    ]);
    for (const [title, tone] of [
      ["Flight", "flight"],
      ["Hotel", "hotel"],
      ["Taxi", "cab"],
      ["Museum", "activity"]
    ]) {
      const card = screen
        .getByRole("button", { name: new RegExp(`^(Expand|Collapse) ${title}$`) })
        .closest("article");
      expect(card).toHaveClass("border-line");
      expect(card).not.toHaveClass("timeline-event-border", `event-type-icon--${tone}`);
      expect(card?.querySelector(".event-type-icon")).toHaveClass(`event-type-icon--${tone}`);
    }
    expect(
      screen.getByRole("button", { name: /^(Expand|Collapse) Flight$/ }).closest("article")
    ).toHaveAttribute("aria-current", "step");
  });
  it("moves the current-event treatment independently of event type and expanded cards", async () => {
    const { props, rerender, container } = setup("current-border", [
      entry("Flight", "01", "flight"),
      entry("Hotel", "01", "hotel_check_in"),
      entry("Taxi", "01", "cab")
    ]);
    const hotelTrigger = screen.getByRole("button", { name: "Expand Hotel" });
    await userEvent.click(hotelTrigger);
    expect(hotelTrigger.closest("article")).not.toHaveAttribute("aria-current");
    for (const activeId of ["Hotel", "Taxi", "Flight"]) {
      rerender(<TripTimeline {...props} activeId={activeId} activeCaption="NOW" />);
      const current = container.querySelectorAll('.timeline-event-card[aria-current="step"]');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute("id", `timeline-${activeId}`);
      expect(current[0]).toHaveTextContent("NOW");
      const badge = within(current[0] as HTMLElement).getByText("NOW");
      expect(badge.parentElement).toHaveAttribute("data-timeline-trigger");
      expect(badge).toHaveClass("shrink-0", "whitespace-nowrap", "px-2.5", "py-1.5");
      expect(current[0].querySelector(".event-type-icon")).not.toBeNull();
    }
    rerender(<TripTimeline {...props} activeId={undefined} />);
    expect(container.querySelector('.timeline-event-card[aria-current="step"]')).toBeNull();
  });
  it("uses compact type icons in headers and reveals decorative artwork only in expanded cards", async () => {
    setup("silhouettes", [
      entry("Flight", "01", "flight"),
      entry("Hotel", "01", "hotel_check_in"),
      entry("Taxi", "01", "cab"),
      entry("Museum")
    ]);
    const hotel = screen.getByRole("button", { name: "Expand Hotel" });
    expect(hotel.querySelector("[data-silhouette]")).toBeNull();
    expect(hotel.querySelector('[data-event-tone="hotel"]')).toHaveClass("size-8");
    expect(hotel.querySelector(".lucide-bed-double")).not.toBeNull();
    expect(hotel).toHaveTextContent("Check-in");
    expect(
      screen
        .getByRole("button", { name: "Expand Museum" })
        .querySelector('[data-event-tone="activity"]')
    ).not.toBeNull();
    await userEvent.click(hotel);
    expect(
      screen.getByRole("button", { name: "Collapse Hotel" }).querySelector("[data-silhouette]")
    ).toBeNull();
    expect(
      hotel
        .closest("article")
        ?.querySelector('[data-silhouette="hotel"][data-silhouette-placement="fallback"]')
    ).toBeVisible();
    expect(screen.getByText("Hotel details")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Expand Taxi" }).querySelector('[data-event-tone="cab"]')
    ).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Collapse Hotel" }));
    expect(
      screen
        .getByRole("button", { name: "Expand Hotel" })
        .closest("article")
        ?.querySelector("[data-silhouette]")
    ).toBeNull();
  });
  it("uses opposite down/up event chevrons, matching the date groups", async () => {
    setup();
    const collapsed = screen.getByRole("button", { name: "Expand Check out" });
    const chevron = collapsed.querySelector(".lucide-chevron-down");
    expect(chevron).toHaveClass("absolute", "right-3", "top-3");
    expect(collapsed).toHaveClass("pr-10");
    expect(chevron).not.toHaveClass("-rotate-90", "rotate-180");
    await userEvent.click(collapsed);
    expect(
      screen
        .getByRole("button", { name: "Collapse Check out" })
        .querySelector(".lucide-chevron-down")
    ).toHaveClass("rotate-180");
    await userEvent.click(screen.getByRole("button", { name: "Collapse Check out" }));
    expect(
      screen.getByRole("button", { name: "Expand Check out" }).querySelector(".lucide-chevron-down")
    ).not.toHaveClass("-rotate-90", "rotate-180");
  });
  it("uses the Add event type list and combines the selected type with the date", async () => {
    setup("types", [
      entry("Flight", "01", "flight"),
      entry("Museum"),
      entry("Later flight", "02", "flight")
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("radio", { name: "Thu, 1 Oct 2026" }));
    await userEvent.click(screen.getByRole("button", { name: /Event type/ }));
    const typeGroup = screen.getByRole("group", { name: "Show event type" });
    expect(
      within(typeGroup)
        .getAllByRole("radio")
        .map((input) => input.closest("label")?.textContent?.replace(/\d+$/, ""))
    ).toEqual(["All types", ...eventTypeChoices.map((choice) => choice.label)]);
    await userEvent.click(within(typeGroup).getByRole("radio", { name: "Flight" }));
    expect(screen.getByRole("button", { name: "Expand Museum" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Apply · 1 item" }));
    expect(screen.getByRole("button", { name: "Collapse Flight" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Expand Museum" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand Later flight" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: "Filter timeline" })).getByText("2")
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Remove filters" }));
    expect(screen.getByRole("button", { name: "Expand Museum" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Expand Later flight" })).toBeVisible();
  });

  it.each([
    {
      label: "Hotel",
      data: [
        entry("Hotel arrival", "01", "hotel_check_in"),
        entry("Hotel departure", "02", "hotel_check_out")
      ],
      expected: ["Hotel arrival", "Hotel departure"]
    },
    {
      label: "Preparation",
      data: [taskEntry, entry("Pack bags", "01", "preparation")],
      expected: ["Bali eVisa", "Pack bags"]
    }
  ])("includes related entries under $label", async ({ label, data, expected }) => {
    setup("related-types", [...data, entry("Museum")]);
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("button", { name: /Event type/ }));
    await userEvent.click(screen.getByRole("radio", { name: label }));
    await userEvent.click(screen.getByRole("button", { name: "Apply · 2 items" }));
    expected.forEach((title) => expect(screen.getByText(title, { exact: true })).toBeVisible());
    expect(screen.queryByRole("button", { name: "Expand Museum" })).not.toBeInTheDocument();
  });

  it("keeps type changes as drafts and clears them through Reset or reveal", async () => {
    const { ref } = setup("draft-types", [entry("Flight", "01", "flight"), entry("Museum")]);
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("button", { name: /Event type/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Activity" }));
    await userEvent.click(screen.getByRole("button", { name: "Close timeline filters" }));
    expect(screen.getByRole("button", { name: "Collapse Flight" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("button", { name: /Event type/ }));
    expect(screen.getByRole("radio", { name: "All types" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "Activity" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply · 1 item" }));
    expect(screen.queryByRole("button", { name: "Collapse Flight" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(screen.getByRole("button", { name: /Event type/ }));
    expect(screen.getByRole("radio", { name: "All types" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Apply · 2 items" }));
    expect(screen.getByRole("button", { name: "Collapse Flight" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("button", { name: /Event type/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Activity" }));
    await userEvent.click(screen.getByRole("button", { name: /^Apply/ }));
    act(() => ref.current?.reveal("Flight"));
    expect(screen.getByRole("button", { name: "Collapse Flight" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove filters" })).not.toBeInTheDocument();
  });

  it("explains an empty type selection without showing empty date groups", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("button", { name: /Event type/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Ferry / boat" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply · 0 items" }));
    expect(screen.getByRole("status")).toHaveTextContent("No events match these filters");
    expect(screen.queryByRole("button", { name: /Thu, 1 Oct 2026/ })).not.toBeInTheDocument();
  });
  it("prioritizes readiness without an event badge while keeping modal and checkbox actions distinct", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-19T10:00:00Z"));
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    try {
      render(
        <TripTimeline
          entries={[taskEntry, ...entries]}
          activeId={taskEntry.id}
          storageKey="task-vs-event"
          onJump={() => {}}
          renderDetail={renderDetail}
          taskControl={(entry) =>
            entry.kind === "requirement" ? { checked: false, onOpen, onToggle } : undefined
          }
        />
      );
      const taskButton = screen.getByRole("button", { name: "View details for Bali eVisa" });
      const taskCard = taskButton.closest("article")!;
      expect(taskButton).not.toHaveAttribute("aria-expanded");
      expect(taskButton.querySelector("svg")).toBeNull();
      expect(within(taskCard).queryByText("Next")).not.toBeInTheDocument();
      expect(taskCard).toHaveAttribute("aria-current", "step");
      expect(within(taskCard).getByText("Task")).toBeVisible();
      expect(within(taskCard).getByText("To do")).toBeVisible();
      expect(screen.queryByText("Next")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Expand Flight" })).toBeVisible();
      await userEvent.click(taskButton);
      expect(onOpen).toHaveBeenCalledOnce();
      expect(onToggle).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("checkbox", { name: "Mark as done: Bali eVisa" }));
      expect(onToggle).toHaveBeenCalledWith(true);
      expect(onOpen).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it("uses concise stay labels and keeps the event type visible alongside its status", () => {
    const arrival = entry("Hotel arrival");
    const departure = entry("Hotel departure", "02");
    if (arrival.kind !== "event" || departure.kind !== "event")
      throw new Error("Expected event fixtures");
    setup("event-labels", [
      {
        ...arrival,
        item: { ...arrival.item, event_type: "hotel_check_in", event_status: "cancelled" }
      },
      { ...departure, item: { ...departure.item, event_type: "hotel_check_out" } }
    ]);
    const checkIn = screen.getByRole("button", { name: "Expand Hotel arrival" });
    expect(within(checkIn).getByText("Check-in")).toBeVisible();
    expect(checkIn).toHaveTextContent("cancelled");
    expect(
      within(screen.getByRole("button", { name: "Expand Hotel departure" })).getByText("Check-out")
    ).toBeVisible();
    expect(screen.queryByText("hotel check in")).not.toBeInTheDocument();
  });
  it("opens dates and only the current event by default", () => {
    setup();
    expect(screen.getByRole("button", { name: "Collapse Flight" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("button", { name: "Expand Check out" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.queryByText("Check out details")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fri, 2 Oct 2026/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
  it("keeps other cards open and restores choices on return", async () => {
    const { unmount } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Expand Check out" }));
    expect(screen.getAllByRole("button", { name: /^Collapse (Flight|Check out)$/ })).toHaveLength(
      2
    );
    unmount();
    setup();
    expect(screen.getByText("Check out details")).toBeInTheDocument();
  });
  it("changes dates without discarding card choices", async () => {
    setup();
    await viewOption("Collapse all dates");
    expect(screen.queryByRole("button", { name: "Collapse Flight" })).not.toBeInTheDocument();
    await viewOption("Expand all dates");
    expect(screen.getByRole("button", { name: "Collapse Flight" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Check out" })).toBeInTheDocument();
  });
  it("filters by date and clears that filter when search reveals another date", async () => {
    const { ref } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("radio", { name: "Fri, 2 Oct 2026" }));
    await userEvent.click(screen.getByRole("button", { name: "Apply · 1 item" }));
    expect(screen.queryByRole("button", { name: "Collapse Flight" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Check out" })).toBeVisible();
    act(() => ref.current?.reveal("Flight"));
    expect(screen.getByRole("button", { name: "Collapse Flight" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter timeline" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("radio", { name: "Fri, 2 Oct 2026" }));
    await userEvent.click(screen.getByRole("button", { name: /^Apply/ }));
    await viewOption("Reset view");
    expect(screen.getByRole("button", { name: "Collapse Flight" })).toBeVisible();
  });
  it("expands all cards and their dates, and collapses cards independently", async () => {
    setup();
    await viewOption("Collapse all dates");
    await viewOption("Expand all cards");
    expect(screen.getByText("Check out details")).toBeVisible();
    await viewOption("Collapse all cards");
    expect(screen.getByRole("button", { name: "Expand Flight" })).toBeVisible();
    await viewOption("Reset view");
    expect(screen.getByText("Flight details")).toBeVisible();
    expect(screen.queryByText("Check out details")).not.toBeInTheDocument();
  });
  it("indicates an applied filter and removes it immediately without resetting expanded cards", async () => {
    setup();
    const filterButton = screen.getByRole("button", { name: "Filter timeline" });
    expect(filterButton).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Remove filters" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand Check out" }));
    await userEvent.click(filterButton);
    await userEvent.click(screen.getByRole("radio", { name: "Fri, 2 Oct 2026" }));
    expect(screen.queryByRole("button", { name: "Remove filters" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Apply/ }));
    expect(filterButton).toHaveAttribute("aria-pressed", "true");
    expect(within(filterButton).getByText("1")).toBeVisible();
    const saved = sessionStorage.getItem("test-outline");
    await userEvent.click(screen.getByRole("button", { name: "Remove filters" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove filters" })).not.toBeInTheDocument();
    expect(filterButton).toHaveAttribute("aria-pressed", "false");
    expect(filterButton).toHaveFocus();
    expect(screen.getByText("Flight details")).toBeVisible();
    expect(screen.getByText("Check out details")).toBeVisible();
    expect(sessionStorage.getItem("test-outline")).toBe(saved);
  });
  it("reveals a search target even when its date is closed", async () => {
    const { ref } = setup();
    await viewOption("Collapse all dates");
    act(() => ref.current?.reveal("Check out"));
    expect(screen.getByText("Check out details")).toBeVisible();
    expect(screen.getByRole("button", { name: /Thu, 1 Oct 2026/ })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
  it("keeps draft filters unapplied on close and restores keyboard focus", async () => {
    setup();
    const original = sessionStorage.getItem("test-outline");
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    expect(screen.getByRole("dialog", { name: "Timeline filters" })).toBeVisible();
    expect(document.body.style.overflow).toBe("hidden");
    const close = screen.getByRole("button", { name: "Close timeline filters" });
    expect(close).toHaveFocus();
    await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
    expect(screen.getByRole("button", { name: /^Apply/ })).toHaveFocus();
    await userEvent.keyboard("{Tab}");
    expect(close).toHaveFocus();
    await userEvent.click(screen.getByRole("radio", { name: "Fri, 2 Oct 2026" }));
    expect(screen.getByRole("button", { name: "Collapse Flight" })).toBeVisible();
    expect(sessionStorage.getItem("test-outline")).toBe(original);
    await userEvent.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "Filter timeline" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    expect(screen.getByRole("radio", { name: "All dates" })).toBeChecked();
  });
  it("applies choices across sections together and resets only the draft", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("radio", { name: "Fri, 2 Oct 2026" }));
    await userEvent.click(screen.getByRole("button", { name: /Display/ }));
    await userEvent.click(
      within(screen.getByRole("group", { name: "Event details" })).getByRole("radio", {
        name: "All expanded"
      })
    );
    expect(screen.queryByText("Check out details")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Apply · 1 item" }));
    expect(screen.getByText("Check out details")).toBeVisible();
    expect(screen.queryByText("Flight details")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("radio", { name: "All dates" })).toBeChecked();
    expect(screen.queryByText("Flight details")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText("Check out details")).toBeVisible();
    expect(screen.queryByText("Flight details")).not.toBeInTheDocument();
  });
  it("preserves individually expanded cards and collapsed dates when applying a date", async () => {
    setup("custom", [...entries, entry("Museum", "03")]);
    await userEvent.click(screen.getByRole("button", { name: "Expand Check out" }));
    await userEvent.click(screen.getByRole("button", { name: /Sat, 3 Oct 2026/ }));
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("button", { name: /Display/ }));
    expect(screen.getAllByRole("radio", { name: "My selection" })).toHaveLength(2);
    screen
      .getAllByRole("radio", { name: "My selection" })
      .forEach((radio) => expect(radio).toBeChecked());
    await userEvent.click(screen.getByRole("button", { name: /Dates All dates/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Fri, 2 Oct 2026" }));
    await userEvent.click(screen.getByRole("button", { name: /^Apply/ }));
    expect(screen.getByText("Check out details")).toBeVisible();
    expect(JSON.parse(sessionStorage.getItem("custom")!)).toEqual({
      expanded: ["Flight", "Check out"],
      collapsedDates: ["2026-10-03"]
    });
  });
  it("shows the mixed date state when a chosen date is reopened in the draft", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Filter timeline" }));
    await userEvent.click(screen.getByRole("button", { name: /Display/ }));
    await userEvent.click(
      within(screen.getByRole("group", { name: "Date groups" })).getByRole("radio", {
        name: "All collapsed"
      })
    );
    await userEvent.click(screen.getByRole("button", { name: "Dates All dates" }));
    await userEvent.click(screen.getByRole("radio", { name: "Fri, 2 Oct 2026" }));
    await userEvent.click(screen.getByRole("button", { name: /Display/ }));
    expect(
      within(screen.getByRole("group", { name: "Date groups" })).getByRole("radio", {
        name: "My selection"
      })
    ).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: /^Apply/ }));
    expect(screen.getByRole("button", { name: "Expand Check out" })).toBeVisible();
  });
  it("does not carry another account or traveler's presentation state", async () => {
    const { unmount } = setup("profile-a:trip:everyone");
    await viewOption("Collapse all dates");
    unmount();
    setup("profile-b:trip:everyone");
    expect(screen.getByText("Flight details")).toBeVisible();
  });
  it("initializes after asynchronous entries arrive", () => {
    const { props, rerender } = setup("async", []);
    rerender(<TripTimeline {...props} entries={entries} />);
    expect(screen.getByText("Flight details")).toBeVisible();
  });
  it("falls back safely from corrupt view memory", () => {
    sessionStorage.setItem("test-outline", "not json");
    setup();
    expect(screen.getByText("Flight details")).toBeVisible();
  });
  it("waits for readiness inputs before remembering the default expansion", () => {
    const props = {
      entries,
      activeId: "Flight",
      storageKey: "loading-tasks",
      ready: false,
      onJump: () => {},
      renderDetail
    };
    const { rerender } = render(<TripTimeline {...props} />);
    rerender(<TripTimeline {...props} activeId="Check out" ready />);
    expect(screen.getByText("Check out details")).toBeVisible();
    expect(screen.queryByText("Flight details")).not.toBeInTheDocument();
  });
});

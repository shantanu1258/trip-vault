import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_TRIP_DRAFT_KEY, CreateTripPage, dateInput, suggestedTripEndDate } from "./CreateTripPage";

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <QueryClientProvider client={new QueryClient()}>
        <CreateTripPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("new trip date defaults", () => {
  beforeEach(() => localStorage.clear());

  it("suggests a trip starting in 15 days and ending seven days later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 13, 9));
    renderPage();

    expect(screen.getByLabelText("Start date")).toHaveValue("2026-09-28");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-10-05");
    vi.useRealTimers();
  });

  it("keeps the end seven days after a changed start until the end is manually edited", () => {
    renderPage();
    const start = screen.getByLabelText("Start date");
    const end = screen.getByLabelText("End date");

    fireEvent.change(start, { target: { value: "2027-02-24" } });
    expect(end).toHaveValue("2027-03-03");

    fireEvent.change(end, { target: { value: "2027-03-10" } });
    fireEvent.change(start, { target: { value: "2027-02-25" } });
    expect(end).toHaveValue("2027-03-10");
  });

  it("uses the versioned draft key so an old one-month-later draft is not restored", () => {
    localStorage.setItem("trip-vault:form-draft:trip:new", JSON.stringify({ startDate: "2099-01-01", endDate: "2099-01-08" }));
    renderPage();
    expect(CREATE_TRIP_DRAFT_KEY).toBe("trip:new:v2");
    expect(screen.getByLabelText("Start date")).toHaveValue(dateInput(15));
  });

  it("calculates across month and year boundaries", () => {
    expect(suggestedTripEndDate("2026-12-29")).toBe("2027-01-05");
  });
});

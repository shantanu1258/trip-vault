import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentVisibilityBadge, documentVisibilityPresentation } from "./DocumentVisibilityBadge";
import type { DocumentVisibility } from "../features/workspace/types";

describe("document visibility presentation", () => {
  it.each([
    ["trip", "Trip members", "Visible to all signed-in trip members"],
    ["private", "Only me", "Visible only to you"],
    ["selected_members", "Selected members", "Visible only to selected trip members"],
    ["traveler_and_managers", "Traveler + managers", "Visible to the traveler and their managers"]
  ] satisfies [DocumentVisibility, string, string][])(
    "describes %s consistently",
    (visibility, label, description) => {
      expect(documentVisibilityPresentation(visibility)).toMatchObject({ label, description });
    }
  );

  it("renders the compact label with the complete trip-member explanation", () => {
    render(<DocumentVisibilityBadge visibility="trip" />);

    const badge = screen.getByLabelText("Visible to all signed-in trip members");
    expect(badge).toHaveTextContent("Trip members");
    expect(badge).toHaveAttribute("title", "Visible to all signed-in trip members");
    expect(badge).toHaveAttribute("data-document-visibility", "trip");
  });
});

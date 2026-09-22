import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { DocumentTypeIcon } from "./DocumentTypeIcon";
import { documentCategories } from "../features/workspace/types";

it("colors only inset type symbols like events while retaining a separate document outline", () => {
  const { container, rerender } = render(
    <>
      {[...documentCategories, "aadhaar", "identity"].map((type) => (
        <DocumentTypeIcon
          key={type}
          type={type as Parameters<typeof DocumentTypeIcon>[0]["type"]}
        />
      ))}
    </>
  );
  for (const type of [...documentCategories, "aadhaar", "identity"]) {
    const icon = container.querySelector(`[data-document-type="${type}"]`)!;
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("data-emphasis", "subtle");
    expect(icon).toHaveAttribute("data-variant", "colored");
    expect(icon.querySelector(".document-type-icon__file svg")).toBeInTheDocument();
    expect(icon.querySelector(".document-type-icon__paper")).toBeInTheDocument();
    expect(icon.className).not.toContain("event-type-icon");
  }
  expect(container.querySelector('[data-document-type="flight"] .lucide-plane')).toHaveClass(
    "document-type-icon__symbol",
    "event-type-icon--flight"
  );
  expect(container.querySelector('[data-document-type="hotel"] .lucide-bed-double')).toHaveClass(
    "document-type-icon__symbol",
    "event-type-icon--hotel"
  );
  expect(
    container.querySelector('[data-document-type="passport"] .lucide-book-user')
  ).toBeInTheDocument();
  expect(
    container.querySelector('[data-document-type="aadhaar"] .lucide-id-card')
  ).toBeInTheDocument();
  expect(container.querySelector(".event-silhouette")).toBeNull();
  rerender(<DocumentTypeIcon type="passport" emphasis="strong" />);
  expect(container.firstChild).toHaveAttribute("data-emphasis", "strong");
  expect(container.querySelector(".lucide-book-user")).toHaveClass("event-type-icon--preparation");
  rerender(<DocumentTypeIcon type="flight" size="sm" />);
  expect(container.firstChild).toHaveClass("size-5");
  expect(container.querySelector(".document-type-icon__file")).toHaveClass("h-5", "w-5");
  expect(container.querySelector(".lucide-plane")).toBeInTheDocument();
  rerender(<DocumentTypeIcon type="hotel" size="sm" variant="monochrome" />);
  expect(container.firstChild).toHaveAttribute("data-variant", "monochrome");
  expect(container.querySelector(".lucide-bed-double")).toBeInTheDocument();
});

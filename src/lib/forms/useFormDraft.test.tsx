import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useFormDraft } from "./useFormDraft";

const storageKey = "trip-vault:form-draft:test-form";

function DraftForm() {
  const draft = useFormDraft("test-form");
  return (
    <form ref={draft.formRef}>
      <label>
        Title
        <input name="title" />
      </label>
      <button type="button" onClick={draft.clearDraft}>
        Clear draft
      </button>
    </form>
  );
}

describe("useFormDraft", () => {
  beforeEach(() => localStorage.clear());

  it("does not recreate a cleared draft while the form unmounts", () => {
    const view = render(<DraftForm />);
    fireEvent.input(screen.getByLabelText("Title"), { target: { value: "Saved trip" } });
    expect(localStorage.getItem(storageKey)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
    view.unmount();

    expect(localStorage.getItem(storageKey)).toBeNull();
  });
});

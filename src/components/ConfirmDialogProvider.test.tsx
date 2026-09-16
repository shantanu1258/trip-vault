import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ConfirmDialogProvider, useConfirmDialog } from "./ConfirmDialogProvider";

function ConfirmationExample() {
  const confirm = useConfirmDialog();
  const [result, setResult] = useState("waiting");
  return (
    <>
      <button
        type="button"
        onClick={async () =>
          setResult(
            (await confirm({
              title: "Archive event?",
              message: "The event can be restored later.",
              confirmLabel: "Archive",
              tone: "danger"
            }))
              ? "confirmed"
              : "cancelled"
          )
        }
      >
        Archive event
      </button>
      <output>{result}</output>
    </>
  );
}

describe("ConfirmDialogProvider", () => {
  it("uses an in-app confirmation dialog instead of a browser prompt", async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialogProvider>
        <ConfirmationExample />
      </ConfirmDialogProvider>
    );

    await user.click(screen.getByRole("button", { name: "Archive event" }));
    expect(screen.getByRole("dialog", { name: "Archive event?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("cancelled")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive event" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(screen.getByText("confirmed")).toBeInTheDocument();
  });
});

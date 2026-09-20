import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TripArchive } from "./TripArchive";
import type { ArchivedTripItem } from "./types";

const task: ArchivedTripItem = {
  id: "task",
  kind: "task",
  title: "Visa application",
  archived_at: "2026-09-20"
};
function setup(overrides: Partial<Parameters<typeof TripArchive>[0]> = {}) {
  const props = {
    items: [task],
    editable: true,
    online: true,
    onRestore: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
  render(<TripArchive {...props} />);
  return props;
}
describe("trip archive", () => {
  it("hides archived titles until opened and restores a task", async () => {
    const props = setup();
    expect(screen.queryByText(task.title)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open archive" }));
    const recover = screen.getByRole("button", { name: `Recover ${task.title}` });
    const remove = screen.getByRole("button", { name: `Delete ${task.title} permanently` });
    expect(screen.getByText("Recover")).toHaveClass("hidden", "sm:inline");
    expect(screen.getByText("Delete")).toHaveClass("hidden", "sm:inline");
    expect(recover).toHaveClass("min-h-11", "min-w-11");
    expect(remove).toHaveClass("min-h-11", "min-w-11");
    await userEvent.click(recover);
    expect(props.onRestore).toHaveBeenCalledWith(task);
    expect(await screen.findByRole("status")).toHaveTextContent("restored");
  });
  it("requires explicit confirmation, supports cancel, and reports deletion errors", async () => {
    const props = setup({
      onDelete: vi.fn().mockRejectedValue({ message: "Only archived items can be deleted" })
    });
    await userEvent.click(screen.getByRole("button", { name: "Open archive" }));
    await userEvent.click(screen.getByRole("button", { name: `Delete ${task.title} permanently` }));
    expect(props.onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: `Delete ${task.title} permanently` }));
    expect(screen.getByText(/This cannot be undone/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledOnce());
    expect(await screen.findByRole("alert")).toHaveTextContent("Only archived items");
  });
  it("does not expose mutations to viewers", async () => {
    const props = setup({ editable: false });
    await userEvent.click(screen.getByRole("button", { name: "Open archive" }));
    expect(screen.getByText(task.title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Recover/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(props.onDelete).not.toHaveBeenCalled();
  });
  it("shows connection and load errors instead of claiming nothing is archived", async () => {
    const { rerender } = render(
      <TripArchive items={[task]} editable online={false} onRestore={vi.fn()} onDelete={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Open archive" }));
    expect(screen.getByText(/Connect to view/)).toBeInTheDocument();
    expect(screen.queryByText(task.title)).not.toBeInTheDocument();
    rerender(
      <TripArchive items={[]} editable online error onRestore={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load");
    expect(screen.queryByText("Nothing is archived.")).not.toBeInTheDocument();
  });
});

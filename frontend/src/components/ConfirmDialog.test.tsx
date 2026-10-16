import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "../test/render";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("shows its content and reports confirm or cancel", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithTheme(
      <ConfirmDialog open title="Delete it?" confirmLabel="Delete" destructive onConfirm={onConfirm} onCancel={onCancel}>
        Gone for good.
      </ConfirmDialog>,
    );

    expect(screen.getByRole("dialog", { name: "Delete it?" })).toHaveTextContent("Gone for good.");
    // destructive: focus starts on Cancel, so Enter can't confirm by accident
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("focuses the confirm action when it isn't destructive", () => {
    renderWithTheme(
      <ConfirmDialog open title="Go?" confirmLabel="Go" onConfirm={vi.fn()} onCancel={vi.fn()}>
        Ready.
      </ConfirmDialog>,
    );
    expect(screen.getByRole("button", { name: "Go" })).toHaveFocus();
  });

  it("renders nothing while closed", () => {
    renderWithTheme(
      <ConfirmDialog open={false} title="Hidden" confirmLabel="OK" onConfirm={vi.fn()} onCancel={vi.fn()}>
        Body
      </ConfirmDialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithTheme } from "../test/render";
import { UploadDialog } from "./UploadDialog";

const XYE = "# tth intensity err\n1 10 0.1\n2 20 0.2\n3 30 0.3\n";

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const onClose = vi.fn();
  renderWithTheme(<UploadDialog open onClose={onClose} onSubmit={onSubmit} />);
  return { onClose, onSubmit };
}

async function choose(text: string, name = "scan_42.xye") {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await userEvent.upload(input, new File([text], name));
}

const plotIt = () => screen.getByRole("button", { name: "Plot it" });

async function pick(label: string, option: string) {
  await userEvent.click(screen.getByRole("combobox", { name: label }));
  await userEvent.click(within(screen.getByRole("listbox")).getByText(option));
}

describe("UploadDialog", () => {
  it("can't plot until a file parses", () => {
    setup();
    expect(plotIt()).toBeDisabled();
  });

  it("parses a file, previews it and plots it", async () => {
    const { onSubmit, onClose } = setup();
    await choose(XYE);

    expect(await screen.findByText(/3 data rows, 3 columns/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("scan_42");

    await userEvent.type(screen.getByRole("combobox", { name: "Data type" }), "pxrd");
    await userEvent.type(screen.getByRole("spinbutton", { name: "File #" }), "42");
    await userEvent.click(plotIt());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith({
      title: "scan_42",
      x: [1, 2, 3],
      y: [10, 20, 30],
      e: [0.1, 0.2, 0.3],
      filenumber: 42,
      data_type: "pxrd",
      x_label: null,
      y_label: null,
    });
  });

  it("remaps columns and drops the error column", async () => {
    const { onSubmit } = setup();
    await choose("#L a b c\n1 10 0.1\n2 20 0.2\n3 30 0.3\n");
    await screen.findByText(/3 data rows/);

    await pick("X column", "b (col 2)");
    await pick("Y column", "a (col 1)");
    await pick("Error column", "None");
    await userEvent.click(plotIt());

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.lastCall![0]).toMatchObject({
      x: [10, 20, 30],
      y: [1, 2, 3],
      e: null,
      x_label: "b",
      y_label: "a",
      filenumber: null,
      data_type: null,
    });
  });

  it("asks for a header count when it can't find the data, then uses it", async () => {
    setup();
    // no run of 3 matching numeric rows anywhere, so auto-detect gives up
    await choose("junk\nx y\n1 2\nfoo\n3 4\nend\n");

    expect(await screen.findByText(/Couldn't detect this automatically/)).toBeInTheDocument();
    expect(plotIt()).toBeDisabled();

    const headerRow = screen.getByRole("checkbox", { name: "Next line names the columns" });
    expect(headerRow).toBeDisabled();

    await userEvent.type(screen.getByRole("spinbutton", { name: "Header lines to skip" }), "1");
    expect(headerRow).toBeEnabled();
    await userEvent.click(headerRow);

    expect(await screen.findByText(/Skipped 2 header line\(s\) · 2 data rows, 2 columns \(2 row\(s\) skipped\)/)).toBeInTheDocument();
  });

  it("rejects a header count that isn't a whole number", async () => {
    setup();
    await choose(XYE);
    await userEvent.type(screen.getByRole("spinbutton", { name: "Header lines to skip" }), "1.5");
    expect(await screen.findByRole("alert")).toHaveTextContent("whole number");
  });

  it("re-parses with an explicit delimiter", async () => {
    setup();
    await choose(XYE);
    await screen.findByText(/3 data rows/);

    await pick("Delimiter", "Comma ( , )");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows a submit failure and stays open", async () => {
    const { onClose } = setup(vi.fn().mockRejectedValue(new Error("server said no")));
    await choose(XYE);
    await screen.findByText(/3 data rows/);
    await userEvent.click(plotIt());

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not plot the file: server said no");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancels", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});

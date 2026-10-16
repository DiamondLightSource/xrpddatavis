import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ALL_SESSIONS } from "../hooks/useInstrumentSessionFilter";
import { renderWithTheme } from "../test/render";
import { SessionSelect } from "./SessionSelect";

const options = [
  { value: ALL_SESSIONS, label: "All sessions", count: 3 },
  { value: "cm1-1", label: "cm1-1", count: 2 },
];

describe("SessionSelect", () => {
  it("renders nothing without options", () => {
    const { container } = renderWithTheme(<SessionSelect options={[]} value={ALL_SESSIONS} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists sessions and reports the pick", async () => {
    const onChange = vi.fn();
    renderWithTheme(<SessionSelect options={options} value={ALL_SESSIONS} onChange={onChange} />);

    await userEvent.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getAllByRole("option")).toHaveLength(2);

    await userEvent.click(within(listbox).getByText("cm1-1"));
    expect(onChange).toHaveBeenCalledWith("cm1-1");
  });

  it("shows a chosen session id", () => {
    renderWithTheme(<SessionSelect options={options} value="cm1-1" onChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("cm1-1");
  });
});

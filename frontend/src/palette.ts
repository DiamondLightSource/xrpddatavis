// Fixed categorical slot order - a colour follows a plot for its whole life,
// it is never reassigned by position in the list. Past eight live plots the
// slots repeat, so repeats are separated by line style as well as hue.
// Values match src/xrpddatavis/static/styles.css --series-* in the previous
// frontend, and the dataviz skill's validated reference palette.
export const PALETTE = {
  light: [
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#4a3aa7",
    "#e34948",
  ],
  dark: [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#008300",
    "#9085e9",
    "#e66767",
  ],
} as const;

export const DASHES = ["solid", "dot", "dashdot", "longdash"] as const;

export function seriesColour(colourIndex: number, mode: "light" | "dark"): string {
  const colours = PALETTE[mode];
  return colours[colourIndex % colours.length];
}

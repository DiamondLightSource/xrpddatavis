/** Plotly draws on SVG/canvas and can't parse CSS custom properties, so a
 * theme colour like `rgb(var(--ds-surface-channel))` has to be resolved to a
 * concrete colour first. A probe element lets the browser do the resolution,
 * including `var()` and the active `data-mode`. */
export function resolveColour(value: string): string {
  if (!value.includes("var(")) return value;
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  document.documentElement.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved || value;
}

import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@diamondlightsource/sci-react-ui";

/** render() inside the DS theme - components rely on its custom palette
 * entries and typography variants (mono3, meta, text.muted, ...). */
export function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

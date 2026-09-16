import { useMemo, useRef } from "react";
import {
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Button,
  useTheme,
} from "@mui/material";
import { RotateCcw } from "lucide-react";
import { useColorScheme } from "@mui/material/styles";
import type { PlotSummary } from "../api/types";
import { buildChart, type ChartOptions, type LayoutMode } from "../chartBuilder";
import { ICON_SM } from "../iconSizes";
import { PlotlyChart, type PlotlyChartHandle } from "./PlotlyChart";
import { usePlotDataCache } from "../hooks/usePlotDataCache";

interface ChartPanelProps {
  selectedSummaries: PlotSummary[];
  hasAnyPlots: boolean;
  mode: LayoutMode;
  onModeChange: (mode: LayoutMode) => void;
  options: ChartOptions;
  onOptionsChange: (options: ChartOptions) => void;
}

const MODE_LABELS: { value: LayoutMode; label: string; hint: string }[] = [
  { value: "overlay", label: "Overlay", hint: "All traces on one pair of axes" },
  { value: "offset", label: "Offset", hint: "Overlay with a vertical offset per trace (waterfall)" },
  { value: "grid", label: "Grid", hint: "One panel per trace" },
];

export function ChartPanel({
  selectedSummaries,
  hasAnyPlots,
  mode,
  onModeChange,
  options,
  onOptionsChange,
}: ChartPanelProps) {
  const theme = useTheme();
  const { mode: schemeMode, systemMode } = useColorScheme();
  const colourMode = (schemeMode === "system" ? systemMode : schemeMode) === "dark" ? "dark" : "light";
  const chartRef = useRef<PlotlyChartHandle>(null);
  const { get: getPlotData, loadError } = usePlotDataCache(selectedSummaries);

  const themeColours = useMemo(
    () => ({
      border: theme.palette.divider,
      borderStrong: theme.palette.border.strong,
      textPrimary: theme.palette.text.primary,
      textSecondary: theme.palette.text.secondary,
      textMuted: theme.palette.text.muted ?? theme.palette.text.secondary,
      surface: theme.palette.background.paper,
      fontFamily: theme.typography.fontFamily ?? "sans-serif",
    }),
    [theme],
  );

  // Not memoized: `getPlotData` reads from a ref-backed cache that fills in
  // asynchronously (usePlotDataCache), so its *identity* never changes even
  // though what it returns does - memoizing on that identity would miss
  // every arrival of freshly-fetched plot data.
  const { traces, layout, prepared } = buildChart(
    selectedSummaries,
    getPlotData,
    mode,
    options,
    colourMode,
    themeColours,
  );

  const drawable = prepared.length > 0;

  let overlay: React.ReactNode = null;
  if (!selectedSummaries.length) {
    overlay = (
      <>
        <Typography variant="subtitle1" sx={{ color: "text.secondary" }}>
          {hasAnyPlots ? "Nothing selected" : "No plots on the server"}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.muted", mt: 0.5 }}>
          {hasAnyPlots
            ? "Tick a plot in the table on the left to draw it. Tick several to overlay them."
            : <>POST a DataPlot document to <code>/plot</code> and it will appear here.</>}
        </Typography>
      </>
    );
  } else if (!drawable) {
    overlay = (
      <Typography variant="subtitle1" sx={{ color: "text.secondary" }}>
        {loadError ? "Could not load the selected plots" : "Loading…"}
      </Typography>
    );
  }

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <Stack
        direction="row"
        spacing={3}
        alignItems="center"
        useFlexGap
        sx={{
          flexWrap: "wrap",
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="overline" sx={{ color: "text.muted" }}>
            Layout
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={mode}
            onChange={(_, next: LayoutMode | null) => next && onModeChange(next)}
            aria-label="Plot layout"
          >
            {MODE_LABELS.map((m) => (
              <ToggleButton key={m.value} value={m.value} title={m.hint} sx={{ textTransform: "none", px: 1.5 }}>
                {m.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          {(
            [
              ["errors", "Error bars"],
              ["calc", "Calc"],
              ["diff", "Diff"],
              ["background", "Background"],
              ["markers", "Markers"],
              ["logy", "Log y"],
              ["normalise", "Normalise"],
            ] as const
          ).map(([key, label]) => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  size="small"
                  checked={options[key]}
                  onChange={(e) => onOptionsChange({ ...options, [key]: e.target.checked })}
                />
              }
              label={label}
              sx={{ mr: 0, "& .MuiFormControlLabel-label": { fontSize: 13 } }}
            />
          ))}
        </Stack>

        <Button
          size="small"
          variant="outlined"
          startIcon={<RotateCcw {...ICON_SM} />}
          onClick={() => chartRef.current?.resetView()}
          sx={{ textTransform: "none" }}
        >
          Reset view
        </Button>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, position: "relative", backgroundColor: "background.paper" }}>
        <PlotlyChart ref={chartRef} traces={traces} layout={layout} overlay={overlay} />
      </Box>
    </Box>
  );
}

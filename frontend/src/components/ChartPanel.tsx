import { useMemo, useRef } from "react";
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormGroup,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import { Layers, LayoutGrid, RotateCcw, Rows3, type LucideIcon } from "lucide-react";
import { useColorScheme } from "@mui/material/styles";
import type { PlotSummary } from "../api/types";
import { buildChart, type ChartOptions, type LayoutMode } from "../chartBuilder";
import { ICON_SM, ICON_XS } from "../iconSizes";
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

const MODE_OPTIONS: { value: LayoutMode; label: string; hint: string; Icon: LucideIcon }[] = [
  { value: "overlay", label: "Overlay", hint: "All traces on one pair of axes", Icon: Layers },
  { value: "offset", label: "Offset", hint: "Vertical offset per trace (waterfall)", Icon: Rows3 },
  { value: "grid", label: "Grid", hint: "One panel per trace", Icon: LayoutGrid },
];

type OptionKey = keyof ChartOptions;

const TRACE_OPTIONS: { key: OptionKey; label: string }[] = [
  { key: "errors", label: "Error bars" },
  { key: "calc", label: "Calc" },
  { key: "diff", label: "Diff" },
  { key: "background", label: "Background" },
  { key: "markers", label: "Markers" },
];

const SCALE_OPTIONS: { key: OptionKey; label: string }[] = [
  { key: "logy", label: "Log y" },
  { key: "normalise", label: "Normalise" },
];

function ToolbarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="overline" sx={{ color: "text.muted" }}>
        {label}
      </Typography>
      {children}
    </Stack>
  );
}

export function ChartPanel({
  selectedSummaries,
  hasAnyPlots,
  mode,
  onModeChange,
  options,
  onOptionsChange,
}: ChartPanelProps) {
  const theme = useTheme();
  const { colorScheme } = useColorScheme();
  const colourMode = colorScheme === "dark" ? "dark" : "light";
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
      loadError ? (
        <Alert severity="error">
          Could not load the selected plots - they may have expired. Reselect them from the list.
        </Alert>
      ) : (
        <Stack direction="row" spacing={1.5} alignItems="center" role="status">
          <CircularProgress size={20} />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Loading selected plots
          </Typography>
        </Stack>
      )
    );
  }

  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      <Stack
        direction="row"
        role="group"
        aria-label="Chart options"
        useFlexGap
        sx={{
          flexWrap: "wrap",
          alignItems: "center",
          columnGap: 3,
          rowGap: 1,
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          backgroundColor: "surface.subtle",
        }}
      >
        {(
          [
            ["Traces", "Trace options", TRACE_OPTIONS],
            ["Scale", "Scale options", SCALE_OPTIONS],
          ] as const
        ).map(([label, ariaLabel, group]) => (
          <ToolbarGroup key={label} label={label}>
            <FormGroup row role="group" aria-label={ariaLabel} sx={{ columnGap: 1.5 }}>
              {group.map((o) => (
                <FormControlLabel
                  key={o.key}
                  control={
                    <Checkbox
                      size="small"
                      checked={options[o.key]}
                      onChange={(e) => onOptionsChange({ ...options, [o.key]: e.target.checked })}
                    />
                  }
                  label={o.label}
                  slotProps={{ typography: { variant: "body2" } }}
                  sx={{ mr: 0 }}
                />
              ))}
            </FormGroup>
          </ToolbarGroup>
        ))}

        <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: "auto" }}>
          <TextField
            select
            size="small"
            value={mode}
            onChange={(e) => onModeChange(e.target.value as LayoutMode)}
            sx={{ minWidth: 112, "& .MuiSelect-select": { py: 0.5 } }}
            slotProps={{
              select: {
                SelectDisplayProps: { "aria-label": "Plot layout" },
                renderValue: (v) => {
                  const m = MODE_OPTIONS.find((o) => o.value === v);
                  return m ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <m.Icon {...ICON_XS} aria-hidden />
                      <span>{m.label}</span>
                    </Stack>
                  ) : null;
                },
              },
            }}
          >
            {MODE_OPTIONS.map((m) => (
              <MenuItem key={m.value} value={m.value} dense>
                <Tooltip title={m.hint} placement="left">
                  <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <ListItemIcon>
                      <m.Icon {...ICON_XS} />
                    </ListItemIcon>
                    <ListItemText primary={m.label} />
                  </Box>
                </Tooltip>
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title="Reset view">
            <IconButton size="small" aria-label="Reset view" onClick={() => chartRef.current?.resetView()}>
              <RotateCcw {...ICON_SM} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, position: "relative", backgroundColor: "background.paper" }}>
        <PlotlyChart ref={chartRef} traces={traces} layout={layout} overlay={overlay} />
      </Box>
    </Box>
  );
}

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ColourSchemeButton, ImageColourSchemeSwitch, Navbar } from "@diamondlightsource/sci-react-ui";
import { Trash2, Upload } from "lucide-react";
// The logo, project name and beamline are composed by hand in `leftSlot`
// (rather than via Navbar's own `logo` prop) so a vertical divider can sit
// between each of the three, evenly spaced and vertically centred -
// Navbar's built-in logo placement instead applies its own fixed margin with
// no divider, which doesn't give that control.
//
// The image itself: the higher-level <Logo /> (and Navbar's `logo="theme"`
// shorthand) reads theme.logos, which DiamondDSTheme only wires up to the
// actual Diamond logo on sci-react-ui's main branch - not yet in 0.7.0
// (latest on npm as of writing, same gap as font-styles.css - see
// frontend/readme.md) - so ImageColourSchemeSwitch (the primitive both are
// built on, which *is* in 0.7.0) is used directly with the same light/dark
// SVGs main wires up by default. Revisit once a release past 0.7.0 ships
// theme.logos.
import diamondLogoLight from "./assets/diamond-logo-light.svg";
import diamondLogoDark from "./assets/diamond-logo-dark.svg";
import { ICON_SM } from "./iconSizes";
import { api, ApiError } from "./api/client";
import type { XYEDataInput } from "./api/types";
import { useLivePlots } from "./hooks/useLivePlots";
import { useSelection } from "./hooks/useSelection";
import { useFacets } from "./hooks/useFacets";
import { ALL_SESSIONS, useInstrumentSessionFilter } from "./hooks/useInstrumentSessionFilter";
import { useAppInfo } from "./hooks/useAppInfo";
import { usePersistentState } from "./hooks/usePersistentState";
import { useResizableWidth } from "./hooks/useResizableWidth";
import { fmtTime } from "./format";
import { StatusChips } from "./components/StatusChips";
import { SessionSelect } from "./components/SessionSelect";
import { Facets } from "./components/Facets";
import { PlotTable } from "./components/PlotTable";
import { ChartPanel } from "./components/ChartPanel";
import { UploadDialog } from "./components/UploadDialog";
import type { ChartOptions, LayoutMode } from "./chartBuilder";

const DEFAULT_OPTIONS: ChartOptions = { errors: true, fits: true, logy: false, normalise: false };

export default function App() {
  const { plots, limits, connection, error: liveError, updatedAt, refresh } = useLivePlots();
  const liveIds = useMemo(() => plots.map((p) => p.id), [plots]);
  const { selected, toggle, selectMany, clear: clearSelection } = useSelection(liveIds);
  const sessionFilter = useInstrumentSessionFilter(plots);
  const facets = useFacets(sessionFilter.filtered);
  const { beamline } = useAppInfo();

  const [filterText, setFilterText] = useState("");
  const [mode, setMode] = usePersistentState<LayoutMode>("mode", "overlay");
  const [options, setOptions] = usePersistentState<ChartOptions>("opts", DEFAULT_OPTIONS);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: "success" | "error" } | null>(null);

  const sidebar = useResizableWidth(440, 300, 720);

  const needle = filterText.trim().toLowerCase();
  const visiblePlots = useMemo(() => {
    if (!needle) return facets.visible;
    return facets.visible.filter((plot) =>
      [plot.name, plot.filepath ?? "", String(plot.filenumber ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [facets.visible, needle]);

  const filtersActive =
    facets.isActive || needle !== "" || sessionFilter.session !== ALL_SESSIONS;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedSummaries = useMemo(
    () => plots.filter((p) => selectedSet.has(p.id)),
    [plots, selectedSet],
  );

  const notify = (message: string, severity: "success" | "error" = "error") =>
    setToast({ message, severity });

  const resetFilters = () => {
    setFilterText("");
    facets.setType("__all__");
    facets.setFilenumber("__all__");
    sessionFilter.setSession(ALL_SESSIONS);
  };

  const withErrorToast = async (action: () => Promise<unknown>, verb: string) => {
    try {
      await action();
      await refresh();
    } catch (err) {
      notify(`${verb} failed: ${err instanceof ApiError ? err.message : String(err)}`);
    }
  };

  const handleDelete = (id: string) => void withErrorToast(() => api.remove(id), "Delete");
  const handleTogglePin = (id: string, pinned: boolean) =>
    void withErrorToast(() => api.edit(id, { pinned }), "Pin");
  const handleCycleColour = (id: string, colourIndex: number) =>
    void withErrorToast(() => api.edit(id, { colour_index: colourIndex % 8 }), "Colour change");
  const handleRename = (id: string, name: string) =>
    void withErrorToast(() => api.edit(id, { name }), "Rename");

  const handleClearServer = () => {
    if (!plots.length) return;
    if (!window.confirm(`Delete all ${plots.length} plots from the server?`)) return;
    void withErrorToast(() => api.clearAll(), "Clear");
  };

  const handleUpload = async (data: XYEDataInput) => {
    const response = await api.post({ data });
    await refresh();
    notify(`Plotted "${data.name}" (${data.x.length} points).`, "success");
    if (response.id) selectMany([response.id]);
  };

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Navbar
        surface="surface"
        variant="base"
        elevation={0}
        containerWidth={false}
        sx={{ px: 2 }}
        leftSlot={
          <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0 }}>
            <ImageColourSchemeSwitch
              image={{
                src: diamondLogoLight,
                srcDark: diamondLogoDark,
                alt: "Diamond Light Source",
                height: "26",
              }}
            />
            <Divider orientation="vertical" flexItem sx={{ my: 1, borderColor: "divider" }} />
            <Typography variant="h6" sx={{ fontWeight: 700, flexShrink: 0, lineHeight: 1 }}>
              xrddatavis
            </Typography>
            {beamline && (
              <>
                <Divider
                  orientation="vertical"
                  flexItem
                  sx={{ my: 1, borderColor: "divider", display: { xs: "none", md: "block" } }}
                />
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 600,
                    lineHeight: 1,
                    color: "text.secondary",
                    fontFamily: "var(--ds-font-family-mono)",
                    display: { xs: "none", md: "block" },
                  }}
                >
                  {beamline.toUpperCase()}
                </Typography>
              </>
            )}
            {sessionFilter.options.length > 0 && (
              <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", gap: 2 }}>
                <Divider orientation="vertical" flexItem sx={{ my: 1, borderColor: "divider" }} />
                <SessionSelect
                  options={sessionFilter.options}
                  value={sessionFilter.session}
                  onChange={sessionFilter.setSession}
                />
              </Box>
            )}
          </Stack>
        }
        rightSlot={
          <Stack direction="row" spacing={1.5} alignItems="center">
            <StatusChips
              held={plots.length}
              maxPlots={limits.max_plots}
              ttlSeconds={limits.ttl_seconds}
              connection={connection}
            />
            <ColourSchemeButton />
          </Stack>
        }
      />

      {liveError && (
        <Alert severity="error" sx={{ borderRadius: 0 }}>
          Could not reach the server: {liveError}
        </Alert>
      )}

      <Box
        ref={sidebar.containerRef}
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: { xs: "column", md: "row" },
          minHeight: 0,
          overflow: { xs: "auto", md: "hidden" },
        }}
      >
        <Box
          sx={{
            position: "relative",
            width: { xs: "100%", md: sidebar.width },
            flex: { xs: "0 0 auto", md: `0 0 ${sidebar.width}px` },
            maxHeight: { xs: "45vh", md: "none" },
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            borderRight: { xs: 0, md: 1 },
            borderBottom: { xs: 1, md: 0 },
            borderColor: "divider",
            backgroundColor: "background.paper",
          }}
        >
          <Stack spacing={1.25} sx={{ p: 1.25, borderBottom: 1, borderColor: "divider" }}>
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                placeholder="Filter by name, file or scan number…"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                fullWidth
              />
              {filtersActive && (
                <Button size="small" variant="outlined" onClick={resetFilters} sx={{ textTransform: "none" }}>
                  Reset
                </Button>
              )}
            </Stack>

            <Facets
              typeOptions={facets.typeOptions}
              dataType={facets.dataType}
              onTypeChange={facets.setType}
              filenumberOptions={facets.filenumberOptions}
              filenumber={facets.filenumber}
              onFilenumberChange={facets.setFilenumber}
            />

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button size="small" variant="outlined" sx={{ textTransform: "none" }} onClick={() => selectMany(visiblePlots.map((p) => p.id))}>
                Select all
              </Button>
              <Button size="small" variant="outlined" sx={{ textTransform: "none" }} onClick={clearSelection}>
                Deselect all
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Upload {...ICON_SM} />}
                sx={{ textTransform: "none" }}
                onClick={() => setUploadOpen(true)}
              >
                Upload file…
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<Trash2 {...ICON_SM} />}
                sx={{ textTransform: "none" }}
                onClick={handleClearServer}
                title="Delete every plot on the server"
              >
                Clear server
              </Button>
            </Stack>
          </Stack>

          <PlotTable
            plots={visiblePlots}
            selected={selected}
            onToggle={toggle}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
            onCycleColour={handleCycleColour}
            onRename={handleRename}
            ttlSeconds={limits.ttl_seconds}
            emptyMessage={plots.length ? "No plots match the current filters." : "No plots yet — POST XYEData to /plot."}
          />

          <Stack
            direction="row"
            justifyContent="space-between"
            sx={{ px: 1.25, py: 0.75, borderTop: 1, borderColor: "divider" }}
          >
            <Typography variant="meta" sx={{ color: "text.muted" }}>
              {selected.length} shown of {plots.length}
            </Typography>
            <Typography variant="meta" sx={{ color: "text.muted" }}>
              {updatedAt ? `updated ${fmtTime(updatedAt)}` : ""}
            </Typography>
          </Stack>

          {/* Resize handle - drag or focus + arrow keys; hidden on narrow layouts via CSS below */}
          <Box
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the plot list"
            aria-valuemin={300}
            aria-valuemax={720}
            aria-valuenow={Math.round(sidebar.width)}
            tabIndex={0}
            onPointerDown={sidebar.onPointerDown}
            onPointerMove={sidebar.onPointerMove}
            onPointerUp={sidebar.onPointerUp}
            onKeyDown={sidebar.onKeyDown}
            sx={{
              display: { xs: "none", md: "block" },
              position: "absolute",
              top: 0,
              bottom: 0,
              right: -4,
              width: 8,
              cursor: "col-resize",
              touchAction: "none",
              zIndex: 3,
              "&:hover::after, &:focus-visible::after": { backgroundColor: "primary.main" },
              "&::after": {
                content: '""',
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 3,
                width: 2,
                backgroundColor: sidebar.dragging ? "primary.main" : "transparent",
              },
            }}
          />
        </Box>

        <Box
          sx={{
            flex: { xs: "0 0 60vh", md: 1 },
            height: { xs: "60vh", md: "auto" },
            minHeight: 0,
            display: "flex",
          }}
        >
          <ChartPanel
            selectedSummaries={selectedSummaries}
            hasAnyPlots={plots.length > 0}
            mode={mode}
            onModeChange={setMode}
            options={options}
            onOptionsChange={setOptions}
          />
        </Box>
      </Box>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onSubmit={handleUpload} />

      <Snackbar
        open={toast !== null}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} variant="filled">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}

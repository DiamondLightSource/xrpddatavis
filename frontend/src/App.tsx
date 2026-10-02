import { useMemo, useState } from "react";
import { Alert, Box, Button, Divider, Snackbar, Stack, Typography } from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import { ColourSchemeButton, Logo, Navbar } from "@diamondlightsource/sci-react-ui";
import { api, ApiError } from "./api/client";
import type { PlotRequest } from "./api/types";
import { useLivePlots } from "./hooks/useLivePlots";
import { useSelection } from "./hooks/useSelection";
import { useFacets } from "./hooks/useFacets";
import { ALL_SESSIONS, useInstrumentSessionFilter } from "./hooks/useInstrumentSessionFilter";
import { useAppInfo } from "./hooks/useAppInfo";
import { usePersistentState } from "./hooks/usePersistentState";
import { useResizableWidth } from "./hooks/useResizableWidth";
import { fmtTime } from "./format";
import { ConnectionStatus, PlotCapacity } from "./components/StatusChips";
import { ListToolbar } from "./components/ListToolbar";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { SessionSelect } from "./components/SessionSelect";
import { Facets } from "./components/Facets";
import { PlotTable } from "./components/PlotTable";
import { ChartPanel } from "./components/ChartPanel";
import { UploadDialog } from "./components/UploadDialog";
import type { ChartOptions, LayoutMode } from "./chartBuilder";

const DEFAULT_OPTIONS: ChartOptions = {
  errors: true,
  calc: true,
  diff: false,
  background: false,
  markers: false,
  logy: false,
  normalise: false,
};

export default function App() {
  const { plots, limits, connection, error: liveError, updatedAt, refresh } = useLivePlots();
  const liveIds = useMemo(() => plots.map((p) => p.id), [plots]);
  const { selected, toggle, selectMany, deselectMany, clear: clearSelection } = useSelection(liveIds);
  const sessionFilter = useInstrumentSessionFilter(plots);
  const facets = useFacets(sessionFilter.filtered);
  const { beamline } = useAppInfo();
  const { colorScheme } = useColorScheme();

  const [filterText, setFilterText] = useState("");
  const [mode, setMode] = usePersistentState<LayoutMode>("mode", "overlay");
  const [options, setOptions] = usePersistentState<ChartOptions>("opts", DEFAULT_OPTIONS);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: "success" | "error" } | null>(null);

  const sidebar = useResizableWidth(440, 340, 720);

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
  const visibleIds = useMemo(() => new Set(visiblePlots.map((p) => p.id)), [visiblePlots]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedSummaries = useMemo(
    () => plots.filter((p) => selectedSet.has(p.id)),
    [plots, selectedSet],
  );

  const hiddenSelected = selected.filter((id) => !visibleIds.has(id)).length;

  const emptyMessage = plots.length
    ? "No plots match the current filters."
    : connection === "connecting"
      ? "Loading plots…"
      : liveError
        ? "Plots could not be loaded."
        : "No plots yet — POST a DataPlot to /plot.";

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
    setConfirmClear(false);
    void withErrorToast(() => api.clearAll(), "Delete all");
  };

  const handleUpload = async (data: PlotRequest) => {
    const response = await api.post(data);
    await refresh();
    notify(`Plotted "${data.title}" (${data.x.length} points).`, "success");
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
            {/* Logo follows `mode`, which is "system" until the user picks one, so it
                stays on the light artwork under an OS dark scheme; fixedTone pins it
                to the resolved scheme. */}
            <Logo fixedTone={colorScheme === "dark" ? "dark" : "light"} />
            <Divider orientation="vertical" flexItem sx={{ my: 1, borderColor: "divider" }} />
            <Typography variant="h6" sx={{ fontWeight: 700, flexShrink: 0, lineHeight: 1 }}>
              xrpddatavis
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
              <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center" }}>
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
            <ConnectionStatus connection={connection} />
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
            borderStyle: "solid",
            borderWidth: { xs: "0 0 1px 0", md: "0 1px 0 0" },
            borderColor: "border.subtle",
            backgroundColor: "background.paper",
          }}
        >
          <Stack spacing={1.5} sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
            <ListToolbar
              filterText={filterText}
              onFilterTextChange={setFilterText}
              onUpload={() => setUploadOpen(true)}
              onClearServer={() => setConfirmClear(true)}
              canClearServer={plots.length > 0}
            />
            <Facets
              typeOptions={facets.typeOptions}
              dataType={facets.dataType}
              onTypeChange={facets.setType}
              filenumberOptions={facets.filenumberOptions}
              filenumber={facets.filenumber}
              onFilenumberChange={facets.setFilenumber}
            />
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            useFlexGap
            sx={{ px: 1.5, py: 0.5, minHeight: 36, flexWrap: "wrap", columnGap: 1, borderBottom: 1, borderColor: "divider" }}
          >
            <Typography variant="meta" role="status" sx={{ color: "text.secondary" }}>
              {filtersActive ? `${visiblePlots.length} of ${plots.length} plots` : `${plots.length} plots`} ·{" "}
              {selected.length} on chart
              {hiddenSelected > 0 ? ` (${hiddenSelected} hidden by filters)` : ""}
            </Typography>
            <Stack direction="row" spacing={0.5}>
              {selected.length > 0 && (
                <Button size="small" color="inherit" onClick={clearSelection}>
                  Clear selection
                </Button>
              )}
              {filtersActive && (
                <Button size="small" color="inherit" onClick={resetFilters}>
                  Clear filters
                </Button>
              )}
            </Stack>
          </Stack>

          <PlotTable
            plots={visiblePlots}
            selected={selected}
            onToggle={toggle}
            onSelectAll={selectMany}
            onDeselectAll={deselectMany}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
            onCycleColour={handleCycleColour}
            onRename={handleRename}
            ttlSeconds={limits.ttl_seconds}
            emptyMessage={emptyMessage}
          />

          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: "divider" }}
          >
            <PlotCapacity held={plots.length} maxPlots={limits.max_plots} ttlSeconds={limits.ttl_seconds} />
            <Typography variant="meta" sx={{ color: "text.muted" }}>
              {updatedAt ? `updated ${fmtTime(updatedAt)}` : ""}
            </Typography>
          </Stack>

          {/* Resize handle - drag or focus + arrow keys; hidden on narrow layouts via CSS below */}
          <Box
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the plot list"
            aria-valuemin={340}
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

      <ConfirmDialog
        open={confirmClear}
        title={`Delete all ${plots.length} plots?`}
        confirmLabel="Delete all"
        destructive
        onConfirm={handleClearServer}
        onCancel={() => setConfirmClear(false)}
      >
        This removes every plot from the server for everyone, including pinned plots. It can't be undone.
      </ConfirmDialog>

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

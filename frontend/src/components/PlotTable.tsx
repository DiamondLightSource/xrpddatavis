import { useMemo, useRef, useState } from "react";
import {
  Box,
  Checkbox,
  IconButton,
  LinearProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { MoreVertical, Pencil, Pin, Trash2 } from "lucide-react";
import type { PlotSummary } from "../api/types";
import { fmtDuration, fmtNumber } from "../format";
import { ICON_SM, ICON_XS } from "../iconSizes";
import { ConfirmDialog } from "./ConfirmDialog";
import { seriesColour } from "../palette";
import { useColorScheme } from "@mui/material/styles";

const FIRST_LINE = 28;

const firstLine = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  minHeight: FIRST_LINE,
} as const;

const visuallyHidden = {
  position: "absolute",
  top: 0,
  left: 0,
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
} as const;

type SortKey = "name" | "points" | "created_at";

interface PlotTableProps {
  plots: PlotSummary[];
  selected: string[];
  onToggle: (id: string, force?: boolean) => void;
  onSelectAll: (ids: string[]) => void;
  onDeselectAll: (ids: string[]) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onCycleColour: (id: string, colourIndex: number) => void;
  onRename: (id: string, name: string) => void;
  ttlSeconds: number;
  emptyMessage: string;
}

function useSort() {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "created_at",
    dir: "desc",
  });
  const toggle = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  return { sort, toggle };
}

function sortPlots(plots: PlotSummary[], sort: { key: SortKey; dir: "asc" | "desc" }) {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...plots].sort((a, b) => {
    let result: number;
    if (sort.key === "name") result = a.name.localeCompare(b.name, undefined, { numeric: true });
    else if (sort.key === "points") result = a.points - b.points;
    else result = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return result * sign || a.id.localeCompare(b.id);
  });
}

function TtlCell({ plot, ttlSeconds }: { plot: PlotSummary; ttlSeconds: number }) {
  if (plot.pinned) {
    return (
      <Typography variant="mono3" fontWeight={600} sx={{ ...firstLine, color: "primary.main" }}>
        Pinned
      </Typography>
    );
  }
  if (!ttlSeconds) return null;
  const remaining = plot.ttl_remaining_seconds;
  const fraction = Math.max(0, Math.min(1, remaining / ttlSeconds));
  const expiring = fraction < 0.15;
  return (
    <Box sx={{ minWidth: 56 }}>
      <Typography variant="mono3" component="div" sx={{ ...firstLine, color: "text.secondary" }}>
        {fmtDuration(remaining)}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={fraction * 100}
        color={expiring ? "warning" : "success"}
        sx={{ height: 3, borderRadius: 1, mt: -0.25 }}
      />
    </Box>
  );
}

export function PlotTable({
  plots,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onTogglePin,
  onCycleColour,
  onRename,
  ttlSeconds,
  emptyMessage,
}: PlotTableProps) {
  const { sort, toggle } = useSort();
  const { colorScheme } = useColorScheme();
  const colourMode = colorScheme === "dark" ? "dark" : "light";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [menu, setMenu] = useState<{ anchor: HTMLElement; plot: PlotSummary } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlotSummary | null>(null);
  const pendingRename = useRef<PlotSummary | null>(null);

  const sorted = useMemo(() => sortPlots(plots, sort), [plots, sort]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const selectedVisible = sorted.filter((p) => selectedSet.has(p.id)).length;
  const allSelected = sorted.length > 0 && selectedVisible === sorted.length;
  const someSelected = selectedVisible > 0 && !allSelected;

  const startRename = (plot: PlotSummary) => {
    renameDone.current = false;
    setEditingId(plot.id);
    setDraftName(plot.name);
  };

  const renameDone = useRef(false);

  const focusRowMenu = (id: string) =>
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-row-menu="${id}"]`)?.focus(),
    );

  const finishRename = (plot: PlotSummary, commit: boolean, restoreFocus: boolean) => {
    if (renameDone.current) return;
    renameDone.current = true;
    const value = draftName.trim();
    setEditingId(null);
    if (commit && value && value !== plot.name) onRename(plot.id, value);
    if (restoreFocus) focusRowMenu(plot.id);
  };

  if (!sorted.length) {
    return (
      <Box sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
        <Typography variant="body2">{emptyMessage}</Typography>
      </Box>
    );
  }

  return (
    <TableContainer sx={{ flex: 1, minHeight: 0, border: 0, borderRadius: 0 }}>
      <Table size="small" stickyHeader aria-label="Live plots" sx={{ tableLayout: "fixed", width: "100%" }}>
        <colgroup>
          <col style={{ width: 44 }} />
          <col />
          <col style={{ width: 64 }} />
          <col style={{ width: 72 }} />
          <col style={{ width: 60 }} />
        </colgroup>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox">
              <Checkbox
                size="small"
                sx={{ p: 0.5 }}
                checked={allSelected}
                indeterminate={someSelected}
                onChange={() => {
                  const ids = sorted.map((p) => p.id);
                  if (allSelected) onDeselectAll(ids);
                  else onSelectAll(ids);
                }}
                inputProps={{ "aria-label": allSelected ? "Deselect all listed plots" : "Select all listed plots" }}
              />
            </TableCell>
            <TableCell sortDirection={sort.key === "name" ? sort.dir : false}>
              <TableSortLabel
                active={sort.key === "name"}
                direction={sort.key === "name" ? sort.dir : "asc"}
                onClick={() => toggle("name")}
              >
                Name
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sortDirection={sort.key === "points" ? sort.dir : false}>
              <TableSortLabel
                active={sort.key === "points"}
                direction={sort.key === "points" ? sort.dir : "desc"}
                onClick={() => toggle("points")}
              >
                Pts
              </TableSortLabel>
            </TableCell>
            <TableCell align="right" sortDirection={sort.key === "created_at" ? sort.dir : false}>
              <TableSortLabel
                active={sort.key === "created_at"}
                direction={sort.key === "created_at" ? sort.dir : "desc"}
                onClick={() => toggle("created_at")}
              >
                TTL
              </TableSortLabel>
            </TableCell>
            <TableCell padding="checkbox">
              <Box component="span" sx={visuallyHidden}>
                Actions
              </Box>
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((plot) => {
            const isSelected = selectedSet.has(plot.id);
            const colour = seriesColour(plot.colour_index, colourMode);
            const flags = [plot.has_errors && "errors", plot.has_fit && "fit"].filter(Boolean);
            return (
              <TableRow
                key={plot.id}
                hover
                selected={isSelected}
                onClick={() => {
                  setEditingId(null);
                  onToggle(plot.id);
                }}
                sx={{ cursor: "pointer", verticalAlign: "top" }}
              >
                <TableCell padding="checkbox" sx={{ "&&": { pt: 0.75 } }} onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    size="small"
                    sx={{ p: 0.5 }}
                    checked={isSelected}
                    onChange={(e) => onToggle(plot.id, e.target.checked)}
                    inputProps={{ "aria-label": `Show ${plot.name}` }}
                  />
                </TableCell>
                <TableCell sx={{ overflow: "hidden" }}>
                  <Box sx={{ minHeight: FIRST_LINE, display: "flex", alignItems: "center" }}>
                    {editingId === plot.id ? (
                      <TextField
                        autoFocus
                        size="small"
                        variant="standard"
                        value={draftName}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => finishRename(plot, true, false)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") finishRename(plot, true, true);
                          if (e.key === "Escape") finishRename(plot, false, true);
                        }}
                        slotProps={{ htmlInput: { "aria-label": `Rename ${plot.name}` } }}
                        fullWidth
                      />
                    ) : (
                      <Tooltip title={plot.filepath ? `${plot.name} - ${plot.filepath}` : plot.name}>
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          noWrap
                          onDoubleClick={() => startRename(plot)}
                          sx={{ minWidth: 0 }}
                        >
                          {plot.name}
                        </Typography>
                      </Tooltip>
                    )}
                    <Tooltip title="Change colour">
                      <IconButton
                        size="small"
                        aria-label={`Change colour for ${plot.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onCycleColour(plot.id, plot.colour_index + 1);
                        }}
                        sx={{ p: 0.5, ml: "auto", flexShrink: 0 }}
                      >
                        <Box
                          component="span"
                          sx={{
                            width: 14,
                            height: 14,
                            borderRadius: 0.5,
                            backgroundColor: colour,
                          }}
                        />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="meta" component="div" noWrap sx={{ color: "text.secondary" }}>
                    {[plot.data_type?.toUpperCase(), plot.filenumber !== null && `#${plot.filenumber}`, ...flags]
                      .filter(Boolean)
                      .join(" · ")}
                  </Typography>
                  <Typography variant="mono3" component="div" noWrap sx={{ color: "text.muted" }}>
                    x {fmtNumber(plot.x_min)} – {fmtNumber(plot.x_max)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="mono3" component="div" sx={{ ...firstLine, color: "text.secondary" }}>
                    {plot.points.toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <TtlCell plot={plot} ttlSeconds={ttlSeconds} />
                </TableCell>
                <TableCell padding="checkbox" sx={{ "&&": { pt: 0.75 } }} onClick={(e) => e.stopPropagation()}>
                  <Stack direction="row" alignItems="center" justifyContent="flex-end" sx={{ minHeight: FIRST_LINE }}>
                    <Tooltip title={plot.pinned ? "Unpin - allow this plot to expire" : "Pin - keep this plot from expiring"}>
                      <IconButton
                        size="small"
                        aria-label={`Pin ${plot.name}`}
                        aria-pressed={plot.pinned}
                        color={plot.pinned ? "primary" : "default"}
                        onClick={() => onTogglePin(plot.id, !plot.pinned)}
                      >
                        <Pin {...ICON_XS} fill={plot.pinned ? "currentColor" : "none"} />
                      </IconButton>
                    </Tooltip>
                    <IconButton
                      size="small"
                      aria-label={`More actions for ${plot.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menu?.plot.id === plot.id ? true : undefined}
                      data-row-menu={plot.id}
                      onClick={(e) => setMenu({ anchor: e.currentTarget, plot })}
                    >
                      <MoreVertical {...ICON_XS} />
                    </IconButton>
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Menu
        anchorEl={menu?.anchor}
        open={menu !== null}
        onClose={() => setMenu(null)}
        slotProps={{
          transition: {
            onExited: () => {
              if (pendingRename.current) startRename(pendingRename.current);
              pendingRename.current = null;
            },
          },
        }}
      >
        <MenuItem
          onClick={() => {
            pendingRename.current = menu?.plot ?? null;
            setMenu(null);
          }}
        >
          <ListItemIcon>
            <Pencil {...ICON_SM} />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu?.plot.pinned) setConfirmDelete(menu.plot);
            else if (menu) onDelete(menu.plot.id);
            setMenu(null);
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon sx={{ color: "inherit" }}>
            <Trash2 {...ICON_SM} />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>
      <ConfirmDialog
        open={confirmDelete !== null}
        title={`Delete pinned plot ${confirmDelete?.name ?? ""}?`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) onDelete(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        This plot is pinned so it would not expire. Deleting it removes it for everyone and can't be undone.
      </ConfirmDialog>
    </TableContainer>
  );
}

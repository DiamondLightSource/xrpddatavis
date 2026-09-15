import { useMemo, useState } from "react";
import {
  Box,
  Checkbox,
  Chip,
  IconButton,
  LinearProgress,
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
  useTheme,
} from "@mui/material";
import { Pin, Trash2 } from "lucide-react";
import type { PlotSummary } from "../api/types";
import { fmtDuration, fmtNumber } from "../format";
import { ICON_XS } from "../iconSizes";
import { seriesColour } from "../palette";
import { useColorScheme } from "@mui/material/styles";

type SortKey = "name" | "points" | "created_at";

interface PlotTableProps {
  plots: PlotSummary[];
  selected: string[];
  onToggle: (id: string, force?: boolean) => void;
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
      <Typography variant="mono3" fontWeight={600} sx={{ color: "primary.main" }}>
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
      <Typography variant="mono3" sx={{ color: "text.secondary" }}>
        {fmtDuration(remaining)}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={fraction * 100}
        color={expiring ? "warning" : "success"}
        sx={{ height: 3, borderRadius: 1, mt: 0.5 }}
      />
    </Box>
  );
}

export function PlotTable({
  plots,
  selected,
  onToggle,
  onDelete,
  onTogglePin,
  onCycleColour,
  onRename,
  ttlSeconds,
  emptyMessage,
}: PlotTableProps) {
  const { sort, toggle } = useSort();
  const theme = useTheme();
  const { mode, systemMode } = useColorScheme();
  const colourMode = (mode === "system" ? systemMode : mode) === "dark" ? "dark" : "light";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const sorted = useMemo(() => sortPlots(plots, sort), [plots, sort]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const commitRename = (id: string) => {
    const value = draftName.trim();
    setEditingId(null);
    if (value) onRename(id, value);
  };

  if (!sorted.length) {
    return (
      <Box sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
        <Typography variant="body2">{emptyMessage}</Typography>
      </Box>
    );
  }

  return (
    <TableContainer sx={{ flex: 1, minHeight: 0 }}>
      <Table size="small" stickyHeader aria-label="Live plots">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" sx={{ width: 60 }} />
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
            <TableCell padding="checkbox" sx={{ width: 40 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {sorted.map((plot) => {
            const isSelected = selectedSet.has(plot.id);
            const colour = seriesColour(plot.colour_index, colourMode);
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
                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Checkbox
                      size="small"
                      checked={isSelected}
                      onChange={(e) => onToggle(plot.id, e.target.checked)}
                      inputProps={{ "aria-label": `Show ${plot.name}` }}
                    />
                    <Tooltip title="Change colour">
                      <Box
                        component="button"
                        onClick={() => onCycleColour(plot.id, plot.colour_index + 1)}
                        aria-label={`Change colour for ${plot.name}`}
                        sx={{
                          width: 12,
                          height: 12,
                          borderRadius: 0.5,
                          border: "none",
                          cursor: "pointer",
                          backgroundColor: colour,
                          opacity: isSelected ? 1 : 0.4,
                          p: 0,
                        }}
                      />
                    </Tooltip>
                  </Stack>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {editingId === plot.id ? (
                    <TextField
                      autoFocus
                      size="small"
                      variant="standard"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onBlur={() => commitRename(plot.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(plot.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      fullWidth
                    />
                  ) : (
                    <Typography
                      variant="body2"
                      fontWeight={500}
                      onDoubleClick={() => {
                        setEditingId(plot.id);
                        setDraftName(plot.name);
                      }}
                      title="Double-click to rename"
                      sx={{ wordBreak: "break-word" }}
                    >
                      {plot.name}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.25 }}>
                    {plot.data_type && (
                      <Chip
                        label={plot.data_type.toUpperCase()}
                        size="small"
                        variant="outlined"
                        color="primary"
                        sx={{ height: 18, fontSize: 10, fontWeight: 600 }}
                      />
                    )}
                    {plot.filenumber !== null && (
                      <Chip
                        label={`#${plot.filenumber}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: 10 }}
                      />
                    )}
                    {plot.has_errors && (
                      <Chip label="e" size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                    )}
                    {plot.has_fit && (
                      <Chip
                        label="fit"
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: 10 }}
                      />
                    )}
                  </Stack>
                  <Typography variant="mono3" sx={{ color: "text.muted", wordBreak: "break-all" }}>
                    x {fmtNumber(plot.x_min)} – {fmtNumber(plot.x_max)}
                    {plot.filepath ? ` · ${plot.filepath}` : ""}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="mono3" sx={{ color: "text.secondary" }}>
                    {plot.points.toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                  <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                    <TtlCell plot={plot} ttlSeconds={ttlSeconds} />
                    <Tooltip title={plot.pinned ? "Unpin - allow this plot to expire" : "Pin - keep this plot from expiring"}>
                      <IconButton
                        size="small"
                        aria-label={`${plot.pinned ? "Unpin" : "Pin"} ${plot.name}`}
                        aria-pressed={plot.pinned}
                        color={plot.pinned ? "primary" : "default"}
                        onClick={() => onTogglePin(plot.id, !plot.pinned)}
                      >
                        <Pin {...ICON_XS} style={{ opacity: plot.pinned ? 1 : 0.5 }} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
                <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                  <Tooltip title="Delete plot">
                    <IconButton
                      size="small"
                      aria-label={`Delete ${plot.name}`}
                      onClick={() => onDelete(plot.id)}
                      sx={{
                        color: "text.muted",
                        "&:hover": { color: "error.main", backgroundColor: theme.palette.surface.subtle },
                      }}
                    >
                      <Trash2 {...ICON_XS} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

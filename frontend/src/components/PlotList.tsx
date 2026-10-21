import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Checkbox,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { FilterX, MoreVertical, Pencil, Pin, Trash2 } from "lucide-react";
import type { PlotSummary } from "../api/types";
import { fmtDuration, fmtNumber } from "../format";
import { SORT_OPTIONS, type SortOrder } from "../hooks/usePlotSort";
import { ICON_SM, ICON_XS } from "../iconSizes";
import { ConfirmDialog } from "./ConfirmDialog";
import { seriesColour } from "../palette";
import { useColorScheme } from "@mui/material/styles";

const FIRST_LINE = 28;

const SELECTED_SHADOW = "inset 3px 0 0 var(--ds-primary), inset 0 0 0 9999px var(--ds-overlay-selected)";

interface PlotListProps {
  plots: PlotSummary[];
  selected: string[];
  onToggle: (id: string, force?: boolean) => void;
  onSelectAll: (ids: string[]) => void;
  onDeselectAll: (ids: string[]) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onCycleColour: (id: string, colourIndex: number) => void;
  onRename: (id: string, name: string) => void;
  totalCount: number;
  filtersActive: boolean;
  onClearFilters: () => void;
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  ttlSeconds: number;
  emptyMessage: string;
}

interface TtlProps {
  plot: PlotSummary;
  ttlSeconds: number;
}

function ttlFraction({ plot, ttlSeconds }: TtlProps) {
  return Math.max(0, Math.min(1, plot.ttl_remaining_seconds / ttlSeconds));
}

function TtlLabel({ plot, ttlSeconds }: TtlProps) {
  if (plot.pinned) {
    return (
      <Typography variant="mono3" fontWeight={600} sx={{ color: "primary.main", flexShrink: 0 }}>
        Pinned
      </Typography>
    );
  }
  if (!ttlSeconds) return null;
  const expiring = ttlFraction({ plot, ttlSeconds }) < 0.15;
  return (
    <Typography variant="mono3" sx={{ color: expiring ? "warning.main" : "text.secondary", flexShrink: 0 }}>
      {fmtDuration(plot.ttl_remaining_seconds)}
    </Typography>
  );
}

interface PlotCardProps {
  plot: PlotSummary;
  isSelected: boolean;
  ttlSeconds: number;
  colour: string;
  editing: boolean;
  draftName: string;
  menuOpen: boolean;
  onDraftNameChange: (name: string) => void;
  onToggle: (id: string, force?: boolean) => void;
  onToggleCard: (id: string) => void;
  onStartRename: (plot: PlotSummary) => void;
  onFinishRename: (plot: PlotSummary, commit: boolean, restoreFocus: boolean) => void;
  onCycleColour: (id: string, colourIndex: number) => void;
  onPin: (plot: PlotSummary) => void;
  onOpenMenu: (anchor: HTMLElement, plot: PlotSummary) => void;
}

function PlotCard({
  plot,
  isSelected,
  ttlSeconds,
  colour,
  editing,
  draftName,
  menuOpen,
  onDraftNameChange,
  onToggle,
  onToggleCard,
  onStartRename,
  onFinishRename,
  onCycleColour,
  onPin,
  onOpenMenu,
}: PlotCardProps) {
  const pastTtl = plot.pinned && ttlSeconds > 0 && plot.ttl_remaining_seconds <= 0;
  const tags = [plot.data_type?.toUpperCase(), plot.filenumber !== null && `#${plot.filenumber}`, plot.has_fit && "fit"]
    .filter(Boolean)
    .join(" · ");

  return (
    <Box
      component="li"
      data-plot-id={plot.id}
      onClick={() => onToggleCard(plot.id)}
      sx={{
        display: "flex",
        alignItems: "flex-start",
        flexShrink: 0,
        gap: 0.5,
        listStyle: "none",
        overflow: "hidden",
        cursor: "pointer",
        px: 1,
        pt: 0.5,
        pb: 0.5,
        borderBottom: 1,
        borderColor: "border.subtle",
        backgroundColor: "background.paper",
        boxShadow: isSelected ? SELECTED_SHADOW : "none",
        "&:hover": { boxShadow: isSelected ? SELECTED_SHADOW : "inset 0 0 0 9999px var(--ds-overlay-hover)" },
      }}
    >
      <Checkbox
        size="small"
        sx={{ p: 0.5 }}
        checked={isSelected}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onToggle(plot.id, e.target.checked)}
        inputProps={{ "aria-label": `Show ${plot.name}` }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" sx={{ minHeight: FIRST_LINE }}>
          {editing ? (
            <TextField
              autoFocus
              size="small"
              variant="standard"
              value={draftName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onDraftNameChange(e.target.value)}
              onBlur={() => onFinishRename(plot, true, false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onFinishRename(plot, true, true);
                if (e.key === "Escape") onFinishRename(plot, false, true);
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
                onDoubleClick={() => onStartRename(plot)}
                sx={{ minWidth: 0, flex: 1 }}
              >
                {plot.name}
              </Typography>
            </Tooltip>
          )}
          <Box onClick={(e) => e.stopPropagation()} sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
            <Tooltip title="Change colour">
              <IconButton
                size="small"
                aria-label={`Change colour for ${plot.name}`}
                onClick={() => onCycleColour(plot.id, plot.colour_index + 1)}
              >
                <Box component="span" sx={{ width: ICON_XS.size, height: ICON_XS.size, borderRadius: "50%", backgroundColor: colour }} />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={
                pastTtl
                  ? "Expired - unpinning removes it now"
                  : plot.pinned
                    ? "Unpin - allow this plot to expire"
                    : "Pin - keep this plot from expiring"
              }
            >
              <IconButton
                size="small"
                aria-label={`Pin ${plot.name}${pastTtl ? " (expired)" : ""}`}
                aria-pressed={plot.pinned}
                color={pastTtl ? "warning" : plot.pinned ? "primary" : "default"}
                onClick={() => onPin(plot)}
              >
                <Pin {...ICON_XS} fill={plot.pinned ? "currentColor" : "none"} />
              </IconButton>
            </Tooltip>
            <IconButton
              size="small"
              aria-label={`More actions for ${plot.name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen ? true : undefined}
              data-row-menu={plot.id}
              onClick={(e) => onOpenMenu(e.currentTarget, plot)}
            >
              <MoreVertical {...ICON_XS} />
            </IconButton>
          </Box>
        </Stack>
        <Typography variant="meta" component="div" noWrap sx={{ color: "text.secondary", minHeight: "1.5em" }}>
          {tags}
        </Typography>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" spacing={1}>
          <Typography variant="mono3" component="div" noWrap sx={{ color: "text.muted", minWidth: 0 }}>
            x {fmtNumber(plot.x_min)} – {fmtNumber(plot.x_max)} ·{" "}
            <Box component="span" sx={{ color: "text.secondary" }}>
              {plot.points.toLocaleString()} pts
            </Box>
          </Typography>
          <TtlLabel plot={plot} ttlSeconds={ttlSeconds} />
        </Stack>
      </Box>
    </Box>
  );
}

export function PlotList({
  plots,
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onTogglePin,
  onCycleColour,
  onRename,
  totalCount,
  filtersActive,
  onClearFilters,
  sortOrder,
  onSortOrderChange,
  ttlSeconds,
  emptyMessage,
}: PlotListProps) {
  const { colorScheme } = useColorScheme();
  const colourMode = colorScheme === "dark" ? "dark" : "light";
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [menu, setMenu] = useState<{ anchor: HTMLElement; plot: PlotSummary } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PlotSummary | null>(null);
  const [confirmUnpin, setConfirmUnpin] = useState<PlotSummary | null>(null);
  const pendingRename = useRef<PlotSummary | null>(null);
  const summaryRef = useRef<HTMLSpanElement>(null);
  const focusedCard = useRef<string | null>(null);

  // A card that leaves the list while it holds focus (unpinned under the Pinned
  // filter, deleted, expired) takes focus with it; hand it to the counts line
  // so a keyboard user keeps their place instead of restarting from the top.
  useEffect(() => {
    const id = focusedCard.current;
    if (id === null || plots.some((p) => p.id === id)) return;
    focusedCard.current = null;
    if (!document.activeElement || document.activeElement === document.body) summaryRef.current?.focus();
  }, [plots]);

  const trackFocus = (e: React.FocusEvent) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>("[data-plot-id]")?.dataset.plotId;
    if (id) focusedCard.current = id;
  };

  // Focus moving to another element clears the tracking. A blur with nowhere to
  // go is either a click on empty space (target still attached: clear) or the
  // card being removed (target gone by the next microtask: keep, the effect
  // above needs it).
  const trackBlur = (e: React.FocusEvent) => {
    if (e.relatedTarget) {
      focusedCard.current = null;
      return;
    }
    const target = e.target as HTMLElement;
    queueMicrotask(() => {
      if (target.isConnected) focusedCard.current = null;
    });
  };
  const renameDone = useRef(true);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const selectedVisible = plots.filter((p) => selectedSet.has(p.id)).length;
  const hiddenSelected = selected.length - selectedVisible;
  const hasSelection = selected.length > 0;
  const allSelected = selectedVisible === plots.length;

  const startRename = (plot: PlotSummary) => {
    renameDone.current = false;
    setEditingId(plot.id);
    setDraftName(plot.name);
  };

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

  const empty = (
    <Box sx={{ p: 4, textAlign: "center", color: "text.secondary" }}>
      <Typography variant="body2">{emptyMessage}</Typography>
    </Box>
  );

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      {totalCount > 0 && (
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ px: 1, py: 0.5, flexShrink: 0, borderBottom: 1, borderColor: "divider" }}
        >
          <Checkbox
            size="small"
            sx={{ p: 0.5 }}
            checked={plots.length > 0 && allSelected}
            indeterminate={hasSelection && !(plots.length > 0 && allSelected)}
            onChange={() => {
              if (hasSelection) onDeselectAll(selected);
              else if (plots.length) onSelectAll(plots.map((p) => p.id));
            }}
            inputProps={{ "aria-label": "Select all listed plots" }}
          />
          <Typography
            variant="meta"
            role="status"
            tabIndex={-1}
            ref={summaryRef}
            sx={{ flex: 1, minWidth: 0, color: "text.secondary" }}
          >
            {filtersActive ? `${plots.length} of ${totalCount}` : totalCount} plots · {selected.length} selected
            {hiddenSelected > 0 ? ` (${hiddenSelected} hidden)` : ""}
          </Typography>
          {filtersActive && (
            <Tooltip title="Clear filters">
              <IconButton
                size="small"
                aria-label="Clear filters"
                onClick={() => {
                  onClearFilters();
                  summaryRef.current?.focus();
                }}
              >
                <FilterX {...ICON_XS} />
              </IconButton>
            </Tooltip>
          )}
          <TextField
            select
            size="small"
            variant="standard"
            value={sortOrder}
            onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
            sx={{ flexShrink: 0, "& .MuiSelect-select": { py: 0.5, typography: "body2" } }}
            slotProps={{
              htmlInput: { "aria-label": "Sort plots" },
              input: {
                disableUnderline: true,
                startAdornment: (
                  <InputAdornment position="start" sx={{ mr: 1 }}>
                    <Typography variant="meta" sx={{ color: "text.secondary" }}>
                      Sort:
                    </Typography>
                  </InputAdornment>
                ),
              },
            }}
          >
            {SORT_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value} dense>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      )}
      {!plots.length ? (
        empty
      ) : (
        <Box
          component="ul"
          aria-label="Live plots"
          onFocus={trackFocus}
          onBlur={trackBlur}
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            m: 0,
            p: 0,
            display: "flex",
            flexDirection: "column",
            backgroundColor: "background.paper",
          }}
        >
          {plots.map((plot) => (
            <PlotCard
              key={plot.id}
              plot={plot}
              isSelected={selectedSet.has(plot.id)}
              ttlSeconds={ttlSeconds}
              colour={seriesColour(plot.colour_index, colourMode)}
              editing={editingId === plot.id}
              draftName={draftName}
              menuOpen={menu?.plot.id === plot.id}
              onDraftNameChange={setDraftName}
              onToggle={onToggle}
              onToggleCard={(id) => {
                setEditingId(null);
                onToggle(id);
              }}
              onStartRename={startRename}
              onFinishRename={finishRename}
              onCycleColour={onCycleColour}
              onPin={(p) => {
                if (p.pinned && ttlSeconds > 0 && p.ttl_remaining_seconds <= 0) setConfirmUnpin(p);
                else onTogglePin(p.id, !p.pinned);
              }}
              onOpenMenu={(anchor, p) => setMenu({ anchor, plot: p })}
            />
          ))}
        </Box>
      )}
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
            else if (menu) {
              focusedCard.current = menu.plot.id;
              onDelete(menu.plot.id);
            }
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
          if (confirmDelete) {
            focusedCard.current = confirmDelete.id;
            onDelete(confirmDelete.id);
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        This plot is pinned so it would not expire. Deleting it removes it for everyone and can't be undone.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmUnpin !== null}
        title={`Unpin and remove ${confirmUnpin?.name ?? ""}?`}
        confirmLabel="Unpin and remove"
        destructive
        onConfirm={() => {
          if (confirmUnpin) {
            focusedCard.current = confirmUnpin.id;
            onTogglePin(confirmUnpin.id, false);
          }
          setConfirmUnpin(null);
        }}
        onCancel={() => setConfirmUnpin(null)}
      >
        This plot has expired and is only kept because it is pinned. Unpinning removes it immediately, for everyone, and can't be undone.
      </ConfirmDialog>
    </Box>
  );
}

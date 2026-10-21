import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import type { ConnectionState } from "../hooks/useLivePlots";
import { fmtDuration } from "../format";

const CONNECTION_COLOUR: Record<ConnectionState, "success" | "warning" | "error"> = {
  live: "success",
  polling: "warning",
  down: "error",
  connecting: "warning",
};

const CONNECTION_LABEL: Record<ConnectionState, string> = {
  live: "live",
  polling: "polling",
  down: "offline",
  connecting: "connecting",
};

export function ConnectionStatus({ connection }: { connection: ConnectionState }) {
  return (
    <Tooltip title="Live update stream">
      <Chip
        size="small"
        variant="outlined"
        color={CONNECTION_COLOUR[connection]}
        role="status"
        // a plain filled dot, not a lucide icon - Lucide is line-based/unfilled
        // by design (see the Icons foundation page), which reads poorly as a
        // solid status indicator
        icon={
          <Box
            component="span"
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: "currentColor",
              display: "inline-block",
              ml: "6px",
            }}
          />
        }
        label={CONNECTION_LABEL[connection]}
      />
    </Tooltip>
  );
}

interface PlotCapacityProps {
  held: number;
  maxPlots: number;
  ttlSeconds: number;
}

/** Server-side limits as plain text: they are context, not something to act
 * on, so they shouldn't compete with the controls above them. */
export function PlotCapacity({ held, maxPlots, ttlSeconds }: PlotCapacityProps) {
  const full = maxPlots > 0 && held >= maxPlots;
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Tooltip title="The server holds at most this many plots; the oldest is dropped to make room.">
        <Typography variant="meta" sx={{ color: full ? "warning.main" : "text.secondary" }}>
          {`${held} / ${maxPlots || "—"} plots`}
        </Typography>
      </Tooltip>
      <Typography variant="meta" aria-hidden sx={{ color: "text.muted" }}>
        ·
      </Typography>
      <Tooltip title="Plots are cleared automatically this long after arriving (pinned plots are exempt).">
        <Typography variant="meta" sx={{ color: "text.secondary" }}>
          {`ttl ${ttlSeconds ? fmtDuration(ttlSeconds) : "—"}`}
        </Typography>
      </Tooltip>
    </Stack>
  );
}

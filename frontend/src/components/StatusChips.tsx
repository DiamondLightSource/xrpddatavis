import { Box, Chip, Stack, Tooltip } from "@mui/material";
import type { ConnectionState } from "../hooks/useLivePlots";
import { fmtDuration } from "../format";

interface StatusChipsProps {
  held: number;
  maxPlots: number;
  ttlSeconds: number;
  connection: ConnectionState;
}

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

export function StatusChips({ held, maxPlots, ttlSeconds, connection }: StatusChipsProps) {
  const full = maxPlots > 0 && held >= maxPlots;
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Box sx={{ display: { xs: "none", sm: "flex" }, gap: 1 }}>
        <Tooltip title="The server holds at most this many plots; the oldest is dropped to make room.">
          <Chip
            size="small"
            variant="outlined"
            color={full ? "warning" : "default"}
            label={`${held} / ${maxPlots || "—"} plots`}
          />
        </Tooltip>
        <Tooltip title="Plots are cleared automatically this long after arriving (pinned plots are exempt).">
          <Chip size="small" variant="outlined" label={`ttl ${ttlSeconds ? fmtDuration(ttlSeconds) : "—"}`} />
        </Tooltip>
      </Box>
      <Tooltip title="Live update stream">
        <Chip
          size="small"
          variant="outlined"
          color={CONNECTION_COLOUR[connection]}
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
    </Stack>
  );
}

import { MenuItem, TextField, Typography } from "@mui/material";
import type { SessionOption } from "../hooks/useInstrumentSessionFilter";
import { ALL_SESSIONS } from "../hooks/useInstrumentSessionFilter";

interface SessionSelectProps {
  options: SessionOption[];
  value: string;
  onChange: (value: string) => void;
}

/** The instrument-session picker next to the logo/name/beamline - only
 * rendered at all once at least one live plot has a resolvable session
 * (see DataPlot.get_instrument_session on the server). Session IDs are
 * technical identifiers, so - like the beamline chip - they're set in mono;
 * the "All sessions" option is plain prose and stays in Inter. */
export function SessionSelect({ options, value, onChange }: SessionSelectProps) {
  if (!options.length) return null;
  return (
    // Not wrapped in a Tooltip: MUI's shows on focus as well as hover, and
    // since focus stays on the select after picking an option, it would be
    // left open overlapping the sidebar's search/Reset row directly below
    // the header.
    <TextField
      select
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filter plots to one instrument session"
      sx={{ minWidth: 150 }}
      slotProps={{
        select: {
          renderValue: (v) =>
            v === ALL_SESSIONS ? (
              "All sessions"
            ) : (
              <Typography component="span" variant="mono2">
                {v as string}
              </Typography>
            ),
        },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.value === ALL_SESSIONS ? (
            option.label
          ) : (
            <Typography component="span" variant="mono2">
              {option.label}
            </Typography>
          )}
          <Typography component="span" variant="mono3" sx={{ ml: 1, opacity: 0.6 }}>
            {option.count}
          </Typography>
        </MenuItem>
      ))}
    </TextField>
  );
}

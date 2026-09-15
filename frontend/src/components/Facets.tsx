import { Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import type { FilenumberOption, TypeOption } from "../hooks/useFacets";

interface FacetRowProps<T extends { value: string; label: string; count: number }> {
  label: string;
  options: T[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

function FacetRow<T extends { value: string; label: string; count: number }>({
  label,
  options,
  value,
  onChange,
  ariaLabel,
}: FacetRowProps<T>) {
  if (!options.length) return null;
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
      <Typography
        variant="overline"
        sx={{ color: "text.muted", lineHeight: "28px", flexShrink: 0 }}
      >
        {label}
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={value}
        onChange={(_, next: string | null) => next && onChange(next)}
        aria-label={ariaLabel}
        sx={{ flexWrap: "wrap", gap: 0.5, "& .MuiToggleButtonGroup-grouped": { border: 1, borderRadius: 1 } }}
      >
        {options.map((option) => (
          <ToggleButton key={option.value} value={option.value} sx={{ py: 0.25, px: 1.25, textTransform: "none" }}>
            {option.label}
            <Typography component="span" variant="mono3" sx={{ ml: 0.5, opacity: 0.75 }}>
              {option.count}
            </Typography>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}

interface FacetsProps {
  typeOptions: TypeOption[];
  dataType: string;
  onTypeChange: (value: string) => void;
  filenumberOptions: FilenumberOption[];
  filenumber: string;
  onFilenumberChange: (value: string) => void;
}

export function Facets({
  typeOptions,
  dataType,
  onTypeChange,
  filenumberOptions,
  filenumber,
  onFilenumberChange,
}: FacetsProps) {
  return (
    <Stack spacing={1}>
      <FacetRow
        label="Type"
        options={typeOptions}
        value={dataType}
        onChange={onTypeChange}
        ariaLabel="Filter by data type"
      />
      <FacetRow
        label="File #"
        options={filenumberOptions}
        value={filenumber}
        onChange={onFilenumberChange}
        ariaLabel="Filter by file number"
      />
    </Stack>
  );
}

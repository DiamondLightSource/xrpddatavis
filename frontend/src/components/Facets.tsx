import { Checkbox, ListItemText, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { FilenumberOption, TypeOption } from "../hooks/useFacets";

interface FacetSelectProps<T extends { value: string; label: string; count: number }> {
  label: string;
  allLabel: string;
  options: T[];
  value: string[];
  onChange: (value: string[]) => void;
  ariaLabel: string;
}

const MAX_NAMED = 3;

/** A multi-select dropdown: an empty selection means "all", so there is no
 * separate All option to keep in sync with the ticked ones. */
function FacetSelect<T extends { value: string; label: string; count: number }>({
  label,
  allLabel,
  options,
  value,
  onChange,
  ariaLabel,
}: FacetSelectProps<T>) {
  if (!options.length) return null;
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => {
        const next = e.target.value as unknown as string | string[];
        onChange(typeof next === "string" ? next.split(",") : next);
      }}
      sx={{ flex: 1, minWidth: 0 }}
      slotProps={{
        htmlInput: { "aria-label": ariaLabel },
        // always float the label: with an empty selection the field shows
        // "All", which would otherwise be drawn on top of an unshrunk label
        inputLabel: { shrink: true },
        select: {
          multiple: true,
          displayEmpty: true,
          renderValue: (selected) => {
            const values = selected as string[];
            if (values.length === 0) return allLabel;
            if (values.length > MAX_NAMED) return `${values.length} selected`;
            return values.map(labelOf).join(", ");
          },
        },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value} dense>
          <Checkbox size="small" checked={value.includes(option.value)} sx={{ p: 0.5, mr: 1 }} />
          <ListItemText primary={option.label} />
          <Typography component="span" variant="mono3" sx={{ ml: 1, opacity: 0.6 }}>
            {option.count}
          </Typography>
        </MenuItem>
      ))}
    </TextField>
  );
}

interface FacetsProps {
  typeOptions: TypeOption[];
  dataTypes: string[];
  onTypesChange: (value: string[]) => void;
  filenumberOptions: FilenumberOption[];
  filenumbers: string[];
  onFilenumbersChange: (value: string[]) => void;
}

/** Type and file-number filters as two multi-select dropdowns on one row. */
export function Facets({
  typeOptions,
  dataTypes,
  onTypesChange,
  filenumberOptions,
  filenumbers,
  onFilenumbersChange,
}: FacetsProps) {
  return (
    <Stack direction="row" spacing={1}>
      <FacetSelect
        label="Type"
        allLabel="All"
        options={typeOptions}
        value={dataTypes}
        onChange={onTypesChange}
        ariaLabel="Filter by data type"
      />
      <FacetSelect
        label="File #"
        allLabel="All"
        options={filenumberOptions}
        value={filenumbers}
        onChange={onFilenumbersChange}
        ariaLabel="Filter by file number"
      />
    </Stack>
  );
}

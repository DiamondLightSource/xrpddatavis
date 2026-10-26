import { Checkbox, ListItemText, MenuItem, Stack, TextField, Typography } from "@mui/material";
import type { FilenumberOption, StatusOption, TypeOption } from "../hooks/useFacets";

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
  // stays in the row, disabled, when there is nothing to choose between -
  // hiding it would make the other field stretch and the row jump around.
  // A lone option is shown as the value, since that is what is being viewed.
  const disabled = options.length < 2;
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <TextField
      select
      size="small"
      label={label}
      disabled={disabled}
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
            if (disabled) return options.length === 1 ? options[0].label : "–";
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

interface StatusSelectProps {
  options: StatusOption[];
  value: string;
  onChange: (value: string) => void;
}

/** Single-choice: pinned, unpinned, errors and fit overlap, so a multi-select
 * would have to pick between "any of" and "all of". */
function StatusSelect({ options, value, onChange }: StatusSelectProps) {
  return (
    <TextField
      select
      size="small"
      label="Show"
      disabled={options.length < 2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ flex: 1, minWidth: 0 }}
      slotProps={{
        inputLabel: { shrink: true },
        // a single select otherwise shows the whole selected item, which
        // would wrap inside the field
        select: { renderValue: (selected) => options.find((o) => o.value === selected)?.label ?? String(selected) },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value} dense>
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
  statusOptions: StatusOption[];
  status: string;
  onStatusChange: (value: string) => void;
}

/** Type and file-number filters as multi-select dropdowns, plus a
 * single-choice status filter, all on one row. */
export function Facets({
  typeOptions,
  dataTypes,
  onTypesChange,
  filenumberOptions,
  filenumbers,
  onFilenumbersChange,
  statusOptions,
  status,
  onStatusChange,
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
      <StatusSelect options={statusOptions} value={status} onChange={onStatusChange} />
    </Stack>
  );
}

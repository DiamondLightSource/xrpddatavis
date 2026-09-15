import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  defaultColumnMapping,
  HeaderDetectionError,
  parseColumnFile,
  type DelimiterChoice,
  type ParsedTable,
} from "../uploadParser";
import { fmtNumber } from "../format";
import type { XYEDataInput } from "../api/types";

interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: XYEDataInput) => Promise<void>;
}

const DELIMITERS: { value: DelimiterChoice; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: ",", label: "Comma ( , )" },
  { value: "tab", label: "Tab" },
  { value: ";", label: "Semicolon ( ; )" },
  { value: "ws", label: "Whitespace" },
];

const DATA_TYPE_SUGGESTIONS = ["pxrd", "iq", "sq", "fq", "gr"];
const NONE = "none";

function columnLabel(names: (string | null)[], index: number): string {
  const name = names[index];
  return name ? `${name} (col ${index + 1})` : `Column ${index + 1}`;
}

function buildPreview(parsed: ParsedTable, xCol: number, yCol: number, eCol: number | null): string {
  const rows = parsed.rows
    .slice(0, 8)
    .map((row) =>
      [row[xCol], row[yCol], eCol !== null ? row[eCol] : null]
        .filter((v): v is number => v !== null)
        .map(fmtNumber)
        .join("   "),
    )
    .join("\n");
  const skippedNote = parsed.skippedRows ? ` (${parsed.skippedRows} row(s) skipped)` : "";
  return (
    `Skipped ${parsed.headerLines} header line(s) · ${parsed.rows.length} data rows, ` +
    `${parsed.columns} columns${skippedNote}\n\n${rows}`
  );
}

export function UploadDialog({ open, onClose, onSubmit }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [delimiter, setDelimiter] = useState<DelimiterChoice>("auto");
  const [headerLinesInput, setHeaderLinesInput] = useState("");
  const [hasHeaderRow, setHasHeaderRow] = useState(false);
  const [needsManualHeader, setNeedsManualHeader] = useState(false);
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState("");
  const [filenumber, setFilenumber] = useState("");
  const [parsed, setParsed] = useState<ParsedTable | null>(null);
  const [xCol, setXCol] = useState(0);
  const [yCol, setYCol] = useState(1);
  const [eCol, setECol] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setFile(null);
    setParsed(null);
    setError(null);
    setNeedsManualHeader(false);
    setName("");
    setDataType("");
    setFilenumber("");
    setHeaderLinesInput("");
    setHasHeaderRow(false);
    setDelimiter("auto");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const reparse = async (
    nextFile: File | null,
    nextDelimiter: DelimiterChoice,
    nextHeaderLinesInput: string,
    nextHasHeaderRow: boolean,
  ) => {
    setParsed(null);
    setError(null);
    setNeedsManualHeader(false);
    if (!nextFile) return;

    const trimmed = nextHeaderLinesInput.trim();
    let headerLines: number | undefined;
    if (trimmed !== "") {
      const parsedCount = Number(trimmed);
      if (!Number.isInteger(parsedCount) || parsedCount < 0) {
        setError("Header lines must be a whole number of 0 or more.");
        return;
      }
      headerLines = parsedCount;
    }

    try {
      const text = await nextFile.text();
      const result = parseColumnFile(text, {
        delimiter: nextDelimiter,
        headerLines,
        hasHeaderRow: headerLines !== undefined ? nextHasHeaderRow : undefined,
      });
      setParsed(result);
      const mapping = defaultColumnMapping(result.columns);
      setXCol(mapping.x);
      setYCol(mapping.y);
      setECol(mapping.e);
    } catch (err) {
      if (err instanceof HeaderDetectionError) setNeedsManualHeader(true);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleFile = (nextFile: File | null) => {
    setFile(nextFile);
    if (nextFile && !name.trim()) setName(nextFile.name.replace(/\.[^./\\]+$/, ""));
    void reparse(nextFile, delimiter, headerLinesInput, hasHeaderRow);
  };

  const handleDelimiter = (value: DelimiterChoice) => {
    setDelimiter(value);
    void reparse(file, value, headerLinesInput, hasHeaderRow);
  };

  const handleHeaderLines = (value: string) => {
    setHeaderLinesInput(value);
    void reparse(file, delimiter, value, hasHeaderRow);
  };

  const handleHasHeaderRow = (value: boolean) => {
    setHasHeaderRow(value);
    void reparse(file, delimiter, headerLinesInput, value);
  };

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const parsedFilenumber = filenumber.trim() === "" ? null : Number(filenumber);
      await onSubmit({
        name: name.trim() || "uploaded",
        x: parsed.rows.map((row) => row[xCol]),
        y: parsed.rows.map((row) => row[yCol]),
        e: eCol !== null ? parsed.rows.map((row) => row[eCol]) : null,
        filenumber: Number.isFinite(parsedFilenumber) ? parsedFilenumber : null,
        data_type: dataType.trim() || null,
        x_label: parsed.columnNames[xCol],
        y_label: parsed.columnNames[yCol],
      });
      handleClose();
    } catch (err) {
      setError(`Could not plot the file: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Upload a column file</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" sx={{ color: "text.muted" }}>
            Columns of x, y and optionally more (an error column, etc), separated by commas,
            tabs, semicolons or spaces. Any preamble - comments, key=value settings, SPEC-style
            metadata - is skipped automatically by scanning for where the data itself starts.
          </Typography>

          <Button component="label" variant="outlined" sx={{ textTransform: "none", alignSelf: "flex-start" }}>
            {file ? file.name : "Choose file"}
            <input
              type="file"
              hidden
              accept=".csv,.tsv,.txt,.dat,.xy,.xye,.gr,.sq,.fq,.iq"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </Button>

          <Stack direction="row" spacing={2} alignItems="flex-start" flexWrap="wrap">
            <TextField
              select
              label="Delimiter"
              size="small"
              value={delimiter}
              onChange={(e) => handleDelimiter(e.target.value as DelimiterChoice)}
              sx={{ minWidth: 160 }}
            >
              {DELIMITERS.map((d) => (
                <MenuItem key={d.value} value={d.value}>
                  {d.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Header lines to skip"
              size="small"
              type="number"
              slotProps={{ htmlInput: { min: 0 } }}
              placeholder="auto-detect"
              value={headerLinesInput}
              onChange={(e) => handleHeaderLines(e.target.value)}
              error={needsManualHeader}
              helperText={
                needsManualHeader
                  ? "Couldn't detect this automatically - enter a count"
                  : "Leave blank to detect automatically"
              }
              sx={{ width: 210 }}
            />
            <FormControlLabel
              sx={{ pt: 0.5 }}
              control={
                <Checkbox
                  checked={hasHeaderRow}
                  disabled={headerLinesInput.trim() === ""}
                  onChange={(e) => handleHasHeaderRow(e.target.checked)}
                />
              }
              label="Next line names the columns"
            />
          </Stack>

          <Stack direction="row" spacing={2} flexWrap="wrap">
            <TextField
              label="Name"
              size="small"
              placeholder="from filename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              sx={{ flex: 1, minWidth: 120 }}
            />
            <Autocomplete
              freeSolo
              options={DATA_TYPE_SUGGESTIONS}
              inputValue={dataType}
              onInputChange={(_, value) => setDataType(value)}
              sx={{ flex: 1, minWidth: 120 }}
              renderInput={(params) => <TextField {...params} label="Data type" size="small" placeholder="optional" />}
            />
            <TextField
              label="File #"
              size="small"
              type="number"
              placeholder="optional"
              value={filenumber}
              onChange={(e) => setFilenumber(e.target.value)}
              sx={{ width: 110 }}
            />
          </Stack>

          {parsed && (
            <>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                <TextField
                  select
                  label="X column"
                  size="small"
                  value={xCol}
                  onChange={(e) => setXCol(Number(e.target.value))}
                  sx={{ flex: 1, minWidth: 130 }}
                >
                  {parsed.columnNames.map((_, i) => (
                    <MenuItem key={i} value={i}>
                      {columnLabel(parsed.columnNames, i)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Y column"
                  size="small"
                  value={yCol}
                  onChange={(e) => setYCol(Number(e.target.value))}
                  sx={{ flex: 1, minWidth: 130 }}
                >
                  {parsed.columnNames.map((_, i) => (
                    <MenuItem key={i} value={i}>
                      {columnLabel(parsed.columnNames, i)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Error column"
                  size="small"
                  value={eCol === null ? NONE : eCol}
                  onChange={(e) => setECol(e.target.value === NONE ? null : Number(e.target.value))}
                  sx={{ flex: 1, minWidth: 130 }}
                >
                  <MenuItem value={NONE}>None</MenuItem>
                  {parsed.columnNames.map((_, i) => (
                    <MenuItem key={i} value={i}>
                      {columnLabel(parsed.columnNames, i)}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <Box
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1,
                  maxHeight: 160,
                  overflow: "auto",
                  backgroundColor: "surface.subtle",
                }}
              >
                <Typography
                  variant="mono3"
                  component="pre"
                  sx={{ m: 0, whiteSpace: "pre-wrap", color: "text.secondary" }}
                >
                  {buildPreview(parsed, xCol, yCol, eCol)}
                </Typography>
              </Box>
            </>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!parsed || submitting}
          onClick={() => void handleSubmit()}
          sx={{ textTransform: "none" }}
        >
          Plot it
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export type DelimiterChoice = "auto" | "," | "tab" | ";" | "ws";
type FixedDelimiter = Exclude<DelimiterChoice, "auto">;

const DELIMITER_CANDIDATES: FixedDelimiter[] = [",", "tab", ";", "ws"];

// how many consecutive same-shaped numeric rows count as "we've found the
// data" - one matching row could be a fluke, three in a row essentially
// never is, even against noisy real instrument-file preambles
const CONFIDENCE_RUN = 3;

export interface ParsedTable {
  /** How many lines were skipped before the data (comments, metadata, a
   * plain header row - whatever the file's preamble contained). */
  headerLines: number;
  delimiterUsed: FixedDelimiter;
  columns: number;
  /** One name per column, e.g. from a SPEC-style `#L` line or a plain
   * header row - null for a column nothing named. */
  columnNames: (string | null)[];
  /** Every well-formed data row, in file order, as parsed numbers. */
  rows: number[][];
  /** Rows at/after the data start that didn't fit and were dropped. */
  skippedRows: number;
}

export interface ParseOptions {
  delimiter: DelimiterChoice;
  /** Skip exactly this many lines before looking for data, instead of
   * scanning for where it starts. Set this when auto-detection fails. */
  headerLines?: number;
  /** Only meaningful with `headerLines`: treat the line right after those as
   * a plain column-name row (no leading #) rather than the first data row. */
  hasHeaderRow?: boolean;
}

/** Thrown when auto-detection can't confidently find where the data starts -
 * the caller should ask the user for `headerLines` and retry. */
export class HeaderDetectionError extends Error {}

function splitDelimited(line: string, mode: FixedDelimiter): string[] {
  if (mode === "ws") return line.trim().split(/\s+/);
  if (mode === "tab") return line.split("\t");
  return line.split(mode);
}

function tokenise(line: string, mode: FixedDelimiter): string[] {
  return splitDelimited(line, mode)
    .map((cell) => cell.trim())
    .filter((cell) => cell !== "");
}

function isNumericRow(tokens: string[]): boolean {
  return tokens.length >= 2 && tokens.every((t) => Number.isFinite(Number(t)));
}

/**
 * Scan for the first run of `CONFIDENCE_RUN` consecutive lines that all
 * split, under some delimiter, into the same number of purely numeric
 * tokens. This is how real instrument files are found - a PDFgetX2
 * .gr/.sq/.fq/.iq file's preamble runs to well over a hundred lines of
 * `key=value` settings and SPEC-style `#`-prefixed metadata, ending with a
 * `##### start data` marker - rather than assume a fixed header length,
 * this looks past all of it for wherever the data itself actually begins.
 */
function findDataRun(
  lines: string[],
  delimiters: FixedDelimiter[],
): { startIndex: number; delimiter: FixedDelimiter; columns: number } | null {
  for (const mode of delimiters) {
    for (let i = 0; i < lines.length; i++) {
      const tokens = tokenise(lines[i], mode);
      if (!isNumericRow(tokens)) continue;
      const columns = tokens.length;

      let matched = 1;
      for (let j = i + 1; j < lines.length && matched < CONFIDENCE_RUN; j++) {
        const next = tokenise(lines[j], mode);
        if (next.length !== columns || !isNumericRow(next)) break;
        matched++;
      }
      if (matched >= Math.min(CONFIDENCE_RUN, lines.length - i)) {
        return { startIndex: i, delimiter: mode, columns };
      }
    }
  }
  return null;
}

/** Delimiter/column count from a single line, trying each candidate in
 * turn - used once the user has told us exactly where the data starts. */
function detectFirstRow(
  line: string,
  delimiters: FixedDelimiter[],
): { delimiter: FixedDelimiter; columns: number } | null {
  for (const mode of delimiters) {
    const tokens = tokenise(line, mode);
    if (isNumericRow(tokens)) return { delimiter: mode, columns: tokens.length };
  }
  return null;
}

/**
 * A plain (no `#`) column-name row immediately above the data - the
 * convention a simple exported CSV/TSV uses instead of SPEC-style metadata.
 * Only counts if it splits into exactly as many fields as the data itself
 * and isn't just another numeric row.
 */
function findPlainHeaderRow(
  lines: string[],
  startIndex: number,
  delimiter: FixedDelimiter,
  columns: number,
): string[] | null {
  if (startIndex === 0) return null;
  const candidate = lines[startIndex - 1];
  if (candidate.startsWith("#") || candidate.startsWith("//")) return null;
  const tokens = tokenise(candidate, delimiter);
  if (tokens.length !== columns || isNumericRow(tokens)) return null;
  return tokens;
}

/** The nearest SPEC-style `#L name1 name2 ...` column-name line at or before
 * `beforeIndex` - the convention PDFgetX2 and SPEC-derived files use. */
function findSpecColumnNames(lines: string[], beforeIndex: number): string[] | null {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const match = /^#L\s+(.*)/i.exec(lines[i]);
    if (match) return match[1].trim().split(/\s+/);
  }
  return null;
}

function extractRows(
  lines: string[],
  startIndex: number,
  delimiter: FixedDelimiter,
  columns: number,
): { rows: number[][]; skipped: number } {
  const rows: number[][] = [];
  let skipped = 0;
  for (let i = startIndex; i < lines.length; i++) {
    const tokens = tokenise(lines[i], delimiter);
    if (tokens.length !== columns || !isNumericRow(tokens)) {
      skipped++;
      continue;
    }
    rows.push(tokens.map(Number));
  }
  return { rows, skipped };
}

function namesToColumns(names: string[] | null, columns: number): (string | null)[] {
  return Array.from({ length: columns }, (_, i) => names?.[i] ?? null);
}

export function parseColumnFile(text: string, options: ParseOptions): ParsedTable {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) throw new Error("The file is empty.");

  const delimiters = options.delimiter === "auto" ? DELIMITER_CANDIDATES : [options.delimiter];

  let startIndex: number;
  let delimiter: FixedDelimiter;
  let columns: number;
  let columnNames: (string | null)[];

  if (options.headerLines === undefined) {
    const found = findDataRun(lines, delimiters);
    if (!found) {
      throw new HeaderDetectionError(
        "Could not automatically find where the data starts - enter the number of header lines to skip below.",
      );
    }
    ({ startIndex, delimiter, columns } = found);
    columnNames = namesToColumns(
      findSpecColumnNames(lines, startIndex) ??
        findPlainHeaderRow(lines, startIndex, delimiter, columns),
      columns,
    );
  } else {
    if (options.headerLines < 0 || options.headerLines >= lines.length) {
      throw new Error(
        `The file only has ${lines.length} line(s) - ${options.headerLines} is too many to skip.`,
      );
    }
    let dataStart = options.headerLines;
    let headerRowNames: string[] | null = null;
    if (options.hasHeaderRow) {
      const mode = options.delimiter === "auto" ? "ws" : options.delimiter;
      headerRowNames = tokenise(lines[dataStart], mode);
      dataStart += 1;
    }

    if (dataStart >= lines.length) {
      throw new Error("Nothing is left after skipping the header - check the line count.");
    }
    // Trust the user's line count outright: look at just the first
    // remaining line, not a multi-row run - that confidence check is only
    // there to blindly find data in the first place, and would otherwise
    // reject a real (if short, or trailed by one stray line) dataset the
    // user has already told us the exact start of.
    const found = detectFirstRow(lines[dataStart], delimiters);
    if (!found) {
      throw new Error(
        "The line after the header doesn't look like numeric data - check the header line " +
          "count, the delimiter, and the \"next line names the columns\" option.",
      );
    }
    startIndex = dataStart;
    delimiter = found.delimiter;
    columns = found.columns;
    columnNames = namesToColumns(
      headerRowNames ?? findSpecColumnNames(lines, startIndex),
      columns,
    );
  }

  const { rows, skipped } = extractRows(lines, startIndex, delimiter, columns);
  if (!rows.length) throw new Error("No valid numeric rows found.");

  return {
    headerLines: startIndex,
    delimiterUsed: delimiter,
    columns,
    columnNames,
    rows,
    skippedRows: skipped,
  };
}

/** A sensible default column mapping: x is first, y is second, and (when
 * there's a plausible candidate) the error column is the last one - true
 * for a classic 3-column x/y/e file and for PDFgetX2's 4-column
 * x/y/dx/dy files alike (dx, the x error, isn't representable and is
 * simply left unmapped). */
export function defaultColumnMapping(columns: number): { x: number; y: number; e: number | null } {
  return { x: 0, y: Math.min(1, columns - 1), e: columns >= 3 ? columns - 1 : null };
}

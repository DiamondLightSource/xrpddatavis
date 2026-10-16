import { describe, expect, it } from "vitest";
import { HeaderDetectionError, defaultColumnMapping, parseColumnFile } from "./uploadParser";

describe("parseColumnFile (auto-detect)", () => {
  it("parses a plain whitespace-delimited xye file", () => {
    const table = parseColumnFile("1 10 0.1\n2 20 0.2\n3 30 0.3\n", { delimiter: "auto" });
    expect(table.headerLines).toBe(0);
    expect(table.delimiterUsed).toBe("ws");
    expect(table.columns).toBe(3);
    expect(table.columnNames).toEqual([null, null, null]);
    expect(table.rows).toEqual([
      [1, 10, 0.1],
      [2, 20, 0.2],
      [3, 30, 0.3],
    ]);
    expect(table.skippedRows).toBe(0);
  });

  it("reads names from a plain CSV header row", () => {
    const table = parseColumnFile("tth,intensity\r\n1,5\r\n2,6\r\n3,7", { delimiter: "auto" });
    expect(table.delimiterUsed).toBe(",");
    expect(table.headerLines).toBe(1);
    expect(table.columnNames).toEqual(["tth", "intensity"]);
    expect(table.rows).toHaveLength(3);
  });

  it("skips a PDFgetX2-style preamble and reads SPEC #L names", () => {
    const text = [
      "[DEFAULT]",
      "version = 1.0",
      "dataformat = QA",
      "#L r G(r) dr dG(r)",
      "##### start data",
      "0.01 0.5 0 0.01",
      "0.02 0.6 0 0.01",
      "0.03 0.7 0 0.01",
      "0.04 0.8 0 0.01",
    ].join("\n");
    const table = parseColumnFile(text, { delimiter: "auto" });
    expect(table.headerLines).toBe(5);
    expect(table.columns).toBe(4);
    expect(table.columnNames).toEqual(["r", "G(r)", "dr", "dG(r)"]);
    expect(table.rows).toHaveLength(4);
  });

  it("counts malformed rows after the data starts as skipped", () => {
    const table = parseColumnFile("1 2\n3 4\n5 6\noops\n7 8", { delimiter: "ws" });
    expect(table.rows).toHaveLength(4);
    expect(table.skippedRows).toBe(1);
  });

  it("accepts a file shorter than the confidence run", () => {
    expect(parseColumnFile("1\t2\n3\t4", { delimiter: "auto" }).rows).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("rejects an empty file", () => {
    expect(() => parseColumnFile("\n  \n", { delimiter: "auto" })).toThrow("empty");
  });

  it("throws HeaderDetectionError when no data run is found", () => {
    expect(() => parseColumnFile("a b\nc d\n1", { delimiter: "auto" })).toThrow(
      HeaderDetectionError,
    );
  });
});

describe("parseColumnFile (explicit header lines)", () => {
  it("trusts the given header count", () => {
    const table = parseColumnFile("junk\nmore junk\n1;2\n3;4", {
      delimiter: "auto",
      headerLines: 2,
    });
    expect(table.headerLines).toBe(2);
    expect(table.delimiterUsed).toBe(";");
    expect(table.rows).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("reads a header row after the skipped lines", () => {
    const table = parseColumnFile("junk\nx y\n1 2\n3 4", {
      delimiter: "auto",
      headerLines: 1,
      hasHeaderRow: true,
    });
    expect(table.columnNames).toEqual(["x", "y"]);
    expect(table.rows).toHaveLength(2);
  });

  it("rejects a header count outside the file", () => {
    expect(() => parseColumnFile("1 2\n3 4", { delimiter: "auto", headerLines: 2 })).toThrow(
      "too many to skip",
    );
    expect(() => parseColumnFile("1 2\n3 4", { delimiter: "auto", headerLines: -1 })).toThrow();
  });

  it("rejects nothing left after the header row", () => {
    expect(() =>
      parseColumnFile("junk\nx y", { delimiter: "auto", headerLines: 1, hasHeaderRow: true }),
    ).toThrow("Nothing is left");
  });

  it("rejects a non-numeric first data line", () => {
    expect(() => parseColumnFile("junk\nx y\n1 2", { delimiter: "auto", headerLines: 1 })).toThrow(
      "doesn't look like numeric data",
    );
  });
});

describe("defaultColumnMapping", () => {
  it("maps x/y and uses the last column as errors when there are 3+", () => {
    expect(defaultColumnMapping(2)).toEqual({ x: 0, y: 1, e: null });
    expect(defaultColumnMapping(3)).toEqual({ x: 0, y: 1, e: 2 });
    expect(defaultColumnMapping(4)).toEqual({ x: 0, y: 1, e: 3 });
  });

  it("copes with a single column", () => {
    expect(defaultColumnMapping(1)).toEqual({ x: 0, y: 0, e: null });
  });
});

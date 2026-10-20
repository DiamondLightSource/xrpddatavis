import { useEffect, useMemo } from "react";
import type { PlotSummary } from "../api/types";
import { usePersistentState } from "./usePersistentState";

export const UNTYPED = "__untyped__";

export interface TypeOption {
  value: string;
  label: string;
  count: number;
}

export interface FilenumberOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Type and file-number filters for the sidebar, computed from whatever
 * plots are actually live - an option only exists while at least one plot
 * needs it. Both are multi-select; an empty selection means "all". File
 * numbers are scoped to the selected types, so changing type shows only the
 * file numbers relevant to it - a file number that is still offered stays
 * selected, so "file 1" can be combined with any type.
 */
export function useFacets(plots: PlotSummary[]) {
  const [dataTypes, setDataTypes] = usePersistentState<string[]>("facetDataTypes", []);
  const [filenumbers, setFilenumbers] = usePersistentState<string[]>("facetFilenumbers", []);

  const typeOptions = useMemo<TypeOption[]>(() => {
    const counts = new Map<string, number>();
    let untyped = 0;
    for (const plot of plots) {
      if (plot.data_type) counts.set(plot.data_type, (counts.get(plot.data_type) ?? 0) + 1);
      else untyped += 1;
    }
    const options: TypeOption[] = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([type, count]) => ({ value: type, label: type.toUpperCase(), count }));
    if (untyped) options.push({ value: UNTYPED, label: "Untyped", count: untyped });
    return options;
  }, [plots]);

  const byType = useMemo(
    () =>
      dataTypes.length === 0
        ? plots
        : plots.filter((p) => dataTypes.includes(p.data_type || UNTYPED)),
    [plots, dataTypes],
  );

  const filenumberOptions = useMemo<FilenumberOption[]>(() => {
    const counts = new Map<number, number>();
    for (const plot of byType) {
      if (plot.filenumber !== null) counts.set(plot.filenumber, (counts.get(plot.filenumber) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, count]) => ({ value: String(number), label: `#${number}`, count }));
  }, [byType]);

  // drop selected values that are no longer offered (e.g. that plot
  // expired, or changing type changed which file numbers apply)
  useEffect(() => {
    const offered = new Set(typeOptions.map((o) => o.value));
    if (dataTypes.some((v) => !offered.has(v))) setDataTypes(dataTypes.filter((v) => offered.has(v)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeOptions]);

  useEffect(() => {
    const offered = new Set(filenumberOptions.map((o) => o.value));
    if (filenumbers.some((v) => !offered.has(v))) {
      setFilenumbers(filenumbers.filter((v) => offered.has(v)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filenumberOptions]);

  const visible = useMemo(
    () =>
      filenumbers.length === 0
        ? byType
        : byType.filter((p) => filenumbers.includes(String(p.filenumber))),
    [byType, filenumbers],
  );

  const reset = () => {
    setDataTypes([]);
    setFilenumbers([]);
  };

  return {
    dataTypes,
    setTypes: setDataTypes,
    filenumbers,
    setFilenumbers,
    typeOptions,
    filenumberOptions,
    visible,
    reset,
    isActive: dataTypes.length > 0 || filenumbers.length > 0,
  };
}

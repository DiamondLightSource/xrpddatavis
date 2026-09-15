import { useEffect, useMemo } from "react";
import type { PlotSummary } from "../api/types";
import { usePersistentState } from "./usePersistentState";

export const ALL = "__all__";
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
 * Type tabs and file-number chips for the sidebar, computed from whatever
 * plots are actually live - a tab/chip only exists while at least one plot
 * needs it. File numbers are scoped to the active type, so switching type
 * shows only the file numbers relevant to it.
 */
export function useFacets(plots: PlotSummary[]) {
  const [dataType, setDataType] = usePersistentState<string>("facetDataType", ALL);
  const [filenumber, setFilenumber] = usePersistentState<string>("facetFilenumber", ALL);

  const typeOptions = useMemo<TypeOption[]>(() => {
    const counts = new Map<string, number>();
    let untyped = 0;
    for (const plot of plots) {
      if (plot.data_type) counts.set(plot.data_type, (counts.get(plot.data_type) ?? 0) + 1);
      else untyped += 1;
    }
    if (counts.size === 0 && untyped === 0) return [];
    const options: TypeOption[] = [{ value: ALL, label: "All", count: plots.length }];
    [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([type, count]) => options.push({ value: type, label: type.toUpperCase(), count }));
    if (untyped) options.push({ value: UNTYPED, label: "Untyped", count: untyped });
    return options;
  }, [plots]);

  const byType = useMemo(
    () =>
      dataType === ALL
        ? plots
        : dataType === UNTYPED
          ? plots.filter((p) => !p.data_type)
          : plots.filter((p) => p.data_type === dataType),
    [plots, dataType],
  );

  const filenumberOptions = useMemo<FilenumberOption[]>(() => {
    const counts = new Map<number, number>();
    for (const plot of byType) {
      if (plot.filenumber !== null) counts.set(plot.filenumber, (counts.get(plot.filenumber) ?? 0) + 1);
    }
    if (counts.size < 2) return [];
    const options: FilenumberOption[] = [{ value: ALL, label: "All", count: byType.length }];
    [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([number, count]) =>
        options.push({ value: String(number), label: `#${number}`, count }),
      );
    return options;
  }, [byType]);

  // reset a facet once its current value is no longer offered (e.g. that
  // plot expired, or switching type tab changed which file numbers apply)
  useEffect(() => {
    if (typeOptions.length && !typeOptions.some((o) => o.value === dataType)) setDataType(ALL);
    if (!typeOptions.length && dataType !== ALL) setDataType(ALL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeOptions]);

  useEffect(() => {
    if (filenumberOptions.length && !filenumberOptions.some((o) => o.value === filenumber)) {
      setFilenumber(ALL);
    }
    if (!filenumberOptions.length && filenumber !== ALL) setFilenumber(ALL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filenumberOptions]);

  const visible = useMemo(
    () => (filenumber === ALL ? byType : byType.filter((p) => String(p.filenumber) === filenumber)),
    [byType, filenumber],
  );

  const setType = (value: string) => {
    setDataType(value);
    setFilenumber(ALL); // switching category makes the previous file-number choice meaningless
  };

  return {
    dataType,
    setType,
    filenumber,
    setFilenumber,
    typeOptions,
    filenumberOptions,
    visible,
    isActive: dataType !== ALL || filenumber !== ALL,
  };
}

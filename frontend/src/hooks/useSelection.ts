import { useCallback, useEffect, useRef } from "react";
import { usePersistentState } from "./usePersistentState";

/** Which plot ids are ticked in the table - persisted per browser, pruned to
 * whatever is still live on the server. When plots first arrive and nothing
 * is selected, `newestId` is ticked so the chart isn't empty - once per page
 * load, so clearing the selection afterwards sticks. */
export function useSelection(liveIds: string[], newestId: string | null) {
  const [selected, setSelected] = usePersistentState<string[]>("selected", []);

  useEffect(() => {
    const live = new Set(liveIds);
    setSelected((prev) => {
      const pruned = prev.filter((id) => live.has(id));
      return pruned.length === prev.length ? prev : pruned;
    });
    // only re-run when the set of live ids changes, not on every `setSelected` identity change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveIds.join(",")]);

  const autoTicked = useRef(false);
  useEffect(() => {
    if (autoTicked.current || newestId === null) return;
    autoTicked.current = true;
    setSelected((prev) => (prev.length === 0 ? [newestId] : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId]);

  const toggle = useCallback(
    (id: string, force?: boolean) => {
      setSelected((prev) => {
        const isSelected = prev.includes(id);
        const next = force ?? !isSelected;
        if (next === isSelected) return prev;
        return next ? [...prev, id] : prev.filter((existing) => existing !== id);
      });
    },
    [setSelected],
  );

  const selectMany = useCallback(
    (ids: string[]) => {
      setSelected((prev) => Array.from(new Set([...prev, ...ids])));
    },
    [setSelected],
  );

  const deselectMany = useCallback(
    (ids: string[]) => {
      const drop = new Set(ids);
      setSelected((prev) => prev.filter((id) => !drop.has(id)));
    },
    [setSelected],
  );

  const clear = useCallback(() => setSelected([]), [setSelected]);

  return { selected, toggle, selectMany, deselectMany, clear };
}

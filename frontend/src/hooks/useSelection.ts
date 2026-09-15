import { useCallback, useEffect } from "react";
import { usePersistentState } from "./usePersistentState";

/** Which plot ids are ticked in the table - persisted per browser, pruned to
 * whatever is still live on the server. */
export function useSelection(liveIds: string[]) {
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

  const clear = useCallback(() => setSelected([]), [setSelected]);

  return { selected, toggle, selectMany, clear };
}

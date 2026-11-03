/**
 * State updater for a list whose rows share one "open menu" id.
 *
 * Pressing another row's trigger opens that row and, in the same event, the
 * old row's menu reports that it closed. The close comes last, so a plain
 * `setOpen(open ? id : null)` cleared the row that had just opened. A close
 * only clears the id when it is still this row's.
 */
export function rowMenuOpenChange<T>(id: T, open: boolean) {
  return (current: T | null): T | null =>
    open ? id : current === id ? null : current;
}

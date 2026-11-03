/**
 * The row «Eliminar» of the post site's Incidents tab deleted the incident at
 * once, with no question. A press that lands on the open menu's «Eliminar»
 * (the menu covers the ⋮ of the next rows) therefore deleted a record. It now
 * asks first, like «Eliminar» in the incident list (/dispatch-tickets).
 */
export async function confirmThenDelete(
  ask: () => Promise<boolean>,
  remove: () => Promise<unknown>,
): Promise<boolean> {
  if (!(await ask())) return false;
  await remove();

  return true;
}

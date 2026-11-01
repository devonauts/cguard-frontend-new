/** Show the page? Decided only once the session is read. */
export function puedeVerLaRuta(
  auth: { user?: any; loading?: boolean; hasAny?: (p: string[]) => boolean },
  permisos: string[],
): boolean {
  // Still reading the session: ProtectedRoute shows its own loader.
  if (auth.loading || !auth.user) return true;

  return !!auth.user.isSuperadmin || !!auth.hasAny?.(permisos);
}

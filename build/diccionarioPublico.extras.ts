/**
 * Keys the public app builds AT RUNTIME, which the source scan of
 * build/diccionarioPublico.ts cannot see (for example `t(`errors.${code}`)`).
 *
 * Each entry is a full key or a subtree prefix ("errors.signIn" keeps the
 * whole subtree). Empty on 2026-10-26: every key the public screens use is a
 * string literal in their own source. The build fails and names the key if a
 * new public screen needs an entry here.
 */
export const CLAVES_EXTRA: string[] = [];

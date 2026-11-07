/**
 * Keys the public app builds AT RUNTIME, which the source scan of
 * build/diccionarioPublico.ts cannot see (for example `t(`errors.${code}`)`).
 *
 * Each entry is a full key or a subtree prefix ("errors.signIn" keeps the
 * whole subtree).
 *
 * `publico.accesoNegado`: the «no access» screen (src/publico/AccesoNegado.tsx)
 * builds `publico.accesoNegado.${motivo}.titulo|texto`. Without this entry the
 * public dictionary dropped those texts and a company waiting for trial
 * approval saw the raw key «publico.accesoNegado.review.titulo» (2026-11-06).
 */
export const CLAVES_EXTRA: string[] = ["publico.accesoNegado"];

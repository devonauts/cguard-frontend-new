/**
 * Messaging: UNA bandeja para todo. Antes eran dos pantallas («Mensajes
 * Operativos» y «Mensajes de Clientes») que pedían la misma lista y la partían
 * por tipo de destinatario. Ahora la lista es una y se filtra aquí.
 */
export type Filtro = "todos" | "equipo" | "clientes" | "grupos";

export type Tipo = "grupo" | "guard" | "staff" | "client";

export type ConvLike = {
  isGroup?: boolean;
  kind?: string;
  recipientType: string;
  recipientName?: string | null;
  lastMessagePreview?: string | null;
};

export function tipoDe(c: ConvLike): Tipo {
  if (c.isGroup || c.kind === "group") return "grupo";
  if (c.recipientType === "client") return "client";
  if (c.recipientType === "staff") return "staff";

  return "guard";
}

/** «Equipo» = vigilantes, supervisores y personal de oficina (directos). */
export function enFiltro(c: ConvLike, f: Filtro): boolean {
  const tipo = tipoDe(c);

  if (f === "grupos") return tipo === "grupo";
  if (f === "clientes") return tipo === "client";
  if (f === "equipo") return tipo === "guard" || tipo === "staff";

  return true;
}

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Búsqueda en la lista: por nombre o por el último mensaje, sin tildes. */
export function coincide(c: ConvLike, texto: string): boolean {
  const q = plano(texto.trim());

  if (!q) return true;

  return (
    plano(c.recipientName || "").includes(q) ||
    plano(c.lastMessagePreview || "").includes(q)
  );
}

/** Cuántos hilos SIN LEER hay en cada filtro (los números de las pestañas). */
export function sinLeerPorFiltro(
  cs: Array<ConvLike & { unreadCount?: number }>,
): Record<Filtro, number> {
  const out: Record<Filtro, number> = { todos: 0, equipo: 0, clientes: 0, grupos: 0 };

  for (const c of cs) {
    if (!(c.unreadCount || 0)) continue;
    for (const f of ["todos", "equipo", "clientes", "grupos"] as Filtro[])
      if (enFiltro(c, f)) out[f]++;
  }

  return out;
}

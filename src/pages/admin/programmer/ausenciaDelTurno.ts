/**
 * What an `absent` shift was, for «Estado de turnos». The shift row only says
 * `absent`; the Horario mark of that guard and day says why: vacation, leave,
 * a day off or a falta. Every absent shift read «Falta», vacations included
 * (QA 2026-11-02, N3). Without a mark it is a neutral «Ausente».
 */
export interface EtiquetaDeAusencia {
  key: string;
  defaultValue: string;
  tone: "bad" | "info" | "neutral";
}

const POR_MARCA: Record<string, EtiquetaDeAusencia> = {
  F: { key: "ui.ShiftStatus.falta", defaultValue: "Falta", tone: "bad" },
  V: { key: "ui.codeTones.vacaciones", defaultValue: "Vacaciones", tone: "info" },
  PM: { key: "ui.codeTones.permiso", defaultValue: "Permiso", tone: "info" },
  L: { key: "ui.codeTones.libre", defaultValue: "Libre", tone: "neutral" },
};

export function etiquetaDeAusencia(marca?: string | null): EtiquetaDeAusencia {
  return (
    POR_MARCA[String(marca || "").toUpperCase()] || {
      key: "ui.ShiftStatus.ausente",
      defaultValue: "Ausente",
      tone: "bad",
    }
  );
}

/** `guardId|YYYY-MM-DD` → the type of the Horario mark (first one wins). */
export function marcasPorDia(
  filas: Array<{ guardId?: string | null; date?: string | null; type?: string | null }>,
): Map<string, string> {
  const m = new Map<string, string>();

  for (const o of filas) {
    if (!o?.guardId || !o?.date || !o?.type) continue;
    const k = `${o.guardId}|${String(o.date).slice(0, 10)}`;

    if (!m.has(k)) m.set(k, String(o.type));
  }

  return m;
}

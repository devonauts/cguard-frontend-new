import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";

import { ApiService } from "@/services/api/apiService";

export type RotationStyle = {
  id: string;
  name: string;
  dayShifts: number;
  nightShifts: number;
  restDays: number;
  isSystem?: boolean;
};

/**
 * LA SECUENCIA PROPIA DE UN VIGILANTE — distinta de la de su estación.
 *
 * `RotationStyleSelect` elige el patrón de la ESTACIÓN, que es el que hereda
 * todo el mundo y sigue siendo el caso normal. Esto es lo otro: la excepción
 * que hay estaciones que necesitan.
 *
 *   Batallón Sur trabaja 07:00–23:00 en dos bloques. El fijo 1 hace 2 mañanas y
 *   2 tardes; el fijo 2 hace 3 mañanas y 2 tardes. Mismo puesto, dos ciclos.
 *
 * Vacío = hereda el de la estación, que es el defecto y lo que ve quien no toca
 * nada. El segundo campo se llama «2.º bloque» y no «noche» a propósito: en una
 * estación de dos tramos diurnos ese tramo es la TARDE, y llamarlo noche hacía
 * que el operador no lo reconociera como lo que acababa de configurar.
 */
export default function SecuenciaPropiaSelect({
  tenantId,
  value,
  onChange,
  /** Cómo describir el primer tramo del ciclo en esta estación. */
  etiquetaPrimerBloque = "día",
  /** Cómo describir el segundo tramo del ciclo en esta estación. */
  etiquetaSegundoBloque = "noche",
  /** Nombre del patrón de la estación, para nombrar la opción heredada. */
  patronDeLaEstacion,
  /** Texto de la opción vacía. Un sacafranco no «hereda» nada: tapa huecos. */
  etiquetaPorDefecto,
}: {
  tenantId: string;
  value: string;
  onChange: (id: string) => void;
  etiquetaPrimerBloque?: string;
  etiquetaSegundoBloque?: string;
  patronDeLaEstacion?: string | null;
  etiquetaPorDefecto?: string;
}) {
  const [styles, setStyles] = useState<RotationStyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [cWork, setCWork] = useState("2");
  const [cNight, setCNight] = useState("2");
  const [cRest, setCRest] = useState("2");

  useEffect(() => {
    let vivo = true;

    (async () => {
      setLoading(true);
      try {
        const res: any = await ApiService.get(
          `/tenant/${tenantId}/rotation-styles`,
        );

        if (vivo)
          setStyles(
            Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [],
          );
      } catch {
        /* se queda vacío */
      } finally {
        if (vivo) setLoading(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [tenantId]);

  const describir = (s: RotationStyle) => {
    const descanso =
      s.restDays === 0 ? "sin descanso" : `${s.restDays} descansa`;

    return (s.nightShifts || 0) > 0
      ? `${s.name} — ${s.dayShifts} ${etiquetaPrimerBloque} · ${s.nightShifts} ${etiquetaSegundoBloque} · ${descanso}`
      : `${s.name} — ${s.dayShifts} trabaja · ${descanso}`;
  };

  // Un mismo ciclo puede estar duplicado en la empresa (pasa: los patrones se
  // crearon al vuelo varias veces). Se enseña uno por combinación.
  const opciones = useMemo(() => {
    const vistos = new Set<string>();

    return styles.filter((s) => {
      const k = `${s.dayShifts}|${s.nightShifts}|${s.restDays}`;

      if (vistos.has(k) && s.id !== value) return false;
      vistos.add(k);

      return true;
    });
  }, [styles, value]);

  const crear = async () => {
    const work = Math.max(0, parseInt(cWork, 10) || 0);
    const night = Math.max(0, parseInt(cNight, 10) || 0);
    const rest = Math.max(0, parseInt(cRest, 10) || 0);

    if (work + night < 1) {
      toast.error("La secuencia necesita al menos un día de trabajo.");

      return;
    }
    const name = night > 0 ? `${work}-${night}-${rest}` : `${work}-${rest}`;
    // Reutiliza uno idéntico en vez de acumular duplicados en el catálogo.
    const igual = styles.find(
      (s) =>
        s.dayShifts === work && s.nightShifts === night && s.restDays === rest,
    );

    if (igual) {
      onChange(igual.id);
      setAbierto(false);

      return;
    }
    setCreating(true);
    try {
      const res: any = await ApiService.post(
        `/tenant/${tenantId}/rotation-style`,
        {
          data: {
            name,
            description: `${work} ${etiquetaPrimerBloque} · ${night} ${etiquetaSegundoBloque} · ${rest} descansa`,
            dayShifts: work,
            nightShifts: night,
            restDays: rest,
          },
        },
      );
      const creado = res?.data ?? res;

      if (creado?.id) {
        setStyles((prev) => [...prev, creado]);
        onChange(creado.id);
        setAbierto(false);
      }
    } catch (e: any) {
      toast.error(
        e?.data?.message || e?.message || "No se pudo crear la secuencia",
      );
    } finally {
      setCreating(false);
    }
  };

  const campo = "w-full rounded-xl border px-3 py-2 text-sm";
  const estiloCampo = {
    borderColor: "var(--hairline)",
    background: "var(--glass-sunken)",
  } as const;

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="animate-spin" size={12} /> Cargando secuencias…
        </div>
      ) : (
        <select
          className={campo}
          style={estiloCampo}
          value={value}
          onChange={(e) => {
            if (e.target.value === "__nueva__") {
              setAbierto(true);
            } else {
              onChange(e.target.value);
            }
          }}
        >
          <option value="">
            {etiquetaPorDefecto ||
              (patronDeLaEstacion
                ? `La de la estación (${patronDeLaEstacion})`
                : "La de la estación")}
          </option>
          {opciones.map((s) => (
            <option key={s.id} value={s.id}>
              {describir(s)}
            </option>
          ))}
          <option value="__nueva__">+ Crear una secuencia…</option>
        </select>
      )}

      {abierto && (
        <div
          className="rounded-xl border p-3"
          style={{
            borderColor: "var(--brand-line)",
            background: "var(--brand-wash)",
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold">Nueva secuencia</span>
            <button
              aria-label="Cerrar"
              className="cg-focus rounded-md p-1"
              type="button"
              onClick={() => setAbierto(false)}
            >
              <X size={13} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[11px] text-muted-foreground">
              Turnos de {etiquetaPrimerBloque}
              <input
                className={`${campo} mt-1`}
                min={0}
                style={estiloCampo}
                type="number"
                value={cWork}
                onChange={(e) => setCWork(e.target.value)}
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Turnos de {etiquetaSegundoBloque}
              <input
                className={`${campo} mt-1`}
                min={0}
                style={estiloCampo}
                type="number"
                value={cNight}
                onChange={(e) => setCNight(e.target.value)}
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Descansos
              <input
                className={`${campo} mt-1`}
                min={0}
                style={estiloCampo}
                type="number"
                value={cRest}
                onChange={(e) => setCRest(e.target.value)}
              />
            </label>
          </div>
          <button
            className="cg-focus mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={creating}
            style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
            type="button"
            onClick={crear}
          >
            {creating ? (
              <Loader2 className="animate-spin" size={12} />
            ) : (
              <Plus size={12} />
            )}{" "}
            Crear y usar
          </button>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Search } from "lucide-react";

import { ApiService } from "@/services/api/apiService";
import { todosLosVigilantes } from "@/lib/listarCompleto";
import { FIELD_CLS_LG } from "@/pages/admin/clientes/components/_shared/tab-kit";

export interface VigilanteOpcion {
  id: string;
  label: string;
}

/**
 * Los vigilantes DISPONIBLES de la empresa: con ficha activa y sin ninguna
 * asignación activa (fijo o sacafranco). Es la misma regla que el popup de
 * asignar de la ficha de la estación.
 */
export function useVigilantesDisponibles(tenantId: string, abierto: boolean) {
  const [todos, setTodos] = useState<VigilanteOpcion[]>([]);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!abierto || !tenantId) return;
    let viva = true;

    setCargando(true);
    Promise.all([
      todosLosVigilantes(tenantId),
      ApiService.get(`/tenant/${tenantId}/guard-assignments?status=active`),
    ])
      .then(([g, a]: any[]) => {
        if (!viva) return;
        const lista = Array.isArray(g) ? g : (g?.rows ?? []);

        setTodos(
          lista
            .map((r: any) => ({
              id: String(r.guardId || r.id || r.value || ""),
              label: r.fullName || r.name || r.label || r.email || "",
            }))
            .filter((x: VigilanteOpcion) => x.id),
        );
        const filas = Array.isArray(a) ? a : (a?.rows ?? []);

        setOcupados(
          new Set(
            filas.map((x: any) => String(x.guardId || x.guard?.id || "")),
          ),
        );
      })
      .catch(() => {
        if (viva) {
          setTodos([]);
          setOcupados(new Set());
        }
      })
      .finally(() => viva && setCargando(false));

    return () => {
      viva = false;
    };
  }, [tenantId, abierto]);

  const disponibles = useMemo(
    () => todos.filter((g) => !ocupados.has(g.id)),
    [todos, ocupados],
  );

  return { disponibles, todos, cargando };
}

/** El buscador: escribe, elige; sólo entre los disponibles. */
export default function BuscadorDeVigilante({
  opciones,
  cargando,
  value,
  onChange,
  excluir,
}: {
  opciones: VigilanteOpcion[];
  cargando?: boolean;
  value: string;
  onChange: (id: string) => void;
  /** Ids que no deben ofrecerse (p. ej. la persona a la que se sustituye). */
  excluir?: string[];
}) {
  const { t } = useTranslation();
  const [filtro, setFiltro] = useState("");
  const [abierta, setAbierta] = useState(false);
  const elegido = opciones.find((g) => g.id === value);
  const lista = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const base = opciones.filter((g) => !excluir?.includes(g.id));

    return q ? base.filter((g) => g.label.toLowerCase().includes(q)) : base;
  }, [opciones, filtro, excluir]);

  if (cargando)
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="animate-spin" size={12} /> {t("common.loading")}
      </div>
    );

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        size={14}
        style={{ color: "var(--ink-faint)" }}
      />
      <input
        autoComplete="off"
        className={`${FIELD_CLS_LG} pl-9`}
        placeholder={t(
          "ui.ShiftAssignModal.buscarDisponible",
          "Buscar entre los vigilantes disponibles…",
        )}
        value={filtro || elegido?.label || ""}
        onBlur={() => setTimeout(() => setAbierta(false), 150)}
        onChange={(e) => {
          setFiltro(e.target.value);
          onChange("");
          setAbierta(true);
        }}
        onFocus={() => setAbierta(true)}
      />
      {abierta && (
        <div
          className="glass absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-xl p-1"
          style={{ background: "var(--background)" }}
        >
          {lista.map((g) => (
            <button
              key={g.id}
              className="cg-focus flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--brand-wash)]"
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(g.id);
                setFiltro("");
                setAbierta(false);
              }}
            >
              <span className="truncate">{g.label}</span>
              {g.id === value && (
                <Check className="h-4 w-4 shrink-0 brand-text" />
              )}
            </button>
          ))}
          {!lista.length && (
            <p
              className="px-3 py-2 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {t(
                "ui.ShiftAssignModal.nadieDisponibleConEseNombre",
                "Ningún vigilante disponible con ese nombre.",
              )}
            </p>
          )}
        </div>
      )}
      <p className="mt-1 text-[11px]" style={{ color: "var(--ink-soft)" }}>
        {t("ui.ShiftAssignModal.nDisponibles", {
          defaultValue:
            "{{count}} disponibles · sólo quienes no tienen ya una asignación activa",
          count: opciones.length,
        })}
      </p>
    </div>
  );
}

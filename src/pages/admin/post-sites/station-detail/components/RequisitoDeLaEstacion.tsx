import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
  AlertTriangle,
} from "lucide-react";

import { ApiService } from "@/services/api/apiService";
import { invalidateEntity } from "@/lib/queryClient";
import { InfoNote } from "@/components/kit";
import { diasCompactos } from "@/lib/diasDeLaSemana";
import { localeActual } from "@/lib/localeActual";
import { personasQueSeTurnanCon } from "@/lib/secuenciaDeRotacion";
import {
  DIAS_REQ,
  consecuencias,
  cuerpoDelRequisito,
  franjasDesdePlazas,
  mismoRequisito,
  validarFranjas,
  type FranjaReq,
  type PlazaReq,
} from "@/lib/requisitoDeLaEstacion";

const ETIQUETA_DIA: Record<string, string> = {
  lun: "L",
  mar: "M",
  mie: "X",
  jue: "J",
  vie: "V",
  sab: "S",
  dom: "D",
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESTACIÓN › REQUISITO — the ONE place that says how many people a station
 * needs, when, and which days (phase 2).
 *
 * Everywhere else (Horario, Sin cubrir, the client report, Cobertura en vivo)
 * only reads it. Saving goes through `auto-positions` with `franjas`, where the
 * server pairs the plazas by window (`lib/emparejarPlazas`): the preview below
 * runs the same rules, so it says who moves and who leaves BEFORE saving.
 * Sacafranco plazas are not part of the requirement and are not touched.
 * ════════════════════════════════════════════════════════════════════════════
 */
export default function RequisitoDeLaEstacion({
  stationId,
  rotationStyleId,
}: {
  stationId: string;
  rotationStyleId?: string | null;
}) {
  const { t } = useTranslation();
  const tenantId = localStorage.getItem("tenantId") || "";
  const [plazas, setPlazas] = useState<PlazaReq[] | null>(null);
  const [ocupantes, setOcupantes] = useState<
    Array<{ positionId: string; guardName: string }>
  >([]);
  const [estilos, setEstilos] = useState<Map<string, any>>(new Map());
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<FranjaReq[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [pos, asg, rot]: any[] = await Promise.all([
        ApiService.get(`/tenant/${tenantId}/station/${stationId}/positions`),
        ApiService.get(
          `/tenant/${tenantId}/guard-assignments?stationId=${stationId}&status=active`,
        ),
        ApiService.get(`/tenant/${tenantId}/rotation-styles?includeArchived=1`),
      ]);

      setPlazas(Array.isArray(pos) ? pos : (pos?.rows ?? []));
      setOcupantes(
        (Array.isArray(asg) ? asg : (asg?.rows ?? []))
          .filter(
            (a: any) =>
              a.positionId &&
              (a.role || "holder") === "holder" &&
              !a.isTemporary,
          )
          .map((a: any) => ({
            positionId: String(a.positionId),
            guardName:
              a.guard?.fullName ||
              [a.guard?.firstName, a.guard?.lastName]
                .filter(Boolean)
                .join(" ") ||
              a.guard?.email ||
              "—",
          })),
      );
      setEstilos(
        new Map(
          (Array.isArray(rot) ? rot : (rot?.rows ?? [])).map((r: any) => [
            String(r.id),
            r,
          ]),
        ),
      );
    } catch (e: any) {
      setError(e?.data?.message || e?.message || "Error");
      setPlazas([]);
    }
  }, [tenantId, stationId]);

  useEffect(() => {
    void cargar();
    const otra = (e: Event) => {
      const id = (e as CustomEvent)?.detail?.stationId;

      if (!id || id === stationId) void cargar();
    };

    window.addEventListener("station-horario-changed", otra);

    return () => window.removeEventListener("station-horario-changed", otra);
  }, [cargar, stationId]);

  /** People per seat with a plaza's cycle (its own, else the station's). */
  const kDe = useCallback(
    (p: PlazaReq) => {
      const id = String(p.rotationStyleId || rotationStyleId || "");

      return id && estilos.get(id)
        ? personasQueSeTurnanCon(estilos.get(id))
        : 1;
    },
    [estilos, rotationStyleId],
  );
  const kEstacion = useMemo(() => {
    const st = rotationStyleId ? estilos.get(String(rotationStyleId)) : null;

    return st ? personasQueSeTurnanCon(st) : 1;
  }, [estilos, rotationStyleId]);

  /* Arriving from «Reconfigurar» in the Horario (`#requisito`): scroll here. */
  useEffect(() => {
    if (plazas && window.location.hash === "#requisito") {
      document
        .getElementById("requisito")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [plazas]);

  const actuales = useMemo(
    () => franjasDesdePlazas(plazas || [], kDe),
    [plazas, kDe],
  );
  const sacafrancos = (plazas || []).filter(
    (p) => p.type === "sacafranco",
  ).length;
  const efecto = useMemo(
    () =>
      editando && plazas
        ? consecuencias(plazas, borrador, kEstacion, ocupantes)
        : null,
    [editando, plazas, borrador, kEstacion, ocupantes],
  );
  const invalido = editando ? validarFranjas(borrador) : null;
  const sinCambios = editando && mismoRequisito(actuales, borrador);

  const empezar = () => {
    setBorrador(
      actuales.length
        ? actuales.map((f) => ({ ...f }))
        : [{ id: "n0", start: "07:00", end: "19:00", guards: 1, days: [] }],
    );
    setEditando(true);
  };
  const cambiar = (id: string, d: Partial<FranjaReq>) =>
    setBorrador((l) => l.map((f) => (f.id === id ? { ...f, ...d } : f)));
  const alternarDia = (f: FranjaReq, dia: string) => {
    const todos = f.days.length ? new Set(f.days) : new Set<string>(DIAS_REQ);

    if (todos.has(dia)) todos.delete(dia);
    else todos.add(dia);
    if (!todos.size) return; // a window open no day is not a window
    cambiar(f.id, {
      days: todos.size === 7 ? [] : DIAS_REQ.filter((x) => todos.has(x)),
    });
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      await ApiService.post(
        `/tenant/${tenantId}/station/${stationId}/auto-positions`,
        {
          data: cuerpoDelRequisito(borrador, rotationStyleId),
        },
      );
      toast.success(t("ui.Requisito.guardado", "Requisito guardado"));
      invalidateEntity("stations");
      try {
        window.dispatchEvent(
          new CustomEvent("station-horario-changed", { detail: { stationId } }),
        );
      } catch {
        /* noop */
      }
      setEditando(false);
      await cargar();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.Requisito.noGuardado", "No se pudo guardar el requisito"),
      );
    } finally {
      setGuardando(false);
    }
  };

  const textoDias = (f: FranjaReq) =>
    diasCompactos(f.days, localeActual()) ||
    t("ui.Requisito.todosLosDias", "Todos los días");

  return (
    <div
      className="space-y-3 border-t p-6"
      id="requisito"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: "var(--brand-text)" }} />
          <h3 className="text-sm font-semibold text-foreground">
            {t("ui.Requisito.titulo", "Requisito")}
          </h3>
        </div>
        {!editando && plazas && (
          <button
            className="cg-btn-glass cg-focus inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium"
            type="button"
            onClick={empezar}
          >
            <Pencil size={14} />
            {t("ui.Requisito.cambiar", "Cambiar requisito")}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "ui.Requisito.explicacion",
          "Cuántos vigilantes pide la estación, a qué hora y qué días. Es lo único que define sus puestos: el Horario, Sin cubrir y los informes lo leen de aquí.",
        )}
      </p>

      {error && <InfoNote tone="bad">{error}</InfoNote>}

      {!plazas ? (
        <Loader2 className="animate-spin" size={16} />
      ) : !editando ? (
        actuales.length ? (
          <ul className="space-y-1.5">
            {actuales.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-baseline gap-x-3 text-sm"
              >
                <span className="font-mono tabular-nums">
                  {f.start}–{f.end}
                </span>
                <span>
                  {t("ui.Requisito.aLaVez", {
                    defaultValue: "{{count}} a la vez",
                    count: f.guards,
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {textoDias(f)}
                </span>
              </li>
            ))}
            {sacafrancos > 0 && (
              <li className="text-xs text-muted-foreground">
                {t("ui.Requisito.sacafrancosAparte", {
                  defaultValue:
                    "Además, {{count}} puesto(s) de sacafranco: cubren descansos y no cuentan en el requisito.",
                  count: sacafrancos,
                })}
              </li>
            )}
          </ul>
        ) : (
          <InfoNote tone="warn">
            {t(
              "ui.Requisito.sinRequisito",
              "Esta estación aún no dice cuántos vigilantes pide. Sin requisito no se pueden calcular sus huecos.",
            )}
          </InfoNote>
        )
      ) : (
        <div className="space-y-3">
          {borrador.map((f) => (
            <div
              key={f.id}
              className="glass-sunken flex flex-wrap items-end gap-3 rounded-xl p-3"
            >
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("comun.horaInicio", "Inicio")}
                <input
                  className="cg-input cg-focus w-36 px-2 py-1.5 font-mono text-sm"
                  type="time"
                  value={f.start}
                  onChange={(e) => cambiar(f.id, { start: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("comun.horaFin", "Fin")}
                <input
                  className="cg-input cg-focus w-36 px-2 py-1.5 font-mono text-sm"
                  type="time"
                  value={f.end}
                  onChange={(e) => cambiar(f.id, { end: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("ui.Requisito.personas", "A la vez")}
                <input
                  className="cg-input cg-focus w-20 px-2 py-1.5 text-sm"
                  max={20}
                  min={1}
                  type="number"
                  value={f.guards}
                  onChange={(e) =>
                    cambiar(f.id, {
                      guards: Math.max(
                        1,
                        Math.min(20, Math.floor(Number(e.target.value) || 1)),
                      ),
                    })
                  }
                />
              </label>
              <div className="grid gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("ui.Requisito.dias", "Días")}
                </span>
                <div className="flex gap-1">
                  {DIAS_REQ.map((d) => {
                    const on = !f.days.length || f.days.includes(d);

                    return (
                      <button
                        key={d}
                        aria-pressed={on}
                        className="cg-focus h-8 w-8 rounded-full border text-xs font-semibold"
                        style={
                          on
                            ? {
                                background: "var(--brand-wash)",
                                borderColor: "var(--brand-line)",
                              }
                            : {
                                borderColor: "var(--hairline)",
                                color: "var(--ink-faint)",
                              }
                        }
                        type="button"
                        onClick={() => alternarDia(f, d)}
                      >
                        {t(`ui.Requisito.dia.${d}`, ETIQUETA_DIA[d])}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                aria-label={t(
                  "ui.Requisito.quitarFranja",
                  "Quitar este horario",
                )}
                className="cg-focus ml-auto rounded-full p-2"
                disabled={borrador.length <= 1}
                style={{ color: "var(--bad-text)" }}
                type="button"
                onClick={() =>
                  setBorrador((l) => l.filter((x) => x.id !== f.id))
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <button
            className="cg-focus inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: "var(--brand-text)" }}
            type="button"
            onClick={() => {
              const u = borrador[borrador.length - 1];

              setBorrador((l) => [
                ...l,
                {
                  id: `n${Date.now()}`,
                  start: u?.end || "07:00",
                  end: u?.start || "19:00",
                  guards: 1,
                  days: [],
                },
              ]);
            }}
          >
            <Plus size={14} />{" "}
            {t("ui.Requisito.anadirFranja", "Añadir horario")}
          </button>

          {efecto &&
            !sinCambios &&
            (efecto.salen.length > 0 ||
              efecto.cambian.length > 0 ||
              efecto.nuevas > 0) && (
              <InfoNote
                icon={<AlertTriangle />}
                title={t("ui.Requisito.alGuardar", "Al guardar")}
                tone={efecto.salen.length ? "warn" : "info"}
              >
                <ul className="list-disc space-y-0.5 pl-4">
                  {efecto.salen.map((s) => (
                    <li key={`s${s.nombre}${s.ventana}`}>
                      {t("ui.Requisito.sale", {
                        defaultValue:
                          "{{nombre}} deja la estación (su puesto de {{ventana}} desaparece).",
                        nombre: s.nombre,
                        ventana: s.ventana,
                      })}
                    </li>
                  ))}
                  {efecto.cambian.map((c) => (
                    <li key={`c${c.nombre}${c.de}`}>
                      {t("ui.Requisito.cambiaDeHora", {
                        defaultValue: "{{nombre}} pasa de {{de}} a {{a}}.",
                        nombre: c.nombre,
                        de: c.de,
                        a: c.a,
                      })}
                    </li>
                  ))}
                  {efecto.nuevas > 0 && (
                    <li>
                      {t("ui.Requisito.plazasNuevas", {
                        defaultValue:
                          "{{count}} puesto(s) nuevo(s) sin vigilante: saldrán en Sin cubrir.",
                        count: efecto.nuevas,
                      })}
                    </li>
                  )}
                </ul>
              </InfoNote>
            )}
          {invalido && (
            <p className="text-xs" style={{ color: "var(--bad-text)" }}>
              {invalido === "personas"
                ? t(
                    "ui.Requisito.personasInvalidas",
                    "Entre 1 y 20 vigilantes a la vez.",
                  )
                : t(
                    "ui.Requisito.horaInvalida",
                    "Escribe las horas como 07:00.",
                  )}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              className="cg-btn-ghost cg-focus rounded-lg px-3 py-1.5 text-xs font-semibold"
              type="button"
              onClick={() => setEditando(false)}
            >
              {t("common.cancel", "Cancelar")}
            </button>
            <button
              className="cg-btn-brand cg-focus inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              disabled={guardando || !!invalido || sinCambios}
              type="button"
              onClick={guardar}
            >
              {guardando ? (
                <Loader2 className="animate-spin" size={13} />
              ) : (
                <Check size={13} />
              )}
              {t("ui.Requisito.guardar", "Guardar requisito")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

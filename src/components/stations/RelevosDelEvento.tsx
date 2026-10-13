import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Clock, Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { invalidateEntity } from "@/lib/queryClient";
import {
  rangoDelEvento,
  type RelevoDeEvento,
  type SedeConVigencia,
} from "@/lib/eventos";
import { ApiService } from "@/services/api/apiService";

import { AvisosDeRelevos } from "./AvisosDeRelevos";
import {
  coberturaInicialDelEvento,
  duracion,
  type Franja,
  partir,
  partirPorHoras,
} from "./StationCreateForm";

/* ════════════════════════════════════════════════════════════════════════════
   LOS RELEVOS DE UNA ESTACIÓN DE EVENTO, DESPUÉS DE CREARLA.

   Antes sólo se decían al crear la estación: pasar de «todo el horario» a
   relevos de 4 h, mover la estación de 16–00 a 15–23 o pedir 8 vigilantes en
   vez de 6 obligaba a borrarla y hacerla de nuevo. Aquí se cambian con las
   mismas preguntas del alta (horario, turno de cada vigilante, cuántos a la
   vez) y el servidor decide quién se queda: quien conserva un relevo con sus
   mismas horas sigue asignado; quien ya no cabe sale. Antes de guardar se
   dice quién saldría y se pide confirmar (`simular` del servidor).

   Va EN LÍNEA, no en un `Modal`: el `confirmDialog` vive fuera y un diálogo
   abierto le quitaría los clics.
   ════════════════════════════════════════════════════════════════════════ */

/** Vigilantes a la vez en un relevo: lo mismo que acepta el servidor. */
const MAX_A_LA_VEZ = 50;
const HORAS_DE_RELEVO = [2, 4, 6, 8, 12];

const nuevaId = () => Math.random().toString(36).slice(2);

const aMin = (hhmm: string) => {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);

  return m ? (Number(m[1]) % 24) * 60 + (Number(m[2]) % 60) : NaN;
};
const aHHMM = (min: number) => {
  const mm = ((min % 1440) + 1440) % 1440;

  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
};

interface Cobertura {
  modo: "24h" | "horario";
  desde: string;
  hasta: string;
  relevo: number | null;
  aLaVez: number;
  /** Los relevos de ahora no salen de los botones: se editan uno a uno. */
  manual: boolean;
}

/**
 * Cómo está configurada HOY la estación, leído de sus relevos, para que el
 * editor abra con lo que hay. Si los relevos no salen de «horario + relevos de
 * N h + tantos a la vez» (alguien los ajustó a mano), se abren uno a uno.
 */
export function coberturaDeRelevos(rs: RelevoDeEvento[]): Cobertura | null {
  if (!rs.length) return null;
  const desde = rs[0].inicio;
  const hasta = rs[rs.length - 1].fin;
  const modo = desde === hasta ? "24h" : "horario";
  const aLaVez = rs[0].plazas;
  const mismoCupo = rs.every((r) => r.plazas === aLaVez);
  let relevo: number | null = null;
  let cuadra = rs.length === 1;

  if (rs.length > 1) {
    const h = duracion({ start: rs[0].inicio, end: rs[0].fin }) / 60;
    const p = partirPorHoras(desde, hasta, h, 1);

    cuadra =
      HORAS_DE_RELEVO.includes(h) &&
      p.length === rs.length &&
      p.every((f, i) => f.start === rs[i].inicio && f.end === rs[i].fin);
    relevo = cuadra ? h : null;
  }

  return {
    modo,
    desde,
    hasta,
    relevo,
    aLaVez,
    manual: !cuadra || !mismoCupo,
  };
}

// ── EL EDITOR ──────────────────────────────────────────────────────────────

interface Salida {
  guardId?: string;
  nombre?: string | null;
  relevo?: string;
  motivo?: "relevoEliminado" | "cupoReducido" | "fueraDelEvento";
}

interface Previa {
  quedan: number;
  plazas: number;
  salidas: Salida[];
}

/** La respuesta del servidor venga envuelta o no. */
const cuerpo = (r: any) =>
  r && typeof r === "object" && r.data && !Array.isArray(r.data) && "salidas" in r.data
    ? r.data
    : r;

const chip = (activo: boolean) =>
  activo
    ? {
        background: "var(--brand)",
        color: "var(--brand-ink)",
        borderColor: "var(--brand)",
      }
    : {
        background: "var(--glass)",
        color: "var(--ink)",
        borderColor: "var(--hairline)",
      };

export function EditorDeRelevos({
  stationId,
  sede,
  relevos,
  onCancel,
  onSaved,
  className,
}: {
  stationId: string;
  sede: SedeConVigencia | null | undefined;
  relevos: RelevoDeEvento[];
  onCancel: () => void;
  onSaved?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const tenantId = localStorage.getItem("tenantId") || "";
  const [inicial] = useState<Cobertura>(() => {
    const deAhora = coberturaDeRelevos(relevos);

    if (deAhora) return deAhora;
    const delEvento = coberturaInicialDelEvento({
      desde: sede?.vigenteDesde,
      hasta: sede?.vigenteHasta,
    });

    return {
      modo: delEvento?.modo === "24h" ? "24h" : "horario",
      desde: delEvento?.desde || "07:00",
      hasta: delEvento?.hasta || "19:00",
      relevo: delEvento?.modo === "24h" ? 12 : null,
      aLaVez: 1,
      manual: false,
    };
  });
  const [modo, setModo] = useState<"24h" | "horario">(inicial.modo);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [relevo, setRelevo] = useState<number | null>(inicial.relevo);
  const [aLaVez, setALaVez] = useState(inicial.aLaVez);
  const [ajustar, setAjustar] = useState(inicial.manual);
  const [manuales, setManuales] = useState<Franja[]>(() =>
    inicial.manual
      ? relevos.map((r) => ({
          id: nuevaId(),
          start: r.inicio,
          end: r.fin,
          guards: r.plazas,
          days: [],
        }))
      : [],
  );
  const [guardando, setGuardando] = useState(false);

  const ventana = modo === "24h" ? { desde, hasta: desde } : { desde, hasta };
  const horasVentana = duracion({ start: ventana.desde, end: ventana.hasta }) / 60;
  const calculadas = useMemo(
    () =>
      relevo
        ? partirPorHoras(ventana.desde, ventana.hasta, relevo, aLaVez)
        : partir(ventana.desde, ventana.hasta, 1, aLaVez, []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modo, desde, hasta, relevo, aLaVez],
  );
  const franjas = ajustar ? manuales : calculadas;
  const valido =
    franjas.length > 0 &&
    franjas.every(
      (f) => duracion(f) > 0 && f.guards >= 1 && f.guards <= MAX_A_LA_VEZ,
    );
  const pedido = useMemo(
    () =>
      franjas.map((f) => ({
        start: f.start,
        end: f.end,
        guards: Math.max(1, f.guards),
      })),
    [franjas],
  );
  const clave = JSON.stringify(pedido);
  const plazas = pedido.reduce((n, f) => n + f.guards, 0);

  const enviar = (simular: boolean) =>
    ApiService.put(
      `/tenant/${tenantId}/station/${encodeURIComponent(stationId)}/relevos-del-evento`,
      { data: { franjas: pedido, simular } },
    ).then(cuerpo);

  /* QUIÉN SE QUEDA, MIENTRAS SE EDITA. El servidor lo calcula con la misma
     regla con la que va a guardar (sin escribir nada); se pide un instante
     después de dejar de teclear. */
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [errorPrevia, setErrorPrevia] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  useEffect(() => {
    if (!valido) {
      setPrevia(null);
      setErrorPrevia(null);

      return;
    }
    let vivo = true;

    setCalculando(true);
    const h = window.setTimeout(() => {
      enviar(true)
        .then((r: any) => {
          if (!vivo) return;
          setPrevia({
            quedan: Number(r?.quedan) || 0,
            plazas: Number(r?.plazas) || 0,
            salidas: Array.isArray(r?.salidas) ? r.salidas : [],
          });
          setErrorPrevia(null);
        })
        .catch((e: any) => {
          if (!vivo) return;
          setPrevia(null);
          setErrorPrevia(e?.data?.message || e?.message || null);
        })
        .finally(() => vivo && setCalculando(false));
    }, 400);

    return () => {
      vivo = false;
      window.clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, valido, stationId]);

  const motivo = (s: Salida) =>
    s.motivo === "cupoReducido"
      ? t(
          "ui.RelevosDelEvento.motivo.cupoReducido",
          "su relevo se queda con menos plazas",
        )
      : s.motivo === "fueraDelEvento"
        ? t(
            "ui.RelevosDelEvento.motivo.fueraDelEvento",
            "su relevo queda fuera del evento",
          )
        : t(
            "ui.RelevosDelEvento.motivo.relevoEliminado",
            "su relevo ya no existe",
          );
  const lista = (xs: Salida[], sep: string) =>
    xs
      .map(
        (s) =>
          `${s.nombre || "—"}${s.relevo ? ` (${s.relevo})` : ""} — ${motivo(s)}`,
      )
      .join(sep);

  const elegirModo = (m: "24h" | "horario") => {
    setModo(m);
    setAjustar(false);
    setRelevo(m === "24h" ? 12 : null);
    if (m === "horario" && desde === hasta) {
      const fin = coberturaInicialDelEvento({
        desde: sede?.vigenteDesde,
        hasta: sede?.vigenteHasta,
      });

      setHasta(
        fin?.modo === "horario" && fin.hasta !== desde
          ? fin.hasta
          : aHHMM(aMin(desde) + 8 * 60),
      );
    }
  };
  const abrirAjuste = () => {
    setManuales(calculadas.map((f) => ({ ...f, id: nuevaId() })));
    setAjustar(true);
  };
  const cambiarFranja = (id: string, delta: Partial<Franja>) =>
    setManuales((fs) => fs.map((f) => (f.id === id ? { ...f, ...delta } : f)));
  const anadirFranja = () =>
    setManuales((fs) => {
      const ultima = fs[fs.length - 1];
      const ini = ultima?.end || desde;
      const largo = ultima ? duracion(ultima) : 4 * 60;

      return [
        ...fs,
        {
          id: nuevaId(),
          start: ini,
          end: aHHMM(aMin(ini) + Math.min(largo, 12 * 60)),
          guards: ultima?.guards || aLaVez,
          days: [],
        },
      ];
    });

  const guardar = async () => {
    if (!valido) {
      toast.error(
        t(
          "ui.RelevosDelEvento.relevoInvalido",
          "Revisa los relevos: cada uno necesita hora de entrada, hora de salida y de 1 a 50 vigilantes.",
        ),
      );

      return;
    }
    setGuardando(true);
    try {
      // Se vuelve a preguntar justo antes: la vista previa pudo quedar vieja
      // si alguien asignó a otro vigilante mientras tanto.
      const sim: any = await enviar(true);
      const salen: Salida[] = Array.isArray(sim?.salidas) ? sim.salidas : [];

      if (
        salen.length &&
        !(await confirmDialog({
          title: t(
            "ui.RelevosDelEvento.confirmar.titulo",
            "¿Cambiar los relevos?",
          ),
          message: t("ui.RelevosDelEvento.confirmar.texto", {
            defaultValue:
              "Si guardas, salen de esta estación ({{vigilantes}}) y se borra su turno del evento:\n{{lista}}\n\nDespués podrás asignar a otros en los relevos nuevos.",
            vigilantes: t("ui.eventos.nVigilantes", {
              defaultValue: "{{count}} vigilantes",
              count: salen.length,
            }),
            lista: lista(salen, "\n"),
          }),
          confirmText: t(
            "ui.RelevosDelEvento.confirmar.boton",
            "Sí, cambiar los relevos",
          ),
          tone: "danger",
        }))
      )
        return;
      const r: any = await enviar(false);
      const salieron: Salida[] = Array.isArray(r?.salidas) ? r.salidas : [];

      toast.success(
        t("ui.RelevosDelEvento.guardado", {
          defaultValue: "Relevos actualizados: {{relevos}} · {{plazas}}.",
          relevos: t("ui.eventos.nRelevos", {
            defaultValue: "{{count}} relevos",
            count: Array.isArray(r?.relevos) ? r.relevos.length : franjas.length,
          }),
          plazas: t("ui.eventos.nPlazas", {
            defaultValue: "{{count}} plazas",
            count: Number(r?.plazas) || plazas,
          }),
        }),
      );
      if (salieron.length)
        toast.warning(
          t("ui.RelevosDelEvento.salieron", {
            defaultValue:
              "Salieron de la estación: {{lista}}. Asigna a otros en sus relevos.",
            lista: lista(salieron, "; "),
          }),
          { duration: 15000 },
        );
      invalidateEntity("stations");
      try {
        window.dispatchEvent(new CustomEvent("assignments:changed"));
      } catch {
        /* sin oyentes */
      }
      onSaved?.();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.RelevosDelEvento.noSePudo",
            "No se pudieron cambiar los relevos",
          ),
      );
    } finally {
      setGuardando(false);
    }
  };

  const rango = rangoDelEvento(sede?.vigenteDesde, sede?.vigenteHasta);

  return (
    <div
      className={`glass-flat space-y-4 p-4 ${className || ""}`}
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="flex items-start gap-2">
        <Clock size={16} style={{ color: "var(--brand-text)" }} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">
            {t("ui.RelevosDelEvento.titulo", "Relevos del evento")}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-soft)" }}>
            {rango ? `${rango} · ` : ""}
            {t(
              "ui.RelevosDelEvento.explica",
              "Cambia el horario de esta estación dentro del evento, cuánto dura el turno de cada vigilante y cuántos van a la vez. Quien ya está asignado se queda si su relevo sigue con las mismas horas.",
            )}
          </p>
        </div>
      </div>

      {/* El horario de la estación: 24 horas o de tal a tal hora */}
      <div className="flex flex-wrap items-center gap-2">
        {(["24h", "horario"] as const).map((m) => (
          <button
            key={m}
            aria-pressed={modo === m}
            className="cg-focus rounded-full border px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
            style={chip(modo === m)}
            type="button"
            onClick={() => elegirModo(m)}
          >
            {m === "24h"
              ? t("ui.RelevosDelEvento.24h", "24 horas")
              : t(
                  "ui.RelevosDelEvento.unHorario",
                  "Un horario (hora de entrada y de salida)",
                )}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span style={{ color: "var(--ink-soft)" }}>
          {modo === "24h"
            ? t("ui.RelevosDelEvento.relevoALas", "relevo a las")
            : t("ui.RelevosDelEvento.de", "de")}
        </span>
        <input
          className="cg-input cg-focus h-8 w-28 px-2 text-center font-mono text-sm"
          disabled={ajustar}
          type="time"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
        />
        {modo === "horario" && (
          <>
            <span style={{ color: "var(--ink-soft)" }}>
              {t("ui.RelevosDelEvento.a", "a")}
            </span>
            <input
              className="cg-input cg-focus h-8 w-28 px-2 text-center font-mono text-sm"
              disabled={ajustar}
              type="time"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </>
        )}
        <span className="font-semibold tabular-nums">
          {Math.round(horasVentana * 10) / 10} h
        </span>
      </div>

      {/* Cuánto dura el turno de cada vigilante */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span style={{ color: "var(--ink-soft)" }}>
          {t("ui.RelevosDelEvento.turnoDeCadaUno", "Turno de cada vigilante")}
        </span>
        {[null, ...HORAS_DE_RELEVO]
          .filter((h) => h === null || h < horasVentana)
          .map((h) => (
            <button
              key={String(h)}
              aria-pressed={!ajustar && relevo === h}
              className="cg-focus rounded-full border px-3 py-1 text-xs font-semibold transition-opacity hover:opacity-80"
              style={chip(!ajustar && relevo === h)}
              type="button"
              onClick={() => {
                setRelevo(h);
                setAjustar(false);
              }}
            >
              {h === null
                ? t("ui.RelevosDelEvento.todoElHorario", {
                    defaultValue: "Todo el horario ({{h}} h)",
                    h: Math.round(horasVentana * 10) / 10,
                  })
                : t("ui.RelevosDelEvento.relevosDe", {
                    defaultValue: "Relevos de {{h}} h",
                    h,
                  })}
            </button>
          ))}
      </div>

      {/* Cuántos a la vez */}
      {!ajustar && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.RelevosDelEvento.aLaVez",
              "Vigilantes a la vez en cada relevo",
            )}
          </span>
          <input
            className="cg-input cg-focus h-8 w-16 px-2 text-center text-sm"
            max={MAX_A_LA_VEZ}
            min={1}
            type="number"
            value={aLaVez}
            onChange={(e) =>
              setALaVez(
                Math.max(
                  1,
                  Math.min(MAX_A_LA_VEZ, Number(e.target.value) || 1),
                ),
              )
            }
          />
        </div>
      )}

      {/* Los relevos que salen de eso, o uno a uno */}
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="cg-eyebrow">
            {t("ui.eventos.nRelevos", {
              defaultValue: "{{count}} relevos",
              count: franjas.length,
            })}
            {" · "}
            {t("ui.eventos.nPlazas", {
              defaultValue: "{{count}} plazas",
              count: plazas,
            })}
          </span>
          <button
            className="cg-focus text-xs font-semibold"
            style={{ color: "var(--brand-text)" }}
            type="button"
            onClick={() => (ajustar ? setAjustar(false) : abrirAjuste())}
          >
            {ajustar
              ? t("ui.RelevosDelEvento.volverAutomatico", "Volver a lo automático")
              : t("ui.RelevosDelEvento.ajustarAMano", "Ajustar uno a uno")}
          </button>
        </div>
        {!ajustar ? (
          <div className="flex flex-wrap gap-1.5">
            {calculadas.map((f, i) => (
              <span
                key={f.id}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs"
                style={{ borderColor: "var(--hairline)" }}
              >
                {i + 1} · {f.start}–{f.end} · ×{f.guards}
              </span>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {manuales.map((f, i) => {
              const mal = duracion(f) === 0 || f.guards < 1;

              return (
                <div
                  key={f.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                  style={{ borderColor: mal ? "var(--bad)" : "var(--hairline)" }}
                >
                  <span
                    className="w-6 text-center text-xs font-bold tabular-nums"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {i + 1}
                  </span>
                  <input
                    className="cg-input cg-focus h-8 w-28 px-2 text-center font-mono text-sm"
                    type="time"
                    value={f.start}
                    onChange={(e) => cambiarFranja(f.id, { start: e.target.value })}
                  />
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t("ui.RelevosDelEvento.a", "a")}
                  </span>
                  <input
                    className="cg-input cg-focus h-8 w-28 px-2 text-center font-mono text-sm"
                    type="time"
                    value={f.end}
                    onChange={(e) => cambiarFranja(f.id, { end: e.target.value })}
                  />
                  <input
                    className="cg-input cg-focus h-8 w-16 px-2 text-center text-sm"
                    max={MAX_A_LA_VEZ}
                    min={1}
                    type="number"
                    value={f.guards}
                    onChange={(e) =>
                      cambiarFranja(f.id, {
                        guards: Math.max(
                          1,
                          Math.min(MAX_A_LA_VEZ, Number(e.target.value) || 1),
                        ),
                      })
                    }
                  />
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t("ui.RelevosDelEvento.aLaVezCorto", "a la vez")}
                  </span>
                  <button
                    aria-label={t("ui.RelevosDelEvento.quitarRelevo", "Quitar relevo")}
                    className="cg-focus ml-auto rounded-md"
                    disabled={manuales.length <= 1}
                    style={{ color: "var(--bad-text)" }}
                    title={t("ui.RelevosDelEvento.quitarRelevo", "Quitar relevo")}
                    type="button"
                    onClick={() =>
                      setManuales((fs) => fs.filter((x) => x.id !== f.id))
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            <button
              className="cg-focus inline-flex items-center gap-1 text-xs font-semibold"
              style={{ color: "var(--brand-text)" }}
              type="button"
              onClick={anadirFranja}
            >
              <Plus className="h-3.5 w-3.5" />
              {t("ui.RelevosDelEvento.anadirRelevo", "Añadir relevo")}
            </button>
          </div>
        )}
      </div>

      <AvisosDeRelevos franjas={franjas} sede={sede} />

      {/* Quién se queda y quién saldría, antes de guardar */}
      {valido && (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {calculando && !previa ? (
            t("ui.RelevosDelEvento.previa.calculando", "Mirando quién se queda…")
          ) : errorPrevia ? (
            <span style={{ color: "var(--bad-text)" }}>{errorPrevia}</span>
          ) : previa ? (
            previa.salidas.length ? (
              <span style={{ color: "var(--warn-text)" }}>
                {t("ui.RelevosDelEvento.previa.salen", {
                  defaultValue:
                    "Si guardas, salen de la estación: {{lista}}. Siguen asignados: {{quedan}}.",
                  lista: lista(previa.salidas, "; "),
                  quedan: t("ui.eventos.nVigilantes", {
                    defaultValue: "{{count}} vigilantes",
                    count: previa.quedan,
                  }),
                })}
              </span>
            ) : previa.quedan ? (
              t("ui.RelevosDelEvento.previa.nadieSale", {
                defaultValue:
                  "Nadie sale de la estación. Siguen asignados: {{quedan}}.",
                quedan: t("ui.eventos.nVigilantes", {
                  defaultValue: "{{count}} vigilantes",
                  count: previa.quedan,
                }),
              })
            ) : (
              t(
                "ui.RelevosDelEvento.previa.sinAsignados",
                "Todavía no hay vigilantes asignados en esta estación.",
              )
            )
          ) : null}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button disabled={guardando} size="sm" variant="ghost" onClick={onCancel}>
          {t("common.cancel", "Cancelar")}
        </Button>
        <Button
          disabled={!valido || guardando}
          size="sm"
          variant="brand"
          onClick={guardar}
        >
          {guardando ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1.5 h-4 w-4" />
          )}
          {t("ui.RelevosDelEvento.guardar", "Guardar relevos")}
        </Button>
      </div>
    </div>
  );
}

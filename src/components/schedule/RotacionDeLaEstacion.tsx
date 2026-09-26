import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Users, UserCog } from "lucide-react";

import RotationStyleSelect from "./RotationStyleSelect";
import {
  bloqueSiguiente,
  plazasPrevistas,
  porQueNoSePuede,
  secuenciaDelCiclo,
  tramoSiguiente,
  type CicloRotacion,
  type EntradaDePlazas,
  type PlazaPrevista,
} from "./plazas";

import { ApiService } from "@/services/api/apiService";

export type EstiloRotacion = CicloRotacion & {
  id: string;
  name: string;
  isSystem?: boolean;
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL PATRÓN DE ROTACIÓN DE UNA ESTACIÓN — COMPARTIDO O UNO POR PLAZA
 *
 * El formulario del puesto ofrecía UN patrón «general» y nada más. Con eso no
 * se puede escribir una operación tan corriente como ésta:
 *
 *   BIOMAR (SEGURIDAD BAS) cubre 07:00–23:00 en dos tramos —07:00–15:00 y
 *   15:00–23:00—. Un vigilante hace 2 mañanas, 3 tardes y 2 libres; el otro
 *   hace 3 mañanas, 2 tardes y 2 libres. Dos ciclos, la misma estación.
 *
 * El motor sabía hacerlo desde 2026-09-06 (`guardAssignment.rotationStyleId`),
 * pero sólo se podía elegir vigilante a vigilante DESPUÉS de asignarlos, y
 * quien configura el puesto lo hace antes de que haya nadie. Aquí se elige al
 * configurar: cada plaza se queda con su ciclo y quien se asigne ahí lo hereda.
 *
 * Y se ENSEÑA lo que sale: la semana de cada plaza escrita («M M T T T L L») y
 * cuántos días de cada tramo quedan para el sacafranco. Eso es lo que el
 * operador estaba calculando a mano contra un «2-3-2» que no decía si los 2
 * eran mañanas o tardes.
 * ════════════════════════════════════════════════════════════════════════════
 */
export default function RotacionDeLaEstacion({
  tenantId,
  entrada,
  value,
  onChange,
  onStyleChange,
  porPlaza,
  onPorPlazaChange,
  etiquetaPrimerBloque,
  etiquetaSegundoBloque,
}: {
  tenantId: string;
  /** Cómo está configurada la estación: de ahí salen sus plazas. */
  entrada: EntradaDePlazas;
  /** Patrón de la estación (el compartido, y el respaldo de las plazas sin ciclo). */
  value: string;
  onChange: (id: string) => void;
  onStyleChange?: (s: CicloRotacion | null) => void;
  /** Un id por plaza (''=la de la estación), o null si la rotación es compartida. */
  porPlaza: string[] | null;
  onPorPlazaChange: (v: string[] | null) => void;
  etiquetaPrimerBloque?: string;
  etiquetaSegundoBloque?: string;
}) {
  const { t } = useTranslation();
  const [estilos, setEstilos] = useState<EstiloRotacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const es24h = entrada.scheduleType === "24h";

  const cargar = async () => {
    setCargando(true);
    try {
      const res: any = await ApiService.get(
        `/tenant/${tenantId}/rotation-styles`,
      );

      setEstilos(
        Array.isArray(res?.rows) ? res.rows : Array.isArray(res) ? res : [],
      );
    } catch {
      /* se queda vacío */
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, [tenantId]);

  const plazas = useMemo(
    () => plazasPrevistas(entrada),
    [
      entrada.scheduleType,
      entrada.inicio,
      entrada.fin,
      entrada.blockHours,
      entrada.restCoverage,
      entrada.ciclo?.dayShifts,
      entrada.ciclo?.nightShifts,
      entrada.ciclo?.restDays,
      // Sin esta dependencia la vista previa no se recalcula al marcar
      // «alterna día y noche», y vuelve a enseñar la ventana espejada que el
      // servidor no va a guardar.
      entrada.ciclo?.alternatesDayNight,
    ],
  );

  /* La rotación individual sólo significa algo con DOS plazas o más: en un
     puesto de una sola plaza «cada uno el suyo» y «el de la estación» son la
     misma frase, y ofrecer la elección sólo añade un paso que no decide nada. */
  const puedeIndividual = plazas.length >= 2;

  /* Lo que el servidor va a rechazar, dicho ANTES de pulsar guardar. Ver
     `porQueNoSePuede`. */
  const impedimento = useMemo(
    () => porQueNoSePuede(entrada),
    [
      entrada.scheduleType,
      entrada.restCoverage,
      entrada.ciclo?.dayShifts,
      entrada.ciclo?.nightShifts,
      entrada.ciclo?.restDays,
    ],
  );
  const individual = !!porPlaza && puedeIndividual;

  // La lista se recorta o se alarga con las plazas: cambiar las horas del
  // puesto puede partirlo en tres tramos donde había dos.
  useEffect(() => {
    if (!porPlaza) return;
    if (porPlaza.length === plazas.length) return;
    onPorPlazaChange(
      Array.from({ length: plazas.length }, (_, i) => porPlaza[i] || ""),
    );
  }, [plazas.length]);

  const porId = useMemo(
    () => new Map(estilos.map((s) => [String(s.id), s])),
    [estilos],
  );

  /* En COMPARTIDA quien avisa del ciclo elegido es `RotationStyleSelect`. En
     INDIVIDUAL ese componente no se pinta, así que el ciclo de la estación
     —el respaldo, y de él salen la cuenta de fijos por bloque y el aviso de
     alternancia del formulario— se quedaba congelado en el último valor. */
  useEffect(() => {
    if (!individual) return;
    onStyleChange?.(porId.get(String(value)) || null);
  }, [individual, value, porId]);
  const cicloDe = (i: number): CicloRotacion | null => {
    const propio = porPlaza?.[i] ? porId.get(String(porPlaza[i])) : null;

    return propio || porId.get(String(value)) || null;
  };

  /* ── LO QUE QUEDA PARA EL SACAFRANCO ──────────────────────────────────────
     Un tramo hay que cubrirlo TODOS los días del ciclo. Cada plaza aporta sus
     días de trabajo a su tramo y al siguiente; lo que falte hasta el largo del
     ciclo lo tapa el sacafranco. Es una cuenta de días por ciclo, no de qué día
     concreto —la fase la pone la fecha de alta de cada vigilante—, así que vale
     igual antes de asignar a nadie, que es cuando se configura el puesto. */
  const resumen = useMemo(() => {
    const ciclos = plazas.map((_, i) => cicloDe(i));

    if (ciclos.some((c) => !c)) return null;
    const largos = ciclos.map(
      (c) => (c!.dayShifts || 0) + (c!.nightShifts || 0) + (c!.restDays || 0),
    );

    if (largos.some((l) => l <= 0)) return null;
    const desigual = largos.some((l) => l !== largos[0]);

    /* En un 24 h con patrón de noche las dos plazas COMPARTEN ventana
       (07:00–19:00) y es la rotación la que lleva a una a la noche: contar por
       ventana las juntaría en una sola y diría que la noche está descubierta.
       Ahí los tramos son el día y la noche, no dos horarios. */
    const mismaVentana =
      new Set(plazas.map((p) => `${p.startTime}|${p.endTime}`)).size === 1;

    if (es24h && mismaVentana) {
      const dia = ciclos.reduce((n, c) => n + (c!.dayShifts || 0), 0);
      const noche = ciclos.reduce((n, c) => n + (c!.nightShifts || 0), 0);

      return {
        largo: largos[0],
        desigual,
        tramos: [
          {
            nombre: t("ui.RotacionDeLaEstacion.dia", "Día"),
            cubierto: dia,
            falta: Math.max(0, largos[0] - dia),
          },
          {
            nombre: t("ui.RotacionDeLaEstacion.noche", "Noche"),
            cubierto: noche,
            falta: Math.max(0, largos[0] - noche),
          },
        ],
      };
    }

    const tramos = new Map<string, { nombre: string; cubierto: number }>();

    plazas.forEach((p) => {
      const k = `${p.startTime}|${p.endTime}`;

      if (!tramos.has(k))
        tramos.set(k, { nombre: `${p.startTime}–${p.endTime}`, cubierto: 0 });
    });
    plazas.forEach((p, i) => {
      const c = ciclos[i]!;
      const propia = `${p.startTime}|${p.endTime}`;

      if (tramos.has(propia)) tramos.get(propia)!.cubierto += c.dayShifts || 0;
      // Por la VENTANA del bloque siguiente, no por su nombre: una cobertura de
      // cuatro bloques de 6 h tiene dos que se llaman «noche».
      const sig = bloqueSiguiente(plazas, i, es24h)?.clave || null;

      if (sig && tramos.has(sig))
        tramos.get(sig)!.cubierto += c.nightShifts || 0;
    });

    return {
      largo: largos[0],
      desigual,
      tramos: Array.from(tramos.values()).map((t) => ({
        ...t,
        falta: Math.max(0, largos[0] - t.cubierto),
      })),
    };
  }, [plazas, porPlaza, value, porId, es24h]);

  return (
    <div className="space-y-3">
      {impedimento && (
        <div
          className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-xs"
          style={{
            background: "color-mix(in oklab, var(--bad) 10%, transparent)",
            border:
              "1px solid color-mix(in oklab, var(--bad) 28%, transparent)",
            color: "var(--bad-text)",
          }}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{impedimento}</span>
        </div>
      )}

      {puedeIndividual && (
        <div
          className="rounded-xl p-2.5"
          style={{
            border: "1px solid var(--hairline)",
            background: "var(--glass-sunken)",
          }}
        >
          <div
            className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("ui.RotacionDeLaEstacion.losNVigilantesHacenElMismoCiclo", {
              defaultValue: "¿Los {{n}} vigilantes hacen el mismo ciclo?",
              n: plazas.length,
            })}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              className={`cg-focus rounded-lg px-2 py-2 text-left text-[11px] font-semibold transition-all ${!individual ? "glass-brand" : "glass-flat"}`}
              type="button"
              onClick={() => onPorPlazaChange(null)}
            >
              <span className="inline-flex items-center gap-1.5">
                <Users size={12} />{" "}
                {t(
                  "ui.RotacionDeLaEstacion.rotacionCompartida",
                  "Rotación compartida",
                )}
              </span>
              <span className="mt-0.5 block text-[10px] font-normal opacity-75">
                {t(
                  "ui.RotacionDeLaEstacion.unSoloCicloParaTodoElPuesto",
                  "Un solo ciclo para todo el puesto. El motor escalona a los vigilantes entre sí.",
                )}
              </span>
            </button>
            <button
              className={`cg-focus rounded-lg px-2 py-2 text-left text-[11px] font-semibold transition-all ${individual ? "glass-brand" : "glass-flat"}`}
              type="button"
              onClick={() =>
                onPorPlazaChange(
                  Array.from({ length: plazas.length }, () => ""),
                )
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <UserCog size={12} />{" "}
                {t(
                  "ui.RotacionDeLaEstacion.rotacionIndividual",
                  "Rotación individual",
                )}
              </span>
              <span className="mt-0.5 block text-[10px] font-normal opacity-75">
                {t(
                  "ui.RotacionDeLaEstacion.cadaPlazaConSuCiclo",
                  "Cada plaza con su ciclo — uno hace 2 mañanas y 3 tardes, otro 3 y 2.",
                )}
              </span>
            </button>
          </div>
        </div>
      )}

      {!individual && (
        <RotationStyleSelect
          bloques={entrada.scheduleType === "custom" ? plazas.length : 1}
          etiquetaPrimerBloque={etiquetaPrimerBloque}
          etiquetaSegundoBloque={etiquetaSegundoBloque}
          scheduleType={entrada.scheduleType}
          value={value}
          onChange={onChange}
          onStyleChange={(s) => onStyleChange?.(s)}
        />
      )}

      {individual && (
        <div className="space-y-2">
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--ink-soft)" }}
          >
            {t(
              "ui.RotacionDeLaEstacion.elCicloDeCadaPlaza",
              "El ciclo de cada plaza",
            )}
          </div>
          {cargando ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="animate-spin" size={12} />{" "}
              {t("ui.RotacionDeLaEstacion.cargandoCiclos", "Cargando ciclos…")}
            </div>
          ) : (
            plazas.map((p, i) => (
              <PlazaFila
                key={p.indice}
                cicloEfectivo={cicloDe(i)}
                estilos={estilos}
                etiquetaPropia={es24h ? t("ui.tramos.dia", "día") : p.tramo}
                etiquetaSiguiente={tramoSiguiente(plazas, i, es24h)}
                patronDeLaEstacion={porId.get(String(value))?.name || null}
                plaza={p}
                tenantId={tenantId}
                value={porPlaza?.[i] || ""}
                onChange={(id) => {
                  const next = Array.from({ length: plazas.length }, (_, k) =>
                    k === i ? id : porPlaza?.[k] || "",
                  );

                  onPorPlazaChange(next);
                  /* La estación necesita un patrón igual: es el respaldo de las
                   plazas que se dejen «como la estación» y lo que lee el
                   detector de huecos cuando una plaza está vacante. Se toma el
                   de la primera plaza que tenga uno. */
                  const respaldo = next.find(Boolean);

                  if (respaldo && respaldo !== value) onChange(respaldo);
                }}
                onCreado={(nuevo) =>
                  setEstilos((prev) =>
                    prev.some((x) => x.id === nuevo.id)
                      ? prev
                      : [...prev, nuevo],
                  )
                }
              />
            ))
          )}
        </div>
      )}

      {resumen && (
        <div
          className="rounded-xl p-2.5 text-[11px]"
          style={{
            border: "1px solid var(--hairline)",
            background: "var(--glass-sunken)",
            color: "var(--ink-soft)",
          }}
        >
          {resumen.desigual ? (
            <span>
              {t("ui.RotacionDeLaEstacion.losCiclosTienen", "Los ciclos tienen")}{" "}
              <strong>
                {t("ui.RotacionDeLaEstacion.largosDistintos", "largos distintos")}
              </strong>
              {t(
                "ui.RotacionDeLaEstacion.elCuadranteNoSeRepite",
                ": el cuadrante no se repite cada semana y los descansos caen en días diferentes cada vuelta. Revisa la cobertura en Programador › Horario antes de darlo por bueno.",
              )}
            </span>
          ) : (
            <>
              <span className="font-semibold">
                {t("ui.RotacionDeLaEstacion.cicloDeNDias", {
                  defaultValue: "Ciclo de {{n}} días.",
                  n: resumen.largo,
                })}
              </span>{" "}
              {resumen.tramos.map((tr, i) => (
                <span key={tr.nombre}>
                  {i > 0 ? " · " : ""}
                  <span className="font-mono">{tr.nombre}</span>:{" "}
                  {t("ui.RotacionDeLaEstacion.diasConFijo", {
                    defaultValue: "{{cubierto}}/{{largo}} días con fijo",
                    cubierto: Math.min(tr.cubierto, resumen.largo),
                    largo: resumen.largo,
                  })}
                  {tr.falta > 0
                    ? t("ui.RotacionDeLaEstacion.nParaElSacafranco", {
                        defaultValue: " ({{n}} para el sacafranco)",
                        n: tr.falta,
                      })
                    : ""}
                </span>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Una plaza: su ventana, el selector de su ciclo y la semana que sale de él. */
function PlazaFila({
  tenantId,
  plaza,
  estilos,
  value,
  onChange,
  etiquetaPropia,
  etiquetaSiguiente,
  onCreado,
  cicloEfectivo,
  patronDeLaEstacion,
}: {
  tenantId: string;
  plaza: PlazaPrevista;
  estilos: EstiloRotacion[];
  value: string;
  onChange: (id: string) => void;
  etiquetaPropia: string;
  etiquetaSiguiente: string;
  onCreado: (s: EstiloRotacion) => void;
  cicloEfectivo: CicloRotacion | null;
  patronDeLaEstacion: string | null;
}) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [cPropio, setCPropio] = useState("2");
  const [cSiguiente, setCSiguiente] = useState("2");
  const [cLibres, setCLibres] = useState("2");

  // Un mismo ciclo puede estar duplicado en la empresa (se crearon al vuelo
  // varias veces). Se enseña uno por combinación.
  const opciones = useMemo(() => {
    const vistos = new Set<string>();

    return estilos.filter((s) => {
      const k = `${s.dayShifts}|${s.nightShifts}|${s.restDays}`;

      if (vistos.has(k) && s.id !== value) return false;
      vistos.add(k);

      return true;
    });
  }, [estilos, value]);

  const describir = (s: EstiloRotacion) => {
    const descanso =
      s.restDays === 0
        ? t("ui.RotationStyleSelect.sinDescanso", "sin descanso")
        : t("ui.RotacionDeLaEstacion.nLibres", {
            defaultValue: "{{count}} libres",
            count: s.restDays,
          });

    return (s.nightShifts || 0) > 0
      ? `${s.name} — ${s.dayShifts} ${etiquetaPropia} · ${s.nightShifts} ${etiquetaSiguiente} · ${descanso}`
      : `${s.name} — ${s.dayShifts} ${etiquetaPropia} · ${descanso}`;
  };

  const crear = async () => {
    const propio = Math.max(0, parseInt(cPropio, 10) || 0);
    const siguiente = Math.max(0, parseInt(cSiguiente, 10) || 0);
    const libres = Math.max(0, parseInt(cLibres, 10) || 0);

    if (propio + siguiente < 1) {
      toast.error(
        t(
          "ui.RotacionDeLaEstacion.elCicloNecesitaAlMenos",
          "El ciclo necesita al menos un día de trabajo.",
        ),
      );

      return;
    }
    const igual = estilos.find(
      (s) =>
        s.dayShifts === propio &&
        s.nightShifts === siguiente &&
        s.restDays === libres,
    );

    if (igual) {
      onChange(igual.id);
      setAbierto(false);

      return;
    }
    setCreando(true);
    try {
      const res: any = await ApiService.post(
        `/tenant/${tenantId}/rotation-style`,
        {
          data: {
            name:
              siguiente > 0
                ? `${propio}-${siguiente}-${libres}`
                : `${propio}-${libres}`,
            description: `${propio} ${etiquetaPropia} · ${siguiente} ${etiquetaSiguiente} · ${libres} descansa`,
            dayShifts: propio,
            nightShifts: siguiente,
            restDays: libres,
          },
        },
      );
      const creado = res?.data ?? res;

      if (creado?.id) {
        onCreado(creado);
        onChange(creado.id);
        setAbierto(false);
      }
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.RotacionDeLaEstacion.noSePudoCrearElCiclo", "No se pudo crear el ciclo"),
      );
    } finally {
      setCreando(false);
    }
  };

  const semana = secuenciaDelCiclo(
    cicloEfectivo,
    etiquetaPropia,
    etiquetaSiguiente,
  );
  const campo = "w-full rounded-xl border px-3 py-2 text-sm";
  const estiloCampo = {
    borderColor: "var(--hairline)",
    background: "var(--glass-sunken)",
  } as const;

  return (
    <div
      className="rounded-xl border p-2.5"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
        <span className="text-xs font-semibold">{plaza.nombre}</span>
        <span
          className="font-mono text-[11px] tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          {plaza.startTime}–{plaza.endTime}
        </span>
        <span
          className="text-[10px] capitalize"
          style={{ color: "var(--ink-faint)" }}
        >
          {plaza.tramo}
        </span>
      </div>
      <select
        className={campo}
        style={estiloCampo}
        value={value}
        onChange={(e) => {
          if (e.target.value === "__nuevo__") setAbierto(true);
          else onChange(e.target.value);
        }}
      >
        <option value="">
          {patronDeLaEstacion
            ? t("ui.RotacionDeLaEstacion.laDeLaEstacionCon", {
                defaultValue: "La de la estación ({{patron}})",
                patron: patronDeLaEstacion,
              })
            : t("ui.RotacionDeLaEstacion.laDeLaEstacion", "La de la estación")}
        </option>
        {opciones.map((s) => (
          <option key={s.id} value={s.id}>
            {describir(s)}
          </option>
        ))}
        <option value="__nuevo__">
          {t("ui.RotacionDeLaEstacion.crearUnCiclo", "+ Crear un ciclo…")}
        </option>
      </select>

      {abierto && (
        <div
          className="mt-2 rounded-xl border p-2.5"
          style={{
            borderColor: "var(--brand-line)",
            background: "var(--brand-wash)",
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            <label className="text-[10px] text-muted-foreground">
              {t("ui.RotacionDeLaEstacion.diasDe", {
                defaultValue: "Días de {{tramo}}",
                tramo: etiquetaPropia,
              })}
              <input
                className={`${campo} mt-1`}
                min={0}
                style={estiloCampo}
                type="number"
                value={cPropio}
                onChange={(e) => setCPropio(e.target.value)}
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              {t("ui.RotacionDeLaEstacion.diasDe", {
                defaultValue: "Días de {{tramo}}",
                tramo: etiquetaSiguiente,
              })}
              <input
                className={`${campo} mt-1`}
                min={0}
                style={estiloCampo}
                type="number"
                value={cSiguiente}
                onChange={(e) => setCSiguiente(e.target.value)}
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              {t("ui.RotacionDeLaEstacion.libres", "Libres")}
              <input
                className={`${campo} mt-1`}
                min={0}
                style={estiloCampo}
                type="number"
                value={cLibres}
                onChange={(e) => setCLibres(e.target.value)}
              />
            </label>
          </div>
          <button
            className="cg-btn-brand cg-focus mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            disabled={creando}
            type="button"
            onClick={() => void crear()}
          >
            {creando ? (
              <Loader2 className="animate-spin" size={12} />
            ) : (
              <Plus size={12} />
            )}{" "}
            {t("ui.RotationStyleSelect.crearYUsar", "Crear y usar")}
          </button>
        </div>
      )}

      {semana.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {semana.map((d, i) => (
            <span
              key={i}
              className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold"
              style={
                d.tipo === "libre"
                  ? {
                      background: "var(--glass-sunken)",
                      color: "var(--ink-faint)",
                    }
                  : d.tipo === "propio"
                    ? { background: "var(--brand)", color: "var(--brand-ink)" }
                    : {
                        background:
                          "color-mix(in oklab, var(--info) 55%, transparent)",
                        color: "var(--brand-ink)",
                      }
              }
              title={d.nombre}
            >
              {d.letra}
            </span>
          ))}
          <span
            className="ml-1 text-[10px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("ui.RotacionDeLaEstacion.resumenSemana", {
              defaultValue:
                "{{propio}} de {{tramoPropio}}, {{siguiente}} de {{tramoSiguiente}}, {{libres}} libre(s)",
              propio: semana.filter((d) => d.tipo === "propio").length,
              tramoPropio: etiquetaPropia,
              siguiente: semana.filter((d) => d.tipo === "siguiente").length,
              tramoSiguiente: etiquetaSiguiente,
              libres: semana.filter((d) => d.tipo === "libre").length,
            })}
          </span>
        </div>
      )}
    </div>
  );
}

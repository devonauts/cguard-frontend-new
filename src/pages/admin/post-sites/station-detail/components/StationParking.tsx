import type { Station } from "@/types";

import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Car, Settings2, AlarmClock, Ban } from "lucide-react";
import { toast } from "sonner";

import { visitorLogService } from "@/lib/api/visitorLogService";
import {
  vehicleControlService,
  type Ocupacion,
  type ReglasVehiculo,
} from "@/lib/api/vehicleControlService";
import {
  Section,
  EmptyState,
  SkeletonCards,
  FadeIn,
  StatusBadge,
  SmartImage,
} from "@/components/kit";
import { fileUrlFromFile } from "@/lib/fileUrl";
import { localeActual } from "@/lib/localeActual";
type Props = { station: Station; stationId: string; postSiteId: string };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONTROL VEHICULAR DEL PUESTO — entra, se estaciona, sale.
 *
 * Un vehículo NO es una tabla aparte: es una visita del `visitorLog` que trae
 * placa. El vigilante la registra desde la app (modo «Vehículo», donde la placa
 * es la identidad) y marca la salida desde la misma ficha; aquí se ve el
 * resultado. Un vehículo sin `exitTime` sigue DENTRO.
 *
 * ── POR QUÉ ESTA PANTALLA NO SERVÍA ────────────────────────────────────────
 * Dos fallos que se tapaban entre sí:
 *
 * 1. Buscaba las filas probando cinco escrituras posibles del tipo de lugar
 *    («Parking», «Parqueadero», «Estacionamiento», «Vehículo», «Vehiculo») y,
 *    si ninguna devolvía nada, se traía TODAS las visitas del puesto. La app
 *    escribe `placeType: "vehiculo"`, así que la lista acababa enseñando
 *    también a las personas que llegaron a pie: por eso no se entendía qué era
 *    esta sección.
 * 2. La primera columna pintaba nombre y apellido. En una visita en modo
 *    vehículo el nombre es el del conductor —o el literal «Vehículo» cuando no
 *    se anota— así que LA PLACA, que es el único dato que identifica al coche,
 *    no aparecía por ningún lado.
 *
 * Ahora la regla es la del dato, no la de una cadena de texto: es un vehículo
 * si tiene placa. Y la placa manda en la primera columna.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface ParkGuardRef {
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  name?: string;
  fullName?: string;
}
interface ParkingRow {
  id?: string;
  firstName?: string;
  first_name?: string;
  lastName?: string;
  last_name?: string;
  name?: string;
  visitorName?: string;
  company?: string;
  placeType?: string;
  place_type?: string;
  vehiclePlate?: string;
  vehicle_plate?: string;
  vehicleType?: string;
  vehicle_type?: string;
  vehicleColor?: string;
  vehicleMakeModel?: string;
  parkingLocation?: string;
  tagNumber?: string;
  vehiclePhoto?: any[] | null;
  vehicleExitPhoto?: any[] | null;
  vehicleCondition?: string | null;
  vehicleConditionNotes?: string | null;
  vehicleExitCondition?: string | null;
  vehicleExitConditionNotes?: string | null;
  visitDate?: string | null;
  entryTime?: string | null;
  createdAt?: string | null;
  exitTime?: string | null;
  exit_time?: string | null;
  guard?: ParkGuardRef | null;
  securityGuard?: ParkGuardRef | null;
  guardName?: string;
}

/** Estado del vehículo → cómo se pinta. Los semánticos son fijos. */
// Los textos se traducen donde se pintan: este mapa es de módulo y un t() aquí
// congelaría el idioma con el que arrancó la sesión.
const ESTADO: Record<
  string,
  { clave: string; texto: string; tono: "ok" | "bad" | "warn" }
> = {
  ok: { clave: "station.parking.condition.ok", texto: "Sin daños", tono: "ok" },
  damaged: {
    clave: "station.parking.condition.damaged",
    texto: "Con daños",
    tono: "bad",
  },
  noted: {
    clave: "station.parking.condition.noted",
    texto: "Con observación",
    tono: "warn",
  },
};

/** Los tipos que manda la app del vigilante, traducidos a algo legible. */
const TIPO: Record<string, { clave: string; texto: string }> = {
  car: { clave: "station.parking.vehicleType.car", texto: "Automóvil" },
  motorcycle: {
    clave: "station.parking.vehicleType.motorcycle",
    texto: "Motocicleta",
  },
  van: { clave: "station.parking.vehicleType.van", texto: "Furgoneta" },
  truck: { clave: "station.parking.vehicleType.truck", texto: "Camión" },
  other: { clave: "station.parking.vehicleType.other", texto: "Otro" },
};

function formatDate(val: string | null | undefined) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString(localeActual(), {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return val;
  }
}

/** Cuánto lleva dentro, en un formato que se lee de un vistazo. */
function permanencia(
  entrada: string | null | undefined,
  salida: string | null | undefined,
): string {
  if (!entrada) return "—";
  const ini = new Date(entrada).getTime();
  const fin = salida ? new Date(salida).getTime() : Date.now();

  if (!Number.isFinite(ini) || !Number.isFinite(fin) || fin < ini) return "—";
  const min = Math.round((fin - ini) / 60000);

  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);

  return min % 60 === 0 ? `${h} h` : `${h} h ${min % 60} min`;
}

export default function StationParking({ stationId }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ParkingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soloDentro, setSoloDentro] = useState(false);
  const [lightbox, setLightbox] = useState<{
    url: string;
    placa: string;
    cual: "entrada" | "salida";
  } | null>(null);
  const [ocup, setOcup] = useState<Ocupacion | null>(null);
  const [ajustes, setAjustes] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Nunca null: si la consulta de reglas falla, se parte de las de fábrica y
  // el panel sigue sirviendo para configurarlas. Un botón que abre un panel
  // vacío es peor que no tener botón.
  const [borrador, setBorrador] = useState<ReglasVehiculo>({
    enabled: false,
    capacity: null,
    bays: [],
    maxStayMinutes: null,
    blacklistEnabled: false,
  });

  useEffect(() => {
    if (!stationId) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Se piden las visitas del puesto y se filtra por el DATO (¿trae placa?)
        // en vez de adivinar cómo se escribió el tipo de lugar.
        const res: any = await visitorLogService.list({ stationId } as any, {
          limit: 200,
          offset: 0,
        });
        const list: ParkingRow[] = Array.isArray(res) ? res : (res?.rows ?? []);

        if (mounted) setRows(list);
        // Las reglas del puesto van aparte: pueden estar apagadas, y en ese
        // caso la pantalla no enseña ni cupo ni permanencia ni vetos.
        try {
          const o = await vehicleControlService.ocupacion(stationId);

          if (mounted) {
            setOcup(o);
            setBorrador(o.reglas);
          }
        } catch {
          /* sin reglas, la tabla funciona igual */
        }
      } catch (e: any) {
        if (mounted)
          setError(
            e?.message ||
              t("station.parking.loadError", "Error al cargar registros"),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [stationId, t]);

  const vehiculos = useMemo(() => {
    const conPlaca = rows.filter((r) =>
      String(r.vehiclePlate || r.vehicle_plate || "").trim(),
    );

    // Más reciente primero: lo que acaba de entrar es lo que se está mirando.
    return conPlaca.sort((a, b) => {
      const fa = new Date(
        a.visitDate || a.entryTime || a.createdAt || 0,
      ).getTime();
      const fb = new Date(
        b.visitDate || b.entryTime || b.createdAt || 0,
      ).getTime();

      return fb - fa;
    });
  }, [rows]);

  const dentro = useMemo(
    () => vehiculos.filter((r) => !(r.exitTime || r.exit_time)),
    [vehiculos],
  );
  const visibles = soloDentro ? dentro : vehiculos;

  return (
    <Section
      action={
        !loading ? (
          <>
            {/* El cupo sólo aparece si el puesto lo tiene configurado. */}
            {ocup?.reglas.enabled && ocup.capacidad != null && (
              <span
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums"
                style={
                  ocup.lleno
                    ? {
                        background:
                          "color-mix(in oklab, var(--bad) 16%, transparent)",
                        color: "var(--bad-text)",
                      }
                    : {
                        background: "var(--glass-sunken)",
                        color: "var(--ink-soft)",
                      }
                }
                title={t(
                  "station.parking.capacityHint",
                  "Vehículos dentro respecto al cupo del puesto",
                )}
              >
                {ocup.dentro}/{ocup.capacidad}
                {ocup.lleno
                  ? ` · ${t("station.parking.full", "lleno")}`
                  : ` · ${ocup.libres} ${t("station.parking.free", "libres")}`}
              </span>
            )}
            <button
              className="cg-focus min-h-9 shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
              style={{
                background: "var(--glass-sunken)",
                color: "var(--ink-soft)",
              }}
              title={t("station.parking.rules", "Reglas del control vehicular")}
              type="button"
              onClick={() => setAjustes((v) => !v)}
            >
              <Settings2 className="mr-1 inline" size={13} />
              {t("station.parking.rules", "Reglas")}
            </button>
            {vehiculos.length > 0 && (
              <button
                aria-pressed={soloDentro}
                className="cg-focus min-h-9 shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all"
                style={
                  soloDentro
                    ? { background: "var(--brand)", color: "var(--brand-ink)" }
                    : {
                        background: "var(--glass-sunken)",
                        color: "var(--ink-soft)",
                      }
                }
                type="button"
                onClick={() => setSoloDentro((v) => !v)}
              >
                {t("station.parking.onlyInside", "Sólo los que están dentro")} (
                {dentro.length})
              </button>
            )}
          </>
        ) : undefined
      }
      contentClassName="-mx-5 -mb-5"
      icon={<Car />}
      title={
        <span>
          {t("station.parking.title", "Control vehicular")}
          {!loading && vehiculos.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              ({vehiculos.length})
            </span>
          )}
        </span>
      }
    >
      <p className="px-5 -mt-2 mb-3 text-xs text-muted-foreground">
        {t(
          "station.parking.subtitle",
          "Entrada y salida de vehículos en este puesto. El vigilante los registra desde la app y marca la salida cuando se van.",
        )}
      </p>

      {/* ── LAS TRES REGLAS, OPCIONALES ────────────────────────────────────
          Apagadas, el puesto registra entradas y salidas y nada más — que es
          lo que quiere una garita de patio abierto. Encendidas, cada una añade
          UNA cosa concreta. Ninguna bloquea el registro: en la puerta decide
          el vigilante, que ve lo que la pantalla no ve. */}
      {ajustes && (
        <div
          className="mx-5 mb-4 space-y-4 rounded-2xl p-4"
          style={{ background: "var(--glass-sunken)" }}
        >
          <label className="flex cursor-pointer items-start gap-3">
            <input
              checked={borrador.enabled}
              className="mt-0.5 h-4 w-4 shrink-0"
              type="checkbox"
              onChange={(e) =>
                setBorrador({ ...borrador, enabled: e.target.checked })
              }
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">
                {t("station.parking.enable", "Activar reglas en este puesto")}
              </span>
              <span
                className="block text-[11px]"
                style={{ color: "var(--ink-soft)" }}
              >
                {t(
                  "station.parking.enableHint",
                  "Sin activar, el puesto sigue registrando entradas y salidas: sólo se apagan el cupo, el aviso de permanencia y las placas vetadas.",
                )}
              </span>
            </span>
          </label>

          {borrador.enabled && (
            <div
              className="space-y-4 border-t pt-4"
              style={{ borderColor: "var(--hairline)" }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className="cg-eyebrow mb-1.5 block">
                    {t("station.parking.capacity", "Cupo de vehículos")}
                  </label>
                  <input
                    className="cg-input cg-focus w-full px-3 py-2 text-sm tabular-nums"
                    min={0}
                    placeholder={
                      t("station.parking.noLimit", "Sin límite") as string
                    }
                    type="number"
                    value={borrador.capacity ?? ""}
                    onChange={(e) =>
                      setBorrador({
                        ...borrador,
                        capacity:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {t(
                      "station.parking.capacityHelp",
                      "Vacío = sin límite. El vigilante ve cuántos quedan al registrar.",
                    )}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="cg-eyebrow mb-1.5 block">
                    <AlarmClock className="mr-1 inline" size={11} />
                    {t(
                      "station.parking.maxStay",
                      "Aviso por permanencia (min)",
                    )}
                  </label>
                  <input
                    className="cg-input cg-focus w-full px-3 py-2 text-sm tabular-nums"
                    min={0}
                    placeholder={
                      t("station.parking.noAlert", "Sin aviso") as string
                    }
                    type="number"
                    value={borrador.maxStayMinutes ?? ""}
                    onChange={(e) =>
                      setBorrador({
                        ...borrador,
                        maxStayMinutes:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                  <p
                    className="mt-1 text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {t(
                      "station.parking.maxStayHelp",
                      "Vacío = sin aviso. Se avisa una sola vez por vehículo.",
                    )}
                  </p>
                </div>
              </div>

              <div className="min-w-0">
                <label className="cg-eyebrow mb-1.5 block">
                  {t("station.parking.bays", "Cajones (opcional)")}
                </label>
                <input
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                  placeholder="A-01, A-02, B-01…"
                  value={borrador.bays.join(", ")}
                  onChange={(e) =>
                    setBorrador({
                      ...borrador,
                      bays: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
                <p
                  className="mt-1 text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t(
                    "station.parking.baysHelp",
                    "Separados por comas. Con la lista puesta, el vigilante elige cajón en vez de escribirlo, y aquí se ve cuáles están libres.",
                  )}
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  checked={borrador.blacklistEnabled}
                  className="mt-0.5 h-4 w-4 shrink-0"
                  type="checkbox"
                  onChange={(e) =>
                    setBorrador({
                      ...borrador,
                      blacklistEnabled: e.target.checked,
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    <Ban className="mr-1 inline" size={12} />
                    {t("station.parking.blacklist", "Avisar de placas vetadas")}
                  </span>
                  <span
                    className="block text-[11px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t(
                      "station.parking.blacklistHint",
                      "Al escribir la placa, el vigilante ve un aviso si está vetada. No le impide registrarla: la decisión en la puerta es suya.",
                    )}
                  </span>
                </span>
              </label>

              {ocup && ocup.reglas.bays.length > 0 && (
                <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
                  {t("station.parking.freeBays", "Cajones libres ahora")}:{" "}
                  <strong>{ocup.cajonesLibres.join(", ") || "—"}</strong>
                </p>
              )}
            </div>
          )}

          <div
            className="flex flex-wrap justify-end gap-2 border-t pt-3"
            style={{ borderColor: "var(--hairline)" }}
          >
            <button
              className="cg-btn-ghost cg-focus min-h-9 rounded-full px-4 text-sm font-semibold"
              type="button"
              onClick={() => {
                setBorrador(ocup?.reglas ?? borrador);
                setAjustes(false);
              }}
            >
              {t("common.cancel", "Cancelar")}
            </button>
            <button
              className="cg-btn-brand cg-focus min-h-9 rounded-full px-5 text-sm font-semibold disabled:opacity-40"
              disabled={guardando}
              type="button"
              onClick={async () => {
                setGuardando(true);
                try {
                  const o = await vehicleControlService.guardarReglas(
                    stationId,
                    borrador,
                  );

                  setOcup(o);
                  setBorrador(o.reglas);
                  setAjustes(false);
                  toast.success(t("station.parking.saved", "Reglas guardadas"));
                } catch (e: any) {
                  toast.error(
                    e?.message ||
                      t(
                        "station.parking.saveError",
                        "No se pudieron guardar las reglas",
                      ),
                  );
                } finally {
                  setGuardando(false);
                }
              }}
            >
              {guardando ? "…" : t("common.save", "Guardar")}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-5 pb-5">
          <SkeletonCards count={4} />
        </div>
      ) : error ? (
        <div className="px-5 pb-5 text-sm" style={{ color: "var(--bad-text)" }}>
          {error}
        </div>
      ) : visibles.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            description={
              soloDentro
                ? undefined
                : t(
                    "station.parking.emptyHint",
                    "El vigilante los registra desde la app, en Visitas › Vehículo.",
                  )
            }
            icon={<Car />}
            title={
              soloDentro
                ? t(
                    "station.parking.emptyInside",
                    "Ahora mismo no hay vehículos dentro.",
                  )
                : t(
                    "station.parking.empty",
                    "Todavía no se ha registrado ningún vehículo en este puesto.",
                  )
            }
          />
        </div>
      ) : (
        <FadeIn className="overflow-x-auto">
          <table className="min-w-[880px] text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="cg-eyebrow px-2 py-2 text-left">
                  {t("station.parking.col.photo", "Foto")}
                </th>
                <th className="cg-eyebrow px-2 py-2 text-left">
                  {t("station.parking.col.plate", "Placa")}
                </th>
                <th className="cg-eyebrow px-2 py-2 text-left">
                  {t("station.parking.col.vehicle", "Vehículo")}
                </th>
                <th className="cg-eyebrow px-2 py-2 text-left">
                  {t("station.parking.col.driver", "Conductor / empresa")}
                </th>
                <th className="cg-eyebrow px-2 py-2 text-left">
                  {t("station.parking.col.entry", "Entrada")}
                </th>
                <th className="cg-eyebrow px-2 py-2 text-left">
                  {t("station.parking.col.exit", "Salida")}
                </th>
                <th className="cg-eyebrow px-2 py-2 text-left">
                  {t("station.parking.col.stay", "Permanencia")}
                </th>
                <th className="cg-eyebrow px-2 py-2 text-left">
                  {t("station.parking.col.condition", "Estado")}
                </th>
                <th className="cg-eyebrow px-2 py-2 text-left">
                  {t("station.parking.col.guard", "Vigilante")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibles.map((r: ParkingRow, i: number) => {
                const placa = String(r.vehiclePlate || r.vehicle_plate || "")
                  .trim()
                  .toUpperCase();
                const tipoBruto = String(
                  r.vehicleType || r.vehicle_type || "",
                ).trim();
                const tipoDef = TIPO[tipoBruto.toLowerCase()];
                const tipo = tipoDef
                  ? t(tipoDef.clave, tipoDef.texto)
                  : tipoBruto || "—";
                const detalle = [r.vehicleMakeModel, r.vehicleColor]
                  .filter(Boolean)
                  .join(" · ");
                const firstName = r.firstName || r.first_name || "";
                const lastName = r.lastName || r.last_name || "";
                const conductor =
                  [firstName, lastName].filter(Boolean).join(" ") ||
                  r.name ||
                  r.visitorName ||
                  "—";
                const entradaISO = r.visitDate || r.entryTime || r.createdAt;
                const salidaISO = r.exitTime || r.exit_time;
                const guard = r.guard || r.securityGuard || {};
                const guardName =
                  [
                    guard.firstName || guard.first_name,
                    guard.lastName || guard.last_name,
                  ]
                    .filter(Boolean)
                    .join(" ") ||
                  guard.name ||
                  guard.fullName ||
                  r.guardName ||
                  "—";
                const fotoEntrada = fileUrlFromFile(
                  Array.isArray(r.vehiclePhoto) ? r.vehiclePhoto[0] : null,
                );
                const fotoSalida = fileUrlFromFile(
                  Array.isArray(r.vehicleExitPhoto)
                    ? r.vehicleExitPhoto[0]
                    : null,
                );
                const est = r.vehicleCondition
                  ? ESTADO[r.vehicleCondition]
                  : null;
                const estSalida = r.vehicleExitCondition
                  ? ESTADO[r.vehicleExitCondition]
                  : null;

                return (
                  <tr key={r.id || i} className="hover:bg-muted/40">
                    <td className="px-2 py-2">
                      {/* La foto de ENTRADA es la que se mira de un vistazo; la de
                          salida se ofrece detrás, porque sólo importa al comparar. */}
                      <button
                        className="cg-focus block disabled:cursor-default"
                        disabled={!fotoEntrada}
                        title={
                          fotoEntrada
                            ? t("station.parking.viewPhoto", "Ver foto")
                            : undefined
                        }
                        type="button"
                        onClick={() =>
                          fotoEntrada &&
                          setLightbox({
                            url: fotoEntrada,
                            placa,
                            cual: "entrada",
                          })
                        }
                      >
                        <SmartImage
                          alt=""
                          className="h-11 w-16 shrink-0"
                          fallback={
                            <Car
                              size={16}
                              style={{ color: "var(--ink-faint)" }}
                            />
                          }
                          fit="cover"
                          rounded="rounded-lg"
                          src={fotoEntrada}
                          style={{ border: "1px solid var(--hairline)" }}
                        />
                      </button>
                      {fotoSalida && (
                        <button
                          className="cg-focus mt-1 block text-[10px] font-semibold hover:underline"
                          style={{ color: "var(--brand-text)" }}
                          type="button"
                          onClick={() =>
                            setLightbox({
                              url: fotoSalida,
                              placa,
                              cual: "salida",
                            })
                          }
                        >
                          {t("station.parking.exitPhoto", "Ver salida")}
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <span
                        className="font-mono text-sm font-bold tracking-wider"
                        style={{ color: "var(--ink)" }}
                      >
                        {placa}
                      </span>
                      {r.parkingLocation && (
                        <span className="block text-[11px] text-muted-foreground">
                          {r.parkingLocation}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <span style={{ color: "var(--ink)" }}>{tipo}</span>
                      {detalle && (
                        <span className="block text-[11px] text-muted-foreground">
                          {detalle}
                        </span>
                      )}
                    </td>
                    <td className="min-w-0 px-2 py-2.5">
                      <span
                        className="block truncate"
                        style={{ color: "var(--ink)" }}
                      >
                        {conductor}
                      </span>
                      {r.company && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {r.company}
                        </span>
                      )}
                    </td>
                    <td
                      className="px-2 py-2.5 tabular-nums"
                      style={{ color: "var(--ink)" }}
                    >
                      {formatDate(entradaISO)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {salidaISO ? (
                        <span className="text-muted-foreground">
                          {formatDate(salidaISO)}
                        </span>
                      ) : (
                        <StatusBadge tone="ok">
                          {t("station.parking.inside", "Dentro")}
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {(() => {
                        const texto = permanencia(entradaISO, salidaISO);
                        const limite = ocup?.reglas.enabled
                          ? ocup.reglas.maxStayMinutes
                          : null;
                        const mins = entradaISO
                          ? Math.round(
                              ((salidaISO
                                ? new Date(salidaISO).getTime()
                                : Date.now()) -
                                new Date(entradaISO).getTime()) /
                                60000,
                            )
                          : 0;
                        // Sólo se marca al que SIGUE dentro: uno que ya salió
                        // tarde es historia, no algo que atender ahora.
                        const pasado = !!limite && !salidaISO && mins > limite;

                        return pasado ? (
                          <span
                            className="inline-flex items-center gap-1 font-semibold"
                            style={{ color: "var(--bad-text)" }}
                          >
                            <AlarmClock size={12} />
                            {texto}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{texto}</span>
                        );
                      })()}
                    </td>
                    <td className="min-w-0 px-2 py-2.5">
                      {est ? (
                        <StatusBadge tone={est.tono}>
                          {t(est.clave, est.texto)}
                        </StatusBadge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {r.vehicleConditionNotes && (
                        <span
                          className="mt-0.5 block max-w-[220px] truncate text-[11px] text-muted-foreground"
                          title={r.vehicleConditionNotes}
                        >
                          {r.vehicleConditionNotes}
                        </span>
                      )}
                      {estSalida && (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          {t("station.parking.onExit", "Al salir")}:{" "}
                          {t(estSalida.clave, estSalida.texto)}
                          {r.vehicleExitConditionNotes
                            ? ` · ${r.vehicleExitConditionNotes}`
                            : ""}
                        </span>
                      )}
                    </td>
                    <td className="min-w-0 px-2 py-2.5">
                      <span
                        className="block truncate"
                        style={{ color: "var(--ink)" }}
                      >
                        {guardName}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </FadeIn>
      )}

      {/* Visor. Una foto de 64px no sirve para discutir un rayón: hay que poder
          abrirla grande. Se cierra tocando fuera o con Escape. */}
      {lightbox && (
        <div
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          role="dialog"
          style={{ background: "oklch(0 0 0 / 0.85)" }}
          tabIndex={-1}
          onClick={() => setLightbox(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setLightbox(null);
          }}
        >
          <div
            className="max-h-full w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-mono text-sm font-bold tracking-wider text-white">
                {lightbox.placa}
                <span className="ml-2 font-sans text-xs font-normal opacity-70">
                  {lightbox.cual === "entrada"
                    ? t("station.parking.photoEntry", "foto de entrada")
                    : t("station.parking.photoExit", "foto de salida")}
                </span>
              </p>
              <button
                className="cg-focus min-h-9 rounded-full px-3 text-sm font-semibold text-white/80 hover:text-white"
                type="button"
                onClick={() => setLightbox(null)}
              >
                {t("common.close", "Cerrar")}
              </button>
            </div>
            <img
              alt=""
              className="max-h-[78vh] w-full rounded-xl object-contain"
              src={lightbox.url}
            />
          </div>
        </div>
      )}
    </Section>
  );
}

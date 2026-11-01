import { usePuede } from "@/hooks/usePuede";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldAlert,
  ShieldCheck,
  Clock,
  UserPlus,
  UserCheck,
  ArrowRightLeft,
  RefreshCw,
  Undo2,
  CalendarRange,
  CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

import GuardTypeahead, { GuardPick } from "./GuardTypeahead";

import LanzarDoblete, { type HuecoElegido } from "@/pages/admin/dobletes/LanzarDoblete";
import { ChipDeBusqueda, useDobletesEnCobertura } from "@/pages/admin/dobletes/EnCobertura";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PageContainer,
  PageHeader,
  Section,
  MetricTile,
  StatsStrip,
  EmptyState,
  SkeletonCards,
  Modal,
  Stagger,
  StatusBadge,
  Segmented,
  GlassPanel,
  IconTile,
  InfoNote,
} from "@/components/kit";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { localeActual } from "@/lib/localeActual";
import attendanceService from "@/lib/api/attendanceService";
import { crearSocket, cerrarSocket } from "@/lib/socket";
import { getAuthToken } from "@/lib/api";
import { hoyEnLaEmpresa, zonaDeLaEmpresa} from "@/lib/horaDeLaEmpresa";
import coverageService, {
  COVERAGE_REASONS,
  REASON_LABEL,
  STATUS_LABEL,
  coverageErrorCode,
  stationLabel,
  type LiveCoverage,
  type StationCoverage,
  type CoverageEvent,
  type CoverageReason,
} from "@/lib/api/coverageService";
import { ErrorDeCarga } from "@/components/kit/ErrorDeCarga";

/**
 * Cobertura en vivo — the office's operational view.
 *
 * The Horario says who was PLANNED. This says who is actually standing at each
 * post right now, which is the only thing that matters when a client calls to
 * ask why nobody is at their gate. Uncovered posts sort first, and every gap
 * carries the action that closes it.
 */

/** Estado del puesto → papel de color del sistema. Un puesto sin cubrir es
 *  `bad` siempre, elija el usuario el acento que elija. */
const STATUS_TONE: Record<string, "bad" | "warn" | "ok" | "neutral"> = {
  uncovered: "bad",
  at_risk: "warn",
  covered: "ok",
  idle: "neutral",
};

/** Overrides the operator can confirm when the service refuses. */
type ConfirmFlags = { allowRestDay: boolean; allowDoubleShift: boolean };

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(localeActual(), { timeZone: zonaDeLaEmpresa(),
    hour: "2-digit",
    minute: "2-digit",
  });

const tenantId = () => localStorage.getItem("tenantId") || "";

export default function Coverage() {
  const { t } = useTranslation();
  // Buttons follow the server's coverage rules (lib/reglasDeAcciones).
  const registrar = usePuede("cobertura.registrar");
  const trasladar = usePuede("cobertura.trasladar");
  const [live, setLive] = useState<LiveCoverage | null>(null);
  const [events, setEvents] = useState<CoverageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  /** The board did not load: never read «no posts configured» then. */
  const [fallo, setFallo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"board" | "events">("board");

  // Report-absence modal
  const [absenceFor, setAbsenceFor] = useState<any | null>(null);
  const [reason, setReason] = useState<CoverageReason>("permiso_con_sueldo");
  const [note, setNote] = useState("");

  // Cover-post modal
  const [coverFor, setCoverFor] = useState<any | null>(null);
  /* «Ofrecer doblete» (módulo Dobletes): the gap goes to the reserve as an
     offer instead of being assigned by hand; the live state shows in the row. */
  const dobletes = useDobletesEnCobertura();
  const [dobleteFor, setDobleteFor] = useState<HuecoElegido | null>(null);
  const [candidates, setCandidates] = useState<any[] | null>(null);

  // Transfer modal. A traslado is temporary by construction: it moves only the
  // turnos inside the chosen range, so the vigilante returns to their own post
  // on the next one — there is no separate "expiry" to run or forget.
  const [transferFor, setTransferFor] = useState<any | null>(null);
  /* ── «ESTÁ AQUÍ, PERO NO PUDO FICHAR» ────────────────────────────────────
     La fila de un vigilante esperado sólo ofrecía «Trasladar» y «Novedad»: o lo
     mandas a otro puesto, o declaras que faltó. Faltaba el caso más común de
     todos — está en el puesto y el teléfono se rompió, se quedó sin batería o se
     lo olvidó. Sin esto, la central tenía que declarar una falta que no existió
     para poder cubrir el puesto, y ese turno no se pagaba. */
  const [entradaManualFor, setEntradaManualFor] = useState<any | null>(null);
  const [motivoManual, setMotivoManual] = useState("");
  const [toStationId, setToStationId] = useState("");
  const [transferMode, setTransferMode] = useState<"shift" | "range">("shift");
  const [transferUntil, setTransferUntil] = useState("");

  // Reemplazo por vacaciones/permiso
  const [repOpen, setRepOpen] = useState(false);
  const [repOut, setRepOut] = useState<GuardPick | null>(null);
  const [repIn, setRepIn] = useState<GuardPick | null>(null);
  const [repFrom, setRepFrom] = useState("");
  const [repTo, setRepTo] = useState("");
  const [repReason, setRepReason] = useState<CoverageReason>("vacaciones");

  const load = useCallback(async () => {
    try {
      const [l, e] = await Promise.all([
        coverageService.live(),
        // `resolved` también: es el hueco que VENCIÓ sin que nadie lo cubriera y
        // que el barrido cerró para que dejara de pedir relevo. Cerrarlo no
        // puede equivaler a esconderlo — es justo el que hay que poder mirar.
        coverageService.events({ status: "open,covered,resolved" }),
      ]);

      setLive(l);
      setEvents(e?.rows || []);
      setFallo(false);
    } catch {
      setFallo(true);
      toast.error(t("comun.noSePudoCargarLa"));
    } finally {
      setLoading(false);
    }
  }, []);

  /* El tablero se mira durante un incidente, así que no puede quedarse viejo
     delante de quien lo está observando. Ahora se entera por evento —el
     servidor anuncia `coverage:changed` desde los seis caminos que la cambian, y
     agrupa las ráfagas de planificación— y el reloj se queda como red de
     seguridad por si el socket estaba caído, pausado con la pestaña oculta.
     `connect` recarga al reconectar: es ahí, y no en un temporizador, donde hay
     que recuperar lo que pasó mientras no escuchábamos. */
  useEffect(() => {
    load();
    const tid = tenantId();
    let socket: ReturnType<typeof crearSocket> | null = null;
    /* Agrupado: un cambio de turno emite decenas de eventos y cada recarga
       pide /coverage/live, que son diez consultas secuenciales. */
    let agrup: ReturnType<typeof setTimeout> | null = null;
    const alCambiar = () => {
      if (agrup) clearTimeout(agrup);
      agrup = setTimeout(() => {
        void load();
      }, 700);
    };

    if (tid) {
      socket = crearSocket(getAuthToken() || "", tid);
      socket.on("coverage:changed", alCambiar);
      socket.on("shift:punch", alCambiar);
      socket.on("connect", alCambiar);
    }

    let iv: ReturnType<typeof setInterval> | null = null;
    const visible = () => document.visibilityState !== "hidden";
    const arrancar = () => {
      if (!iv && visible()) iv = setInterval(load, 30_000);
    };
    const parar = () => {
      if (iv) {
        clearInterval(iv);
        iv = null;
      }
    };
    const alVerse = () => {
      if (visible()) {
        void load();
        arrancar();
      } else parar();
    };

    arrancar();
    document.addEventListener("visibilitychange", alVerse);

    return () => {
      parar();
      document.removeEventListener("visibilitychange", alVerse);
      if (socket) {
        if (agrup) clearTimeout(agrup);
        socket.off("coverage:changed", alCambiar);
        socket.off("shift:punch", alCambiar);
        socket.off("connect", alCambiar);
        cerrarSocket(socket);
      }
    };
  }, [load]);

  /**
   * `rest_day` is the server asking for confirmation of a real decision, not a
   * failure — re-issue with the confirmation instead of dead-ending the user.
   */
  const runWithConfirm = async (
    call: (flags: ConfirmFlags) => Promise<any>,
    okMsg: string,
  ) => {
    setBusy(true);
    try {
      // Two refusals are operational decisions rather than errors — the guard is
      // on their descanso, or already has an overlapping turno (doblar turno,
      // which is exactly what happens when the relief does not show). Ask, then
      // repeat with the confirmation. Each is asked at most once so a genuine
      // failure surfaces instead of looping.
      const flags: ConfirmFlags = {
        allowRestDay: false,
        allowDoubleShift: false,
      };
      const asked = { rest_day: false, double_booking: false };

      for (;;) {
        try {
          await call(flags);
          break;
        } catch (e: any) {
          const code = coverageErrorCode(e);

          if (code === "rest_day" && !asked.rest_day) {
            asked.rest_day = true;
            if (
              !(await confirmDialog(
                t(
                  "ui.TransferShiftModal.vigilanteEnDescansoConfirm",
                  "Ese vigilante está en descanso ese día. ¿Asignarlo de todos modos?",
                ),
              ))
            )
              return;
            flags.allowRestDay = true;
            continue;
          }
          if (code === "double_booking" && !asked.double_booking) {
            asked.double_booking = true;
            if (
              !(await confirmDialog(
                t(
                  "ui.TransferShiftModal.doblarTurnoConfirm",
                  "Ya tiene otro turno que se cruza con ese horario. ¿Doblar turno?",
                ),
              ))
            )
              return;
            flags.allowDoubleShift = true;
            continue;
          }
          if (code) {
            toast.error(
              e?.response?.data?.message ||
                t(
                  "ui.Coverage.noSePudoCompletarLa",
                  "No se pudo completar la acción",
                ),
            );

            return;
          }
          throw e;
        }
      }
      toast.success(okMsg);
      await load();

      return true;
    } catch {
      toast.error(t("ui.Coverage.noSePudoCompletarLa"));
    } finally {
      setBusy(false);
    }
  };

  /** Registrar la entrada de alguien que ESTÁ en el puesto y no pudo fichar. */
  const registrarEntradaManual = async () => {
    const row = entradaManualFor;

    if (!row || motivoManual.trim().length < 10) return;
    setBusy(true);
    try {
      const r = await attendanceService.manualClockIn({
        guardId: row.guardId,
        stationId: row.stationId,
        reason: motivoManual.trim(),
      });

      if (!r.ok) {
        // El servidor no lanza error cuando la razón es operativa (ya está en
        // turno, el fichaje lo rechazó una puerta): lo dice, y aquí se cuenta.
        toast.error(
          r.turnoAbiertoDesde
            ? t(
                "ui.Coverage.yaTieneUnTurnoAbierto",
                "Ya tiene un turno abierto — no se abre un segundo.",
              )
            : r.detalle ||
                t(
                  "ui.Coverage.noSePudoRegistrarLaEntrada",
                  "No se pudo registrar la entrada",
                ),
        );

        return;
      }
      toast.success(
        t("ui.Coverage.entradaRegistradaPara", {
          defaultValue:
            "Entrada registrada para {{nombre}} — queda en espera de revisión",
          nombre:
            r.vigilante || t("ui.Coverage.elVigilante", "el vigilante"),
        }),
      );
      setEntradaManualFor(null);
      setMotivoManual("");
      load();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "ui.Coverage.noSePudoRegistrarLaEntrada",
            "No se pudo registrar la entrada",
          ),
      );
    } finally {
      setBusy(false);
    }
  };

  const submitAbsence = async () => {
    const row = absenceFor;

    if (!row) return;
    const ok = await runWithConfirm(
      () =>
        coverageService.reportAbsence({
          guardId: row.guardId,
          reason,
          reasonNote: note.trim() || undefined,
          shiftId: row.shiftId,
          stationId: row.stationId,
        }),
      t("ui.Coverage.novedadRegistrada", "Novedad registrada"),
    );

    if (ok) {
      setAbsenceFor(null);
      setNote("");
    }
  };

  const submitReplacement = async () => {
    if (!repOut || !repIn || !repFrom || !repTo) return;
    const ok = await runWithConfirm(
      (flags) =>
        coverageService.replacement({
          absentGuardId: repOut.guardId,
          replacementGuardId: repIn.guardId,
          dateFrom: repFrom,
          dateTo: repTo,
          reason: repReason,
          allowDoubleShift: flags.allowDoubleShift,
        }),
      t("ui.Coverage.reemplazoAplicado", "Reemplazo aplicado"),
    );

    if (ok) {
      setRepOpen(false);
      setRepOut(null);
      setRepIn(null);
      setRepFrom("");
      setRepTo("");
      setRepReason("vacaciones");
    }
  };

  const openReplacement = () => {
    if (!registrar.puede) {
      toast.info(registrar.porQueNo);
      return;
    }
    setRepFrom(tenantToday());
    setRepTo(tenantToday());
    setRepOpen(true);
  };

  const openCover = async (ev: any) => {
    if (!registrar.puede) {
      toast.info(registrar.porQueNo);
      return;
    }
    setCoverFor(ev);
    setCandidates(null);
    try {
      setCandidates(await coverageService.candidates({ eventId: ev.id }));
    } catch {
      setCandidates([]);
    }
  };

  /** Today in the TENANT's calendar, so the date input matches the operation. */
  const tenantToday = () => {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: live?.tz || "America/Mexico_City",
      }).format(new Date());
    } catch {
      return hoyEnLaEmpresa();
    }
  };

  const submitTransfer = async () => {
    const row = transferFor;

    if (!row || !toStationId) return;
    const range = transferMode === "range" && transferUntil;
    const ok = await runWithConfirm(
      (flags) =>
        coverageService.transfer({
          guardId: row.guardId,
          toStationId,
          // Either this one turno, or every turno from today through the chosen
          // date. Dates go as plain YYYY-MM-DD and are resolved in the tenant's
          // timezone server-side — parsing them here would drop the last day.
          ...(range
            ? { dateFrom: tenantToday(), dateTo: transferUntil }
            : { shiftIds: row.shiftId ? [row.shiftId] : undefined }),
          reasonNote: note.trim() || undefined,
          ...flags,
        }),
      range
        ? t("ui.Coverage.trasladadoHasta", {
            defaultValue: "Trasladado hasta el {{fecha}}",
            fecha: transferUntil,
          })
        : t("ui.Coverage.vigilanteTrasladado", "Vigilante trasladado"),
    );

    if (ok) {
      setTransferFor(null);
      setToStationId("");
      setNote("");
      setTransferMode("shift");
      setTransferUntil("");
    }
  };

  const summary = live?.summary || {};
  const problems = (summary.uncovered || 0) + (summary.at_risk || 0);

  const openEvents = useMemo(
    () => events.filter((e) => e.status === "open"),
    [events],
  );

  // Reparto de los puestos entre cubiertos / en riesgo / sin cubrir, para que
  // cada KPI diga qué porción del total representa.
  const totalPuestos =
    (summary.uncovered || 0) + (summary.at_risk || 0) + (summary.covered || 0);
  const pct = (n: number) =>
    totalPuestos > 0 ? Math.round((n / totalPuestos) * 100) : 0;

  const StationRow = ({ st }: { st: StationCoverage }) => (
    /* `glass-flat` y no `glass`: esta tarjeta se repite por cada puesto y un
       desenfoque por tarjeta obliga a rasterizar el fondo en cada fotograma. */
    <GlassPanel flat className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold">
            {st.nickname && (
              <span
                className="glass-sunken shrink-0 px-1.5 py-0.5 font-mono text-xs font-bold"
                style={{ color: "var(--ink-soft)" }}
              >
                {st.nickname}
              </span>
            )}
            <span className="truncate">{st.stationName || "—"}</span>
          </p>
          {st.minutesSinceStart != null && st.status !== "covered" && (
            <p
              className="mt-0.5 text-xs tabular-nums"
              style={{ color: "var(--ink-soft)" }}
            >
              {t("ui.Coverage.minDesdeElInicio", {
                defaultValue: "{{n}} min desde el inicio del turno",
                n: st.minutesSinceStart,
              })}
            </p>
          )}
        </div>
        <StatusBadge tone={STATUS_TONE[st.status] ?? "neutral"}>
          {STATUS_LABEL[st.status]}
        </StatusBadge>
      </div>

      {st.expected.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {st.expected.map((e) => {
            const here = st.present.some((p) => p.guardId === e.guardId);

            return (
              <div
                key={e.shiftId}
                /* En el teléfono el nombre va arriba y los botones debajo, en
                   su propia fila: tres botones que no parten («Trasladar»,
                   «Registrar entrada», «Novedad») suman 340 px y no caben junto
                   al nombre en una columna de 318. A partir de `sm` vuelven a la
                   misma línea, que es donde sí caben. */
                className="glass-sunken px-3 py-2 sm:flex sm:items-center sm:gap-2"
              >
                <div className="min-w-0 sm:flex-1">
                  <p className="truncate text-sm font-medium">
                    {e.fullName || t("comun.vigilante", "Vigilante")}
                  </p>
                  <p
                    className="text-xs tabular-nums"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {fmtTime(e.startTime)}–{fmtTime(e.endTime)} ·{" "}
                    <span
                      className="font-semibold"
                      style={{
                        color: here
                          ? "var(--ok-text)"
                          : e.enCamino
                            ? "var(--warn-text, var(--ink))"
                            : "var(--bad-text)",
                      }}
                    >
                      {/* El reemplazo que se acaba de mandar «va en camino»:
                          no es un «sin marcar entrada» hasta que pase su
                          gracia (lo decide el servidor). */}
                      {here
                        ? t("ui.Coverage.enElPuesto", "En el puesto")
                        : e.enCamino
                          ? t("ui.Coverage.vaEnCamino", {
                              defaultValue:
                                "Va en camino · enviado hace {{min}} min",
                              min: e.enCaminoDesde
                                ? Math.max(
                                    0,
                                    Math.round(
                                      (Date.now() -
                                        new Date(e.enCaminoDesde).getTime()) /
                                        60000,
                                    ),
                                  )
                                : 0,
                            })
                          : t(
                              "ui.Coverage.sinMarcarEntrada",
                              "Sin marcar entrada",
                            )}
                    </span>
                  </p>
                </div>
                {/* `cg-acciones`: en el teléfono los botones CRECEN hasta
                    llenar su línea en vez de quedarse pegados a la izquierda
                    con el ancho de su texto. */}
                <div className="cg-acciones mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:w-auto sm:shrink-0">
                  {trasladar.puede && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTransferFor({
                        ...e,
                        stationId: st.stationId,
                        stationName: st.stationName,
                      });
                      setToStationId("");
                      setNote("");
                    }}
                  >
                    <ArrowRightLeft className="mr-1 size-3.5" />{" "}
                    {t("ui.TransferShiftModal.trasladar", "Trasladar")}
                  </Button>
                  )}
                  {!here && registrar.puede && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setEntradaManualFor({
                            ...e,
                            stationId: st.stationId,
                            stationName: st.stationName,
                          });
                          setMotivoManual("");
                        }}
                      >
                        <UserCheck className="mr-1 size-3.5" />{" "}
                        {t("ui.Coverage.registrarEntrada", "Registrar entrada")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          setAbsenceFor({
                            ...e,
                            stationId: st.stationId,
                            stationName: st.stationName,
                          });
                          setReason("permiso_con_sueldo");
                          setNote("");
                        }}
                      >
                        {t("ui.Coverage.novedad", "Novedad")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {st.openEvents.map((ev) => (
        <div
          key={ev.id}
          className="mt-2 flex items-center gap-2 rounded-xl border px-3 py-2"
          style={{
            borderColor: "color-mix(in oklab, var(--bad) 30%, transparent)",
            background: "color-mix(in oklab, var(--bad) 10%, transparent)",
          }}
        >
          <ShieldAlert
            className="size-4 shrink-0"
            style={{ color: "var(--bad-text)" }}
          />
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold"
              style={{ color: "var(--bad-text)" }}
            >
              {REASON_LABEL[ev.reason] || ev.reason}
            </p>
            <p
              className="text-xs tabular-nums"
              style={{ color: "var(--ink-soft)" }}
            >
              {t("ui.Coverage.puestoVacioHace", {
                defaultValue: "Puesto vacío hace {{n}} min",
                n: ev.minutesOpen,
              })}
            </p>
          </div>
          {dobletes.porHueco.get(ev.id) ? (
            <ChipDeBusqueda s={dobletes.porHueco.get(ev.id)!} />
          ) : (
            dobletes.puede && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDobleteFor({
                    id: ev.id,
                    titulo: stationLabel({ stationName: st.stationName, nickname: st.nickname }),
                    detalle: REASON_LABEL[ev.reason] || ev.reason,
                  })
                }
              >
                <CalendarPlus className="mr-1 size-3.5" />{" "}
                {t("dobletes.cobertura.ofrecer", "Ofrecer doblete")}
              </Button>
            )
          )}
          <Button size="sm" onClick={() => openCover(ev)}>
            <UserPlus className="mr-1 size-3.5" />{" "}
            {t("ui.Coverage.cubrir", "Cubrir")}
          </Button>
        </div>
      ))}
    </GlassPanel>
  );

  return (
    <AppLayout>
      {/* Mismo ancho y mismos márgenes que sus cinco páginas hermanas: sin
          esto, pasar de Cobertura a Turnos abiertos daba un salto de anchura. */}
      <PageContainer width="wide">
        <PageHeader
          actions={
            <>
              <Button onClick={openReplacement} disabled={!registrar.puede} title={registrar.porQueNo}>
                <UserPlus className="mr-1.5 size-4" />{" "}
                {t("ui.Coverage.reemplazoPorVacaciones", "Reemplazo por vacaciones")}
              </Button>
              {dobletes.tiene && (
                <Button asChild variant="outline">
                  <Link to="/dobletes">
                    <CalendarPlus className="mr-1.5 size-4" />{" "}
                    {t("dobletes.titulo", "Dobletes")}
                  </Link>
                </Button>
              )}
              <Button disabled={busy} variant="outline" onClick={load}>
                <RefreshCw className="mr-1.5 size-4" />{" "}
                {t("app.refresh", "Actualizar")}
              </Button>
            </>
          }
          icon={<ShieldCheck />}
          subtitle={
            problems > 0
              ? t("ui.Coverage.puestosRequierenAtencion", {
                  defaultValue: "{{count}} puesto(s) requieren atención",
                  count: problems,
                })
              : t("ui.Coverage.todosLosPuestosCubiertos", "Todos los puestos cubiertos")
          }
          title={t("sidebar.asistencia.coberturaEnVivo", "Cobertura en vivo")}
        />

        <StatsStrip className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            delta={
              totalPuestos > 0
                ? {
                    value: `${pct(summary.uncovered || 0)} %`,
                    direction: (summary.uncovered || 0) > 0 ? "down" : "flat",
                  }
                : undefined
            }
            hint={t("ui.Coverage.puestosSinNadiePresente")}
            icon={<ShieldAlert />}
            label={t("comun.sinCubrir")}
            value={summary.uncovered || 0}
          />
          <MetricTile
            delta={
              totalPuestos > 0
                ? {
                    value: `${pct(summary.at_risk || 0)} %`,
                    direction: (summary.at_risk || 0) > 0 ? "down" : "flat",
                  }
                : undefined
            }
            hint={t("ui.Coverage.elTurnoEmpezoYNo")}
            icon={<Clock />}
            label={t("coverage.status.at_risk", "En riesgo")}
            value={summary.at_risk || 0}
          />
          <MetricTile
            delta={
              totalPuestos > 0
                ? { value: `${pct(summary.covered || 0)} %`, direction: "up" }
                : undefined
            }
            hint={t("ui.Coverage.vigilantePresenteEnElPuesto")}
            icon={<ShieldCheck />}
            label={t("ui.Coverage.cubiertos", "Cubiertos")}
            value={summary.covered || 0}
          />
          <MetricTile
            hint={t("ui.Coverage.ausenciasAunSinReemplazo")}
            icon={<ArrowRightLeft />}
            label={t("ui.Coverage.novedadesAbiertas", "Novedades abiertas")}
            value={openEvents.length}
          />
        </StatsStrip>

        <Segmented<"board" | "events">
          options={[
            { value: "board", label: t("ui.Coverage.puestos", "Puestos") },
            {
              value: "events",
              label: t("ui.Coverage.novedadesN", {
                defaultValue: "Novedades ({{n}})",
                n: events.length,
              }),
            },
          ]}
          value={tab}
          onChange={setTab}
        />

        {loading ? (
          <SkeletonCards />
        ) : fallo && !live ? (
          <ErrorDeCarga onRetry={() => void load()} />
        ) : tab === "board" ? (
          <Section title={t("ui.Coverage.estadoDeLosPuestos")}>
            {!live?.stations.length ? (
              <EmptyState
                description={t(
                  "ui.Coverage.todaviaNoHayPuestosConfigurados",
                  "Todavía no hay puestos configurados.",
                )}
                icon={<ShieldCheck />}
                title={t("comun.sinPuestos")}
              />
            ) : (
              <Stagger className="grid gap-3 lg:grid-cols-2">
                {live.stations.map((st) => (
                  <StationRow key={st.stationId} st={st} />
                ))}
              </Stagger>
            )}
          </Section>
        ) : (
          <Section
            title={t("ui.Coverage.novedadesRegistradas", "Novedades registradas")}
          >
            {!events.length ? (
              <EmptyState
                description={t(
                  "ui.Coverage.noSeHanRegistradoNovedades",
                  "No se han registrado novedades en el período.",
                )}
                icon={<ShieldCheck />}
                title={t("ui.Coverage.sinNovedades")}
              />
            ) : (
              <div className="space-y-2">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="glass-flat flex flex-wrap items-center gap-3 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {[ev.absentGuard?.firstName, ev.absentGuard?.lastName]
                          .filter(Boolean)
                          .join(" ") || t("comun.vigilante", "Vigilante")}
                        {" · "}
                        <span
                          className="font-normal"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {REASON_LABEL[ev.reason] || ev.reason}
                        </span>
                      </p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {stationLabel(ev.originStation)}
                        {ev.targetStation
                          ? ` → ${stationLabel(ev.targetStation)}`
                          : ""}
                        {" · "}
                        {new Date(ev.windowStart).toLocaleDateString(
                          localeActual(), { timeZone: zonaDeLaEmpresa() })}
                        {/* Same day start/end reads as one turno; otherwise show
                            the span so a multi-day traslado is legible. */}
                        {new Date(ev.windowEnd).toLocaleDateString(
                          localeActual(), { timeZone: zonaDeLaEmpresa() }) !==
                          new Date(ev.windowStart).toLocaleDateString(
                            localeActual(), { timeZone: zonaDeLaEmpresa() }) &&
                          ` – ${new Date(ev.windowEnd).toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa() })}`}
                        {ev.coveringGuard &&
                          t("ui.Coverage.cubreNombre", {
                            defaultValue: " · Cubre {{nombre}}",
                            nombre: [
                              ev.coveringGuard.firstName,
                              ev.coveringGuard.lastName,
                            ]
                              .filter(Boolean)
                              .join(" "),
                          })}
                      </p>
                      {/* A traslado expires on its own — say where they go back
                          to, so nobody goes looking for a button to undo it. */}
                      {ev.kind === "transfer" &&
                        ev.status !== "cancelled" &&
                        ev.originStation && (
                          <p
                            className="mt-0.5 text-[11px] font-medium"
                            style={{ color: "var(--brand-text)" }}
                          >
                            {t("ui.Coverage.vuelveADespuesDel", {
                              defaultValue: "Vuelve a {{puesto}} después del {{fecha}}",
                              puesto: stationLabel(ev.originStation),
                              fecha: new Date(ev.windowEnd).toLocaleDateString(
                                localeActual(),
                                { timeZone: zonaDeLaEmpresa() },
                              ),
                            })}
                          </p>
                        )}
                    </div>
                    {/* Payroll/discipline consequences, visible where they are decided. */}
                    {ev.countsAgainstGuard && (
                      <StatusBadge tone="bad">
                        {t("ui.Coverage.faltaGrave", "Falta grave")}
                      </StatusBadge>
                    )}
                    <StatusBadge dot={false} tone="neutral">
                      {ev.paid
                        ? t("ui.Coverage.conSueldo", "Con sueldo")
                        : t("ui.Coverage.sinSueldo", "Sin sueldo")}
                    </StatusBadge>
                    <StatusBadge
                      tone={
                        ev.status === "open"
                          ? "bad"
                          : ev.status === "resolved"
                            ? "warn"
                            : "ok"
                      }
                    >
                      {ev.status === "open"
                        ? t("comun.sinCubrir", "Sin cubrir")
                        : ev.status === "covered"
                          ? t("coverage.status.covered", "Cubierto")
                          : // Ya pasó y nadie lo cubrió. No lleva botón «Cubrir»
                            // porque no hay nada que cubrir: la noche fue y vino.
                            ev.status === "resolved"
                            ? t("ui.Coverage.quedoSinCubrir", "Quedó sin cubrir")
                            : ev.status}
                    </StatusBadge>
                    {ev.status === "open" &&
                      (dobletes.porHueco.get(ev.id) ? (
                        <ChipDeBusqueda s={dobletes.porHueco.get(ev.id)!} />
                      ) : (
                        dobletes.puede && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setDobleteFor({
                                id: ev.id,
                                titulo: stationLabel(ev.originStation),
                                detalle: REASON_LABEL[ev.reason] || ev.reason,
                              })
                            }
                          >
                            <CalendarPlus className="mr-1 size-3.5" />{" "}
                            {t("dobletes.cobertura.ofrecer", "Ofrecer doblete")}
                          </Button>
                        )
                      ))}
                    {ev.status === "open" && (
                      <Button size="sm" onClick={() => openCover(ev)}>
                        <UserPlus className="mr-1 size-3.5" />{" "}
            {t("ui.Coverage.cubrir", "Cubrir")}
                      </Button>
                    )}
                    {ev.status !== "cancelled" && (
                      <Button
                        disabled={busy}
                        size="sm"
                        title={t(
                          "ui.Coverage.anularLaNovedadYDevolver",
                          "Anular la novedad y devolver el turno a la rotación",
                        )}
                        variant="ghost"
                        hidden={!registrar.puede}
                        onClick={() =>
                          runWithConfirm(
                            () => coverageService.cancel(ev.id),
                            t("ui.Coverage.novedadAnulada", "Novedad anulada"),
                          )
                        }
                      >
                        <Undo2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* ── Report a novedad ─────────────────────────────────────────────── */}
        {/* ── Reemplazo por vacaciones/permiso ─────────────────────────────── */}
        <Modal
          description={t("ui.Coverage.elTitularSalePorUn")}
          footer={
            <>
              <Button variant="outline" onClick={() => setRepOpen(false)}>
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={busy || !repOut || !repIn || !repFrom || !repTo}
                onClick={submitReplacement}
              >
                <UserPlus className="mr-1.5 size-4" />{" "}
                {t("ui.Coverage.aplicarReemplazo", "Aplicar reemplazo")}
              </Button>
            </>
          }
          icon={<CalendarRange />}
          open={repOpen}
          title={t("ui.Coverage.reemplazoPorVacacionesOPermiso")}
          onOpenChange={(o) => {
            if (!o) setRepOpen(false);
          }}
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {t("ui.Coverage.vigilanteQueSale")}
                </label>
                <GuardTypeahead
                  excludeGuardId={repIn?.guardId}
                  placeholder={t(
                    "ui.Coverage.quienTomaVacacionesPermiso",
                    "Quién toma vacaciones/permiso",
                  )}
                  value={repOut}
                  onSelect={setRepOut}
                />
              </div>
              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {t("ui.Coverage.reemplazo", "Reemplazo")}
                </label>
                <GuardTypeahead
                  excludeGuardId={repOut?.guardId}
                  placeholder={t("ui.Coverage.quienLoCubre", "Quién lo cubre")}
                  value={repIn}
                  onSelect={setRepIn}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {t("comun.desde")}
                </label>
                <input
                  className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--glass-sunken)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                  max={repTo || undefined}
                  type="date"
                  value={repFrom}
                  onChange={(e) => setRepFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {t("comun.hasta")}
                </label>
                <input
                  className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--glass-sunken)] px-3 py-2 text-sm text-[var(--ink)] outline-none"
                  min={repFrom || undefined}
                  type="date"
                  value={repTo}
                  onChange={(e) => setRepTo(e.target.value)}
                />
              </div>
              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {t("comun.motivo")}
                </label>
                <Select
                  value={repReason}
                  onValueChange={(v) => setRepReason(v as CoverageReason)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "vacaciones",
                      "permiso_con_sueldo",
                      "permiso_sin_sueldo",
                    ].map((r) => (
                      <SelectItem key={r} value={r}>
                        {REASON_LABEL[r] || r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Resumen en vivo: lo que va a pasar, en una frase clara. */}
            {repOut && repIn && repFrom && repTo && (
              <GlassPanel
                className="p-3 text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                <span className="font-semibold text-[var(--ink)]">
                  {repIn.label}
                </span>{" "}
                {t("ui.Coverage.reemplazaA", "reemplaza a")}{" "}
                <span className="font-semibold text-[var(--ink)]">
                  {repOut.label}
                </span>{" "}
                {t("ui.Coverage.del", "del")}{" "}
                <span className="font-semibold text-[var(--ink)]">
                  {repFrom}
                </span>{" "}
                {t("ui.Coverage.al", "al")}{" "}
                <span className="font-semibold text-[var(--ink)]">{repTo}</span>
                {t(
                  "ui.Coverage.tomaSusTurnosDelPuesto",
                  ". Toma sus turnos del puesto, figura en la estación y puede fichar. Al terminar, la rotación del titular regresa sola.",
                )}
              </GlassPanel>
            )}
          </div>
        </Modal>

        {/* ── Registrar la entrada a nombre del vigilante ──────────────────── */}
        <Modal
          description={`${entradaManualFor?.fullName || t("comun.vigilante", "Vigilante")} · ${entradaManualFor?.stationName || ""}`}
          footer={
            <>
              <Button
                variant="outline"
                onClick={() => setEntradaManualFor(null)}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                disabled={busy || motivoManual.trim().length < 10}
                onClick={registrarEntradaManual}
              >
                {t("ui.Coverage.registrarEntrada", "Registrar entrada")}
              </Button>
            </>
          }
          icon={<UserCheck />}
          open={!!entradaManualFor}
          title={t(
            "ui.Coverage.registrarEntradaANombreDelVigilante",
            "Registrar entrada a nombre del vigilante",
          )}
          onOpenChange={(o) => !o && setEntradaManualFor(null)}
        >
          <div className="space-y-3">
            <InfoNote tone="warn">
              {t("ui.Coverage.usaloSoloCuandoLaPersona", "Úsalo sólo cuando la persona")}{" "}
              <b>{t("ui.Coverage.estaEnElPuesto", "está en el puesto")}</b>{" "}
              {t(
                "ui.Coverage.yNoPuedeFicharElTurnoSeRegistra",
                "y no puede fichar. El turno se registra",
              )}{" "}
              <b>{t("ui.Coverage.sinUbicacion", "sin ubicación")}</b>{" "}
              {t(
                "ui.Coverage.nadieMarcoConGps",
                "—nadie marcó con GPS, y no lo inventamos— y queda en",
              )}{" "}
              <b>{t("ui.Coverage.esperaDeRevision", "espera de revisión")}</b>{" "}
              {t(
                "ui.Coverage.conTuNombreYElMotivo",
                "con tu nombre y el motivo en la bitácora de la tarjeta.",
              )}
            </InfoNote>
            <label className="block">
              <span className="cg-eyebrow mb-1 block">
                {t("ui.Coverage.motivoReq", "Motivo *")}
              </span>
              <input
                className="cg-input cg-focus w-full px-3 py-2 text-sm"
                placeholder={t(
                  "ui.Coverage.placeholderMotivoManual",
                  "Ej.: se le dañó el teléfono camino al puesto; reportó por radio a la central",
                )}
                value={motivoManual}
                onChange={(e) => setMotivoManual(e.target.value)}
              />
              <span
                className="mt-1 block text-[10px]"
                style={{ color: "var(--ink-faint)" }}
              >
                {motivoManual.trim().length < 10
                  ? t(
                      "ui.Coverage.escribeAlMenos10Caracteres",
                      "Escribe al menos 10 caracteres: dentro de un mes alguien va a leer esto para entender por qué se pagó un turno sin fichaje.",
                    )
                  : t(
                      "ui.Coverage.quedaEnLaBitacora",
                      "Queda en la bitácora, junto a quién lo autorizó.",
                    )}
              </span>
            </label>
          </div>
        </Modal>

        <Modal
          description={`${absenceFor?.fullName || t("comun.vigilante", "Vigilante")} · ${absenceFor?.stationName || ""}`}
          footer={
            <>
              <Button variant="outline" onClick={() => setAbsenceFor(null)}>
                {t("actions.cancel")}
              </Button>
              <Button disabled={busy} onClick={submitAbsence}>
                {t("ui.Coverage.registrar", "Registrar")}
              </Button>
            </>
          }
          icon={<ShieldAlert />}
          open={!!absenceFor}
          title={t("ui.Coverage.marcarNovedad", "Marcar novedad")}
          onOpenChange={(o) => !o && setAbsenceFor(null)}
        >
          <div className="space-y-4">
            <div>
              <label className="cg-eyebrow mb-1.5 block">
                {t("comun.motivo")}
              </label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as CoverageReason)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COVERAGE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {REASON_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* The reason is not a label: it decides pay and discipline. */}
              <p
                className="mt-1.5 text-xs"
                style={{ color: "var(--ink-soft)" }}
              >
                {t(
                  "ui.Coverage.elMotivoDefineSiLaAusencia",
                  "El motivo define si la ausencia es remunerada y si afecta el récord del vigilante.",
                )}
              </p>
            </div>
            <div>
              <label className="cg-eyebrow mb-1.5 block">
                {t("ui.Coverage.detalleOpcional")}
              </label>
              <Textarea
                placeholder={t(
                  "ui.Coverage.ejLlamoSeLeDano",
                  "Ej.: llamó, se le dañó la moto en la vía",
                )}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </Modal>

        {/* ── Offer the gap to the reserve (Dobletes) ─────────────────────── */}
        {dobletes.puede && (
          <LanzarDoblete
            hueco={dobleteFor}
            open={!!dobleteFor}
            onLanzado={() => {
              void dobletes.recargar();
              void load();
            }}
            onOpenChange={(o) => !o && setDobleteFor(null)}
          />
        )}

        {/* ── Cover an empty post ──────────────────────────────────────────── */}
        <Modal
          icon={<UserPlus />}
          open={!!coverFor}
          title={t("ui.Coverage.quienCubreElPuesto", "¿Quién cubre el puesto?")}
          onOpenChange={(o) => !o && setCoverFor(null)}
        >
          <div className="space-y-2">
            {candidates == null ? (
              <SkeletonCards />
            ) : !candidates.length ? (
              <EmptyState
                description={t(
                  "ui.Coverage.nadieEstaLibreEnEse",
                  "Nadie está libre en ese horario.",
                )}
                icon={<UserPlus />}
                title={t("comun.sinVigilantesDisponibles")}
              />
            ) : (
              candidates.map((c) => (
                <button
                  key={c.guardId}
                  className="glass-flat glass-hover cg-focus flex w-full items-center gap-3 p-3 text-left"
                  disabled={busy}
                  type="button"
                  onClick={async () => {
                    const ok = await runWithConfirm(
                      (flags) =>
                        coverageService.cover(coverFor.id, c.guardId, flags),
                      t("ui.Coverage.puestoCubierto", "Puesto cubierto"),
                    );

                    if (ok) setCoverFor(null);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {c.fullName || t("comun.vigilante", "Vigilante")}
                    </p>
                    {/* Why the system suggests them — the operator can overrule it. */}
                    <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                      {c.reason}
                    </p>
                    {/* They said they cannot work these hours (their availability). */}
                    {c.outsideAvailability && (
                      <p className="text-xs" style={{ color: "var(--warn-text)" }}>
                        {t(
                          "ui.Coverage.fueraDeDisponibilidad",
                          "Fuera de su disponibilidad",
                        )}
                      </p>
                    )}
                  </div>
                  <IconTile size="sm">
                    <UserPlus />
                  </IconTile>
                </button>
              ))
            )}
          </div>
        </Modal>

        {/* ── Temporary transfer ───────────────────────────────────────────── */}
        <Modal
          description={`${transferFor?.fullName || t("comun.vigilante", "Vigilante")}${t(
            "ui.TransferShiftModal.desdeEstacion",
            {
              defaultValue: " · desde {{estacion}}",
              estacion: transferFor?.stationName || "",
            },
          )}`}
          footer={
            <>
              <Button variant="outline" onClick={() => setTransferFor(null)}>
                {t("actions.cancel")}
              </Button>
              <Button disabled={busy || !toStationId} onClick={submitTransfer}>
                {t("ui.TransferShiftModal.trasladar", "Trasladar")}
              </Button>
            </>
          }
          icon={<ArrowRightLeft />}
          open={!!transferFor}
          title={t("ui.Coverage.trasladoTemporal", "Traslado temporal")}
          onOpenChange={(o) => !o && setTransferFor(null)}
        >
          <div className="space-y-4">
            <div>
              <label className="cg-eyebrow mb-1.5 block">
                {t("comun.puestoDestino")}
              </label>
              <Select value={toStationId} onValueChange={setToStationId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("comun.eligeUnPuesto")} />
                </SelectTrigger>
                <SelectContent>
                  {/* The live payload already carries every station the caller
                      may see, correctly tenant-scoped — no second fetch needed. */}
                  {(live?.stations || [])
                    .filter(
                      (s) =>
                        String(s.stationId) !== String(transferFor?.stationId),
                    )
                    .map((s) => (
                      <SelectItem key={s.stationId} value={String(s.stationId)}>
                        {stationLabel(s)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="cg-eyebrow mb-1.5 block">
                {t("ui.Coverage.duracion", "Duración")}
              </label>
              <Segmented<"shift" | "range">
                options={[
                  {
                    value: "shift",
                    label: t("ui.TransferShiftModal.soloEsteTurno", "Solo este turno"),
                  },
                  {
                    value: "range",
                    label: t("ui.TransferShiftModal.hastaUnaFecha", "Hasta una fecha"),
                  },
                ]}
                value={transferMode}
                onChange={(v) => {
                  setTransferMode(v);
                  if (v === "range" && !transferUntil)
                    setTransferUntil(tenantToday());
                }}
              />
              {transferMode === "range" && (
                <input
                  className="cg-input cg-focus mt-2 w-full px-3 py-2 text-sm tabular-nums"
                  min={tenantToday()}
                  type="date"
                  value={transferUntil}
                  onChange={(e) => setTransferUntil(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="cg-eyebrow mb-1.5 block">
                {t("comun.motivoOpcional")}
              </label>
              <Textarea
                placeholder={t("ui.Coverage.ejRefuerzoPorEventoEn")}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {/* The single most important thing to state plainly: the traslado
                ENDS BY ITSELF. It moves only the turnos in the range, so the
                next one is back at their own post — nothing to remember. */}
            <div className="glass-brand rounded-xl p-3 text-xs">
              <p className="font-semibold">
                {transferMode === "range" && transferUntil
                  ? t("ui.TransferShiftModal.cubreHasta", {
                      defaultValue: "Cubre {{destino}} hasta el {{fecha}}.",
                      destino: transferFor?.stationName
                        ? t("ui.Coverage.otroPuesto", "otro puesto")
                        : t("ui.TransferShiftModal.elDestino", "el destino"),
                      fecha: transferUntil,
                    })
                  : t("ui.TransferShiftModal.cubreSoloEsteTurno", {
                      defaultValue: "Cubre {{destino}} solo en este turno.",
                      destino: t("ui.TransferShiftModal.elDestino", "el destino"),
                    })}
              </p>
              <p className="mt-1" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.Coverage.despuesVuelveAutomaticamenteA",
                  "Después vuelve automáticamente a",
                )}{" "}
                <strong>
                  {transferFor?.stationName ||
                    t("ui.TransferShiftModal.suPuesto", "su puesto")}
                </strong>
                {t(
                  "ui.Coverage.noHaceFaltaRevertirlo",
                  ". No hace falta revertirlo: solo se trasladan los turnos del rango.",
                )}
              </p>
            </div>
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.Coverage.elVigilantePodraMarcarEntrada",
                "El vigilante podrá marcar entrada en el puesto destino y recibirá sus recordatorios de turno allí, como cualquier turno normal. El puesto que deja queda visible como",
              )}{" "}
              <strong>{t("ui.Coverage.sinCubrir")}</strong>{" "}
              {t(
                "ui.Coverage.hastaQueSeAsigneUnReemplazo",
                "hasta que se asigne un reemplazo.",
              )}
            </p>
          </div>
        </Modal>
      </PageContainer>
    </AppLayout>
  );
}

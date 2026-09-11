import type { Station } from "@/types";

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  MapPin,
  Clock,
  Users,
  Pencil,
  Check,
  Loader2,
  Activity,
  LogIn,
  LogOut,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

import { invalidateEntity } from "@/lib/queryClient";
import IncidentMap from "@/components/IncidentMap/IncidentMap";
import { StatusBadge } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import { confirmDialog } from "@/components/ui/confirmDialog";
import StationGeofencePolygon, {
  type PolyPoint,
} from "@/components/GoogleMap/StationGeofencePolygon";
import RotacionDeLaEstacion from "@/components/schedule/RotacionDeLaEstacion";
import {
  etiquetaPrimerTramo,
  etiquetaSegundoTramo,
} from "@/components/schedule/tramos";
import { reverseGeocode } from "@/lib/geocodeClient";
import { Section, StatCard, Stagger } from "@/components/kit";
import { localeActual } from "@/lib/localeActual";
interface StationDetail extends Station {
  name?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  numberOfGuardsInStation?: string | number | null;
  clockInEarlyBufferMin?: number | null;
  clockInLateGraceMin?: number | null;
  geofencePolygon?: PolyPoint[] | null;
  geofenceRadius?: number | string | null;
  startingTimeInDay?: string | null;
  finishTimeInDay?: string | null;
}

type Props = { station: StationDetail; stationId: string; postSiteId: string };

// A guard-shift row from /guard-shift — the attendance/clock-in record. Note the
// backend nests the guard's display name under guardName.fullName (an object).
interface RecentShiftRow {
  id?: string;
  punchInTime?: string | null;
  punchOutTime?: string | null;
  status?: string;
  guardName?: { fullName?: string } | null;
}

// A station's "horario" = the scheduling engine's scheduleType, configured via
// /auto-positions (the same path Programador › Horario uses). The turno picker
// maps to scheduleType so assigned guards abide by the station's horario.
type TurnoType = "diurno" | "nocturno" | "24h" | "custom";
// `label`/`sub` guardan la CLAVE i18n junto al texto español de respaldo; la
// traducción ocurre al pintar. Los rangos horarios no llevan clave: son datos.
const TURNO_LABELS: {
  key: TurnoType;
  label: string;
  labelKey: string;
  sub: string;
  subKey?: string;
}[] = [
  {
    key: "diurno",
    label: "12h Diurno",
    labelKey: "ui.StationOverview.turno.diurno",
    sub: "07:00–19:00",
  },
  {
    key: "nocturno",
    label: "12h Nocturno",
    labelKey: "ui.StationOverview.turno.nocturno",
    sub: "19:00–07:00",
  },
  {
    key: "24h",
    label: "24 Horas",
    labelKey: "ui.StationOverview.turno.24h",
    sub: "Día + Noche",
    subKey: "ui.StationOverview.turno.diaYNoche",
  },
  {
    key: "custom",
    label: "Personalizado",
    labelKey: "ui.StationOverview.turno.custom",
    sub: "Define las horas",
    subKey: "ui.StationOverview.turno.defineLasHoras",
  },
];

function turnoToScheduleType(
  turno: TurnoType,
): "12h-day" | "12h-night" | "24h" | "custom" {
  switch (turno) {
    case "diurno":
      return "12h-day";
    case "nocturno":
      return "12h-night";
    case "24h":
      return "24h";
    default:
      return "custom";
  }
}
function scheduleTypeToTurno(st?: string | null): TurnoType | "" {
  switch (st) {
    case "12h-day":
      return "diurno";
    case "12h-night":
      return "nocturno";
    case "24h":
      return "24h";
    case "custom":
      return "custom";
    default:
      return "";
  }
}

export default function StationOverview({
  station,
  stationId,
  postSiteId,
}: Props) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-station clock-in tolerance windows (minutes). Empty = use tenant default.
  const [clockInEarlyBufferMin, setClockInEarlyBufferMin] = useState("");
  const [clockInLateGraceMin, setClockInLateGraceMin] = useState("");

  // Station horario (turno) — drives scheduleType + positions via /auto-positions.
  const [turno, setTurno] = useState<TurnoType | "">("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  // Custom: hours each fijo works per day ('' = one fijo covers the whole window).
  const [blockHours, setBlockHours] = useState("");
  const winMin = (() => {
    if (!customStart || !customEnd) return 0;
    const toMin = (x: string) => {
      const [h, mm] = x.split(":").map((n) => parseInt(n, 10) || 0);

      return ((h % 24) * 60 + (mm % 60) + 1440) % 1440;
    };
    const w = (toMin(customEnd) - toMin(customStart) + 1440) % 1440;

    return w === 0 ? 1440 : w;
  })();
  const blocksOk =
    Number(blockHours) > 0 &&
    winMin > 0 &&
    winMin % (Number(blockHours) * 60) === 0;
  const blockCount = blocksOk ? winMin / (Number(blockHours) * 60) : 1;
  // Cómo se llama el segundo tramo del ciclo aquí: en 07:00–15:00 + 15:00–23:00
  // es la TARDE, y llamarla «noche» hacía irreconocible lo recién configurado.
  const primerTramo = etiquetaPrimerTramo(
    customStart,
    Number(blockHours) * 60,
    blockCount,
  );
  const segundoTramo = etiquetaSegundoTramo(
    customStart,
    Number(blockHours) * 60,
    blockCount,
  );
  const [restCoverage, setRestCoverage] = useState<"sacafranco" | "alternate">(
    "sacafranco",
  );
  const [rotStyle, setRotStyle] = useState<{
    // El nombre («4-4-2», «7-1 · D/N · dom») es lo que se resume en la cabecera
    // de los ajustes plegados, para no tener que abrirlos sólo para mirar.
    name?: string | null;
    dayShifts: number;
    nightShifts: number;
    restDays: number;
  } | null>(null);
  const rotCycle = rotStyle
    ? (rotStyle.dayShifts || 0) +
      (rotStyle.nightShifts || 0) +
      (rotStyle.restDays || 0)
    : 0;
  const rotWork = rotStyle
    ? (rotStyle.dayShifts || 0) + (rotStyle.nightShifts || 0)
    : 0;
  const alternateOk =
    restCoverage !== "alternate" || (rotWork > 0 && rotCycle % rotWork === 0);
  const guardsPerBlock =
    restCoverage === "alternate" && alternateOk && rotWork > 0
      ? rotCycle / rotWork
      : 1;
  const [rotationStyleId, setRotationStyleId] = useState("");
  /* Un ciclo por plaza cuando la rotación es individual; `null` = compartida. */
  const [estilosPorPlaza, setEstilosPorPlaza] = useState<string[] | null>(null);
  /* Los ajustes de rotación nacen plegados. Se abren solos cuando la estación
     corre rotación INDIVIDUAL, que es lo único que no se puede resumir en una
     línea y que nadie configuró por accidente. */
  const [avanzado, setAvanzado] = useState(false);
  useEffect(() => {
    if (estilosPorPlaza) setAvanzado(true);
  }, [estilosPorPlaza]);

  /* El NOMBRE del ciclo para la línea de resumen. No se puede sacar de
     `rotStyle`, que lo rellena el selector y el selector sólo existe con el
     panel abierto: plegado diría «aún sin ciclo» en una estación que sí tiene
     uno. Una lectura del catálogo y a resolverlo por id. */
  const [nombreDelCiclo, setNombreDelCiclo] = useState<string | null>(null);
  useEffect(() => {
    const tid = localStorage.getItem("tenantId") || "";
    if (!tid || !rotationStyleId) {
      setNombreDelCiclo(null);

      return;
    }
    let vivo = true;

    ApiService.get(`/tenant/${tid}/rotation-styles`)
      .then((res: any) => {
        if (!vivo) return;
        const filas = Array.isArray(res) ? res : (res?.rows ?? []);
        const suyo = filas.find(
          (x: any) => String(x.id) === String(rotationStyleId),
        );

        setNombreDelCiclo(suyo?.name ?? null);
      })
      .catch(() => setNombreDelCiclo(null));

    return () => {
      vivo = false;
    };
  }, [rotationStyleId]);
  const [savingHorario, setSavingHorario] = useState(false);

  // Station LOCATION (coordinates the clock-in geofence uses). Editable here —
  // a station does NOT auto-inherit changes to the client/sitio address.
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [savingLoc, setSavingLoc] = useState(false);
  const [siteLoc, setSiteLoc] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [polygon, setPolygon] = useState<PolyPoint[]>([]);
  // Human-readable address for the station coords (reverse-geocoded for display).
  const [stationAddress, setStationAddress] = useState("");
  // Actividad reciente de la estación (marcaciones) — alimenta cobertura en
  // vivo + la lista de actividad del modo lectura.
  const [recentShifts, setRecentShifts] = useState<RecentShiftRow[] | null>(
    null,
  );

  useEffect(() => {
    if (!stationId) return;
    let alive = true;
    const tenantId = localStorage.getItem("tenantId") || "";

    ApiService.get(
      `/tenant/${tenantId}/guard-shift?filter[stationName]=${encodeURIComponent(stationId)}&limit=15&orderBy=punchInTime_DESC`,
    )
      .then((res: any) => {
        if (!alive) return;
        setRecentShifts((res && (res.rows || res.data?.rows)) || []);
      })
      .catch(() => alive && setRecentShifts([]));

    return () => {
      alive = false;
    };
  }, [stationId]);

  useEffect(() => {
    const la = station?.latitud ?? station?.latitude;
    const ln = station?.longitud ?? station?.longitude;

    if (la == null || ln == null || la === "" || ln === "") {
      setStationAddress("");

      return;
    }
    let alive = true;

    reverseGeocode(la, ln)
      .then((r: any) => {
        if (alive) setStationAddress(r?.display_name || "");
      })
      .catch(() => {
        /* keep coords fallback */
      });

    return () => {
      alive = false;
    };
  }, [
    station?.latitud,
    station?.longitud,
    station?.latitude,
    station?.longitude,
  ]);

  // Load the parent sitio's coordinates (for the "Igual que el sitio" button).
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!postSiteId) return;
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        const res: any = await ApiService.get(
          `/tenant/${tenantId}/post-site/${postSiteId}`,
        );
        const s = res?.data ?? res ?? {};
        const la = Number(s.latitud ?? s.latitude);
        const ln = Number(s.longitud ?? s.longitude);

        if (alive && Number.isFinite(la) && Number.isFinite(ln))
          setSiteLoc({ lat: la, lng: ln });
      } catch {
        /* best-effort */
      }
    })();

    return () => {
      alive = false;
    };
  }, [postSiteId]);

  // Sync state from station prop
  useEffect(() => {
    if (!station) return;
    setClockInEarlyBufferMin(
      station.clockInEarlyBufferMin === null ||
        station.clockInEarlyBufferMin === undefined
        ? ""
        : String(station.clockInEarlyBufferMin),
    );
    setClockInLateGraceMin(
      station.clockInLateGraceMin === null ||
        station.clockInLateGraceMin === undefined
        ? ""
        : String(station.clockInLateGraceMin),
    );
    setTurno(scheduleTypeToTurno(station.scheduleType));
    setCustomStart(station.startingTimeInDay || "");
    setCustomEnd(station.finishTimeInDay || "");
    setRotationStyleId(station.rotationStyleId || "");
    setEditLat(
      station.latitud != null && station.latitud !== ""
        ? String(station.latitud)
        : station.latitude != null
          ? String(station.latitude)
          : "",
    );
    setEditLng(
      station.longitud != null && station.longitud !== ""
        ? String(station.longitud)
        : station.longitude != null
          ? String(station.longitude)
          : "",
    );
    setPolygon(
      Array.isArray(station.geofencePolygon) ? station.geofencePolygon : [],
    );
  }, [station]);

  /* ── LO QUE YA ESTÁ CONFIGURADO POR PLAZA ────────────────────────────────
     Sin esto, abrir el horario de una estación que corre rotación individual la
     enseñaba como si fuera compartida, y pulsar «Actualizar horario» por
     cualquier otro motivo —cambiar la hora, por ejemplo— la habría devuelto a
     un solo ciclo sin avisar. Se leen las plazas y se rehidrata el modo. */
  useEffect(() => {
    if (!stationId) return;
    let vivo = true;

    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        const res: any = await ApiService.get(
          `/tenant/${tenantId}/station/${stationId}/positions`,
        );
        const filas = (Array.isArray(res) ? res : (res?.rows ?? []))
          .filter((p: any) => (p.type || "fijo") !== "sacafranco")
          .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

        if (!vivo) return;
        setEstilosPorPlaza(
          filas.some((p: any) => p.rotationStyleId)
            ? filas.map((p: any) => String(p.rotationStyleId || ""))
            : null,
        );
      } catch {
        /* se queda en compartida, que es el defecto */
      }
    })();

    return () => {
      vivo = false;
    };
  }, [stationId]);

  if (!station) {
    return (
      <div className="text-muted-foreground text-sm">
        {t(
          "ui.StationOverview.noHayInformacionDelPuesto",
          "No hay información del puesto",
        )}
      </div>
    );
  }

  const name = station.name || station.stationName || "-";
  const lat = station.latitud || station.latitude || "";
  const lng = station.longitud || station.longitude || "";
  const assignedGuards = Array.isArray(station.assignedGuards)
    ? station.assignedGuards
    : [];

  // Save the clock-in tolerance windows. The turno (scheduleType) and location
  // each have their own save action below; this only persists the tolerance.
  const handleSave = async () => {
    setSaving(true);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";

      await ApiService.put(`/tenant/${tenantId}/station/${stationId}`, {
        data: {
          // Empty input → null so the tenant Nómina default applies.
          clockInEarlyBufferMin:
            clockInEarlyBufferMin.trim() === ""
              ? null
              : Number(clockInEarlyBufferMin),
          clockInLateGraceMin:
            clockInLateGraceMin.trim() === ""
              ? null
              : Number(clockInLateGraceMin),
        },
      });
      invalidateEntity("stations");
      toast.success("Tolerancia guardada");
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  // Update the station's horario through the scheduling engine (same endpoint as
  // Programador › Horario). Reconfigures the turno positions + regenerates
  // shifts, so it only runs when the horario actually changed and after a
  // confirm (it clears existing assignments at this station).
  const updateHorario = async () => {
    if (!turno) {
      toast.error(t("ui.StationOverview.seleccionaUnTurno"));

      return;
    }
    if (turno === "custom" && (!customStart || !customEnd)) {
      toast.error(t("comun.defineLaHoraDeInicio"));

      return;
    }
    if (turno === "custom" && blockHours && !blocksOk) {
      toast.error(t("comun.laDuracionDelTurnoDebe"));

      return;
    }
    if (turno === "custom" && restCoverage === "alternate" && !alternateOk) {
      toast.error(t("comun.paraAlternarSinSacafrancoEl"));

      return;
    }
    const scheduleType = turnoToScheduleType(turno);
    const currentType = station.scheduleType || "";
    const unchangedType = scheduleType === currentType;
    const unchangedCustom =
      turno !== "custom" ||
      (!blockHours &&
        restCoverage === "sacafranco" &&
        customStart === (station.startingTimeInDay || "") &&
        customEnd === (station.finishTimeInDay || ""));
    const unchangedRotation =
      (rotationStyleId || "") === (station.rotationStyleId || "") &&
      // Elegir rotación individual no toca `rotationStyleId` —el ciclo va por
      // plaza—, así que sin esto el atajo de «no cambió nada» se tragaba el
      // cambio entero y el botón no hacía absolutamente nada.
      !estilosPorPlaza;

    if (unchangedType && unchangedCustom && unchangedRotation) {
      toast.info(t("ui.StationOverview.elHorarioNoCambio"));

      return;
    }
    if (
      !(await confirmDialog({
        message:
          "Cambiar el horario reconfigura los puestos del turno. Si hay vigilantes asignados a esta estación, deberán reasignarse. ¿Continuar?",
        confirmText: "Continuar",
      }))
    )
      return;
    setSavingHorario(true);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";

      await ApiService.post(
        `/tenant/${tenantId}/station/${stationId}/auto-positions`,
        {
          data: {
            scheduleType,
            rotationStyleId: rotationStyleId || undefined,
            startTime: turno === "custom" ? customStart : undefined,
            endTime: turno === "custom" ? customEnd : undefined,
            blockHours:
              turno === "custom" && blockHours ? Number(blockHours) : undefined,
            restCoverage: turno === "custom" ? restCoverage : undefined,
            // Rotación individual: un ciclo por plaza, en orden de plaza. Ausente
            // = compartida, y las plazas conservan el que ya tuvieran.
            positionRotationStyleIds: estilosPorPlaza || undefined,
          },
        },
      );
      toast.success(t("ui.StationOverview.horarioActualizadoLosPuestosDel"));
      // Tell the Turnos tab to re-derive its coverage sketch from the new
      // positions immediately (no manual reload / no stale day+night sketch).
      try {
        window.dispatchEvent(
          new CustomEvent("station-horario-changed", { detail: { stationId } }),
        );
      } catch {
        /* noop */
      }
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "station.overview.scheduleUpdateError",
            "Error al actualizar el horario",
          ),
      );
    } finally {
      setSavingHorario(false);
    }
  };

  // Save the station's coordinates (the clock-in geofence center) AND the
  // polygon geofence together — one map, one save.
  const saveLocation = async () => {
    const latNum = Number(editLat);
    const lngNum = Number(editLng);

    if (
      !editLat.trim() ||
      !editLng.trim() ||
      !Number.isFinite(latNum) ||
      !Number.isFinite(lngNum)
    ) {
      toast.error(t("ui.StationOverview.defineLaUbicacionBuscaLa"));

      return;
    }
    setSavingLoc(true);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";

      await ApiService.put(`/tenant/${tenantId}/station/${stationId}`, {
        data: {
          latitud: latNum,
          longitud: lngNum,
          geofencePolygon: polygon.length >= 3 ? polygon : null,
        },
      });
      invalidateEntity("stations");
      toast.success(t("ui.StationOverview.ubicacionYGeocercaActualizadas"));
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "station.overview.locationSaveError",
            "Error al guardar la ubicación",
          ),
      );
    } finally {
      setSavingLoc(false);
    }
  };

  // ── READ MODE ──
  if (!editing) {
    const turnoInfo = TURNO_LABELS.find(
      (o) => o.key === scheduleTypeToTurno(station.scheduleType),
    );
    const fijos =
      station.scheduleType === "24h"
        ? 2
        : station.scheduleType === "custom"
          ? Number(station.numberOfGuardsInStation) || 1
          : station.scheduleType
            ? 1
            : 0;
    const rows = recentShifts || [];
    const openNow = rows.filter((r) => !r.punchOutTime);
    const today = new Date();

    today.setHours(0, 0, 0, 0);
    const todayCount = rows.filter(
      (r) => r.punchInTime && new Date(r.punchInTime) >= today,
    ).length;
    const STATUS_TONE: Record<
      string,
      { label: string; tone: "green" | "orange" | "red" | "slate" | "primary" }
    > = {
      on_time: { label: "A tiempo", tone: "green" },
      late: { label: "Tarde", tone: "orange" },
      early_departure: { label: "Salida temprana", tone: "orange" },
      missed_clockout: {
        label: t("nomina.estado.missed_clockout", "Sin salida"),
        tone: "red",
      },
      no_call_no_show: {
        label: t("station.overview.status.noShow", "No asistió"),
        tone: "red",
      },
      overtime: { label: "Horas extra", tone: "primary" },
      pending_review: {
        label: t("nomina.estado.pending_review", "En revisión"),
        tone: "slate",
      },
    };
    const fmtHM = (d: any) =>
      d
        ? new Date(d).toLocaleTimeString(localeActual(), {
            hour: "2-digit",
            minute: "2-digit",
          })
        : null;
    const fmtDay = (d: any) =>
      d
        ? new Date(d).toLocaleDateString(localeActual(), {
            day: "2-digit",
            month: "short",
          })
        : "";
    // Tinte estable por vigilante: el acento del usuario ROTADO de tono. No es un
    // color escrito — se repinta solo al cambiar el acento y funciona en ambos temas.
    const guardHue = (nm: string) => {
      let h = 0;

      for (let i = 0; i < nm.length; i++) h = (h * 31 + nm.charCodeAt(i)) >>> 0;

      return [0, 200, 45, 250, 100, 310, 155, 25][h % 8];
    };
    const guardChip = (nm: string): React.CSSProperties => ({
      backgroundColor: `color-mix(in oklab, oklch(from var(--brand) l c calc(h + ${guardHue(nm)})) 22%, transparent)`,
      color: `oklch(from var(--brand-text) l c calc(h + ${guardHue(nm)}))`,
    });

    return (
      <div className="space-y-4">
        {/* Cobertura de un vistazo */}
        <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            accent={openNow.length ? "ok" : "bad"}
            hint={
              openNow.length
                ? openNow
                    .map((r) => r.guardName?.fullName || "Vigilante")
                    .join(", ")
                : "Nadie fichado"
            }
            icon={<ShieldCheck />}
            label={t("ui.StationOverview.deTurnoAhora")}
            value={recentShifts === null ? "…" : openNow.length}
          />
          <StatCard
            accent="info"
            icon={<Users />}
            label="Fijos requeridos"
            value={fijos || "—"}
          />
          <StatCard
            icon={<Activity />}
            label="Marcaciones hoy"
            value={recentShifts === null ? "…" : todayCount}
          />
          <StatCard
            accent="brand"
            hint={
              turnoInfo
                ? turnoInfo.subKey
                  ? t(turnoInfo.subKey, turnoInfo.sub)
                  : turnoInfo.sub
                : t(
                    "station.overview.useEditToAssign",
                    "Usa Editar para asignarlo",
                  )
            }
            icon={<Clock />}
            label={t("comun.horario")}
            value={
              turnoInfo
                ? t(turnoInfo.labelKey, turnoInfo.label)
                : t("station.overview.notConfigured", "Sin configurar")
            }
          />
        </Stagger>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Actividad reciente */}
          <Section
            action={
              <button
                className="cg-btn-glass cg-focus inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all"
                title={t(
                  "ui.StationOverview.editarHorarioToleranciasYUbicacion",
                  "Editar horario, tolerancias y ubicación",
                )}
                onClick={() => setEditing(true)}
              >
                <Pencil size={14} /> Editar puesto
              </button>
            }
            icon={<Activity />}
            title="Actividad reciente"
          >
            {recentShifts === null ? (
              <div
                className="py-8 text-center text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                {t("common.loading")}
              </div>
            ) : rows.length === 0 ? (
              <div
                className="py-8 text-center text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                {t(
                  "ui.StationOverview.aunNoHayMarcacionesEnEstePuesto",
                  "Aún no hay marcaciones en este puesto.",
                )}
              </div>
            ) : (
              <ul className="divide-y divide-border/40">
                {rows.slice(0, 8).map((r) => {
                  const gname = r.guardName?.fullName || "Vigilante";
                  const st = r.status ? STATUS_TONE[r.status] : undefined;

                  return (
                    <li key={r.id} className="flex items-center gap-3 py-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                        style={guardChip(gname)}
                      >
                        {gname.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{gname}</p>
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <LogIn
                              className="h-3 w-3"
                              style={{ color: "var(--ok-text)" }}
                            />
                            {fmtDay(r.punchInTime)} {fmtHM(r.punchInTime)}
                          </span>
                          {r.punchOutTime ? (
                            <span className="flex items-center gap-1">
                              <LogOut
                                className="h-3 w-3"
                                style={{ color: "var(--bad-text)" }}
                              />
                              {fmtHM(r.punchOutTime)}
                            </span>
                          ) : (
                            <span
                              className="font-medium"
                              style={{ color: "var(--ok-text)" }}
                            >
                              {t("ui.StationOverview.enTurno")}
                            </span>
                          )}
                        </p>
                      </div>
                      {st && (
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* Ubicación + geocerca (solo lectura; editar via Editar puesto) */}
          <Section
            icon={<MapPin />}
            title={t(
              "ui.StationOverview.ubicacionYGeocerca",
              "Ubicación y geocerca",
            )}
          >
            {lat || lng ? (
              <>
                <div className="mb-3 overflow-hidden rounded-2xl border">
                  <IncidentMap
                    label={name}
                    lat={Number(lat)}
                    lng={Number(lng)}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {stationAddress || `${lat}, ${lng}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Geocerca:{" "}
                  {Array.isArray(station.geofencePolygon) &&
                  station.geofencePolygon.length >= 3
                    ? `polígono de ${station.geofencePolygon.length} puntos`
                    : `radio de ${station.geofenceRadius || 100} m`}
                </p>
              </>
            ) : (
              <div
                className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-sm"
                style={{
                  borderColor: "var(--hairline)",
                  background: "var(--glass-sunken)",
                  color: "var(--ink-soft)",
                }}
              >
                {t(
                  "ui.StationOverview.sinUbicacionConfigurada",
                  "Sin ubicación configurada",
                )}
                <button
                  className="cg-btn-link cg-focus rounded underline underline-offset-2"
                  onClick={() => setEditing(true)}
                >
                  {t(
                    "ui.StationOverview.definirUbicacion",
                    "Definir ubicación",
                  )}
                </button>
              </div>
            )}
          </Section>
        </div>

        {/* Vigilantes asignados */}
        {assignedGuards.length > 0 && (
          <Section
            icon={<Users />}
            title={`Vigilantes asignados (${assignedGuards.length})`}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {assignedGuards.map((g: any, i: number) => {
                const gname =
                  g.fullName ||
                  g.name ||
                  `${g.firstName || ""} ${g.lastName || ""}`.trim() ||
                  g.email ||
                  "-";
                const onNow = openNow.some(
                  (r) => (r.guardName?.fullName || "") === gname,
                );

                return (
                  <div
                    key={g.id || i}
                    className="glass-flat flex items-center gap-2.5 px-3 py-2"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        ...guardChip(gname),
                      }}
                    >
                      {gname.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {gname}
                    </span>
                    {onNow && (
                      <span
                        className="relative flex h-2.5 w-2.5"
                        title={t("ui.StationOverview.deTurnoAhora")}
                      >
                        <span
                          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
                          style={{ background: "var(--ok)" }}
                        />
                        <span
                          className="relative inline-flex h-2.5 w-2.5 rounded-full"
                          style={{ background: "var(--ok)" }}
                        />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    );
  }

  // ── EDIT MODE ──
  return (
    <div className="space-y-4">
      <div className="glass overflow-hidden">
        {/* Edit header */}
        <div
          className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4"
          style={{
            borderColor: "var(--hairline)",
            background: "var(--brand-wash)",
          }}
        >
          <div>
            <h3 className="text-sm font-semibold">
              {t("ui.StationOverview.configurarPuesto")}
            </h3>
            <p className="mt-0.5 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.StationOverview.turnoUbicacionYToleranciaDe",
                "Turno, ubicación y tolerancia de marcación. «Guardar» aplica la tolerancia.",
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="cg-btn-ghost cg-focus rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
            <button
              className="cg-btn-brand cg-focus flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? (
                <Loader2 className="animate-spin" size={12} />
              ) : (
                <Check size={12} />
              )}
              Guardar
            </button>
          </div>
        </div>

        {/* Horario del turno — drives scheduleType + positions (engine source of truth) */}
        <div
          className="space-y-3 border-t p-6"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="flex items-center gap-2">
            <Clock size={16} style={{ color: "var(--brand-text)" }} />
            <h3 className="text-sm font-semibold text-foreground">
              {t("ui.StationOverview.horarioDelTurno")}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Define el turno del puesto. Los vigilantes asignados a esta estación
            seguirán este horario. También editable en Programador › Horario.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TURNO_LABELS.map((o) => (
              <button
                key={o.key}
                className="cg-focus rounded-xl border px-3 py-2 text-left transition-all"
                style={
                  turno === o.key
                    ? {
                        background: "var(--brand-wash)",
                        borderColor: "var(--brand-line)",
                      }
                    : {
                        background: "var(--glass-sunken)",
                        borderColor: "var(--hairline)",
                      }
                }
                type="button"
                onClick={() => setTurno(o.key)}
              >
                <div className="text-xs font-semibold text-foreground">
                  {t(o.labelKey, o.label)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {o.subKey ? t(o.subKey, o.sub) : o.sub}
                </div>
              </button>
            ))}
          </div>
          {turno === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {t("comun.horaInicio")}
                </label>
                <input
                  className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm"
                  type="time"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {t("comun.horaFin")}
                </label>
                <input
                  className="cg-input cg-focus w-full px-3 py-2 font-mono text-sm"
                  type="time"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {t("comun.turnoPorVigilante")}
                </label>
                <select
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                  value={blockHours}
                  onChange={(e) => setBlockHours(e.target.value)}
                >
                  <option value="">
                    {t("ui.StationOverview.todaLaJornada1Fijo")}
                  </option>
                  {[4, 6, 8, 12].map((h) => {
                    const fits = winMin > 0 && winMin % (h * 60) === 0;
                    const k = fits ? winMin / (h * 60) : 0;

                    return (
                      <option key={h} disabled={!fits} value={String(h)}>
                        {h}h
                        {fits
                          ? ` → ${k} fijo${k > 1 ? "s" : ""}`
                          : " (no divide la cobertura)"}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  {t(
                    "postSites.stations.form.restCoverage",
                    "Cobertura de descansos",
                  )}
                </label>
                <select
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                  value={restCoverage}
                  onChange={(e) => setRestCoverage(e.target.value as any)}
                >
                  <option value="sacafranco">
                    {t("comun.sacafrancoCubreLosDescansos")}
                  </option>
                  <option value="alternate">
                    {t("comun.alternanciaEntreFijosSinSacafranco")}
                  </option>
                </select>
                {restCoverage === "alternate" && rotStyle && (
                  <p
                    className={`mt-1.5 text-[11px] ${alternateOk ? "text-muted-foreground" : "text-destructive"}`}
                  >
                    {alternateOk
                      ? `Patrón ${rotWork}-${rotCycle - rotWork}: ${guardsPerBlock} fijos alternando por bloque, sin sacafranco. Total ${blockCount * guardsPerBlock} fijos.`
                      : `El ciclo (${rotCycle}) debe ser múltiplo de los días de trabajo (${rotWork}). Usa 1-1, 2-2, 3-3…`}
                  </p>
                )}
                {restCoverage === "sacafranco" &&
                  blocksOk &&
                  blockCount > 1 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {winMin / 60}h de cobertura en {blockCount} bloques
                      consecutivos de {Number(blockHours)}h — {blockCount} fijos
                      + sacafranco.
                    </p>
                  )}
              </div>
            </div>
          )}
          {/* ── UNA PREGUNTA ARRIBA, EL RESTO PLEGADO ────────────────────────
              Antes se hacían CUATRO preguntas anidadas —horario, «¿mismo
              ciclo?», «¿rotativo o fijos?» y elegir entre nueve patrones—
              antes de que el puesto tuviera un solo vigilante. Tres de las
              cuatro no se pueden contestar bien sin saber a quién vas a poner,
              y ninguna hace falta para dar de alta el puesto.

              Arriba queda la única que sí: cuántas horas cubre. Lo demás sigue
              aquí, a un clic, con un resumen de lo que hay puesto para que
              nadie tenga que abrirlo sólo para mirar. */}
          {turno && (
            <div
              className="rounded-xl border"
              style={{ borderColor: "var(--hairline)" }}
            >
              <button
                aria-expanded={avanzado}
                className="cg-focus flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                type="button"
                onClick={() => setAvanzado((v) => !v)}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">
                    {t(
                      "ui.StationOverview.ajustesAvanzados",
                      "Ajustes avanzados",
                    )}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-[11px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {estilosPorPlaza
                      ? t(
                          "ui.StationOverview.cadaPlazaConSuCiclo",
                          "Cada plaza con su ciclo",
                        )
                      : (nombreDelCiclo ?? rotStyle?.name)
                        ? t(
                            "ui.StationOverview.cicloYCuandoLibran",
                            "Ciclo de descansos: {{ciclo}}",
                            { ciclo: nombreDelCiclo ?? rotStyle?.name },
                          )
                        : t(
                            "ui.StationOverview.sinCicloTodavia",
                            "Aún sin ciclo de descansos — se elige al asignar al primer vigilante",
                          )}
                  </span>
                </span>
                <ChevronDown
                  className="shrink-0 transition-transform"
                  size={16}
                  style={{
                    color: "var(--ink-soft)",
                    transform: avanzado ? "rotate(180deg)" : undefined,
                  }}
                />
              </button>
              {avanzado && (
                <div
                  className="border-t p-3"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <RotacionDeLaEstacion
                    entrada={{
                scheduleType: turnoToScheduleType(turno),
                inicio:
                  turno === "custom"
                    ? customStart
                    : station.startingTimeInDay || "",
                fin:
                  turno === "custom"
                    ? customEnd
                    : station.finishTimeInDay || "",
                ciclo: rotStyle,
                blockHours:
                  turno === "custom" && blockHours
                    ? Number(blockHours)
                    : undefined,
                restCoverage: turno === "custom" ? restCoverage : undefined,
              }}
              etiquetaPrimerBloque={primerTramo}
              etiquetaSegundoBloque={segundoTramo}
              porPlaza={estilosPorPlaza}
              tenantId={localStorage.getItem("tenantId") || ""}
              value={rotationStyleId}
              onChange={setRotationStyleId}
                    onPorPlazaChange={setEstilosPorPlaza}
                    onStyleChange={setRotStyle}
                  />
                </div>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px]" style={{ color: "var(--warn-text)" }}>
              {t(
                "ui.StationOverview.cambiarElHorarioReconfiguraLos",
                "Cambiar el horario reconfigura los puestos; los vigilantes asignados deberán reasignarse.",
              )}
            </p>
            <button
              className="cg-btn-brand cg-focus inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              disabled={savingHorario}
              onClick={updateHorario}
            >
              {savingHorario ? (
                <Loader2 className="animate-spin" size={13} />
              ) : (
                <Check size={13} />
              )}
              Actualizar horario
            </button>
          </div>
        </div>

        {/* Ubicación y geocerca — ONE map: search the address / "igual que el sitio"
            to set where the guard clocks in, then draw the geofence on the same map. */}
        <div
          className="space-y-3 border-t p-6"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin size={16} style={{ color: "var(--brand-text)" }} />
              <h3 className="text-sm font-semibold text-foreground">
                {t(
                  "ui.StationOverview.ubicacionYGeocerca2",
                  "Ubicación y geocerca",
                )}
              </h3>
            </div>
            <button
              className="cg-btn-brand cg-focus inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
              disabled={savingLoc}
              onClick={saveLocation}
            >
              {savingLoc ? (
                <Loader2 className="animate-spin" size={13} />
              ) : (
                <Check size={13} />
              )}
              Guardar ubicación y geocerca
            </button>
          </div>
          <StationGeofencePolygon
            showLocation
            centerLat={editLat ? Number(editLat) : undefined}
            centerLng={editLng ? Number(editLng) : undefined}
            siteLocation={siteLoc}
            value={polygon}
            onCenterChange={(la, ln) => {
              setEditLat(String(la));
              setEditLng(String(ln));
            }}
            onChange={setPolygon}
          />
          <p className="text-[11px] text-muted-foreground font-mono">
            {editLat && editLng
              ? `Punto: ${Number(editLat).toFixed(6)}, ${Number(editLng).toFixed(6)}`
              : "Sin coordenadas — busca la dirección o usa la del sitio."}
          </p>
        </div>

        {/* Clock-in tolerance windows */}
        <div
          className="space-y-3 border-t p-6"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="flex items-center gap-2">
            <Clock size={16} style={{ color: "var(--brand-text)" }} />
            <h3 className="text-sm font-semibold text-foreground">
              {t(
                "ui.StationOverview.toleranciaDeMarcacionDeEntrada",
                "Tolerancia de marcación de entrada",
              )}
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Minutos antes/después de la hora de inicio en que el vigilante puede
            marcar entrada. Vacío = usar el valor por defecto de la empresa.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {t(
                  "postSites.stations.form.clockInEarlyBuffer",
                  "Tolerancia de entrada anticipada (min)",
                )}
              </label>
              <input
                className="cg-input cg-focus w-full px-3 py-2 text-sm"
                max="240"
                min="0"
                placeholder={t("common.default")}
                type="number"
                value={clockInEarlyBufferMin}
                onChange={(e) => setClockInEarlyBufferMin(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {t(
                  "ui.StationOverview.toleranciaDeEntradaTardiaMin",
                  "Tolerancia de entrada tardía (min)",
                )}
              </label>
              <input
                className="cg-input cg-focus w-full px-3 py-2 text-sm"
                max="240"
                min="0"
                placeholder={t("common.default")}
                type="number"
                value={clockInLateGraceMin}
                onChange={(e) => setClockInLateGraceMin(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

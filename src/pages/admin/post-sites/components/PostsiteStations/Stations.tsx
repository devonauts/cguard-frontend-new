import React, { useEffect, useState, useRef } from "react";
import { esEvento, relevosDeLaEstacion } from "@/lib/eventos";
import { invalidateEntity } from "@/lib/queryClient";
import { useNavigate } from "react-router-dom";
import { ApiService } from "@/services/api/apiService";
import { toast } from "sonner";
import {
  Plus,
  Trash,
  Eye,
  MoreVertical,
  X,
  Shield,
  LayoutGrid,
  List as ListIcon,
  Search,
} from "lucide-react";
import StationCardsGrid from "./StationCardsGrid";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

import { needsOperationSetup } from "@/pages/admin/post-sites/components/OperationSetup/OperationSetupAlert";
import { localeActual } from "@/lib/localeActual";
import { EmptyState, SkeletonCards, Segmented, Field } from "@/components/kit";
import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import type { PostSite } from "@/types";
import { jornadasDePlazas, jornadasPorTipo } from "@/lib/jornadasDePlazas";
import { useVistaGuardada } from "@/hooks/useVistaGuardada";

interface SiteProp extends PostSite {
  latitude?: number | string | null;
  longitude?: number | string | null;
  tenantId?: string;
}

// ── Staffing model ───────────────────────────────────────────────────────────
// A station covers ONE jornada (turno). That jornada needs 1 *fijo* guard on
// post. A "sacafranco" floats across stations to cover everyone's rest days, so
// it does NOT belong to a single station and is NOT counted in a station's
// required guards. Hence a 12h diurno/nocturno station requires 1 guard (the
// fijo) — the sacafranco is shared.
// El nombre que ve el usuario. «Matutina» se quedó fuera a propósito: una
// jornada de 07:00 a 19:00 no es una mañana.
const ETIQUETA_JORNADA: Record<string, string> = {
  diurno: "Diurna",
  nocturno: "Nocturna",
  "24 horas": "24 horas",
  sacafranco: "Relevo",
  personalizada: "Personalizada",
  evento: "Evento",
};
// Translation keys for ETIQUETA_JORNADA (the Spanish text is the fallback).
const ETIQUETA_JORNADA_KEY: Record<string, string> = {
  diurno: "settings.jornada.diurna",
  nocturno: "ui.PostSiteWizard.jornada.nocturna",
  "24 horas": "stations.scheduleType.24h",
  sacafranco: "settings.jornada.relevo",
  personalizada: "ui.PostSiteWizard.jornada.personalizada",
  evento: "ui.eventos.jornada",
};

// El tinte de la jornada sale de los semánticos del sistema: día = warn,
// noche = info, relevo = ok. Se calcula en línea (nada de clases de color
// escritas a mano) para que respete claro/oscuro y el acento elegido. Las
// claves antiguas («matutina», «nocturna») siguen aquí porque hay datos que
// todavía las traen.
const JORNADA_TONE: Record<string, "warn" | "info" | "ok" | "neutral"> = {
  matutina: "warn",
  diurno: "warn",
  nocturna: "info",
  nocturno: "info",
  "24 horas": "warn",
  sacafranco: "ok",
  personalizada: "neutral",
  evento: "info",
};

/* Las jornadas salen de las PLAZAS, que es lo único que el generador de turnos
   lee. La aritmética es UNA y vive en `lib/jornadasDePlazas`, espejo del
   servidor: aquí había una copia propia, y una copia que no se actualiza es una
   pantalla que miente. Sin plazas se enseña la cobertura prevista según el tipo
   de horario. */
function jornadasDeEstacion(r: any): any[] {
  // Un evento no tiene jornadas «diurna/nocturna»: tiene sus relevos.
  if (esEvento(r?.postSite))
    return relevosDeLaEstacion(r?.positions).map((x) => ({
      tipo: "evento",
      nombre: "Evento",
      startTime: x.inicio,
      endTime: x.fin,
      guardsCount: String(x.plazas),
    }));
  const desdePlazas = jornadasDePlazas(r?.positions, r?.scheduleType);
  const base = desdePlazas.length
    ? desdePlazas
    : jornadasPorTipo(r?.scheduleType);

  return base.map((j) => {
    const clave = j.tipo.toLowerCase();

    return {
      tipo: clave,
      nombre: ETIQUETA_JORNADA[clave] || j.tipo,
      startTime: j.startTime,
      endTime: j.endTime,
      guardsCount: String(j.guardsCount),
    };
  });
}

function jornadaChip(tipo?: string): React.CSSProperties {
  const t = JORNADA_TONE[String(tipo || "").toLowerCase()] ?? "neutral";
  const fill = t === "neutral" ? "var(--ink-faint)" : `var(--${t})`;
  return {
    background: `color-mix(in oklab, ${fill} 14%, transparent)`,
    borderColor: `color-mix(in oklab, ${fill} 32%, transparent)`,
    color: t === "neutral" ? "var(--ink-soft)" : `var(--${t}-text)`,
  };
}

export default function Stations({ site }: { site?: SiteProp }) {
  const { t } = useTranslation();
  const [stations, setStations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // Vista Tarjetas ⇄ Lista (persistida), como en Clientes/Vigilantes.
  const [viewMode, setViewMode] = useVistaGuardada<"cards" | "list">(
    "stationsView.viewMode",
    "cards",
  );
  const [query, setQuery] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null,
  );
  const [selectedStationDetail, setSelectedStationDetail] = useState<
    any | null
  >(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDeleteStation, setPendingDeleteStation] = useState<any | null>(
    null,
  );
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [actionSelectValue, setActionSelectValue] = useState<string>("");
  const [deleteBlocked, setDeleteBlocked] = useState(false);
  const [dependencyDetails, setDependencyDetails] = useState<any | null>(null);

  const [stationShifts, setStationShifts] = useState<any[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [guardsOptions, setGuardsOptions] = useState<any[]>([]);
  const [loadingGuards, setLoadingGuards] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [shiftStart, setShiftStart] = useState<string>("");
  const [shiftEnd, setShiftEnd] = useState<string>("");
  const [shiftGuard, setShiftGuard] = useState<string>("");
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tenantId =
          site?.tenantId || localStorage.getItem("tenantId") || "";
        const postSiteId = site?.id || "";
        if (!postSiteId) return;
        setLoading(true);
        const res = await ApiService.get(
          `/tenant/${tenantId}/station?filter[postSite]=${encodeURIComponent(postSiteId)}&limit=999`,
        );
        const rows = Array.isArray(res) ? res : res && res.rows ? res.rows : [];

        // Defensive: filter results to ensure station.postSiteId (when present) matches requested postSiteId
        const filtered = (rows || []).filter((r: any) => {
          const rPost =
            r.postSiteId ||
            r.post_site_id ||
            r.postSite ||
            r.post_site ||
            (r.postSite && r.postSite.id) ||
            (r.station && (r.station.postSiteId || r.station.postSite)) ||
            null;
          if (!rPost) return true; // keep when unknown shape
          try {
            return String(rPost) === String(postSiteId);
          } catch (e) {
            return true;
          }
        });

        if (filtered.length !== (rows || []).length) {
          console.warn(
            "[Stations] filtered out stations that do not match postSiteId",
            {
              requested: postSiteId,
              before: (rows || []).length,
              after: filtered.length,
            },
          );
        }

        // Normalize station objects for UI
        const mapped = (filtered || []).map((r: any) => {
          const jornadas = jornadasDeEstacion(r);
          const toNum = (v: any) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          };
          return {
            id:
              r.id ||
              r.stationId ||
              r._id ||
              r.station_id ||
              String(r._id || r.id || JSON.stringify(r)),
            name:
              r.name ||
              r.stationName ||
              r.station_name ||
              r.label ||
              r.title ||
              (r.description ? String(r.description).slice(0, 60) : "") ||
              "",
            nickname: r.nickname || r.nominativo || "",
            numberOfGuardsInStation: r.numberOfGuardsInStation,
            assignedGuards: r.assignedGuards,
            scheduleType: r.scheduleType || null,
            relevos: esEvento(r?.postSite)
              ? relevosDeLaEstacion(r?.positions)
              : null,
            lat: toNum(r.latitud ?? r.latitude),
            lng: toNum(r.longitud ?? r.longitude),
            geofenceRadius: toNum(r.geofenceRadius),
            hasPolygon: !!(
              r.geofencePolygon &&
              (Array.isArray(r.geofencePolygon)
                ? r.geofencePolygon.length >= 3
                : String(r.geofencePolygon).length > 5)
            ),
            jornadas,
          };
        });

        if (mounted) setStations(mapped);
      } catch (err) {
        console.error("Failed to load stations", err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [site]);

  useScrollToTopOnMount(containerRef);

  useEffect(() => {
    if (!selectedStationId) return;
    let mounted = true;
    (async () => {
      try {
        setLoadingDetail(true);
        const tenantId =
          site?.tenantId || localStorage.getItem("tenantId") || "";
        const res = await ApiService.get(
          `/tenant/${tenantId}/station/${encodeURIComponent(selectedStationId)}`,
        );
        const detail = (res && (res.data || res)) || res;
        if (mounted) setSelectedStationDetail(detail);
      } catch (err) {
        // fallback: try to find in list
        const found = stations.find(
          (s) =>
            s.id === selectedStationId || s.stationId === selectedStationId,
        );
        if (mounted) setSelectedStationDetail(found || null);
      } finally {
        if (mounted) setLoadingDetail(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedStationId, site, stations]);

  useEffect(() => {
    // no-op placeholder for detail modal lifecycle
  }, [showDetailModal, selectedStationDetail]);

  const openNewShift = () => {
    setEditingShiftId(null);
    setShiftStart("");
    setShiftEnd("");
    setShiftGuard("");
    fetchGuardOptions();
    setShowShiftModal(true);
  };

  const openEditShift = (sh: any) => {
    setEditingShiftId(sh.id || sh.shiftId || null);
    setShiftStart(sh.startTime || sh.punchInTime || sh.start || "");
    setShiftEnd(sh.endTime || sh.punchOutTime || sh.end || "");
    setShiftGuard(
      (sh.guard && (sh.guard.id || sh.guard)) || sh.guardId || sh.guard || "",
    );
    fetchGuardOptions();
    setShowShiftModal(true);
  };

  const fetchGuardOptions = async () => {
    try {
      setLoadingGuards(true);
      const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";
      // prefer security-guard autocomplete (more likely to include guard user info)
      try {
        const res = await ApiService.get(
          `/tenant/${tenantId}/security-guard/autocomplete?limit=200`,
        );
        const rows = Array.isArray(res) ? res : res && res.rows ? res.rows : [];
        const normalized = rows.map((r: any) => ({
          id: r.guardId || r.id || r.value,
          label:
            r.fullName ||
            r.name ||
            r.label ||
            (r.guard && (r.guard.firstName || r.guard.lastName)
              ? `${r.guard.firstName || ""} ${r.guard.lastName || ""}`.trim()
              : "") ||
            r.email ||
            r.guardEmail ||
            "",
        }));
        setGuardsOptions(normalized.filter((g: any) => g.id));
        return;
      } catch (e) {
        // fallback to users
      }

      const res2 = await ApiService.get(
        `/tenant/${tenantId}/user?filter[role]=guard&limit=999`,
      );
      const rows2 = Array.isArray(res2)
        ? res2
        : res2 && res2.rows
          ? res2.rows
          : [];
      const normalized2 = rows2.map((u: any) => ({
        id: u.id,
        label: u.fullName || u.name || u.email || "",
      }));
      setGuardsOptions(normalized2);
    } catch (err) {
      console.error("Failed to fetch guards options", err);
      setGuardsOptions([]);
    } finally {
      setLoadingGuards(false);
    }
  };

  const saveShift = async () => {
    try {
      const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";
      const postSiteId = site?.id || "";
      if (!postSiteId || !selectedStationDetail) {
        toast.error(
          t("postSites.stations.selectStationFirst", "Select a station first"),
        );
        return;
      }
      const payload: any = {
        startTime: shiftStart ? new Date(shiftStart).toISOString() : null,
        endTime: shiftEnd ? new Date(shiftEnd).toISOString() : null,
        station:
          selectedStationDetail.id ||
          selectedStationDetail.stationId ||
          selectedStationDetail.id,
        guard: shiftGuard || null,
        postSiteId,
      };

      if (editingShiftId) {
        await ApiService.put(
          `/tenant/${tenantId}/shift/${encodeURIComponent(editingShiftId)}`,
          { data: payload },
        );
        toast.success(t("postSites.stations.shiftUpdated", "Shift updated"));
      } else {
        const res = await ApiService.post(`/tenant/${tenantId}/shift`, {
          data: payload,
        });
        toast.success(t("postSites.stations.shiftCreated", "Shift created"));
      }

      setShowShiftModal(false);
      // refresh shifts
      setSelectedStationId(
        selectedStationDetail.id ||
          selectedStationDetail.stationId ||
          selectedStationDetail.id,
      );
    } catch (err) {
      console.error("Failed saving shift", err);
      toast.error(
        t("postSites.stations.shiftSaveFailed", "Failed saving shift"),
      );
    }
  };

  useEffect(() => {
    if (!selectedStationId) {
      setStationShifts([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        setLoadingShifts(true);
        const tenantId =
          site?.tenantId || localStorage.getItem("tenantId") || "";

        // Try shift endpoint first
        let res = await ApiService.get(
          `/tenant/${tenantId}/shift?filter[station]=${encodeURIComponent(selectedStationId)}&limit=999`,
        );
        let rows = Array.isArray(res) ? res : res && res.rows ? res.rows : [];

        // Fallback to guard-shift if no results
        if (!rows || rows.length === 0) {
          const res2 = await ApiService.get(
            `/tenant/${tenantId}/guard-shift?filter[stationName]=${encodeURIComponent(selectedStationId)}&limit=999`,
          );
          rows = Array.isArray(res2)
            ? res2
            : res2 && res2.rows
              ? res2.rows
              : [];
        }

        if (mounted) setStationShifts(rows || []);
      } catch (err) {
        console.error("Failed to load shifts for station", err);
        if (mounted) setStationShifts([]);
      } finally {
        if (mounted) setLoadingShifts(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedStationId, site]);

  useEffect(() => {
    const onDocClick = (e: any) => {
      if (!openMenuId) return;
      const el = document.querySelector(`[data-menu-id="${openMenuId}"]`);
      if (el && el.contains(e.target)) return;
      setOpenMenuId(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [openMenuId]);

  const formatScheduleFromTimes = (start?: string, end?: string) => {
    if (!start || !end) return null;
    const parseTime = (s: string) => {
      if (!s) return null;
      if (s.includes("T")) {
        const d = new Date(s);
        if (isNaN(d.getTime())) return null;
        return { h: d.getHours(), m: d.getMinutes() };
      }
      const parts = s.split(":");
      const hh = parseInt(parts[0] || "0", 10);
      const mm = parseInt(parts[1] || "0", 10);
      if (isNaN(hh) || isNaN(mm)) return null;
      return { h: hh, m: mm };
    };

    const a = parseTime(start);
    const b = parseTime(end);
    if (!a || !b) return null;
    let minutes = b.h * 60 + b.m - (a.h * 60 + a.m);
    if (minutes < 0) minutes += 24 * 60;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hrs} ${t("postSites.stations.hours", "horas")}`;
    return `${hrs}${t("postSites.stations.hShort", "h")} ${mins}${t("postSites.stations.mShort", "m")}`;
  };

  const formatTimeLocalized = (value?: string | null) => {
    if (!value) return "-";
    try {
      let dt: Date | null = null;
      // ISO datetime
      if (value.includes("T")) dt = new Date(value);
      else {
        // Handle formats like "HH:MM" or "HH:MM a.m./p.m." or "HH:MM AM/PM"
        const ampmMatch = value.match(
          /(\d{1,2}:\d{2})\s*([ap]\.m\.|am|pm|AM|PM)?/i,
        );
        if (ampmMatch) {
          const timePart = ampmMatch[1];
          const ampm = (ampmMatch[2] || "").toLowerCase();
          const parts = timePart.split(":");
          if (parts.length >= 2) {
            let hh = parseInt(parts[0] || "0", 10);
            const mm = parseInt(parts[1] || "0", 10);
            if (ampm.includes("p") && hh < 12) hh += 12;
            if (ampm.includes("a") && hh === 12) hh = 0;
            const now = new Date();
            now.setHours(hh);
            now.setMinutes(mm);
            now.setSeconds(0);
            dt = now;
          }
        } else {
          const parts = value.split(":");
          if (parts.length >= 2) {
            const now = new Date();
            now.setHours(parseInt(parts[0] || "0", 10));
            now.setMinutes(parseInt(parts[1] || "0", 10));
            now.setSeconds(0);
            dt = now;
          }
        }
      }
      if (!dt || isNaN(dt.getTime())) return value;
      return new Intl.DateTimeFormat(localeActual(), {
        hour: "2-digit",
        minute: "2-digit",
      }).format(dt);
    } catch (e) {
      return value;
    }
  };

  // Normaliza diferentes formas en que el backend puede devolver vigilantes asignados
  const normalizeAssignedGuards = (detail: any) => {
    if (!detail) return [];
    if (Array.isArray(detail.assignedGuards)) return detail.assignedGuards;
    if (detail.assignedGuards && Array.isArray(detail.assignedGuards.rows))
      return detail.assignedGuards.rows;
    if (Array.isArray(detail.guards)) return detail.guards;
    if (detail.guards && Array.isArray(detail.guards.rows))
      return detail.guards.rows;
    // some endpoints return embedded objects under 'assigned' or similar
    if (Array.isArray(detail.assigned)) return detail.assigned;
    return [];
  };

  const removeStation = async (id: string) => {
    try {
      const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";
      await ApiService.delete(`/tenant/${tenantId}/station/${id}`);
      invalidateEntity("stations");
      setStations((s) => s.filter((x) => x.id !== id));
      toast.success(t("postSites.stations.removed", "Station removed"));
    } catch (err: any) {
      console.error("Failed remove station", err);
      toast.error(
        err?.message ||
          t("postSites.stations.removeFailed", "Failed to remove station"),
      );
    }
  };

  const handleDelete = (id: string) => {
    console.debug("[Stations] handleDelete called", id);
    (async () => {
      const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";
      try {
        const resp = await ApiService.get(
          `/tenant/${tenantId}/station/${encodeURIComponent(id)}`,
        );
        const st = (resp && (resp.data || resp)) || resp;
        const guards = Array.isArray(st.assignedGuards)
          ? st.assignedGuards.length
          : st.assignedGuards && Array.isArray(st.assignedGuards.rows)
            ? st.assignedGuards.rows.length
            : 0;
        const siteTours = Array.isArray(st.siteTours)
          ? st.siteTours.length
          : st.siteTours && Array.isArray(st.siteTours.rows)
            ? st.siteTours.rows.length
            : 0;
        const tags = Array.isArray(st.siteTourTags)
          ? st.siteTourTags.length
          : st.siteTourTags && Array.isArray(st.siteTourTags.rows)
            ? st.siteTourTags.rows.length
            : 0;
        if ((guards || 0) > 0 || (siteTours || 0) > 0 || (tags || 0) > 0) {
          setDeleteBlocked(true);
          setDependencyDetails([
            {
              id,
              name: st.name || st.stationName || id,
              guards,
              siteTours,
              tags,
            },
          ]);
          setPendingDeleteStation(id);
          setTimeout(() => setOpenDeleteDialog(true), 0);
          return;
        }
      } catch (e) {
        // ignore fetch error and proceed to normal delete flow
      }
      setDeleteBlocked(false);
      setPendingDeleteStation(id);
      // Open dialog on next tick to avoid event ordering issues (menu close etc.)
      setTimeout(() => setOpenDeleteDialog(true), 0);
    })();
  };

  const confirmDeleteStation = async () => {
    const idOrIds = pendingDeleteStation;
    if (!idOrIds) {
      setOpenDeleteDialog(false);
      return;
    }

    try {
      const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";

      if (Array.isArray(idOrIds)) {
        /* UNA llamada, no una por estación: `DELETE /station` acepta `?ids=`
           (ver `api/station/stationDestroy.ts`, que normaliza lista o csv).
           Además invalida el caché igual que el borrado de una sola — antes
           el camino de lote se lo saltaba y la lista volvía con las estaciones
           ya borradas hasta que vencía la frescura. */
        await ApiService.delete(
          `/tenant/${tenantId}/station?ids=${idOrIds.map(encodeURIComponent).join(",")}`,
        );
        invalidateEntity("stations");
        setStations((s) =>
          s.filter((x) => !idOrIds.includes(x.id || x.stationId || "")),
        );
        setSelectedIds([]);
        toast.success(
          t("postSites.stations.removedMultiple", "Stations removed"),
        );
      } else {
        // single delete
        await ApiService.delete(`/tenant/${tenantId}/station/${idOrIds}`);
        invalidateEntity("stations");
        setStations((s) => s.filter((x) => x.id !== idOrIds));
        toast.success(t("postSites.stations.removed", "Station removed"));
      }
    } catch (err: any) {
      console.error("Failed remove station(s)", err);
      toast.error(
        err?.message ||
          t("postSites.stations.removeFailed", "Failed to remove station"),
      );
    } finally {
      setPendingDeleteStation(null);
      setOpenDeleteDialog(false);
    }
  };

  const removeSelected = async () => {
    if (!selectedIds.length) return;
    try {
      const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";

      // Igual que arriba: una sola llamada de lote, y se invalida el caché.
      await ApiService.delete(
        `/tenant/${tenantId}/station?ids=${selectedIds.map(encodeURIComponent).join(",")}`,
      );
      invalidateEntity("stations");
      setStations((s) =>
        s.filter((x) => !selectedIds.includes(x.id || x.stationId || "")),
      );
      setSelectedIds([]);
      toast.success(t("postSites.stations.removed", "Station(s) removed"));
    } catch (err: any) {
      console.error("Failed removing selected stations", err);
      toast.error(
        err?.message ||
          t("postSites.stations.removeFailed", "Failed to remove station"),
      );
    }
  };

  // normalized assigned guards for rendering
  const [fetchedAssignedGuards, setFetchedAssignedGuards] = useState<any[]>([]);
  const assignedGuardsFromDetail = normalizeAssignedGuards(
    selectedStationDetail,
  );
  const assignedGuardsArr =
    assignedGuardsFromDetail && assignedGuardsFromDetail.length
      ? assignedGuardsFromDetail
      : fetchedAssignedGuards;

  useEffect(() => {
    let mounted = true;
    const fetchAssigned = async () => {
      if (!selectedStationDetail) return;
      const existing = normalizeAssignedGuards(selectedStationDetail);
      if (existing && existing.length) {
        if (mounted) setFetchedAssignedGuards([]);
        return;
      }

      try {
        const tenantId =
          site?.tenantId || localStorage.getItem("tenantId") || "";
        const postSiteId =
          site?.id ||
          selectedStationDetail?.postSiteId ||
          selectedStationDetail?.postSiteId ||
          "";
        let rows: any[] = [];

        const stationId =
          selectedStationDetail?.id ||
          selectedStationDetail?.stationId ||
          selectedStationDetail?.station_id ||
          "";

        // Prefer endpoints that allow filtering by station id; include shift/guard-shift responses
        const tryEndpoints = [
          // shifts may include nested `guard` objects
          `/tenant/${tenantId}/shift?filter[station]=${encodeURIComponent(stationId)}&limit=999`,
          `/tenant/${tenantId}/guard-shift?filter[station]=${encodeURIComponent(stationId)}&limit=999`,
          // specific: guards linked directly to a station
          `/tenant/${tenantId}/security-guard?filter[station]=${encodeURIComponent(stationId)}&limit=999`,
          `/tenant/${tenantId}/guard?filter[station]=${encodeURIComponent(stationId)}&limit=999`,
          `/tenant/${tenantId}/user?filter[role]=guard&filter[station]=${encodeURIComponent(stationId)}&limit=999`,
          // fallback: guards filtered by postSite
          `/tenant/${tenantId}/security-guard?filter[postSiteId]=${encodeURIComponent(postSiteId)}&limit=999`,
          `/tenant/${tenantId}/guard?filter[postSiteId]=${encodeURIComponent(postSiteId)}&limit=999`,
          `/tenant/${tenantId}/user?filter[role]=guard&filter[postSiteId]=${encodeURIComponent(postSiteId)}&limit=999`,
          // broad fallbacks
          `/tenant/${tenantId}/security-guard?limit=999`,
          `/tenant/${tenantId}/guard?limit=999`,
          `/tenant/${tenantId}/user?filter[role]=guard&limit=999`,
        ];

        for (const ep of tryEndpoints) {
          try {
            const res = await ApiService.get(ep);
            const rrows = Array.isArray(res)
              ? res
              : res && res.rows
                ? res.rows
                : [];
            if (rrows && rrows.length) {
              rows = rrows;
              break;
            }
          } catch (e) {
            // try next
          }
        }

        if (!rows || rows.length === 0) {
          if (mounted) setFetchedAssignedGuards([]);
          return;
        }

        const stationNamesToMatch = [
          selectedStationDetail?.name ||
            selectedStationDetail?.stationName ||
            selectedStationDetail?.station_name ||
            "",
        ]
          .map((x) => String(x || "").toLowerCase())
          .filter(Boolean);
        const stationIdsToMatch = [
          selectedStationDetail?.id ||
            selectedStationDetail?.stationId ||
            selectedStationDetail?.station_id,
        ]
          .filter(Boolean)
          .map((v: any) => String(v));

        const filtered = rows.filter((r: any) => {
          // station id may be a plain string or nested object
          const rawStationId =
            r.station ||
            r.stationId ||
            r.station_id ||
            (r.station && r.station.id) ||
            r.assignedStationId ||
            r.postSiteId ||
            r.postSite;
          const rStationId =
            rawStationId && typeof rawStationId === "object"
              ? rawStationId.id || rawStationId.stationId || ""
              : rawStationId;
          if (rStationId && stationIdsToMatch.includes(String(rStationId)))
            return true;

          // station name may be nested
          const rStationName = (
            r.stationName ||
            (r.station && (r.station.stationName || r.station.name)) ||
            r.assignedStation ||
            r.postSiteName ||
            r.siteName ||
            ""
          )
            .toString()
            .toLowerCase();
          if (
            rStationName &&
            stationNamesToMatch.some(
              (n) => rStationName.includes(n) || n.includes(rStationName),
            )
          )
            return true;

          // some records embed postSite or station fields differently
          if (
            r.postSite &&
            (r.postSite === selectedStationDetail?.id ||
              r.postSite === selectedStationDetail?.postSiteId)
          )
            return true;

          return false;
        });

        const normalized = filtered.map((r: any) => {
          // guard info may be nested under multiple keys (e.g., r.guard when fetching shifts)
          const guardObj =
            r.guard ||
            r.guardInfo ||
            r.securityGuard ||
            r.user ||
            r.assignedGuard ||
            r;
          const id =
            guardObj?.id ||
            guardObj?.guardId ||
            guardObj?.value ||
            r.guardId ||
            r.id;
          const fullName =
            guardObj?.fullName ||
            (guardObj?.firstName || guardObj?.lastName
              ? `${guardObj?.firstName || ""} ${guardObj?.lastName || ""}`.trim()
              : guardObj?.name || guardObj?.label) ||
            r.fullName ||
            r.name ||
            "";
          const email =
            guardObj?.email || guardObj?.guardEmail || r.email || "";
          // try to extract station/postSite related info from the raw record
          const station =
            r.stationName ||
            (r.station && (r.station.stationName || r.station.name)) ||
            r.assignedStation ||
            r.postSiteName ||
            r.siteName ||
            null;
          const postSite =
            r.postSiteName || r.companyName || r.postSite || null;
          return { id, fullName, email, station, postSite, raw: guardObj };
        });

        // dedupe by id
        const byId: Record<string, any> = {};
        for (const g of normalized) {
          if (!g.id) continue;
          if (!byId[g.id]) byId[g.id] = g;
        }
        const deduped = Object.values(byId);
        if (mounted) setFetchedAssignedGuards(deduped);
      } catch (err) {
        if (mounted) setFetchedAssignedGuards([]);
      }
    };

    fetchAssigned();
    return () => {
      mounted = false;
    };
  }, [selectedStationDetail, site]);

  // Assigned guards updates must be done via AssignGuards component/page.

  const filteredStations = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.nickname || "").toLowerCase().includes(q),
    );
  })();

  return (
    <div className="space-y-4 flex-1 min-h-0 flex flex-col animate-fade-up">
      <div className="glass flex flex-1 flex-col p-4">
        <div className="flex items-center justify-between mb-4 gap-3">
          {/* La barra (acción + buscador + crear) pasa de 375 px: sin `flex-wrap`
              el buscador se quedaba en unos pocos píxeles. */}
          <div className="mx-2 flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="flex-shrink-0">
              <select
                value={actionSelectValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setActionSelectValue(v);
                  if (v === "delete_selected") {
                    if (!selectedIds || selectedIds.length === 0) {
                      toast.error(
                        t(
                          "postSites.stations.selectOneToDelete",
                          "Please select at least one station to delete",
                        ),
                      );
                      setActionSelectValue("");
                      return;
                    }
                    // Check dependencies before opening confirmation
                    (async () => {
                      const tenantId =
                        site?.tenantId ||
                        localStorage.getItem("tenantId") ||
                        "";
                      const problematic: any[] = [];
                      for (const sid of selectedIds) {
                        try {
                          const resp = await ApiService.get(
                            `/tenant/${tenantId}/station/${encodeURIComponent(sid)}`,
                          );
                          const st = (resp && (resp.data || resp)) || resp;
                          const guards = Array.isArray(st.assignedGuards)
                            ? st.assignedGuards.length
                            : st.assignedGuards &&
                                Array.isArray(st.assignedGuards.rows)
                              ? st.assignedGuards.rows.length
                              : 0;
                          const siteTours = Array.isArray(st.siteTours)
                            ? st.siteTours.length
                            : st.siteTours && Array.isArray(st.siteTours.rows)
                              ? st.siteTours.rows.length
                              : 0;
                          const tags = Array.isArray(st.siteTourTags)
                            ? st.siteTourTags.length
                            : st.siteTourTags &&
                                Array.isArray(st.siteTourTags.rows)
                              ? st.siteTourTags.rows.length
                              : 0;
                          if (
                            (guards || 0) > 0 ||
                            (siteTours || 0) > 0 ||
                            (tags || 0) > 0
                          ) {
                            problematic.push({
                              id: sid,
                              name: st.name || st.stationName || sid,
                              guards,
                              siteTours,
                              tags,
                            });
                          }
                        } catch (e) {
                          // ignore individual failures
                        }
                      }
                      if (problematic.length) {
                        setDeleteBlocked(true);
                        setDependencyDetails(problematic);
                        setPendingDeleteStation(problematic.map((p) => p.id));
                        setOpenDeleteDialog(true);
                      } else {
                        setDeleteBlocked(false);
                        setPendingDeleteStation(selectedIds.slice());
                        setOpenDeleteDialog(true);
                      }
                    })();
                    setActionSelectValue("");
                  }
                }}
                className="cg-input cg-focus rounded-lg px-4 py-2 text-sm"
              >
                <option value="">
                  {t("postSites.stations.action", "Action")}
                </option>
                <option value="delete_selected">
                  {t("postSites.stations.deleteSelected", "Delete selected")}
                </option>
              </select>
            </div>

            <div className="min-w-48 flex-1">
              <div className="relative">
                <div
                  className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
                  style={{ color: "var(--ink-faint)" }}
                >
                  <Search className="h-4 w-4" />
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t(
                    "postSites.stations.searchPlaceholder",
                    "Buscar estación…",
                  )}
                  className="cg-input cg-focus w-full py-2.5 pl-10 pr-4 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              <div className="hidden md:block">
                <Segmented
                  value={viewMode}
                  onChange={(v) => setViewMode(v)}
                  options={[
                    {
                      value: "cards",
                      label: (
                        <span className="flex items-center gap-1.5">
                          <LayoutGrid className="h-3.5 w-3.5" />{" "}
                          {t("comun.tarjetas", "Tarjetas")}
                        </span>
                      ),
                    },
                    {
                      value: "list",
                      label: (
                        <span className="flex items-center gap-1.5">
                          <ListIcon className="h-3.5 w-3.5" />{" "}
                          {t("comun.lista")}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
              {/* Sede sin tipo de servicio: no se crean puestos; el botón
                 lleva a configurarla (el servidor también lo rechazaría). */}
              {needsOperationSetup(site) ? (
                <button
                  className="cg-btn-brand cg-focus flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  onClick={() =>
                    navigate(`/post-sites/${site?.id || ""}/edit?step=1`)
                  }
                >
                  {t(
                    "ui.OperationSetupAlert.configurarLaSede",
                    "Configurar la sede",
                  )}
                </button>
              ) : (
                <button
                  onClick={() =>
                    navigate(`/post-sites/${site?.id || ""}/stations/new`)
                  }
                  className="cg-btn-brand cg-focus flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                >
                  <Plus size={16} />{" "}
                  {t("postSites.stations.add", "Crear estación")}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="w-full flex-1 flex flex-col min-h-0">
          {loading ? (
            <SkeletonCards count={4} />
          ) : filteredStations.length === 0 ? (
            <div className="min-h-[320px] flex items-center justify-center">
              <EmptyState
                icon={<Shield />}
                title={
                  query
                    ? t(
                        "postSites.stations.noResults",
                        "Sin resultados para la búsqueda.",
                      )
                    : t(
                        "postSites.stations.noStations",
                        "Aún no hay estaciones.",
                      )
                }
              />
            </div>
          ) : (
            <>
              <div className="hidden md:block flex-1 min-h-0">
                {viewMode === "cards" ? (
                  <div className="overflow-y-auto max-h-[52vh] pr-1">
                    <StationCardsGrid
                      stations={filteredStations}
                      onOpen={(id) =>
                        navigate(`/post-sites/${site?.id}/stations/${id}`)
                      }
                      onDelete={(id) => handleDelete(id)}
                    />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="overflow-y-auto h-[48vh]">
                      <table className="min-w-full table-fixed">
                        <thead>
                          <tr
                            style={{
                              borderBottom: "1px solid var(--hairline)",
                            }}
                          >
                            <th
                              className="cg-eyebrow px-2 py-2 sticky top-0 z-20 w-12"
                              style={{ background: "var(--glass-solid)" }}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                style={{ accentColor: "var(--brand)" }}
                                aria-label={t(
                                  "ui.Stations.seleccionarTodasLasEstaciones",
                                )}
                                checked={
                                  selectedIds.length === stations.length &&
                                  stations.length > 0
                                }
                                onChange={() => {
                                  if (selectedIds.length === stations.length)
                                    setSelectedIds([]);
                                  else
                                    setSelectedIds(
                                      stations.map(
                                        (s) => s.id || s.stationId || "",
                                      ),
                                    );
                                }}
                              />
                            </th>
                            <th
                              className="cg-eyebrow px-2 py-2 sticky top-0 z-20"
                              style={{ background: "var(--glass-solid)" }}
                            >
                              {t("postSites.stations.table.name", "Name")}
                            </th>
                            <th
                              className="cg-eyebrow px-2 py-2 sticky top-0 z-20"
                              style={{ background: "var(--glass-solid)" }}
                            >
                              {t("postSites.stations.table.guards", "Guards")}
                            </th>
                            <th
                              className="cg-eyebrow px-2 py-2 sticky top-0 z-20"
                              style={{ background: "var(--glass-solid)" }}
                            ></th>
                          </tr>
                        </thead>
                        <tbody className="min-h-0">
                          {filteredStations.map((st) => {
                            const id = st.id || st.stationId || "";
                            const name =
                              st.name ||
                              st.stationName ||
                              st.station_name ||
                              "—";
                            const jornadas: any[] = st.jornadas || [];
                            const guardsCount =
                              Array.isArray(st.assignedGuards) &&
                              st.assignedGuards.length > 0
                                ? String(st.assignedGuards.length)
                                : st.numberOfGuardsInStation || "-";
                            return (
                              <tr
                                key={id}
                                className="h-14 cursor-pointer"
                                style={{
                                  borderBottom: "1px solid var(--hairline)",
                                }}
                                onClick={() =>
                                  navigate(
                                    `/post-sites/${site?.id}/stations/${id}`,
                                  )
                                }
                              >
                                <td
                                  className="w-12 px-2 py-2.5 align-middle text-sm"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    className="h-5 w-5"
                                    style={{ accentColor: "var(--brand)" }}
                                    aria-label={t("guards.list.selectAria", {
                                      defaultValue: "Seleccionar {{name}}",
                                      name,
                                    })}
                                    checked={selectedIds.includes(id)}
                                    onChange={() => {
                                      setSelectedIds((prev) =>
                                        prev.includes(id)
                                          ? prev.filter((x) => x !== id)
                                          : [...prev, id],
                                      );
                                    }}
                                  />
                                </td>
                                <td className="px-2 py-2.5 align-middle text-sm">
                                  <div className="font-medium">{name}</div>
                                  {st.nickname && (
                                    <div
                                      className="text-xs"
                                      style={{ color: "var(--ink-soft)" }}
                                    >
                                      {t(
                                        "postSites.stations.form.nickname",
                                        "Nominativo",
                                      )}
                                      :{" "}
                                      <span className="font-medium">
                                        {st.nickname}
                                      </span>
                                    </div>
                                  )}
                                  {jornadas.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {jornadas.map((j: any, i: number) => (
                                        <span
                                          key={`${j.tipo ?? ""}-${j.startTime ?? ""}-${j.endTime ?? ""}-${i}`}
                                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                                          style={jornadaChip(j.tipo)}
                                        >
                                          {ETIQUETA_JORNADA_KEY[j.tipo]
                                            ? t(
                                                ETIQUETA_JORNADA_KEY[j.tipo],
                                                j.nombre,
                                              )
                                            : j.nombre || j.tipo}
                                          {j.startTime && j.endTime && (
                                            <span className="font-mono opacity-60 ml-1">
                                              {j.startTime}–{j.endTime}
                                            </span>
                                          )}
                                          {j.guardsCount &&
                                            j.guardsCount !== "1" && (
                                              <span className="ml-1 opacity-60">
                                                ×{j.guardsCount}
                                              </span>
                                            )}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-2.5 align-middle text-sm">
                                  {guardsCount}
                                </td>
                                <td className="relative w-24 px-2 py-2.5 text-right align-middle text-sm">
                                  <div className="inline-flex items-center gap-2">
                                    <div className="relative">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenMenuId(
                                            openMenuId === id ? null : id,
                                          );
                                        }}
                                        aria-label={t(
                                          "ui.Stations.masAcciones",
                                          "Más acciones",
                                        )}
                                        className="cg-btn-ghost cg-focus rounded p-1"
                                      >
                                        <MoreVertical size={18} />
                                      </button>
                                      {openMenuId === id && (
                                        <div
                                          data-menu-id={id}
                                          className="glass-raised absolute right-0 z-50 mt-2 w-44 py-1"
                                        >
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigate(
                                                `/post-sites/${site?.id}/stations/${id}`,
                                              );
                                              setOpenMenuId(null);
                                            }}
                                            className="cg-btn-ghost flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                                          >
                                            <Eye size={14} />
                                            {t(
                                              "postSites.stations.view",
                                              "View details",
                                            )}
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDelete(id);
                                              setOpenMenuId(null);
                                            }}
                                            className="cg-btn-ghost flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                                            style={{ color: "var(--bad-text)" }}
                                          >
                                            <Trash size={14} />
                                            {t(
                                              "postSites.stations.remove",
                                              "Remove",
                                            )}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="block md:hidden">
                <div className="space-y-3 min-h-[40vh]">
                  {filteredStations.map((st) => {
                    const id = st.id || st.stationId || "";
                    const name =
                      st.name || st.stationName || st.station_name || "—";
                    const guardsCount =
                      st.numberOfGuardsInStation ||
                      (Array.isArray(st.assignedGuards)
                        ? String(st.assignedGuards.length)
                        : "-");
                    const jornadas: any[] = st.jornadas || [];
                    return (
                      <div
                        key={id}
                        className="glass-flat relative cursor-pointer p-5"
                        onClick={() =>
                          navigate(`/post-sites/${site?.id}/stations/${id}`)
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                className="h-5 w-5"
                                style={{ accentColor: "var(--brand)" }}
                                aria-label={t("guards.list.selectAria", {
                                  defaultValue: "Seleccionar {{name}}",
                                  name,
                                })}
                                checked={selectedIds.includes(id)}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() =>
                                  setSelectedIds((prev) =>
                                    prev.includes(id)
                                      ? prev.filter((x) => x !== id)
                                      : [...prev, id],
                                  )
                                }
                              />
                              <div className="font-medium">{name}</div>
                            </div>
                            {jornadas.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2 ml-8">
                                {jornadas.map((j: any, i: number) => (
                                  <span
                                    key={`${j.tipo ?? ""}-${j.startTime ?? ""}-${j.endTime ?? ""}-${i}`}
                                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium"
                                    style={jornadaChip(j.tipo)}
                                  >
                                    {ETIQUETA_JORNADA_KEY[j.tipo]
                                      ? t(
                                          ETIQUETA_JORNADA_KEY[j.tipo],
                                          j.nombre,
                                        )
                                      : j.nombre || j.tipo}
                                    {j.startTime && j.endTime && (
                                      <span className="font-mono opacity-60 ml-1">
                                        {j.startTime}–{j.endTime}
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div
                              className="mt-2 text-sm"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              <strong>
                                {t("postSites.stations.table.guards", "Guards")}
                                :
                              </strong>{" "}
                              {guardsCount}
                            </div>
                          </div>
                          <div className="flex items-center">
                            <div className="relative">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(openMenuId === id ? null : id);
                                }}
                                aria-label={t(
                                  "ui.Stations.masAcciones",
                                  "Más acciones",
                                )}
                                className="cg-btn-ghost cg-focus rounded p-1"
                              >
                                <MoreVertical size={18} />
                              </button>
                              {openMenuId === id && (
                                <div
                                  data-menu-id={id}
                                  className="glass-raised absolute right-0 z-50 mt-2 w-44 py-1"
                                >
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(
                                        `/post-sites/${site?.id}/stations/${id}`,
                                      );
                                      setOpenMenuId(null);
                                    }}
                                    className="cg-btn-ghost flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                                  >
                                    <Eye size={14} />
                                    {t(
                                      "postSites.stations.view",
                                      "View details",
                                    )}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(id);
                                      setOpenMenuId(null);
                                    }}
                                    className="cg-btn-ghost flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                                    style={{ color: "var(--bad-text)" }}
                                  >
                                    <Trash size={14} />
                                    {t("postSites.stations.remove", "Remove")}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create station is now a full page — see /post-sites/:id/stations/new */}

      {/* Details modal */}
      {showDetailModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center"
          onClick={() => setShowDetailModal(false)}
        >
          <div
            className="absolute inset-0 z-50"
            style={{ background: "oklch(0 0 0 / 0.35)" }}
            onClick={() => setShowDetailModal(false)}
          />

          <div
            className="glass-raised pointer-events-auto relative z-70 max-h-[90vh] w-full overflow-y-auto sm:w-96"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b p-6"
              style={{ borderColor: "var(--hairline)" }}
            >
              <h2 className="font-display text-lg font-semibold">
                {t("postSites.stations.detailsTitle", "Station details")}
              </h2>
              <button
                onClick={() => setShowDetailModal(false)}
                aria-label={t("actions.close")}
                className="cg-btn-ghost cg-focus rounded-full p-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6">
              {loadingDetail ? (
                <div>{t("postSites.stations.loading", "Loading...")}</div>
              ) : !selectedStationDetail ? (
                <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t("postSites.stations.noDetails", "No details available")}
                </div>
              ) : (
                <div>
                  <h3 className="font-display text-xl font-semibold">
                    {selectedStationDetail.name ||
                      selectedStationDetail.stationName ||
                      selectedStationDetail.station_name}
                  </h3>
                  {selectedStationDetail.nickname ? (
                    <p
                      className="mt-1 text-sm"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t("postSites.stations.form.nickname", "Nominativo")}:{" "}
                      <span className="font-medium">
                        {selectedStationDetail.nickname}
                      </span>
                      <span
                        className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                        style={{ background: "var(--glass-sunken)" }}
                      >
                        {t("common.private", "Privado")}
                      </span>
                    </p>
                  ) : null}
                  {selectedStationDetail.description ? (
                    <p
                      className="mt-2 text-sm"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {selectedStationDetail.description ||
                        selectedStationDetail.notes}
                    </p>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <Field
                      label={t("postSites.stations.schedule", "Schedule")}
                      value={
                        formatScheduleFromTimes(
                          selectedStationDetail?.startingTimeInDay ||
                            selectedStationDetail?.startTime ||
                            selectedStationDetail?.start ||
                            selectedStationDetail?.starting_time,
                          selectedStationDetail?.finishTimeInDay ||
                            selectedStationDetail?.finishTime ||
                            selectedStationDetail?.endTime ||
                            selectedStationDetail?.finish ||
                            selectedStationDetail?.end_time,
                        ) || "-"
                      }
                    />

                    <Field
                      label={t("postSites.stations.guardsCount", "Guards")}
                      value={
                        selectedStationDetail.numberOfGuardsInStation ||
                        (assignedGuardsArr && assignedGuardsArr.length
                          ? assignedGuardsArr.length
                          : "-")
                      }
                    />

                    <Field
                      label={t("postSites.stations.startTime", "Start")}
                      value={formatTimeLocalized(
                        selectedStationDetail?.startingTimeInDay ||
                          selectedStationDetail?.startTime ||
                          selectedStationDetail?.start ||
                          selectedStationDetail?.starting_time,
                      )}
                    />

                    <Field
                      label={t("postSites.stations.endTime", "End")}
                      value={formatTimeLocalized(
                        selectedStationDetail?.finishTimeInDay ||
                          selectedStationDetail?.finishTime ||
                          selectedStationDetail?.endTime ||
                          selectedStationDetail?.finish ||
                          selectedStationDetail?.end_time,
                      )}
                    />
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium">
                        {t(
                          "postSites.stations.assignedGuardsTitle",
                          "Assigned guards",
                        )}
                      </h4>
                      <div>
                        <button
                          onClick={() =>
                            navigate(`/post-sites/${site?.id}/assign-guards`)
                          }
                          className="cg-btn-glass cg-focus rounded px-2 py-1 text-sm"
                        >
                          {t(
                            "postSites.stations.manageAssignments",
                            "Manage assignments",
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="mt-2">
                      {!assignedGuardsArr || assignedGuardsArr.length === 0 ? (
                        <div style={{ color: "var(--ink-soft)" }}>
                          {t(
                            "postSites.stations.noAssignedGuards",
                            "No guards assigned",
                          )}
                        </div>
                      ) : (
                        <ul className="list-disc pl-5 text-sm">
                          {assignedGuardsArr.map((g: any) => (
                            <li
                              key={g.id || g.value || JSON.stringify(g)}
                              className="mb-1"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  {g.id ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setShowDetailModal(false);
                                        const tenantId =
                                          site?.tenantId ||
                                          localStorage.getItem("tenantId") ||
                                          "";
                                        // Open a blank tab immediately to avoid popup blockers,
                                        // then resolve the correct security-guard resource and navigate it.
                                        const popup = window.open("", "_blank");
                                        (async () => {
                                          try {
                                            // Fast path: if the assigned-guard payload already carries the canonical
                                            // security-guard id/route, navigate directly without any extra lookups.
                                            const directId =
                                              g.securityGuardId ||
                                              g.securityGuard?.id ||
                                              g.guard?.securityGuardId;
                                            if (directId) {
                                              const directUrl = `${window.location.origin}/guards/${directId}/resumen`;
                                              if (popup)
                                                popup.location.href = directUrl;
                                              return;
                                            }
                                            // Try several queries and attempt to find the best matching security-guard record
                                            const tryPaths = [
                                              `/tenant/${tenantId}/security-guard?filter[guardId]=${encodeURIComponent(g.id)}&limit=50`,
                                              `/tenant/${tenantId}/security-guard?filter[id]=${encodeURIComponent(g.id)}&limit=50`,
                                              `/tenant/${tenantId}/security-guard?filter[email]=${encodeURIComponent(g.email || "")}&limit=50`,
                                            ];

                                            let candidate: any = null;

                                            const normalizeRows = (
                                              resp: any,
                                            ) =>
                                              Array.isArray(resp)
                                                ? resp
                                                : resp && resp.rows
                                                  ? resp.rows
                                                  : [];

                                            for (const p of tryPaths) {
                                              try {
                                                const resp =
                                                  await ApiService.get(p, {
                                                    toast: {
                                                      silentError: true,
                                                    },
                                                  } as any);
                                                const rows =
                                                  normalizeRows(resp);
                                                if (!rows || !rows.length)
                                                  continue;
                                                // Find row where nested guard id matches the clicked guard id
                                                const match = rows.find(
                                                  (row: any) => {
                                                    const nestedGuardId =
                                                      row.guard?.id ||
                                                      row.guardId ||
                                                      row.guard?.guardId ||
                                                      row.id ||
                                                      row.guardId;
                                                    if (
                                                      nestedGuardId &&
                                                      String(nestedGuardId) ===
                                                        String(g.id)
                                                    )
                                                      return true;
                                                    // also match if row.id === g.id
                                                    if (
                                                      row.id &&
                                                      String(row.id) ===
                                                        String(g.id)
                                                    )
                                                      return true;
                                                    // try matching by email or phone
                                                    if (
                                                      g.email &&
                                                      ((row.email &&
                                                        String(row.email) ===
                                                          String(g.email)) ||
                                                        (row.guard &&
                                                          row.guard.email &&
                                                          String(
                                                            row.guard.email,
                                                          ) ===
                                                            String(g.email)))
                                                    )
                                                      return true;
                                                    if (
                                                      g.phoneNumber &&
                                                      ((row.phoneNumber &&
                                                        String(
                                                          row.phoneNumber,
                                                        ) ===
                                                          String(
                                                            g.phoneNumber,
                                                          )) ||
                                                        (row.guard &&
                                                          row.guard
                                                            .phoneNumber &&
                                                          String(
                                                            row.guard
                                                              .phoneNumber,
                                                          ) ===
                                                            String(
                                                              g.phoneNumber,
                                                            )))
                                                    )
                                                      return true;
                                                    return false;
                                                  },
                                                );
                                                if (match) {
                                                  candidate = match;
                                                  break;
                                                }
                                                // if no nested match, but only one row returned, prefer it
                                                if (rows.length === 1) {
                                                  candidate = rows[0];
                                                  break;
                                                }
                                              } catch (e) {
                                                // continue
                                              }
                                            }

                                            // If still not found, fall back to the clicked guard id directly.
                                            // (Previously this did a /security-guard?limit=999 full-roster scan,
                                            // which loaded the entire tenant guard list on every click.)
                                            const finalId = candidate
                                              ? candidate.id ||
                                                candidate.guard?.id ||
                                                candidate.guardId ||
                                                g.id
                                              : g.id;
                                            const finalUrl = `${window.location.origin}/guards/${finalId}/resumen`;
                                            if (popup)
                                              popup.location.href = finalUrl;
                                            return;
                                          } catch (e) {
                                            const fallbackUrl = `${window.location.origin}/guards/${g.id}/resumen`;
                                            if (popup)
                                              popup.location.href = fallbackUrl;
                                          }
                                        })();
                                      }}
                                      className="cg-focus rounded text-sm underline"
                                    >
                                      {g.fullName ||
                                        g.label ||
                                        g.name ||
                                        g.email ||
                                        g.id}
                                    </button>
                                  ) : (
                                    <span className="text-sm">
                                      {g.fullName ||
                                        g.label ||
                                        g.name ||
                                        g.email ||
                                        g.id}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="ml-3 text-sm"
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  {(() => {
                                    const st = g.station;
                                    const ps = g.postSite;
                                    const stLabel =
                                      st == null
                                        ? ""
                                        : typeof st === "string"
                                          ? st
                                          : st.stationName ||
                                            st.name ||
                                            st.station_name ||
                                            st.nickname ||
                                            "";
                                    const psLabel =
                                      ps == null
                                        ? ""
                                        : typeof ps === "string"
                                          ? ps
                                          : ps.name ||
                                            ps.companyName ||
                                            ps.stationName ||
                                            "";
                                    return stLabel || psLabel || "";
                                  })()}
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div
              className="flex items-center justify-end gap-3 border-t p-6"
              style={{
                borderColor: "var(--hairline)",
                background: "var(--glass-sunken)",
              }}
            >
              <button
                onClick={() => setShowDetailModal(false)}
                className="cg-btn-glass cg-focus rounded-md px-4 py-2 text-sm"
              >
                {t("actions.close") || "Close"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift create/edit modal */}
      {showShiftModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center"
          onClick={() => setShowShiftModal(false)}
        >
          <div
            className="absolute inset-0 z-50"
            style={{ background: "oklch(0 0 0 / 0.35)" }}
            onClick={() => setShowShiftModal(false)}
          />

          <div
            className="glass-raised pointer-events-auto relative z-70 max-h-[90vh] w-full overflow-y-auto sm:w-96"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b p-6"
              style={{ borderColor: "var(--hairline)" }}
            >
              <h2 className="font-display text-lg font-semibold">
                {editingShiftId
                  ? t("postSites.stations.editShift", "Edit shift")
                  : t("postSites.stations.createShift", "Create shift")}
              </h2>
              <button
                onClick={() => setShowShiftModal(false)}
                aria-label={t("actions.close")}
                className="cg-btn-ghost cg-focus rounded-full p-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t("postSites.stations.form.shiftStart", "Start")}
                </label>
                <input
                  type="datetime-local"
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t("postSites.stations.form.shiftEnd", "End")}
                </label>
                <input
                  type="datetime-local"
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  {t("postSites.stations.form.guard", "Guard")}
                </label>
                <select
                  value={shiftGuard}
                  onChange={(e) => setShiftGuard(e.target.value)}
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                >
                  <option value="">
                    {t("postSites.stations.form.selectGuard", "Select guard")}
                  </option>
                  {guardsOptions.map((g) => {
                    const id = g.id || g.value;
                    const label =
                      g.fullName || g.label || g.name || g.email || id;
                    return (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            <div
              className="flex items-center justify-end gap-3 border-t p-6"
              style={{
                borderColor: "var(--hairline)",
                background: "var(--glass-sunken)",
              }}
            >
              <button
                onClick={() => setShowShiftModal(false)}
                className="cg-btn-glass cg-focus rounded-md px-4 py-2 text-sm"
              >
                {t("actions.cancel") || "Cancel"}
              </button>
              <button
                onClick={saveShift}
                disabled={!shiftStart || !shiftEnd}
                className={`cg-btn-brand cg-focus rounded-md px-6 py-2 text-sm font-semibold ${!shiftStart || !shiftEnd ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {t("actions.save", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}
      <AlertDialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteBlocked
                ? t(
                    "postSites.stations.confirmRemovalBlockedTitle",
                    "Cannot remove station",
                  )
                : Array.isArray(pendingDeleteStation)
                  ? t(
                      "postSites.stations.confirmRemovalMultipleTitle",
                      "Confirm removal of selected stations",
                    )
                  : t(
                      "clients.stations.confirmRemovalTitle",
                      "Confirm removal",
                    )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlocked ? (
                // show dependency details
                <div className="space-y-2">
                  <div>
                    {t(
                      "postSites.stations.confirmRemovalBlockedDesc",
                      "One or more selected stations have related records and cannot be removed.",
                    )}
                  </div>
                  {dependencyDetails && Array.isArray(dependencyDetails) && (
                    <ul className="mt-2 list-disc pl-5 text-sm">
                      {dependencyDetails.map((d: any) => (
                        <li key={d.id}>
                          {d.name}:{" "}
                          {d.guards
                            ? `${d.guards} ${t("postSites.stations.guards", "guards")}`
                            : ""}
                          {d.siteTours
                            ? ` ${d.siteTours} ${t("postSites.stations.siteTours", "site tours")}`
                            : ""}
                          {d.tags
                            ? ` ${d.tags} ${t("postSites.stations.tags", "tags")}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : Array.isArray(pendingDeleteStation) ? (
                t(
                  "postSites.stations.confirmRemovalMultipleDesc",
                  "Are you sure you want to remove the selected stations? This action cannot be undone.",
                )
              ) : (
                t(
                  "clients.stations.confirmRemovalDesc",
                  "Are you sure you want to remove this station? This action cannot be undone.",
                )
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingDeleteStation(null);
                setOpenDeleteDialog(false);
                setDeleteBlocked(false);
                setDependencyDetails(null);
              }}
            >
              {t("actions.cancel", "Cancel")}
            </AlertDialogCancel>
            {!deleteBlocked && (
              <AlertDialogAction
                className="cg-btn-bad"
                onClick={confirmDeleteStation}
              >
                {t("postSites.stations.remove", "Remove")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

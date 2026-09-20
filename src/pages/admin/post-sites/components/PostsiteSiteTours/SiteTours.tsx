import type { PostSite } from '@/types';
import React, { useState, useEffect, useRef } from 'react';
import Select, { MultiValue, OptionsOrGroups } from 'react-select';
import { Search, ChevronDown, Plus, X, Clock, EllipsisVertical, Eye, Edit, Trash, Settings, Route } from 'lucide-react';
import RondaSettingsForm from '@/pages/admin/Configuration/rondas-settings/RondaSettingsForm';
import { useTranslation } from 'react-i18next';
import MobileCardList from '@/components/responsive/MobileCardList';
import { EmptyState, Modal } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { ApiService } from '@/services/api/apiService';
import { toast } from 'sonner';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';

interface SiteProp extends PostSite {
  tenantId?: string;
}

export default function PostSiteTours({
  site,
  guards = [],
}: {
  site?: SiteProp;
  guards?: any[];
}) {
  const { t } = useTranslation();

  // Helper: determine whether a guard object is assigned to a given station id
  function guardMatchesStation(g: any, stationId: string) {
    if (!g || !stationId) return false;
    const sid = String(stationId);

    // direct fields
    if (g.stationId && String(g.stationId) === sid) return true;
    if (g.station_id && String(g.station_id) === sid) return true;
    if (g.assignedStationId && String(g.assignedStationId) === sid) return true;
    if (g.postSiteId && String(g.postSiteId) === sid) return true;
    if (g.post_site_id && String(g.post_site_id) === sid) return true;
    // common single nested object
    if (
      g.station &&
      (String(g.station.id) === sid ||
        String(g.station.stationId) === sid ||
        String(g.station.station_id) === sid)
    )
      return true;
    // arrays of stations
    const arrCandidates =
      g.stations ||
      g.assignedStations ||
      g.stationList ||
      g.stationIds ||
      g.assignedStationsIds ||
      [];

    if (Array.isArray(arrCandidates)) {
      for (const item of arrCandidates) {
        if (!item) continue;
        if (typeof item === "string" || typeof item === "number") {
          if (String(item) === sid) return true;
        } else if (item.id && String(item.id) === sid) return true;
        else if (item.stationId && String(item.stationId) === sid) return true;
        else if (item.station_id && String(item.station_id) === sid)
          return true;
      }
    }

    return false;
  }
  // Resolve station display name for a tour or related object supporting multiple shapes
  function resolveStationName(obj: any) {
    if (!obj) return "-";
    // If obj is a plain id/string/number
    if (typeof obj === "string" || typeof obj === "number") {
      const key = String(obj);

      return stationsMap[key] || key || "-";
    }

    // If obj is an object representing a tour (has stationId or station)
    const sid =
      obj.stationId ||
      obj.station_id ||
      (obj.station &&
        (obj.station.id || obj.station.stationId || obj.station.station_id)) ||
      null;

    if (sid) {
      const key = String(sid);
      const nameFromMap = stationsMap[key];

      if (nameFromMap) return nameFromMap;
      // If station object included, try its name
      if (
        obj.station &&
        (obj.station.stationName ||
          obj.station.name ||
          obj.station.station_name)
      )
        return (
          obj.station.stationName ||
          obj.station.name ||
          obj.station.station_name
        );

      return key;
    }

    // If obj.station is a name string
    if (obj.stationName || obj.station_name || obj.station) {
      const candidate = obj.stationName || obj.station_name || obj.station;

      if (typeof candidate === "string") return candidate;
      if (
        typeof candidate === "object" &&
        (candidate.name || candidate.stationName)
      )
        return candidate.name || candidate.stationName;
    }

    // If tour contains an array of stations, pick first
    const arr = obj.stations || obj.stationList || obj.stationIds || null;

    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];

      if (!first) return "-";
      if (typeof first === "string" || typeof first === "number")
        return stationsMap[String(first)] || String(first);

      return (
        first.stationName || first.name || first.station_name || first.id || "-"
      );
    }

    return "-";
  }

  function resolveGuardName(idOrObj: any) {
    if (!idOrObj) return "-";
    if (typeof idOrObj === "object") {
      const o = idOrObj;

      return (
        o.fullName ||
        o.guardName ||
        (o.firstName || o.lastName
          ? ((o.firstName || "") + " " + (o.lastName || "")).trim()
          : o.name || o.id || "-")
      );
    }
    const id = String(idOrObj);
    // search local guards
    const g1 = (localGuards || []).find(
      (g) => String(g.id || g.guardId || g.securityGuardId || g.userId) === id,
    );

    if (g1)
      return (
        g1.fullName ||
        g1.name ||
        ((g1.firstName || "") + " " + (g1.lastName || "")).trim() ||
        id
      );
    // search detailAssignments
    const a1 = (detailAssignments || []).find(
      (a) =>
        String(
          a.securityGuardId ||
            a.guardId ||
            (a.guard && (a.guard.id || a.guard.userId)) ||
            a.id,
        ) === id,
    );

    if (a1)
      return (
        a1.guardName ||
        (a1.guard &&
          (a1.guard.fullName ||
            (
              (a1.guard.firstName || "") +
              " " +
              (a1.guard.lastName || "")
            ).trim())) ||
        id
      );
    // search detailShifts (direct fields)
    const s1 = (detailShifts || []).find(
      (s) =>
        String(
          s.guardId ||
            s.securityGuardId ||
            (s.guard && (s.guard.id || s.guard.userId)) ||
            s.id,
        ) === id,
    );

    if (s1)
      return (
        s1.guardName ||
        (s1.guard &&
          (s1.guard.fullName ||
            (
              (s1.guard.firstName || "") +
              " " +
              (s1.guard.lastName || "")
            ).trim())) ||
        id
      );

    // deep search inside shifts for nested guard objects (covers various API shapes)
    for (const sh of detailShifts || []) {
      const candidates = [
        sh.guard,
        sh.securityGuard,
        sh.security_guard,
        sh.guardObject,
        sh.user,
        sh.assignedGuard,
        sh.guardInfo,
      ];

      for (const c of candidates) {
        if (!c || typeof c !== "object") continue;
        const cid = String(
          c.id || c._id || c.guardId || c.securityGuardId || c.userId || c.id,
        );

        if (cid === id)
          return (
            c.fullName ||
            c.guardName ||
            ((c.firstName || "") + " " + (c.lastName || "")).trim() ||
            id
          );
      }
    }

    // deep search inside assignments as well
    for (const a of detailAssignments || []) {
      const candidates = [
        a.guard,
        a.securityGuard,
        a.guardObject,
        a.user,
        a.assignedGuard,
      ];

      for (const c of candidates) {
        if (!c || typeof c !== "object") continue;
        const cid = String(
          c.id || c._id || c.guardId || c.securityGuardId || c.userId || c.id,
        );

        if (cid === id)
          return (
            c.fullName ||
            c.guardName ||
            ((c.firstName || "") + " " + (c.lastName || "")).trim() ||
            id
          );
      }
    }

    // fallback to id
    return id;
  }
  const [actionOpen, setActionOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showNewTourModal, setShowNewTourModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const [tourName, setTourName] = useState("");
  const [tourDesc, setTourDesc] = useState("");
  const [scheduledDays, setScheduledDays] = useState<string[]>([]);
  const [continuous, setContinuous] = useState(false);
  const [timeMode, setTimeMode] = useState("specific");
  const [selectTime, setSelectTime] = useState("");
  const [maxDuration, setMaxDuration] = useState("");
  const [stationId, setStationId] = useState("");
  // Eliminado assignGuard: los recorridos no requieren vigilante específico
  const [enableNotes, setEnableNotes] = useState(false);
  const [forceMedia, setForceMedia] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const isFormValid = Boolean(
    tourName.trim() && scheduledDays.length > 0 && stationId,
  );

  const [stations, setStations] = useState<any[]>([]);
  const [loadingStations, setLoadingStations] = useState(false);
  const [stationsMap, setStationsMap] = useState<Record<string, string>>({});

  const [localGuards, setLocalGuards] = useState<any[]>(guards || []);
  const [loadingGuards, setLoadingGuards] = useState(false);
  const [guardLoadError, setGuardLoadError] = useState<string | null>(null);
  const [guardsFromShifts, setGuardsFromShifts] = useState(false);
  const [tours, setTours] = useState<any[]>([]);
  const [loadingTours, setLoadingTours] = useState(false);
  const [toursError, setToursError] = useState<string | null>(null);
  const [selectedTourIds, setSelectedTourIds] = useState<string[]>([]);
  const [showConfirmArchive, setShowConfirmArchive] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [rowActionOpenId, setRowActionOpenId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTour, setDetailTour] = useState<any | null>(null);
  const [detailShifts, setDetailShifts] = useState<any[]>([]);
  const [loadingDetailShifts, setLoadingDetailShifts] = useState(false);
  const [detailAssignments, setDetailAssignments] = useState<any[]>([]);
  const [loadingDetailAssignments, setLoadingDetailAssignments] =
    useState(false);
  const [detailGuardName, setDetailGuardName] = useState<string | null>(null);
  const [editingTourId, setEditingTourId] = useState<string | null>(null);

  const timeInputRef = useRef<HTMLInputElement | null>(null);
  const translateTimeMode = (mode?: string) => {
    if (!mode) return "-";

    return t(`siteTour.form.timeMode.${mode}`, mode);
  };

  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);

  const loadAssignments = async (tourId: string) => {
    const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";

    if (!tenantId || !tourId) return [];
    setLoadingDetailAssignments(true);
    try {
      const resp: any = await ApiService.get(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/assignments`,
      );
      const rows = resp && (resp.rows || resp) ? resp.rows || resp : [];

      return rows || [];
    } catch (e) {
      console.error("Failed loading assignments for tour", e);

      return [];
    } finally {
      setLoadingDetailAssignments(false);
    }
  };

  useEffect(() => {
    // Solo cargar vigilantes asignados a este post site cuando se abre el modal
    // Load stations for this post site when opening modal
    if (showNewTourModal && stations.length === 0) {
      (async () => {
        try {
          setLoadingStations(true);
          const tenantId =
            site?.tenantId || localStorage.getItem("tenantId") || "";
          const postSiteId = site?.id || "";

          if (!tenantId || !postSiteId) return;
          const res: any = await ApiService.get(
            `/tenant/${tenantId}/station?postSiteId=${encodeURIComponent(postSiteId)}&limit=999`,
          );
          const rows = Array.isArray(res)
            ? res
            : res && res.rows
              ? res.rows
              : [];

          setStations(rows || []);
        } catch (e) {
          console.error("Failed loading stations for site", e);
          setStations([]);
        } finally {
          setLoadingStations(false);
        }
      })();
    }
  }, [showNewTourModal, site, t]);
  useScrollToTopOnMount(containerRef);

  // Load stations for the current post site proactively so we can display station names in the table
  useEffect(() => {
    const loadStationsForSite = async () => {
      const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";
      const postSiteId = site?.id || "";

      if (!tenantId || !postSiteId) {
        setStations([]);
        setStationsMap({});

        return;
      }
      try {
        setLoadingStations(true);
        const res: any = await ApiService.get(
          `/tenant/${tenantId}/station?postSiteId=${encodeURIComponent(postSiteId)}&limit=999`,
        );
        const rows = Array.isArray(res) ? res : res && res.rows ? res.rows : [];

        setStations(rows || []);
        const map: Record<string, string> = {};

        (rows || []).forEach((s: any) => {
          const id = s.id || s.stationId || s.station_id;
          const name = s.stationName || s.name || s.station_name || id;

          if (id) map[String(id)] = name;
        });
        setStationsMap(map);
      } catch (e) {
        console.error("Failed loading stations for site (table)", e);
        setStations([]);
        setStationsMap({});
      } finally {
        setLoadingStations(false);
      }
    };

    loadStationsForSite();
  }, [site]);

  // Load guards for selected station when stationId changes (or when opening modal after choosing default)
  useEffect(() => {
    if (!showNewTourModal) return;
    const loadGuards = async () => {
      setLoadingGuards(true);
      setGuardsFromShifts(false);
      setGuardLoadError(null);
      const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";
      const postSiteId = site?.id || "";

      try {
        let guardsList: any[] = [];
        let guardsFromShiftsFlag = false;

        // Helper to extract a guard object from a shift/guard-shift row. Reused for station endpoint and shifts fallback.
        const extractGuardFromShift = (sh: any) => {
          if (!sh) return null;
          const candidates = [
            sh.guard,
            sh.securityGuard,
            sh.security_guard,
            sh.guardObject,
            sh.user,
            sh.assignedGuard,
            sh.guardInfo,
          ];

          for (const c of candidates) {
            if (c && typeof c === "object") return c;
          }

          const idFields = [
            "guardId",
            "securityGuardId",
            "security_guard_id",
            "guard_id",
            "securityGuard_id",
          ];

          for (const f of idFields) {
            if (sh[f]) return { id: sh[f] };
          }

          for (const k of Object.keys(sh || {})) {
            if (/guard/i.test(k)) {
              const v = (sh as any)[k];

              if (!v) continue;
              if (typeof v === "object") return v;
              if (typeof v === "string" || typeof v === "number")
                return { id: v };
            }
          }

          return null;
        };

        // If a station is selected: prefer station-scoped assigned-guards endpoint, then fall back to shifts, then tenant security-guard filter.
        // Note: perform station-scoped lookups even when `postSiteId` is not available.
        if (stationId) {
          try {
            const ts = Date.now();

            // guard-assignments is the real source of truth for guard↔station
            // (the old `/stations/:id/guards` route never existed → always 404'd
            // into the shift-scrape fallback). Rows carry a nested `guard` user.
            try {
              const resp: any = await ApiService.get(
                `/tenant/${tenantId}/guard-assignments?stationId=${encodeURIComponent(stationId)}&status=active&_=${ts}`,
                { headers: { "Cache-Control": "no-cache" } } as any,
              );
              const items = Array.isArray(resp)
                ? resp
                : resp && (resp.rows || resp.data)
                  ? resp.rows || resp.data
                  : [];
              // Items may be: assigned-guard rows with nested guard, OR raw shift rows. Try to extract guard objects in either case.
              const extracted = (items || []).flatMap((r: any) => {
                // If r itself looks like a guard object (has firstName/fullName/displayName/email/id), keep it and attach stationId if missing.
                if (
                  r &&
                  (r.fullName ||
                    r.firstName ||
                    r.lastName ||
                    r.displayName ||
                    r.email ||
                    r.id ||
                    r._id)
                ) {
                  const guardObj = { ...(r || {}) };

                  guardObj.stationId =
                    guardObj.stationId ||
                    guardObj.station_id ||
                    r.stationId ||
                    r.station_id ||
                    stationId;

                  return [guardObj];
                }
                // If nested guard object present, attach stationId from outer row
                const nested =
                  r && (r.guard || r.guardObject || r.securityGuard || r.user);

                if (nested && typeof nested === "object") {
                  const guardObj = { ...(nested || {}) };

                  guardObj.stationId =
                    guardObj.stationId ||
                    guardObj.station_id ||
                    r.stationId ||
                    r.station_id ||
                    stationId;

                  return [guardObj];
                }

                // Otherwise try to extract from shift-like row
                const g = extractGuardFromShift(r);

                if (g) {
                  const guardObj = typeof g === "object" ? { ...g } : { id: g };

                  guardObj.stationId =
                    guardObj.stationId ||
                    guardObj.station_id ||
                    r.stationId ||
                    r.station_id ||
                    stationId;

                  return [guardObj];
                }

                return [];
              });

              // Deduplicate by id/email/username
              const dedupedMap = (extracted || []).reduce(
                (acc: Record<string, any>, g: any) => {
                  const key =
                    g && (g.id || g._id || g.email || g.username)
                      ? String(g.id || g._id || g.email || g.username)
                      : JSON.stringify(g || {});

                  if (!acc[key]) {
                    // normalize station list
                    const copy = { ...(g || {}) };
                    const sid = copy.stationId || copy.station_id || null;

                    if (sid)
                      copy.stations = Array.isArray(copy.stations)
                        ? Array.from(
                            new Set([...(copy.stations || []), String(sid)]),
                          )
                        : [String(sid)];
                    acc[key] = copy;
                  } else {
                    // merge station ids from duplicate rows
                    const existing = acc[key];
                    const sid =
                      g && (g.stationId || g.station_id)
                        ? String(g.stationId || g.station_id)
                        : null;

                    if (sid) {
                      existing.stations = Array.isArray(existing.stations)
                        ? existing.stations
                        : existing.stationId
                          ? [String(existing.stationId)]
                          : [];
                      if (!existing.stations.includes(sid))
                        existing.stations.push(sid);
                      acc[key] = existing;
                    }
                  }

                  return acc;
                },
                {} as Record<string, any>,
              );
              const deduped = Object.values(dedupedMap);

              if (deduped.length) {
                guardsList = deduped;
                guardsFromShiftsFlag = false;
              }
            } catch (err) {
              // ignore and try shifts below
            }

            // If station endpoint returned nothing, fall back to inspecting shifts for guard objects
            if (!guardsFromShiftsFlag) {
              // Request shifts filtered by station; include postSiteId only when present.
              const shiftsQs = `stationId=${encodeURIComponent(stationId)}${postSiteId ? `&postSiteId=${encodeURIComponent(postSiteId)}` : ""}&_=${ts}`;
              const shiftsResp: any = await ApiService.get(
                `/tenant/${tenantId}/shift?${shiftsQs}`,
                { headers: { "Cache-Control": "no-cache" } } as any,
              );
              const shiftRows = Array.isArray(shiftsResp)
                ? shiftsResp
                : shiftsResp && (shiftsResp.rows || shiftsResp.data)
                  ? shiftsResp.rows || shiftsResp.data
                  : [];

              console.debug("[SiteTours] shifts response for station", {
                stationId,
                postSiteId,
                count: (shiftRows || []).length,
              });
              if (shiftRows && shiftRows.length) {
                const guardsFromShifts: any[] = [];

                const extractGuardFromShift = (sh: any) => {
                  if (!sh) return null;
                  // Common direct object fields
                  const candidates = [
                    sh.guard,
                    sh.securityGuard,
                    sh.security_guard,
                    sh.guardObject,
                    sh.user,
                    sh.assignedGuard,
                    sh.guardInfo,
                  ];

                  for (const c of candidates) {
                    if (c && typeof c === "object") return c;
                  }

                  // Common id fields
                  const idFields = [
                    "guardId",
                    "securityGuardId",
                    "security_guard_id",
                    "guard_id",
                    "securityGuard_id",
                  ];

                  for (const f of idFields) {
                    if (sh[f]) return { id: sh[f] };
                  }

                  // Fall back: inspect any property containing "guard" (object or primitive)
                  for (const k of Object.keys(sh)) {
                    if (/guard/i.test(k)) {
                      const v = sh[k];

                      if (!v) continue;
                      if (typeof v === "object") return v;
                      if (typeof v === "string" || typeof v === "number")
                        return { id: v };
                    }
                  }

                  return null;
                };

                shiftRows.forEach((sh: any) => {
                  const g = extractGuardFromShift(sh);

                  if (g) {
                    // normalize to object with id and optional name and attach stationId from the shift row
                    const guardObj =
                      typeof g === "object" ? { ...g } : { id: g };

                    guardObj.stationId =
                      guardObj.stationId ||
                      guardObj.station_id ||
                      sh.stationId ||
                      sh.station_id ||
                      stationId;
                    guardsFromShifts.push(guardObj);
                  }
                });
                // dedupe
                const seen = new Map<string, any>();

                guardsFromShifts.forEach((g: any) => {
                  const key =
                    g && (g.id || g.email || g.username || g._id)
                      ? String(g.id || g._id || g.email || g.username)
                      : JSON.stringify(g);

                  if (!seen.has(key)) {
                    // ensure station list
                    const copy = { ...(g || {}) };
                    const sid = copy.stationId || copy.station_id || null;

                    if (sid) copy.stations = [String(sid)];
                    seen.set(key, copy);
                  } else {
                    // merge station id into existing
                    const existing = seen.get(key);
                    const sid =
                      g && (g.stationId || g.station_id)
                        ? String(g.stationId || g.station_id)
                        : null;

                    if (sid) {
                      existing.stations = Array.isArray(existing.stations)
                        ? existing.stations
                        : existing.stationId
                          ? [String(existing.stationId)]
                          : [];
                      if (!existing.stations.includes(sid))
                        existing.stations.push(sid);
                      seen.set(key, existing);
                    }
                  }
                });
                if (seen.size) guardsList = Array.from(seen.values());
                guardsFromShiftsFlag = guardsList.length > 0;
              }
            }
          } catch (e) {
            // ignore and fallback below
          }

          // If shifts didn't return guards, try tenant-level security-guard filtered by station
          if (guardsList.length === 0) {
            try {
              const ts = Date.now();
              const resp: any = await ApiService.get(
                `/tenant/${tenantId}/security-guard?filter[station]=${encodeURIComponent(stationId)}&_=${ts}`,
                { headers: { "Cache-Control": "no-cache" } } as any,
              );
              const rows = Array.isArray(resp)
                ? resp
                : resp && resp.rows
                  ? resp.rows
                  : [];

              console.debug(
                "[SiteTours] tenant security-guard response filtered by station",
                { stationId, count: (rows || []).length },
              );
              guardsList = rows || [];
            } catch (e) {
              // ignore
            }
          }
          // Do NOT merge postSite-level guards when a station is selected: we must show only guards linked to the station
          // If no guards were found from shifts/security-guard by station, we intentionally leave guardsList empty so UX shows "No guards found"
        } else {
          // No station selected: list all guards for the postSite (or tenant) using security-guard endpoint
          try {
            const ts = Date.now();
            const qs = postSiteId
              ? `?postSiteId=${encodeURIComponent(postSiteId)}&_=${ts}`
              : `?_=${ts}`;
            const resp: any = await ApiService.get(
              `/tenant/${tenantId}/security-guard${qs}`,
              { headers: { "Cache-Control": "no-cache" } } as any,
            );
            const rows = Array.isArray(resp)
              ? resp
              : resp && resp.rows
                ? resp.rows
                : [];

            guardsList = rows || [];
          } catch (e) {
            // ignore
          }
          // Eliminado assignGuard: ya no se usa

          // Eliminado: lógica de idStr ya no es relevante
        }

        // Record whether guards were obtained from shift rows. If they were, trust that list directly.
        setGuardsFromShifts(Boolean(guardsFromShiftsFlag));

        // If guards were NOT obtained from shifts and a station is selected, filter tenant-level guard results defensively.
        if (!guardsFromShiftsFlag && stationId) {
          guardsList = (guardsList || []).filter((g: any) =>
            guardMatchesStation(g, stationId),
          );
        }

        setLocalGuards(guardsList || []);
      } catch (err) {
        console.error("Failed to load guards for station/postsite", err);
        setGuardLoadError(
          t("siteTour.form.errorLoadingGuards", "Error loading guards"),
        );
        setLocalGuards([]);
      } finally {
        setLoadingGuards(false);
      }
    };

    loadGuards();
  }, [stationId, showNewTourModal, site, t, stations]);

  // When detail modal opens, load assignments for the tour
  useEffect(() => {
    if (!showDetailModal || !detailTour) return;
    (async () => {
      try {
        const rows = await loadAssignments(
          String(detailTour.id || detailTour._id || detailTour),
        );

        setDetailAssignments(rows || []);
      } catch (e) {
        console.error("Failed loading detail assignments", e);
        setDetailAssignments([]);
      }
    })();
  }, [showDetailModal, detailTour]);

  // Resolve a human-friendly guard name for the detail modal.
  useEffect(() => {
    if (!detailTour) {
      setDetailGuardName(null);

      return;
    }

    const candidate =
      detailTour.assignedGuard ||
      detailTour.securityGuardId ||
      detailTour.security_guard_id ||
      detailTour.securityGuard ||
      detailTour.guard ||
      detailTour.assigned_guard ||
      detailTour.guardId ||
      detailTour.guard_id ||
      null;
    // initial attempt using local resolvers
    const initial = candidate ? resolveGuardName(candidate) : null;

    // Only overwrite an existing resolved human-friendly name with a raw id.
    setDetailGuardName((prev) => {
      const idStrLocal = candidate ? String(candidate) : null;

      if (initial && idStrLocal && initial !== idStrLocal) return initial;
      if (!prev) return initial || null;

      return prev;
    });

    // If resolver returned the same id string (no name found) and candidate looks like an id, try API lookup
    const idStr = candidate ? String(candidate) : null;

    if (idStr && initial === idStr) {
      // if assignments/shifts are still loading, wait for them to complete (effect will re-run)
      if (loadingDetailAssignments || loadingDetailShifts) {
        return;
      }

      (async () => {
        try {
          const tenantId =
            site?.tenantId || localStorage.getItem("tenantId") || "";

          if (!tenantId) {
            // cannot lookup without tenant; show placeholder instead of raw id
            setDetailGuardName("-");

            return;
          }

          // server does not always expose single-item GET; skip direct GET and use list/filter fallbacks instead

          // fallback: try list endpoint filtered by id
          try {
            const listResp: any = await ApiService.get(
              `/tenant/${tenantId}/security-guard?filter[id]=${encodeURIComponent(idStr)}`,
            );
            const rows = Array.isArray(listResp)
              ? listResp
              : listResp && listResp.rows
                ? listResp.rows
                : [];

            if (rows && rows.length) {
              // Try to find a matching security-guard by either the security-guard record id or the internal guardId field
              const found = (rows || []).find((r: any) => {
                const rid = String(r.id || r._id || "");
                const gid = String(
                  r.guardId || r.securityGuardId || r.guard_id || "",
                );

                return rid === idStr || gid === idStr;
              });

              if (found) {
                const name = resolveGuardName(found);

                if (name) {
                  setDetailGuardName(name);

                  return;
                }
              }
              // also try the first row as a fallback
              const nameFallback = resolveGuardName(rows[0]);

              if (nameFallback && nameFallback !== idStr) {
                setDetailGuardName(nameFallback);

                return;
              }
            }
          } catch (e) {
            // ignore
          }

          // fallback 2: fetch guards for this postSite (if available) and search by id
          try {
            const ts2 = Date.now();
            const postSiteId = site?.id || "";
            const guardsResp: any = await ApiService.get(
              `/tenant/${tenantId}/security-guard?postSiteId=${encodeURIComponent(postSiteId)}&_=${ts2}&limit=999`,
            );
            const guardsRows = Array.isArray(guardsResp)
              ? guardsResp
              : guardsResp && guardsResp.rows
                ? guardsResp.rows
                : [];

            if (guardsRows && guardsRows.length) {
              const found = (guardsRows || []).find(
                (g: any) =>
                  String(g.id || g._id || g.guardId || g.securityGuardId) ===
                  idStr,
              );

              if (found) {
                const name = resolveGuardName(found);

                if (name) {
                  setDetailGuardName(name);

                  return;
                }
              }
            }
          } catch (e) {
            // ignore
          }

          // nothing found: show placeholder instead of raw id, but don't overwrite an already-resolved name
          setDetailGuardName((prev) => {
            if (prev && prev !== idStr && prev !== null) return prev;

            return "-";
          });
        } catch (e) {
          // ignore network errors
          setDetailGuardName("-");
        }
      })();
    }
  }, [detailTour, detailAssignments, detailShifts, localGuards, site]);

  // When editing a tour, prefill assignment fields from existing active assignment (if any)
  useEffect(() => {
    if (!showNewTourModal || !editingTourId) return;
    (async () => {
      try {
        const rows = await loadAssignments(String(editingTourId));

        if (rows && rows.length) {
          // prefer active assignment, otherwise most recent
          const active =
            rows.find((r: any) => r.status === "assigned") || rows[0];

          if (active) {
            // Eliminado assignGuard: ya no se usa
            setStationId(active.stationId || "");
            if (active.startAt) {
              try {
                const dt = new Date(active.startAt);
                const hh = String(dt.getHours()).padStart(2, "0");
                const mm = String(dt.getMinutes()).padStart(2, "0");

                setSelectTime(`${hh}:${mm}`);
              } catch (e) {
                // ignore
              }
            }
            if (active.endAt && active.maxDuration) {
              setMaxDuration(active.maxDuration || "");
            }
          }
        }
      } catch (e) {
        console.error("Failed to prefill assignment for edit", e);
      }
    })();
  }, [showNewTourModal, editingTourId]);

  // Load tenant site tours (tenant-scoped)
  const fetchTours = async () => {
    const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";

    if (!tenantId) return;
    setLoadingTours(true);
    setToursError(null);
    try {
      const postSiteId = site?.id || "";
      const qs = postSiteId
        ? `?postSiteId=${encodeURIComponent(postSiteId)}`
        : "";
      const resp: any = await ApiService.get(
        `/tenant/${tenantId}/site-tour${qs}`,
      );
      const rows =
        resp && resp.rows ? resp.rows : Array.isArray(resp) ? resp : [];

      setTours(rows || []);
    } catch (err: any) {
      console.error("Failed to load site tours", err);
      setToursError(
        t("siteTour.form.errorLoadingTours", "Error loading site tours"),
      );
    } finally {
      setLoadingTours(false);
    }
  };

  useEffect(() => {
    fetchTours();
  }, [site]);

  // Derived filtered list based on search query (filter by tour name)
  const q = (query || "").trim().toLowerCase();
  const filteredTours = q
    ? (tours || []).filter((t: any) => {
        const name = (t?.name || t?.title || "") + "";

        return name.toLowerCase().includes(q);
      })
    : tours || [];

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col animate-fade-up"
    >
      <div className="glass flex flex-1 flex-col p-4">
        {/* Acción + buscador + dos botones pasan de 400 px: sin `flex-wrap` la
            barra empujaba la página fuera de la pantalla del teléfono. */}
        <div
          className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3"
          style={{ background: "var(--glass-solid)" }}
        >
          <div className="relative">
            <button
              onClick={() => setActionOpen((v) => !v)}
              className="cg-btn-glass cg-focus inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm"
            >
              {t("siteTour.menu.action", "Action")}
              <ChevronDown size={14} />
            </button>
            {actionOpen && (
              <div className="glass-raised absolute z-10 mt-2 w-48">
                <button
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-muted/30"
                  onClick={() => {
                    setActionOpen(false);
                    if (!selectedTourIds || selectedTourIds.length === 0) {
                      toast.error(
                        t("siteTour.actions.noSelection", "No items selected"),
                      );

                      return;
                    }
                    setShowConfirmArchive(true);
                  }}
                >
                  {t("siteTour.menu.archive", "Archivar")}
                </button>

                <button
                  className="cg-btn-ghost block w-full px-4 py-2 text-left text-sm"
                  style={{ color: "var(--bad-text)" }}
                  onClick={() => {
                    setActionOpen(false);
                    if (!selectedTourIds || selectedTourIds.length === 0) {
                      toast.error(
                        t("siteTour.actions.noSelection", "No items selected"),
                      );

                      return;
                    }
                    setShowConfirmDelete(true);
                  }}
                >
                  {t("siteTour.menu.delete", "Eliminar")}
                </button>
              </div>
            )}
          </div>

          <div className="flex min-w-48 flex-1 justify-center">
            <div className="relative w-full max-w-xl">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground pointer-events-none">
                <Search size={16} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("siteTour.searchPlaceholder")}
                className="w-full h-10 rounded-full border pl-10 pr-4"
              />
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {/* TagScans ahora es un componente independiente; abre la vista de Etiquetas desde el menú lateral o la ruta dedicada. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettingsModal(true)}
            >
              <Settings className="mr-1.5 h-4 w-4" /> Configuraciones
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={() => {
                setEditingTourId(null);
                setTourName("");
                setTourDesc("");
                setScheduledDays([]);
                setContinuous(false);
                setTimeMode("specific");
                setSelectTime("");
                setMaxDuration("");
                setStationId("");
                setShowNewTourModal(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> {t("siteTour.newTour")}
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="md:block hidden overflow-auto flex-1">
            <table className="w-full text-sm md:text-base">
              <thead>
                <tr>
                  <th className="cg-eyebrow px-2 py-2 align-middle">
                    <div className="flex items-center h-full">
                      <input
                        aria-label={t('siteTour.list.selectAllAria', 'Select all')}
                        checked={Boolean(filteredTours && filteredTours.length > 0 && selectedTourIds.length === filteredTours.length)}
                        className="align-middle"
                        type="checkbox"
                        onChange={(e) => {
                            if (e.target.checked) {
                              const ids = (filteredTours || []).map((t: any) => String(t.id || t._id || '')).filter(Boolean);
                              setSelectedTourIds(ids);
                          } else {
                            setSelectedTourIds([]);
                          }
                        }}
                      />
                    </div>
                  </th>
                  <th className="cg-eyebrow px-2 py-2">
                    {t("siteTour.table.name")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2">
                    {t("siteTour.table.station", "Station")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2">
                    {t("siteTour.table.duration")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2">
                    {t("siteTour.table.type")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {loadingTours ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-16 text-center text-sm text-muted-foreground"
                    >
                      {t("siteTour.loading", "Loading...")}
                    </td>
                  </tr>
                ) : filteredTours.length === 0 ? (
                  <tr>
                    <td className="px-6 py-8" colSpan={4}>
                      <EmptyState
                        description={t('siteTour.empty.message')}
                        icon={<Route />}
                        title={t('siteTour.empty.title')}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredTours.map((tour: any, _idx: number) => {
                    const tid = String(tour.id || tour._id || _idx);
                    const checked = selectedTourIds.includes(tid);

                    return (
                      <tr key={tid} className="border-b">
                        <td className="px-2 py-2.5 align-middle">
                          <div className="flex items-center h-full">
                            <input
                              aria-label={t('siteTour.list.selectAria', 'Select')}
                              checked={checked}
                              className="align-middle"
                              type="checkbox"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTourIds(s => Array.from(new Set([...s, tid])));
                                } else {
                                  setSelectedTourIds(s => s.filter(id => id !== tid));
                                }
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-left">
                          {tour.name || "-"}
                        </td>
                        <td className="px-2 py-2.5 text-left">
                          {resolveStationName(tour)}
                        </td>
                        <td className="px-2 py-2.5 text-left">
                          {tour.maxDuration || "-"}
                        </td>
                        <td className="px-2 py-2.5 text-left">
                          {translateTimeMode(tour.timeMode)}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <div className="relative inline-block">
                            <button
                              onClick={() =>
                                setRowActionOpenId(
                                  rowActionOpenId === tid ? null : tid,
                                )
                              }
                              className="p-2 rounded-full hover:bg-muted"
                            >
                              <EllipsisVertical size={16} />
                            </button>
                            {rowActionOpenId === tid && (
                              <div className="glass-raised absolute right-0 z-20 mt-2 w-40">
                                <button
                                  className="block w-full text-left px-4 py-2 text-sm hover:bg-muted/30"
                                  onClick={async () => {
                                    setRowActionOpenId(null);
                                    // view details
                                    try {
                                      const tenantId =
                                        site?.tenantId ||
                                        localStorage.getItem("tenantId") ||
                                        "";

                                      if (!tenantId) {
                                        toast.error(
                                          t("siteTour.actions.missingTenant"),
                                        );
                                        return;
                                      }
                                      const resp: any = await ApiService.get(
                                        `/tenant/${tenantId}/site-tour/${encodeURIComponent(tid)}`,
                                      );

                                      setDetailTour(resp);
                                      setShowDetailModal(true);

                                      // fetch related shifts for this tour (match by siteTours/json or fallback fields)
                                      try {
                                        setLoadingDetailShifts(true);
                                        const postSiteId = site?.id || "";
                                        const shiftsResp: any =
                                          await ApiService.get(
                                            `/tenant/${tenantId}/shift?postSiteId=${encodeURIComponent(postSiteId)}&limit=999`,
                                            {
                                              headers: {
                                                "Cache-Control": "no-cache",
                                              },
                                            } as any,
                                          );
                                        const shiftRows = Array.isArray(
                                          shiftsResp,
                                        )
                                          ? shiftsResp
                                          : shiftsResp &&
                                              (shiftsResp.rows ||
                                                shiftsResp.data)
                                            ? shiftsResp.rows || shiftsResp.data
                                            : [];
                                        // Store ALL shifts returned for the postSite so resolvers can find nested guard objects.
                                        // Keep the previous matching logic for the 'matched' subset if needed for display.
                                        const matched = (
                                          shiftRows || []
                                        ).filter((sh: any) => {
                                          const siteToursField =
                                            sh.siteTours ||
                                            sh.site_tours ||
                                            sh.siteTour ||
                                            sh.site_tour ||
                                            [];

                                          if (
                                            Array.isArray(siteToursField) &&
                                            siteToursField.length
                                          ) {
                                            if (
                                              siteToursField.some(
                                                (x: any) =>
                                                  String(x) === String(tid) ||
                                                  (x &&
                                                    (x.id || x.siteTourId) &&
                                                    String(
                                                      x.id || x.siteTourId,
                                                    ) === String(tid)),
                                              )
                                            )
                                              return true;
                                          }
                                          // fallback common fields
                                          if (
                                            String(
                                              sh.siteTourId ||
                                                sh.siteTour ||
                                                sh.tourId ||
                                                "",
                                            ) === String(tid)
                                          )
                                            return true;

                                          return false;
                                        });

                                        // Save all shifts to `detailShifts` so resolveGuardName can look through them.
                                        setDetailShifts(shiftRows || []);
                                      } catch (e) {
                                        console.error(
                                          "Failed loading detail shifts",
                                          e,
                                        );
                                        setDetailShifts([]);
                                      } finally {
                                        setLoadingDetailShifts(false);
                                      }
                                    } catch (e) {
                                      toast.error(
                                        t(
                                          "siteTour.actions.deleteError",
                                          "Error loading details",
                                        ),
                                      );
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <Eye size={14} />{" "}
                                    <span>
                                      {t(
                                        "siteTour.actions.view",
                                        "Ver detalles",
                                      )}
                                    </span>
                                  </div>
                                </button>

                                <button
                                  className="block w-full text-left px-4 py-2 text-sm hover:bg-muted/30"
                                  onClick={() => {
                                    setRowActionOpenId(null);
                                    // open edit modal prefilled
                                    setEditingTourId(tid);
                                    setShowNewTourModal(true);
                                    // populate fields from tour
                                    setTourName(tour.name || "");
                                    setTourDesc(tour.description || "");
                                    setScheduledDays(
                                      Array.isArray(tour.scheduledDays)
                                        ? tour.scheduledDays
                                        : typeof tour.scheduledDays ===
                                              "string" && tour.scheduledDays
                                          ? tour.scheduledDays
                                              .split(",")
                                              .map((s: string) => s.trim())
                                              .filter(Boolean)
                                          : [],
                                    );
                                    setContinuous(Boolean(tour.continuous));
                                    setTimeMode(tour.timeMode || "specific");
                                    setSelectTime(tour.selectTime || "");
                                    setMaxDuration(tour.maxDuration || "");
                                    setStationId(
                                      tour.stationId || tour.station_id || "",
                                    );
                                    // Eliminado assignGuard: ya no se usa
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <Edit size={14} />{" "}
                                    <span>
                                      {t("siteTour.actions.edit", "Editar")}
                                    </span>
                                  </div>
                                </button>

                                <button
                                  className="cg-btn-ghost block w-full px-4 py-2 text-left text-sm"
                                  style={{ color: "var(--bad-text)" }}
                                  onClick={() => {
                                    setRowActionOpenId(null);
                                    setSelectedTourIds([tid]);
                                    setShowConfirmDelete(true);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <Trash size={14} />{" "}
                                    <span>
                                      {t("siteTour.actions.delete", "Eliminar")}
                                    </span>
                                  </div>
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Confirm archive modal */}
          <Modal
            footer={(
              <>
                <Button variant="outline" onClick={() => setShowConfirmArchive(false)}>{t('siteTour.buttons.cancel', 'Cancelar')}</Button>
                <Button
                  onClick={async () => {
                    try {
                      const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
                      if (!tenantId) {
                        toast.error(t('siteTour.actions.missingTenant', 'Missing tenant'));
                        return;
                      }
                      // patch each tour to set active=false
                      await Promise.all((selectedTourIds || []).map(id => ApiService.patch(`/tenant/${tenantId}/site-tour/${encodeURIComponent(id)}`, { active: false })));
                      toast.success(t('siteTour.actions.archived', 'Selected tours archived'));
                      setShowConfirmArchive(false);
                      setSelectedTourIds([]);
                      try { await fetchTours(); } catch (e) { /* ignore */ }
                    } catch (err: any) {
                      console.error('Archive selected failed', err);
                      const msg = err?.response?.data?.message || err?.message || t('siteTour.actions.archiveError', 'Error archiving selected tours');
                      toast.error(msg);
                    }
                  }}
                >
                  {t('siteTour.actions.archive', 'Archivar')}
                </Button>
              </>
            )}
            open={showConfirmArchive}
            size="md"
            title={t('siteTour.actions.confirmArchiveTitle', 'Confirmar archivado')}
            onOpenChange={(o) => { if (!o) setShowConfirmArchive(false); }}
          >
            <p className="text-sm text-foreground/70">
              {t(
                "siteTour.actions.confirmArchiveMessage",
                "Are you sure you want to archive the selected tours? This action can be undone by editing the tour.",
              )}
            </p>
          </Modal>

          {/* Confirm delete modal */}
          <Modal
            footer={(
              <>
                <Button variant="outline" onClick={() => setShowConfirmDelete(false)}>{t('siteTour.buttons.cancel', 'Cancelar')}</Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    try {
                      const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
                      if (!tenantId) {
                        toast.error(t('siteTour.actions.missingTenant', 'Missing tenant'));
                        return;
                      }
                      // perform delete for each selected tour
                      await Promise.all((selectedTourIds || []).map(id => ApiService.delete(`/tenant/${tenantId}/site-tour/${encodeURIComponent(id)}`)));
                      toast.success(t('siteTour.actions.deleted', 'Selected tours deleted'));
                      setShowConfirmDelete(false);
                      setSelectedTourIds([]);
                      try { await fetchTours(); } catch (e) { /* ignore */ }
                    } catch (err: any) {
                      console.error('Delete selected failed', err);
                      const msg = err?.response?.data?.message || err?.message || t('siteTour.actions.deleteError', 'Error deleting selected tours');
                      toast.error(msg);
                    }
                  }}
                >
                  {t('siteTour.actions.delete', 'Eliminar')}
                </Button>
              </>
            )}
            icon={<Trash className="h-5 w-5" />}
            open={showConfirmDelete}
            size="md"
            title={t('siteTour.actions.confirmDeleteTitle', 'Confirmar eliminación')}
            onOpenChange={(o) => { if (!o) setShowConfirmDelete(false); }}
          >
            <p className="text-sm text-foreground/70">
              {t(
                "siteTour.actions.confirmDeleteMessage",
                "Are you sure you want to permanently delete the selected tours? This action cannot be undone and will remove all associated data.",
              )}
            </p>
          </Modal>

          {/* TagScans removed from inline modal — use the sidebar/menu or dedicated route */}

          {/* Detail modal (simplified: only relevant fields + guard/station names) */}
          <Modal
            footer={<Button variant="outline" onClick={() => setShowDetailModal(false)}>{t('common.close', 'Cerrar')}</Button>}
            icon={<Eye className="h-5 w-5" />}
            open={showDetailModal && !!detailTour}
            size="lg"
            title={detailTour?.name || detailTour?.title || t('siteTour.detail.title', 'Detalles del recorrido')}
            onOpenChange={(o) => {
              if (!o) setShowDetailModal(false);
            }}
          >
            {/* El cuerpo de un modal se CONSTRUYE aunque `open` sea false: JSX evalúa
                sus hijos al renderizar el padre. Sin esta guarda, `detailTour.description`
                reventaba la pestaña entera nada más entrar, con el recorrido aún sin abrir. */}
            {detailTour && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">
                  {t("siteTour.field.description", "Description")}
                </div>
                <div className="mt-1 text-sm">
                  {detailTour.description || detailTour.desc || "-"}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">
                  {t("siteTour.field.scheduledDays", "Scheduled Days")}
                </div>
                <div className="mt-1 text-sm">
                  {(() => {
                    const d =
                      detailTour.scheduledDays ||
                      detailTour.scheduled_days ||
                      detailTour.schedule;
                    return Array.isArray(d) ? d.join(", ") || "-" : d || "-";
                  })()}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">
                  {t("siteTour.field.timeMode", "Time Mode")}
                </div>
                <div className="mt-1 text-sm">
                  {translateTimeMode(
                    detailTour.timeMode || detailTour.time_mode,
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">
                  {t("siteTour.field.selectTime", "Select Time")}
                </div>
                <div className="mt-1 text-sm">
                  {detailTour.selectTime || detailTour.select_time || "-"}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">
                  {t("siteTour.field.continuous", "Continuous")}
                </div>
                <div className="mt-1 text-sm">
                  {detailTour.continuous
                    ? t("common.yes", "Yes")
                    : t("common.no", "No")}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">
                  {t("siteTour.field.maxDuration", "Max Duration")}
                </div>
                <div className="mt-1 text-sm">
                  {detailTour.maxDuration || detailTour.max_duration || "-"}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">
                  {t("siteTour.field.assignedGuard", "Assigned Guard")}
                </div>
                <div className="mt-1 text-sm">
                  {(() => {
                    const candidateId =
                      detailTour.assignedGuard ||
                      detailTour.securityGuardId ||
                      detailTour.security_guard_id ||
                      detailTour.guard ||
                      detailTour.assigned_guard ||
                      detailTour.guardId ||
                      detailTour.guard_id ||
                      null;

                    if (detailGuardName === "-") {
                      return (
                        <span style={{ color: "var(--bad-text)" }}>
                          {candidateId || "-"}
                        </span>
                      );
                    }
                    if (detailGuardName) return <span>{detailGuardName}</span>;
                    // fallback: try resolving from candidate id synchronously
                    const sync = candidateId
                      ? resolveGuardName(candidateId)
                      : null;

                    if (sync && sync !== String(candidateId))
                      return <span>{sync}</span>;

                    return (
                      <span style={{ color: "var(--bad-text)" }}>
                        {candidateId || "-"}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">
                  {t("siteTour.field.station", "Station")}
                </div>
                <div className="mt-1 text-sm">
                  {resolveStationName(
                    detailTour.station ||
                      detailTour.stationId ||
                      detailTour.station_id ||
                      detailTour.stationName ||
                      detailTour,
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">
                  {t("siteTour.field.active", "Active")}
                </div>
                <div className="mt-1 text-sm">
                  {typeof detailTour.active === "boolean"
                    ? detailTour.active
                      ? t("common.yes", "Yes")
                      : t("common.no", "No")
                    : detailTour.active
                      ? String(detailTour.active)
                      : "-"}
                </div>
              </div>

              {/* Created At / Updated At intentionally omitted per request */}
            </div>
            )}
          </Modal>

          <div className="md:hidden">
            <MobileCardList
              items={filteredTours}
              renderCard={(tour: any) => (
                <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">
                      {tour.name ||
                        t("siteTour.placeholders.tourNameFallback")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {translateTimeMode(tour.timeMode)}
                    </div>
                  </div>
                  <div className="text-sm text-foreground/70">
                    {tour.maxDuration || "-"}
                  </div>
                </div>
                </>
              )}
            />
          </div>
        </div>
      </div>

      {showNewTourModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-end p-4 sm:p-0">
          <div
            className="absolute inset-0"
            style={{ background: "oklch(0 0 0 / 0.45)" }}
            onClick={() => setShowNewTourModal(false)}
          />

          <aside className="glass-raised relative flex h-screen w-full flex-col overflow-hidden sm:ml-auto sm:max-w-md lg:max-w-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                {t("siteTour.modal.title")}
              </h3>
              <button
                onClick={() => {
                  setShowNewTourModal(false);
                  setEditingTourId(null);
                }}
                className="p-2 text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto max-h-[90vh] flex flex-col space-y-4">
              <div>
                <input
                  value={tourName}
                  onChange={(e) => setTourName(e.target.value)}
                  placeholder={t("siteTour.form.tourName")}
                  className="w-full border rounded-lg h-12 px-3"
                />
                {submitAttempted && !tourName.trim() && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {t(
                      "siteTour.form.validation.tourNameRequired",
                      "Tour name is required",
                    )}
                  </div>
                )}
              </div>

              <div>
                <textarea
                  value={tourDesc}
                  onChange={(e) => setTourDesc(e.target.value)}
                  placeholder={t("siteTour.form.tourDescription")}
                  className="w-full border rounded-lg px-3 py-3 min-h-[120px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("siteTour.form.scheduledDays", "Días de la semana")}
                </label>
                <Select<{ value: string; label: string }, true>
                  isMulti
                  classNamePrefix="react-select"
                  options={[
                    { value: 'monday', label: t('siteTour.options.monday', 'Lunes') },
                    { value: 'tuesday', label: t('siteTour.options.tuesday', 'Martes') },
                    { value: 'wednesday', label: t('siteTour.options.wednesday', 'Miércoles') },
                    { value: 'thursday', label: t('siteTour.options.thursday', 'Jueves') },
                    { value: 'friday', label: t('siteTour.options.friday', 'Viernes') },
                    { value: 'saturday', label: t('siteTour.options.saturday', 'Sábado') },
                    { value: 'sunday', label: t('siteTour.options.sunday', 'Domingo') },
                  ]}
                  placeholder={t('siteTour.form.scheduledDaysPlaceholder', 'Selecciona los días...')}
                  value={[
                    { value: 'monday', label: t('siteTour.options.monday', 'Lunes') },
                    { value: 'tuesday', label: t('siteTour.options.tuesday', 'Martes') },
                    { value: 'wednesday', label: t('siteTour.options.wednesday', 'Miércoles') },
                    { value: 'thursday', label: t('siteTour.options.thursday', 'Jueves') },
                    { value: 'friday', label: t('siteTour.options.friday', 'Viernes') },
                    { value: 'saturday', label: t('siteTour.options.saturday', 'Sábado') },
                    { value: 'sunday', label: t('siteTour.options.sunday', 'Domingo') },
                  ].filter(opt => scheduledDays.includes(opt.value))}
                  onChange={(opts: MultiValue<{ value: string; label: string }>) => setScheduledDays((opts || []).map(opt => opt.value))}
                />
                {submitAttempted && scheduledDays.length === 0 && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {t(
                      "siteTour.form.validation.scheduledDaysRequired",
                      "Selecciona al menos un día",
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-foreground/70">
                    {t("siteTour.form.continuous")}
                  </label>
                  <input
                    type="checkbox"
                    checked={continuous}
                    onChange={(e) => setContinuous(e.target.checked)}
                    className="h-5 w-8"
                  />
                </div>

                <div className="flex-1">
                  <select
                    className="w-full border rounded-lg h-12 px-3"
                    value={timeMode}
                    onChange={e => {
                      const v = e.target.value;
                      setTimeMode(v);
                      if (v !== 'specific') setSelectTime('');
                    }}
                  >
                    <option value="specific">
                      {t("siteTour.form.timeMode.specific")}
                    </option>
                    <option value="any">
                      {t("siteTour.form.timeMode.any")}
                    </option>
                  </select>
                </div>
              </div>

              {timeMode === "specific" && (
                <div
                  className="relative"
                  onClick={() => {
                    if (timeInputRef.current) {
                      try {
                        // Prefer showPicker if available (Chrome/Edge)
                        if (
                          typeof (timeInputRef.current as any).showPicker ===
                          "function"
                        ) {
                          (timeInputRef.current as any).showPicker();
                        } else {
                          timeInputRef.current.focus();
                        }
                      } catch (e) {
                        timeInputRef.current.focus();
                      }
                    }
                  }}
                >
                  <input
                    ref={timeInputRef}
                    className="w-full border rounded-lg h-12 px-3"
                    placeholder={t('siteTour.form.selectTime')}
                    type="time"
                    value={selectTime}
                    onChange={e => setSelectTime(e.target.value)}
                  />
                  <button
                    aria-label={t('siteTour.form.openTimePicker', 'Open time picker')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (timeInputRef.current) {
                        if (typeof (timeInputRef.current as any).showPicker === 'function') {
                          (timeInputRef.current as any).showPicker();
                        } else {
                          timeInputRef.current.focus();
                        }
                      }
                    }}
                  >
                    <Clock size={18} />
                  </button>
                </div>
              )}

              <div>
                <select
                  value={maxDuration}
                  onChange={(e) => setMaxDuration(e.target.value)}
                  className="w-full border rounded-lg h-12 px-3"
                >
                  <option value="">
                    {t("siteTour.form.maxDuration.placeholder")}
                  </option>
                  <option value="15">
                    {t("siteTour.form.maxDuration.15")}
                  </option>
                  <option value="30">
                    {t("siteTour.form.maxDuration.30")}
                  </option>
                </select>
              </div>

              <div>
                <select
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                  className="w-full border rounded-lg h-12 px-3"
                >
                  <option value="">
                    {loadingStations
                      ? "Loading stations..."
                      : t("siteTour.form.selectStation", "Select station")}
                  </option>
                  {stations.map((s: any) => (
                    <option
                      key={s.id || s.stationId}
                      value={s.id || s.stationId}
                    >
                      {s.stationName ||
                        s.name ||
                        s.station_name ||
                        s.stationId ||
                        s.id}
                    </option>
                  ))}
                </select>
                {submitAttempted && !stationId && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {t(
                      "siteTour.form.validation.stationRequired",
                      "Station is required",
                    )}
                  </div>
                )}
              </div>

              {/* Eliminado campo de asignación de vigilante: los recorridos pueden ser realizados por cualquier vigilante de la estación */}

              {/*<div className="space-y-2">
                <label className="flex items-center gap-2"><input type="checkbox" checked={enableNotes} onChange={e => setEnableNotes(e.target.checked)} /> {t('siteTour.form.enableNotes')}</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={forceMedia} onChange={e => setForceMedia(e.target.checked)} /> {t('siteTour.form.forceMedia')}</label>
              </div>*/}
            </div>

            <div className="p-4 border-t mt-auto">
              <div className="flex justify-between items-center">
                <div>
                  <button
                    onClick={() => {
                      /* save as draft */ setShowNewTourModal(false);
                      setEditingTourId(null);
                    }}
                    className="px-4 py-2 rounded-full bg-muted text-foreground"
                  >
                    {t("siteTour.buttons.saveDraft")}
                  </button>
                </div>
                <div>
                  <button
                    aria-disabled={!isFormValid}
                    className="ml-2 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!isFormValid}
                    style={isFormValid
                      ? { background: 'var(--brand)', color: 'var(--brand-ink)', boxShadow: '0 6px 20px -8px var(--brand-glow)' }
                      : { background: 'var(--glass-sunken)', color: 'var(--ink-faint)' }}
                    onClick={async () => {
                      // submit new site tour
                      setSubmitAttempted(true);
                      if (!isFormValid) {
                        toast.error(t('siteTour.form.validation.fillRequired', 'Please fill required fields'));
                        return;
                      }
                      try {
                        const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
                        if (!tenantId || !site?.id) {
                          toast.error(t('siteTour.form.noPostSiteId', 'No post site selected'));
                          return;
                        }

                        const payload: any = {
                          name: tourName,
                          description: tourDesc,
                          postSiteId: site?.id || null,
                          stationId: stationId || null,
                          scheduledDays: scheduledDays,
                          continuous,
                          timeMode,
                          selectTime,
                          maxDuration,
                          active: true,
                        };

                        let createdId: string | null = null;
                        if (editingTourId) {
                          await ApiService.patch(`/tenant/${tenantId}/site-tour/${encodeURIComponent(editingTourId)}`, payload);
                          toast.success(t('siteTour.notifications.updated', 'Site tour updated'));
                          createdId = editingTourId;
                        } else {
                          const resp: any = await ApiService.post(`/tenant/${tenantId}/site-tour`, payload);
                          const newId = resp && (resp.id || resp._id);
                          createdId = newId || null;
                          toast.success(t('siteTour.notifications.created', 'Site tour created'));
                        }

                        // Ya no se persiste asignación de vigilante: los recorridos son generales para la estación
                        // refresh list
                        try { await fetchTours(); } catch (e) { /* ignore */ }
                        // reset and close
                        setTourName('');
                        setTourDesc('');
                        setScheduledDays([]);
                        setContinuous(false);
                        setTimeMode('specific');
                        setSelectTime('');
                        setMaxDuration('');
                        // eliminado setAssignGuard
                        setShowNewTourModal(false);
                        setEditingTourId(null);
                      } catch (err: any) {
                        console.error('Create site tour failed', err);
                        const msg = err?.response?.data?.message || err?.message || t('siteTour.form.errorCreating', 'Error creating site tour');
                        toast.error(msg);
                      }
                    }}
                  >
                    {t("siteTour.buttons.submit")}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      <Modal
        description={site?.companyName || site?.name || t('station.siteTours.thisSite', 'Este sitio')}
        icon={<Settings className="h-5 w-5" />}
        open={showSettingsModal}
        size="lg"
        title={t('station.siteTours.settingsTitle', 'Configuraciones de Rondas')}
        onOpenChange={(o) => { if (!o) setShowSettingsModal(false); }}
      >
        <RondaSettingsForm
          postSiteId={site?.id}
          onSaved={() => setShowSettingsModal(false)}
        />
      </Modal>
    </div>
  );
}

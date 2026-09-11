import React, { useRef, useEffect } from "react";
import { clientDisplayName } from "@/lib/clientName";
import { useTranslation } from "react-i18next";
import IncidentMap from "@/components/IncidentMap/IncidentMap";
import { useState } from "react";
import { ApiService } from "@/services/api/apiService";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServiceTypeBadge } from "@/components/post-sites/ServiceTypeBadge";
import { StatCard, EmptyState, Stagger, Section } from "@/components/kit";
import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import {
  Users,
  ShieldCheck,
  Route,
  ClipboardCheck,
  AlertTriangle,
  Clock,
  MapPin,
  MapIcon,
  ExternalLink,
  Activity,
  SlidersHorizontal,
} from "lucide-react";
import type { PostSite } from "@/types";

interface SiteProp extends PostSite {
  active?: boolean;
  businessName?: string;
  city?: string;
  country?: string;
  clientAccountName?: string;
  clientAccount?: {
    name?: string;
    lastName?: string;
    commercialName?: string;
  } | null;
  companyAddress?: string;
  secondAddress?: string;
  serviceType?: string;
  lat?: number | string | null;
  lng?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  location?: { lat?: number | string; lng?: number | string } | null;
  tenantId?: string;
}

export default function PostSiteOverview({ site }: { site?: SiteProp }) {
  const { t } = useTranslation();
  const [openFilter, setOpenFilter] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(containerRef);

  const typeKeys = [
    "callOffRequest",
    "checkList",
    "checkedIn",
    "checkedOut",
    "clockedIn",
    "clockedOut",
    "companyPolicy",
    "dispatch",
    "exchangeShift",
    "geoFence",
    "guardAvailability",
    "guardIdle",
    "guardDeviceFall",
    "incidentReport",
    "lowBattery",
    "openShiftConfirmation",
    "panicAlert",
    "parkingManager",
    "passdownReport",
    "postOrder",
    "shiftConfirmation",
    "siteTour",
    "standardReport",
    "taskReport",
    "timeOff",
    "vehiclePatrol",
    "watchModeReport",
  ];

  const toggleType = (key: string) => {
    setSelectedTypes((s) =>
      s.includes(key) ? s.filter((x) => x !== key) : [...s, key],
    );
  };

  const [assignedCount, setAssignedCount] = useState<number>(0);
  const [onsiteCount, setOnsiteCount] = useState<number>(0);
  const [toursCount, setToursCount] = useState<number>(0);
  const [tasksCount, setTasksCount] = useState<number>(0);
  const [incidentsCount, setIncidentsCount] = useState<number>(0);
  const [hoursLogged, setHoursLogged] = useState<string>("00:00");

  // Each stat: icon + a soft accent colour. Values stay in `foreground` for
  // readability; only the icon chip carries colour.
  const stats = [
    {
      id: "assigned",
      label: t("postSites.overview.Stats.guardsAssigned"),
      value: assignedCount,
      icon: Users,
      accent: "info" as const,
    },
    {
      id: "onsite",
      label: t("postSites.overview.Stats.guardOnSite"),
      value: onsiteCount,
      icon: ShieldCheck,
      accent: "brand" as const,
    },
    {
      id: "tours",
      label: t("postSites.overview.Stats.toursCompleted"),
      value: toursCount,
      icon: Route,
      accent: "ok" as const,
    },
    {
      id: "tasks",
      label: t("postSites.overview.Stats.tasksCompleted"),
      value: tasksCount,
      icon: ClipboardCheck,
      accent: "info" as const,
    },
    {
      id: "incidents",
      label: t("postSites.overview.Stats.incidentsReported"),
      value: incidentsCount,
      icon: AlertTriangle,
      accent: "bad" as const,
    },
    {
      id: "hrs",
      label: t("postSites.overview.Stats.hoursLogged"),
      value: hoursLogged,
      icon: Clock,
      accent: "neutral" as const,
    },
  ];

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tenantId =
          site?.tenantId || localStorage.getItem("tenantId") || "";
        const postSiteId = site?.id || "";
        if (!tenantId || !postSiteId) return;

        // Prefer backend-provided overview counters (single request)
        try {
          const overview: any = await ApiService.get(
            `/tenant/${tenantId}/post-site/${postSiteId}/overview`,
            { toast: { silentError: true } } as any,
          );
          if (overview && typeof overview.assignedCount !== "undefined") {
            if (mounted) {
              setAssignedCount(Number(overview.assignedCount || 0));
              setOnsiteCount(Number(overview.onsiteCount || 0));
              setToursCount(Number(overview.toursLast7Days || 0));
              setTasksCount(Number(overview.tasksLast7Days || 0));
              setIncidentsCount(Number(overview.incidentsLast7Days || 0));
              const secs = Number(overview.hoursLoggedSeconds || 0);
              const hrs = Math.floor(secs / 3600);
              const mins = Math.floor((secs % 3600) / 60);
              setHoursLogged(
                `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
              );
            }
            return; // done
          }
        } catch (e) {
          // fallback to legacy aggregation below
        }

        // 2) Shifts — used for onsite count and hours logged
        let shifts: any[] = [];
        try {
          const shiftsResp: any = await ApiService.get(
            `/tenant/${tenantId}/shift?postSiteId=${encodeURIComponent(postSiteId)}&limit=999`,
            { headers: { "Cache-Control": "no-cache" } } as any,
          );
          shifts = Array.isArray(shiftsResp)
            ? shiftsResp
            : shiftsResp && (shiftsResp.rows || shiftsResp.data)
              ? shiftsResp.rows || shiftsResp.data
              : [];
        } catch (e) {
          // fallback to post-site shifts endpoint
          try {
            const resp2: any = await ApiService.get(
              `/tenant/${tenantId}/post-site/${postSiteId}/shifts`,
              { toast: { silentError: true } } as any,
            );
            shifts = Array.isArray(resp2)
              ? resp2
              : resp2 && (resp2.rows || resp2.data)
                ? resp2.rows || resp2.data
                : [];
          } catch (e2) {
            shifts = [];
          }
        }

        const now = Date.now();
        let onsite = 0;
        let hoursSeconds = 0;
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const sh of shifts || []) {
          const startStr =
            sh.start ||
            sh.shiftStart ||
            sh.startTime ||
            sh.start_time ||
            sh.startAt ||
            sh.startDate;
          const endStr =
            sh.end ||
            sh.shiftEnd ||
            sh.endTime ||
            sh.end_time ||
            sh.finishTimeInDay ||
            sh.finish_time ||
            sh.finish;
          const s = startStr ? +new Date(startStr) : NaN;
          const e = endStr ? +new Date(endStr) : NaN;
          if (!isNaN(s) && !isNaN(e)) {
            if (s <= now && now <= e) onsite += 1;
            if (s >= sevenDaysAgo || e >= sevenDaysAgo) {
              hoursSeconds += Math.max(0, (e - s) / 1000);
            }
          }
        }
        if (mounted) {
          setOnsiteCount(onsite);
          const hrs = Math.floor(hoursSeconds / 3600);
          const mins = Math.floor((hoursSeconds % 3600) / 60);
          setHoursLogged(
            `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
          );
        }

        // 3) Tours completed in last 7 days — use tags as proxy
        try {
          const tagsResp: any = await ApiService.get(
            `/tenant/${tenantId}/post-site/${encodeURIComponent(postSiteId)}/site-tour-tags?limit=999`,
          );
          const tags = Array.isArray(tagsResp)
            ? tagsResp
            : tagsResp && (tagsResp.rows || tagsResp.data)
              ? tagsResp.rows || tagsResp.data
              : [];
          const recentTags = (tags || []).filter((t: any) => {
            const c = t.createdAt || t.created_at || t.timestamp || t.date;
            if (!c) return false;
            const tms = +new Date(c);
            return !isNaN(tms) && tms >= sevenDaysAgo;
          });
          if (mounted) setToursCount(recentTags.length);
        } catch (e) {
          if (mounted) setToursCount(0);
        }

        // 4) Incidents in last 7 days
        try {
          const incResp: any = await ApiService.get(
            `/tenant/${tenantId}/incident?postSiteId=${encodeURIComponent(postSiteId)}&limit=999`,
          );
          const rows = Array.isArray(incResp)
            ? incResp
            : incResp && (incResp.rows || incResp.data)
              ? incResp.rows || incResp.data
              : [];
          const recent = (rows || []).filter((r: any) => {
            const c = r.createdAt || r.created_at || r.incidentAt || r.date;
            if (!c) return false;
            const tms = +new Date(c);
            return !isNaN(tms) && tms >= sevenDaysAgo;
          });
          if (mounted) setIncidentsCount(recent.length);
        } catch (e) {
          if (mounted) setIncidentsCount(0);
        }

        // 5) Tasks completed last 7 days — try couple endpoints
        try {
          let tasksRows: any[] = [];
          try {
            const tResp: any = await ApiService.get(
              `/tenant/${tenantId}/post-site/${postSiteId}/tasks`,
              { toast: { silentError: true } } as any,
            );
            tasksRows = Array.isArray(tResp)
              ? tResp
              : tResp && (tResp.rows || tResp.data)
                ? tResp.rows || tResp.data
                : [];
          } catch (e) {
            try {
              const t2: any = await ApiService.get(
                `/tenant/${tenantId}/task?postSiteId=${encodeURIComponent(postSiteId)}&limit=999`,
                { toast: { silentError: true } } as any,
              );
              tasksRows = Array.isArray(t2)
                ? t2
                : t2 && (t2.rows || t2.data)
                  ? t2.rows || t2.data
                  : [];
            } catch (e2) {
              tasksRows = [];
            }
          }

          const recentTasks = (tasksRows || []).filter((it: any) => {
            const fin =
              it.completedAt ||
              it.finishedAt ||
              it.closedAt ||
              it.completed_at ||
              it.finished_at ||
              it.closed_at ||
              it.updatedAt ||
              it.updated_at;
            if (!fin) return false;
            const tms = +new Date(fin);
            return !isNaN(tms) && tms >= sevenDaysAgo;
          });
          if (mounted) setTasksCount(recentTasks.length);
        } catch (e) {
          if (mounted) setTasksCount(0);
        }
      } catch (err) {
        console.error("Failed loading overview counters", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [site]);

  // ── Derived site identity fields (tolerant of varied API field names). ──
  const siteName =
    site?.businessName ||
    site?.companyName ||
    site?.name ||
    t("postSites.postsite", "Post Site");
  const address =
    site?.address ||
    site?.companyAddress ||
    site?.secondAddress ||
    [site?.city, site?.country].filter(Boolean).join(", ");
  const clientName =
    site?.clientAccountName ||
    clientDisplayName(site?.client ?? site?.clientAccount, "") ||
    (typeof site?.client === "string" ? site?.client : "");
  const phone = site?.contactPhone || site?.phone || "";
  const email = site?.contactEmail || site?.email || "";
  const isActive = site?.active !== false && site?.status !== "inactive";
  const serviceType = site?.serviceType;

  const lat =
    site?.latitud ??
    site?.latitude ??
    site?.lat ??
    (site?.location && site.location.lat);
  const lng =
    site?.longitud ??
    site?.longitude ??
    site?.lng ??
    (site?.location && site.location.lng);
  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasCoords =
    lat != null && lng != null && !isNaN(latNum) && !isNaN(lngNum);
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "";

  return (
    <div ref={containerRef} className="space-y-6 animate-fade-up">
      {/* Identity header lives in PostSiteLayout now (avoids duplication). */}

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center gap-2 px-1">
          <h3 className="cg-eyebrow">{t("postSites.overview.Stats.title")}</h3>
          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
            · {t("postSites.overview.last7days", "últimos 7 días")}
          </span>
        </div>
        <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <StatCard
                key={s.id}
                label={s.label}
                value={s.value}
                icon={<Icon />}
                accent={s.accent}
              />
            );
          })}
        </Stagger>
      </div>

      {/* ── Location map ─────────────────────────────────────────────────── */}
      <Section
        title={t("postSites.overview.Map.title")}
        icon={<MapIcon />}
        action={
          address ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="cg-btn-link cg-focus inline-flex items-center gap-1.5 rounded text-sm hover:underline"
            >
              {t("postSites.overview.Map.openInMaps", "Abrir en Google Maps")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : undefined
        }
      >
        {hasCoords ? (
          <div
            className="h-80 overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--hairline)" }}
          >
            <IncidentMap lat={latNum} lng={lngNum} label={siteName} />
          </div>
        ) : (
          <EmptyState
            icon={<MapPin />}
            title={t(
              "postSites.overview.Map.noCoords",
              "Este sitio no tiene coordenadas configuradas.",
            )}
            action={
              address ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="cg-btn-link cg-focus rounded text-sm hover:underline"
                >
                  {t(
                    "postSites.overview.Map.openInMaps",
                    "Abrir en Google Maps",
                  )}
                </a>
              ) : undefined
            }
          />
        )}
      </Section>

      {/* ── Latest activity ──────────────────────────────────────────────── */}
      <Section
        title={t("postSites.overview.LatestActivity")}
        icon={<Activity />}
        action={
          <Sheet open={openFilter} onOpenChange={setOpenFilter}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />
                {t("postSites.overview.Filters", "Filtros")}
                {selectedTypes.length > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-1 px-1.5 py-0 text-[10px]"
                  >
                    {selectedTypes.length}
                  </Badge>
                ) : null}
              </Button>
            </SheetTrigger>

            {/* 400 px fijos son más anchos que un teléfono de 375: el panel se
                  salía por la derecha. En móvil ocupa el ancho disponible. */}
            <SheetContent
              side="right"
              className="z-[9999] w-full max-w-full sm:w-[460px] sm:max-w-[460px]"
            >
              <SheetHeader>
                <SheetTitle>
                  {t("postSites.overview.Filters", "Filtros")}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t(
                    "postSites.overview.FilterHelp",
                    "Selecciona filtros para la vista.",
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="cg-eyebrow">
                      {t("postSites.overview.Filter.fromDate", "Desde")}
                    </label>
                    <input
                      type="date"
                      className="cg-input cg-focus w-full px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="cg-eyebrow">
                      {t("postSites.overview.Filter.toDate", "Hasta")}
                    </label>
                    <input
                      type="date"
                      className="cg-input cg-focus w-full px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">
                    {t("postSites.overview.Filter.type", "Tipo")}
                  </label>
                  <div className="glass-sunken mt-2 max-h-60 overflow-auto p-2">
                    {typeKeys.map((key) => (
                      <label
                        key={key}
                        className="flex cursor-pointer items-center gap-3 rounded px-2 py-2"
                      >
                        <Checkbox
                          checked={selectedTypes.includes(key)}
                          onCheckedChange={() => toggleType(key)}
                        />
                        <span className="text-sm">
                          {t(`postSites.overview.types.${key}`)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  {selectedTypes.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTypes([])}
                    >
                      {t("common.clear", "Limpiar")}
                    </Button>
                  ) : null}
                  <Button
                    variant="brand"
                    size="sm"
                    onClick={() => setOpenFilter(false)}
                  >
                    {t("common.apply", "Filtrar")}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        }
      >
        <div className="mt-2">
          <EmptyState
            icon={<Activity />}
            title={t(
              "postSites.overview.noActivity",
              "Sin actividad por ahora.",
            )}
          />
        </div>
      </Section>
    </div>
  );
}

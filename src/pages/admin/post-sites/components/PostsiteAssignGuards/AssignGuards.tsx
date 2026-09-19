import type { PostSite } from "@/types";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  MapPin,
  ArrowRight,
  Users,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ApiService } from "@/services/api/apiService";
import { Section, EmptyState, SearchInput } from "@/components/kit";
import { Input } from "@/components/ui/input";

interface SiteProp extends PostSite {
  tenantId?: string;
}

/**
 * SITE-LEVEL vigilante roster — READ-ONLY aggregate.
 *
 * A "sitio de servicio" has NO assignment entity of its own: guards belong to
 * its STATIONS (guardAssignment is station-keyed). This tab is a roll-up of the
 * SAME canonical store (`/guard-assignments`) the station "Vigilantes" tab reads,
 * grouped by station — so the two views can never disagree. There is no
 * assign/remove here on purpose (the old site-level "assign" secretly wrote to
 * station #1 and its delete hit divergent legacy paths); every row deep-links
 * into its station, the single place to add/remove/change a vigilante.
 */

type RosterRow = {
  assignmentId: string;
  guardUserId: string;
  guardName: string;
  type: "fijo" | "sacafranco";
  positionName: string;
  rotation: string;
  stationId: string;
  stationName: string;
};

export default function AssignGuards({ site }: { site?: SiteProp }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const tenantId = site?.tenantId || localStorage.getItem("tenantId") || "";
  const postSiteId = site?.id || "";

  const [rows, setRows] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!tenantId || !postSiteId) return;
    setLoading(true);
    setError(null);
    try {
      const ts = Date.now();
      // Canonical source: the site's stations + every active assignment, then
      // keep only the assignments whose station belongs to THIS site. Same store
      // as the station tab (guardAssignment) → consistent ids + never diverges.
      const [stRes, aRes, gRes]: any[] = await Promise.all([
        ApiService.get(
          `/tenant/${tenantId}/post-site/${encodeURIComponent(postSiteId)}/stations?_=${ts}`,
          { toast: { silentError: true } } as any,
        ).catch(() => []),
        ApiService.get(
          `/tenant/${tenantId}/guard-assignments?status=active&_=${ts}`,
          { toast: { silentError: true } } as any,
        ).catch(() => []),
        ApiService.get(`/tenant/${tenantId}/security-guard?limit=999&_=${ts}`, {
          toast: { silentError: true },
        } as any).catch(() => []),
      ]);

      const stationsRaw = Array.isArray(stRes) ? stRes : (stRes?.rows ?? []);
      // HARD isolation: only keep stations that ACTUALLY belong to this site.
      // The /post-site/:id/stations endpoint currently ignores its postSiteId
      // filter and returns tenant-wide stations, which leaked other clients'
      // guards into this roster — never trust it, re-filter by postSiteId here.
      const stations = stationsRaw.filter(
        (s: any) =>
          String(s.postSiteId || s.post_site_id || "") === String(postSiteId),
      );
      const stationById = new Map<string, string>();

      for (const s of stations) {
        stationById.set(
          String(s.id || s.stationId),
          s.stationName || s.name || s.station_name || "—",
        );
      }

      // guard id (securityGuard id / user id) -> display name
      const gRows = Array.isArray(gRes) ? gRes : (gRes?.rows ?? []);
      const nameById: Record<string, string> = {};

      for (const r of gRows) {
        const u = r.guard || r;
        const nm =
          u.fullName ||
          r.fullName ||
          `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
          u.email ||
          "";

        for (const id of [u.id, r.id, r.guardId, u.guardId])
          if (id) nameById[String(id)] = nm || nameById[String(id)] || "";
      }

      const aRows = Array.isArray(aRes) ? aRes : (aRes?.rows ?? []);
      const out: RosterRow[] = [];

      for (const a of aRows) {
        const sid = String(a.stationId || a.station?.id || "");

        if (!stationById.has(sid)) continue; // not a station of this site
        const g = a.guard || a.user || {};
        const pos = a.position || {};
        const type: "fijo" | "sacafranco" = (pos.type ||
          (a.isRelief ? "sacafranco" : "fijo")) as any;
        const gid = String(g.id || a.guardId || "");

        out.push({
          assignmentId: String(a.id),
          guardUserId: gid,
          guardName:
            g.fullName ||
            `${g.firstName || ""} ${g.lastName || ""}`.trim() ||
            g.email ||
            nameById[gid] ||
            "—",
          type,
          positionName:
            pos.name || (type === "sacafranco" ? "Sacafranco" : "Fijo"),
          rotation: a.rotationStyle?.name || a.rotationStyle?.pattern || "",
          stationId: sid,
          stationName: stationById.get(sid) || "—",
        });
      }
      // Stable order: by station, then guard.
      out.sort(
        (x, y) =>
          x.stationName.localeCompare(y.stationName) ||
          x.guardName.localeCompare(y.guardName),
      );
      setRows(out);
    } catch (e: any) {
      setError(
        e?.message ||
          t(
            "clients.assignGuards.failedLoadAssignments",
            "No se pudieron cargar los vigilantes",
          ),
      );
    } finally {
      setLoading(false);
    }
  }, [tenantId, postSiteId, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh when a station's assignments change anywhere (the station tab fires
  // this after assign/remove), so the site roll-up stays live.
  useEffect(() => {
    const onChanged = () => load();

    window.addEventListener("assignments:changed", onChanged);
    window.addEventListener("station-horario-changed", onChanged);

    return () => {
      window.removeEventListener("assignments:changed", onChanged);
      window.removeEventListener("station-horario-changed", onChanged);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter(
      (r) =>
        r.guardName.toLowerCase().includes(q) ||
        r.stationName.toLowerCase().includes(q),
    );
  }, [rows, query]);

  // Group by station for the roll-up view.
  const groups = useMemo(() => {
    const m = new Map<
      string,
      { stationId: string; stationName: string; guards: RosterRow[] }
    >();

    for (const r of filtered) {
      if (!m.has(r.stationId))
        m.set(r.stationId, {
          stationId: r.stationId,
          stationName: r.stationName,
          guards: [],
        });
      m.get(r.stationId)!.guards.push(r);
    }

    return Array.from(m.values());
  }, [filtered]);

  const goToStation = (stationId: string) =>
    navigate(`/post-sites/${postSiteId}/stations/${stationId}/guards`);

  return (
    <Section
      action={
        <button
          className="cg-btn-glass cg-focus inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
          disabled={loading}
          onClick={load}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {t("app.refresh", "Actualizar")}
        </button>
      }
      icon={<Users />}
      title={t("postSites.Details.GuardsList", "Lista de vigilantes")}
    >
      <p className="mb-4 text-xs text-muted-foreground">
        {t(
          "clients.assignGuards.siteRosterHint",
          "Los vigilantes pertenecen a las estaciones de este sitio. Aquí ves el resumen; para asignar, quitar o cambiar un vigilante, entra a su estación.",
        )}
      </p>
      <div className="mb-4 flex items-center gap-2">
        <SearchInput
          className="flex-1 max-w-sm"
          placeholder={
              t(
                "clients.assignGuards.searchPlaceholder",
                "Buscar vigilante o estación…",
              ) as string
            }
          value={query}
          onChange={(v) => setQuery(v)}
        />
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />{" "}
          {t("app.loading", "Cargando…")}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          description={
            t(
              "clients.assignGuards.emptyHint",
              "Entra a una estación de este sitio para asignar vigilantes.",
            ) as string
          }
          icon={<Users />}
          title={
            t(
              "clients.assignGuards.emptyTitle",
              "Sin vigilantes asignados",
            ) as string
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map((grp) => (
            <div key={grp.stationId} className="glass-flat">
              <button
                className="glass-sunken flex w-full items-center justify-between gap-3 rounded-b-none px-4 py-3 text-left transition-colors"
                onClick={() => goToStation(grp.stationId)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="h-4 w-4 shrink-0 brand-text" />
                  <span className="truncate font-semibold text-foreground">
                    {grp.stationName}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {grp.guards.length}{" "}
                    {grp.guards.length === 1
                      ? t("clients.assignGuards.guardOne", "vigilante")
                      : t("clients.assignGuards.guardMany", "vigilantes")}
                  </span>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium brand-text">
                  {t(
                    "clients.assignGuards.manageInStation",
                    "Gestionar en la estación",
                  )}{" "}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>
              <ul className="divide-y divide-border/40">
                {grp.guards.map((r) => (
                  <li
                    key={r.assignmentId}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.guardName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.type === "sacafranco"
                          ? t("clients.assignGuards.roleSf", "Sacafranco")
                          : r.positionName}
                        {r.rotation ? ` · ${r.rotation}` : ""}
                      </p>
                    </div>
                    <button
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => goToStation(r.stationId)}
                    >
                      {t("clients.assignGuards.view", "Ver")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

import type { Station } from "@/types";

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { localeActual } from "@/lib/localeActual";
import { AlertTriangle } from "lucide-react";

import { ApiService } from "@/services/api/apiService";
import {
  Section,
  EmptyState,
  SkeletonCards,
  StatusBadge,
} from "@/components/kit";

type Props = { station: Station; stationId: string; postSiteId: string };

// An incident row from the backend /incident endpoint. Fields are read
// defensively (several backend aliases), so this stays permissive.
interface IncidentGuardRef {
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}
interface IncidentRow {
  id?: string;
  description?: string;
  subject?: string;
  title?: string;
  incidentDescription?: string;
  status?: string;
  incidentStatus?: string;
  createdAt?: string;
  incidentDate?: string;
  date?: string;
  stationId?: string;
  // `guardName` ES la asociación del vigilante, no un texto: el backend declara
  // `incident.belongsTo(securityGuard, { as: 'guardName' })` y la envía con
  // `attributes: ['id','fullName']`. Tiparla como string hacía que el compilador
  // bendijera renderizarla directa — y renderizar un objeto es React #31, que
  // aquí tumbaba el CRM entero a pantalla blanca.
  // Se admite string por si alguna ruta antigua devuelve el nombre plano.
  guardName?: IncidentGuardRef | string | null;
}

/**
 * Nombre legible del vigilante de un incidente.
 *
 * Devuelve SIEMPRE un string. Es la barrera contra React #31: el valor puede
 * llegar como objeto de asociación, como texto plano o como null según la ruta,
 * y renderizar el objeto crudo rompe todo el árbol de React.
 */
function guardLabel(
  value: IncidentGuardRef | string | null | undefined,
): string {
  if (!value) return "-";
  if (typeof value === "string") return value.trim() || "-";
  const full = value.fullName || value.name;

  if (full) return String(full);
  const parts = `${value.firstName || ""} ${value.lastName || ""}`.trim();

  return parts || "-";
}

export default function StationIncidents({ stationId, postSiteId }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<IncidentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stationId) return;
    let mounted = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        // Try stationId filter first, fall back to postSiteId
        let list: any[] = [];

        try {
          const res: any = await ApiService.get(
            `/tenant/${tenantId}/incident?filter[stationId]=${encodeURIComponent(stationId)}&limit=999`,
          );

          list = Array.isArray(res) ? res : (res?.rows ?? []);
        } catch {
          // fallback via postSiteId is fine — incidents may not support stationId filter
        }

        if (!list.length && postSiteId) {
          const res2: any = await ApiService.get(
            `/tenant/${tenantId}/incident?postSiteId=${encodeURIComponent(postSiteId)}&limit=50`,
          );
          const all = Array.isArray(res2) ? res2 : (res2?.rows ?? []);

          // Filter client-side for this station if stationId is present
          list = all.filter(
            (r: any) =>
              !r.stationId || String(r.stationId) === String(stationId),
          );
        }

        if (mounted) setRows(list);
      } catch (e: any) {
        if (mounted)
          setError(
            e?.message ||
              t("station.incidents.loadError", "Error al cargar incidencias"),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [stationId, postSiteId]);

  const fmt = (v: any) => {
    if (!v) return "-";
    try {
      return new Intl.DateTimeFormat(localeActual(), {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(v));
    } catch {
      return String(v);
    }
  };

  // Display label for the known status values; unknown ones render as stored.
  const statusLabel = (status: string): string => {
    const s = (status || "").toLowerCase();

    if (s === "cerrado" || s === "closed")
      return t("incidents.status.closed", "Cerrado");
    if (s === "resolved")
      return t("reports.panicLog.status.resolved", "Resuelto");
    if (s === "abierto" || s === "open")
      return t("incidents.status.open", "Abierto");

    return status;
  };

  const statusTone = (status: string): "slate" | "orange" | "blue" => {
    const s = (status || "").toLowerCase();

    if (s === "cerrado" || s === "closed" || s === "resolved") return "slate";
    if (s === "abierto" || s === "open") return "orange";

    return "blue";
  };

  return (
    <Section
      contentClassName="-mx-5 -mb-5"
      icon={<AlertTriangle />}
      title={
        <>
          {t("station.incidents.title", "Incidencias")}
          {rows.length > 0 && (
            <span className="ml-2 font-normal text-muted-foreground">
              ({rows.length})
            </span>
          )}
        </>
      }
    >
      {loading ? (
        <div className="px-5 pb-5">
          <SkeletonCards count={3} />
        </div>
      ) : error ? (
        <div className="px-5 pb-5 text-sm" style={{ color: "var(--bad-text)" }}>
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<AlertTriangle />}
            title={t(
              "station.incidents.empty",
              "No hay incidencias para esta estación.",
            )}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead
              className="border-y"
              style={{ borderColor: "var(--hairline)" }}
            >
              <tr>
                <th className="cg-eyebrow px-2 py-2">
                  {t("station.incidents.col.description", "Descripción")}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t("station.incidents.col.status", "Estado")}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t("station.incidents.col.date", "Fecha")}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t("station.incidents.col.guard", "Vigilante")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r: IncidentRow, i: number) => {
                const description =
                  r.description ||
                  r.subject ||
                  r.title ||
                  r.incidentDescription ||
                  "-";
                const status = r.status || r.incidentStatus || "-";
                const date = r.createdAt || r.incidentDate || r.date;
                // El incidente NO trae `guard`, `securityGuard` ni
                // `responsibleGuard`: ninguno de esos alias existe en el modelo.
                // El vigilante viaja bajo `guardName`, que es un OBJETO.
                const guardName = guardLabel(r.guardName);

                return (
                  <tr key={r.id || i} className="hover:bg-muted/40">
                    <td className="px-2 py-2.5 text-foreground max-w-xs">
                      <div className="truncate">{description}</div>
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusBadge
                        className="capitalize"
                        tone={statusTone(status)}
                      >
                        {statusLabel(status)}
                      </StatusBadge>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground font-mono text-xs">
                      {fmt(date)}
                    </td>
                    <td className="px-2 py-2.5 text-foreground">{guardName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

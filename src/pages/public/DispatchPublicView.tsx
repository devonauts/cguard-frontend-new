import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { FileText, ShieldAlert } from "lucide-react";

import { clientDisplayName } from "@/lib/clientName";
import BrandLockup from "@/components/BrandLockup";
import DispatchFiles from "@/pages/admin/dispatcher/DispatchFiles";
import { callerTypeLabel } from "@/pages/admin/dispatcher/dispatchLabels";
import IncidentMap from "@/components/IncidentMap/IncidentMap";
import { clientService } from "@/lib/api/clientService";
import { postSiteService } from "@/lib/api/postSiteService";
import IncidentTypesService from "@/services/incident-types.service";
import { Section, StatusBadge, EmptyState } from "@/components/kit";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { resolveApiBase } from "@/lib/apiBase";

// Only allow http/https URLs to be used as navigable hrefs. Rejects
// javascript:/data:/other schemes that could come from server-stored data.
function safeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw, window.location.origin);

    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch (e) {
    // not a parseable absolute/relative URL
  }

  return null;
}

export default function DispatchPublicView() {
  const { t } = useTranslation();
  const { token } = useParams();
  const [payload, setPayload] = useState<any | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [postSites, setPostSites] = useState<any[]>([]);
  const [incidentTypes, setIncidentTypes] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      try {
        // Through the API base, `/api` included, like every other call. Taking
        // only its origin dropped `/api` (and a relative base fell back to
        // localhost:3001), so the fetch got the SPA's HTML and every shared
        // link said «no existe o ha expirado».
        const apiBase = (resolveApiBase() ?? "/api").replace(/\/+$/, "");
        const url = `${apiBase}/public/dispatch/${encodeURIComponent(token)}`;
        const resp = await fetch(url, { method: "GET" });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const p = await resp.json();

        setPayload(p);
      } catch (e) {
        setPayload(null);
      }
    };

    load();
  }, [token]);

  useEffect(() => {
    // These endpoints are authenticated, tenant-scoped CRM APIs. On a genuine
    // public viewer they would 401 and only waste requests. The public payload
    // already embeds resolved client/site/incidentType names (used first in the
    // render lookups below), so only fetch the aux lists when a session exists
    // (e.g. an admin opening the share/print view).
    let isAuthenticated = false;

    try {
      isAuthenticated = !!(
        localStorage.getItem("authToken") || localStorage.getItem("token")
      );
    } catch (e) {
      isAuthenticated = false;
    }
    if (!isAuthenticated) return;
    const loadAux = async () => {
      try {
        const [clientsResp, sitesResp] = await Promise.all([
          clientService
            .getClients(undefined, { limit: 1000, offset: 0 })
            .catch(() => null),
          postSiteService
            .list({}, { limit: 1000, offset: 0 })
            .catch(() => null),
        ]);

        if (clientsResp && Array.isArray((clientsResp as any).rows))
          setClients((clientsResp as any).rows);
        if (sitesResp && Array.isArray((sitesResp as any).rows))
          setPostSites((sitesResp as any).rows);
        try {
          const itResp: any = await IncidentTypesService.list("", 1, 1000);

          if (itResp && Array.isArray(itResp.rows))
            setIncidentTypes(itResp.rows);
        } catch (e) {
          // ignore
        }
      } catch (e) {
        // ignore
      }
    };

    loadAux();
  }, []);

  // Compute coordinates based on payload and auxiliary data
  const coords = (() => {
    if (!payload) return null;
    const maybe = (k: string) => (payload[k] !== undefined ? payload[k] : null);
    const lat =
      maybe("latitude") ||
      maybe("lat") ||
      maybe("locationLat") ||
      (payload.geo && payload.geo.lat) ||
      null;
    const lng =
      maybe("longitude") ||
      maybe("lng") ||
      maybe("locationLng") ||
      (payload.geo && payload.geo.lng) ||
      null;

    if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
    // Resolve from the site object. The backend (publicRequest -> RequestRepository
    // findById) already embeds the `site` (businessInfo) association, so the
    // public page needs no authenticated lookup. businessInfo stores geo in
    // Spanish field names (latitud/longitud); support those plus the list-shaped
    // fallbacks. fromSite() works for both the embedded payload.site and a row
    // resolved from the (authenticated-only) postSites list.
    try {
      const fromSite = (site: any) => {
        if (!site) return null;
        const sLat =
          site.latitud ??
          site.latitude ??
          site.lat ??
          site.locationLat ??
          site.coords?.lat ??
          null;
        const sLng =
          site.longitud ??
          site.longitude ??
          site.lng ??
          site.locationLng ??
          site.coords?.lng ??
          null;

        if (sLat != null && sLng != null && sLat !== "" && sLng !== "")
          return { lat: Number(sLat), lng: Number(sLng) };
        if (site.location && typeof site.location === "string") {
          const parts = site.location.split(",").map((s: string) => s.trim());

          if (
            parts.length === 2 &&
            !isNaN(Number(parts[0])) &&
            !isNaN(Number(parts[1]))
          )
            return { lat: Number(parts[0]), lng: Number(parts[1]) };
        }

        return null;
      };
      // Prefer the embedded site object first (no network needed).
      const embedded = fromSite(payload.site);

      if (embedded) return embedded;
      const siteId = payload.siteId || payload.postSiteId || payload.site?.id;

      if (siteId && postSites && postSites.length > 0) {
        const site = postSites.find(
          (s) => s.id === siteId || s._id === siteId || s.id === String(siteId),
        );
        const resolved = fromSite(site);

        if (resolved) return resolved;
      }
    } catch (e) {
      // ignore
    }
    // fallback: string location
    if (payload.location && typeof payload.location === "string") {
      const m = payload.location.split(",").map((s: string) => s.trim());

      if (m.length === 2 && !isNaN(Number(m[0])) && !isNaN(Number(m[1])))
        return { lat: Number(m[0]), lng: Number(m[1]) };
    }

    return null;
  })();

  // The company's zone travels with the share: an anonymous viewer has no
  // session to read it from, and the times came in the viewer's own zone.
  const zona = (payload && payload.timezone) || zonaDeLaEmpresa();

  if (!payload)
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <EmptyState
          className="bg-card max-w-sm"
          description={t("ui.DispatchPublicView.esteEnlaceNoExisteO")}
          icon={<ShieldAlert />}
          title={t("ui.DispatchPublicView.noDisponible", "No disponible")}
        />
      </div>
    );

  // prepare guard rows for display
  const guardRows: React.JSX.Element[] = [];

  if (payload) {
    if (payload.guardName) {
      guardRows.push(
        <tr key="guard-main" className="border-t">
          <td className="py-2 px-3">
            {payload.guardName.fullName || payload.guardName.name || "-"}
          </td>
          <td className="py-2 px-3">-</td>
          <td className="py-2 px-3">
            {payload.dateTime
              ? new Date(payload.dateTime).toLocaleString(localeActual(), { timeZone: zona })
              : payload.createdAt
                ? new Date(payload.createdAt).toLocaleString(localeActual(), { timeZone: zona })
                : "-"}
          </td>
        </tr>,
      );
    } else if (
      (payload.guards && payload.guards.length > 0) ||
      (payload.assignedGuards && payload.assignedGuards.length > 0)
    ) {
      const list = payload.guards || payload.assignedGuards;

      list.forEach((g: any, i: number) => {
        guardRows.push(
          <tr key={i} className="border-t">
            <td className="py-2 px-3">
              {(g && (g.name || g.fullName)) || g || "-"}
            </td>
            <td className="py-2 px-3">
              {(g && (g.status || g.guardStatus)) || "-"}
            </td>
            <td className="py-2 px-3">
              {g && (g.dateTime || g.assignedAt)
                ? new Date(g.dateTime || g.assignedAt).toLocaleString(
                    localeActual(), { timeZone: zona })
                : "-"}
            </td>
          </tr>,
        );
      });
    }
  }

  const ticketShort = (() => {
    const full = (payload && (payload.ticketId || payload.id)) || "";

    if (!full) return "";
    const idx = full.indexOf("-");

    return idx > 0 ? full.slice(0, idx) : full;
  })();

  const incidentTypeDisplay = (() => {
    if (!payload) return "-";
    if (payload.incidentType && typeof payload.incidentType === "object")
      return payload.incidentType.name || "-";
    const idString =
      (typeof payload.incidentType === "string" && payload.incidentType) ||
      payload.incidentTypeId ||
      null;

    if (idString) {
      const found = incidentTypes.find((t) => t.id === idString);

      if (found) return found.name || idString;

      return idString;
    }

    return "-";
  })();

  return (
    <div
      className="p-4 sm:p-6 bg-muted/30 min-h-screen"
      style={{ fontFamily: "Inter, Arial, sans-serif" }}
    >
      {/* En un móvil de 375 px, 24 px de margen a cada lado se comen el 13 % del
          ancho útil justo donde hay una tabla que ya va justa: de ahí el p-4. */}
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Logo + Map header */}
        <div className="flex flex-col items-center mb-2">
          {/* El bloque es casi 6:1. Con sólo la ALTURA fijada (h-32) el navegador
              calculaba 741 px de ancho: en un móvil eso no es un logo grande, es
              la página entera desplazándose de lado. Se manda el ANCHO y la
              altura se deduce. */}
          {/* The sheet is the company's: its name heads it. The platform
              lockup («Seguridad Inteligente») only when the share has none. */}
          {payload.company?.name ? (
            <h1 className="mb-4 text-center text-2xl font-bold text-foreground">
              {payload.company.name}
            </h1>
          ) : (
            <BrandLockup className="mb-4 w-full max-w-[260px] sm:max-w-md" />
          )}
          {coords && (
            <div className="w-full overflow-hidden rounded-2xl border shadow-sm">
              <IncidentMap
                label={payload?.ticketId || payload?.id}
                lat={coords.lat}
                lng={coords.lng}
              />
            </div>
          )}
        </div>

        {/* `overflow-hidden` RECORTABA: son cuatro columnas de etiqueta+valor y
            en un móvil no caben, así que la fecha y el nombre del puesto
            desaparecían por el borde derecho sin forma de llegar a ellos. Con
            desplazamiento horizontal —y un ancho mínimo para que las celdas no
            se estrujen a una letra por línea— la tabla se lee entera y el
            desplazamiento se queda DENTRO de la tarjeta, sin arrastrar la
            página. */}
        <Section
          contentClassName="overflow-x-auto rounded-xl border"
          icon={<FileText />}
          title={t("ui.DispatchPublicView.datosDelDespacho")}
        >
          <div className="text-sm">
            <table className="w-full min-w-[640px] text-sm border-collapse">
              <tbody>
                <tr className="border-b">
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("ui.DispatchPublicView.nDeTicket", "N.º de ticket")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {ticketShort}{" "}
                    <StatusBadge
                      className="ml-2"
                      tone={
                        payload.status === "open" ||
                        payload.status === "abierto"
                          ? "red"
                          : "green"
                      }
                    >
                      {payload.status === "open" || payload.status === "abierto"
                        ? t("dispatcher.status_open", "Abierto")
                        : payload.status === "closed" ||
                            payload.status === "cerrado"
                          ? t("dispatcher.status_closed", "Cerrado")
                          : (payload.status ?? "")}
                    </StatusBadge>
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("dispatcher.date_time", "Fecha/Hora")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {payload.createdAt
                      ? new Date(payload.createdAt).toLocaleString(
                          localeActual(), { timeZone: zona })
                      : "-"}
                  </td>
                </tr>

                <tr className="border-b">
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("clients.overview.generalInfo.clientName", "Nombre del cliente")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {/* The share sends client and site as plain names. */}
                    {(typeof payload.client === "string" && payload.client) ||
                      clientDisplayName(payload.client, "") ||
                      clientDisplayName(
                        clients.find((c) => c.id === payload.clientId),
                        "",
                      ) ||
                      "-"}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("dispatcher.post_site_label", "Sede")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {(typeof payload.site === "string" && payload.site) ||
                      (payload.site &&
                      (payload.site.name || payload.site.companyName)) ||
                      postSites.find((s) => s.id === payload.siteId)?.name ||
                      "-"}
                  </td>
                </tr>

                <tr className="border-b">
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("ui.DispatchPublicView.tipoDeLlamador", "Tipo de llamador")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {callerTypeLabel(payload.callerType) || "-"}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("ui.DispatchPublicView.nombreDelLlamador", "Nombre del llamador")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {payload.callerName || "-"}
                  </td>
                </tr>

                <tr className="border-b">
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("dispatcher.incident_type_label", "Tipo de incidente")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {incidentTypeDisplay}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("dispatcher.incident_datetime", "Fecha y hora del incidente")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {payload.incidentAt || payload.dateTime
                      ? new Date(
                          payload.incidentAt || payload.dateTime,
                        ).toLocaleString(localeActual(), { timeZone: zona })
                      : "-"}
                  </td>
                </tr>

                <tr className="border-b">
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("ui.DispatchPublicView.ubicacionDelIncidente")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {payload.location || payload.incidentLocation || "-"}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                    {t("dispatcher.dispatcher_label", "Despachador")}
                  </td>
                  <td className="py-3 px-4 text-sm text-foreground">
                    {(typeof payload.guardName === "string"
                      ? payload.guardName
                      : payload.guardName?.fullName ||
                        payload.guardName?.name) || "-"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <div className="space-y-4">
          <Section icon={<FileText />} title={t("comun.detallesDelIncidente", "Detalles del incidente")}>
            <div className="text-sm text-foreground">
              {payload?.content ||
                payload?.incidentDetails ||
                payload?.details ||
                "-"}
            </div>
          </Section>

          <Section icon={<FileText />} title={t("ui.PanicAlertOverlay.accionTomada", "Acción tomada")}>
            <div className="text-sm text-foreground">
              {payload?.actionsTaken ||
                payload?.actionTaken ||
                payload?.action ||
                "-"}
            </div>
          </Section>

          {/* Internal notes never go out on a public link (the API no longer sends them). */}
          <Section icon={<FileText />} title={t("dispatcher.files", "Archivos")}>
            <div className="text-sm">
              <DispatchFiles payload={payload} />
              {typeof window !== "undefined" &&
                new URLSearchParams(window.location.search).has(
                  "debugPayload",
                ) &&
                payload && (
                  <div className="bg-muted/30 border rounded-md p-4 text-xs whitespace-pre-wrap overflow-auto mt-3">
                    <pre className="text-xs">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  </div>
                )}
            </div>
          </Section>

          <Section
            icon={<ShieldAlert />}
            title={t("ui.DispatchPublicView.vigilanteAsignado")}
          >
            <div className="text-sm">
              <div className="overflow-x-auto rounded-xl border">
                {/* `table-fixed w-full` repartía el ancho a partes iguales pase
                    lo que pase, así que el contenedor que se desplaza nunca
                    tenía nada que desplazar: en un móvil la columna de fecha
                    quedaba en 100 px y la hora caía en cuatro líneas. Con un
                    ancho mínimo, cuando no cabe se desliza. */}
                <table className="w-full min-w-[460px] text-sm table-fixed border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-left">
                      <th className="py-2 px-3 text-xs font-medium text-muted-foreground">
                        {t("dispatcher.guard", "Vigilante")}
                      </th>
                      <th className="py-2 px-3 text-xs font-medium text-muted-foreground">
                        {t("comun.estado")}
                      </th>
                      <th className="py-2 px-3 text-xs font-medium text-muted-foreground">
                        {t("dispatcher.date_time", "Fecha/Hora")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardRows.length > 0 ? (
                      guardRows
                    ) : (
                      <tr>
                        <td className="py-2 px-3" colSpan={3}>
                          -
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        </div>

        <div className="mt-6 max-w-4xl mx-auto">
          <Section icon={<FileText />} title={t("dispatcher.ticket_summary", "Resumen del ticket")}>
            <div>
              {payload?.comments && payload.comments.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  {t(
                    "ui.DispatchPublicView.noHayComentariosAun",
                    "No hay comentarios aún",
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {payload.comments &&
                    payload.comments.map((c: any) => (
                      <div
                        key={c.id || c.createdAt}
                        className="flex items-start gap-3"
                      >
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-foreground">
                          {c.author &&
                          (c.author.name ||
                            c.author.fullName ||
                            c.author.username)
                            ? String(
                                c.author.name ||
                                  c.author.fullName ||
                                  c.author.username,
                              )
                                .charAt(0)
                                .toUpperCase()
                            : "U"}
                        </div>
                        {/* `min-w-0`: un hijo flexible no baja de su contenido
                          mínimo, así que un adjunto con URL larga empujaba el
                          comentario fuera de la tarjeta en vez de partirse. */}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-foreground/70">
                            {(c.author &&
                              (c.author.name ||
                                c.author.fullName ||
                                c.author.username)) ||
                              t("comun.usuario", "Usuario")}{" "}
                            ·{" "}
                            {c.createdAt
                              ? new Date(c.createdAt).toLocaleString(
                                  localeActual(), { timeZone: zona })
                              : ""}
                          </div>
                          <div className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                            {c.text || c.body || c.message}
                          </div>
                          {c.attachment &&
                            c.attachment.url &&
                            safeHttpUrl(c.attachment.url) && (
                              <div className="mt-2">
                                <a
                                  className="break-all text-xs text-blue-600 underline"
                                  href={safeHttpUrl(c.attachment.url) as string}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {t("ui.DispatchPublicView.adjunto", {
                                    defaultValue: "Adjunto: {{nombre}}",
                                    nombre: c.attachment.name || c.attachment.url,
                                  })}
                                </a>
                              </div>
                            )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

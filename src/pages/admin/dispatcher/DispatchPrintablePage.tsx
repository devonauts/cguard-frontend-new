import React, { useEffect, useState } from "react";
import { clientDisplayName } from "@/lib/clientName";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { clientService } from "@/lib/api/clientService";
import { postSiteService } from "@/lib/api/postSiteService";
import IncidentTypesService from "@/services/incident-types.service";
import IncidentMap from "@/components/IncidentMap/IncidentMap";
// El acta impresa se queda con el mapa PLANO a propósito (nadie despacha desde
// un papel); lo que se comparte es la sonda de coordenadas.
import { coordDeSitio } from "./DispatchIncidentMap";
import DispatchFiles from "./DispatchFiles";
import { callerTypeLabel, personName } from "./dispatchLabels";
import { uploadCommentAttachment, uploadErrorText } from "./commentAttachment";
import { toast } from "sonner";
import {
  PageContainer,
  PageHeader,
  Modal,
  StatusBadge,
  Avatar,
} from "@/components/kit";
import { ArrowLeft, Printer, MessageSquarePlus } from "lucide-react";
import type {
  DirectoryOption,
  NamedEntity,
  DispatchComment,
  CommentAttachment,
} from "./types";
import i18n from "@/i18n";
import { localeActual } from "@/lib/localeActual";
import { diaDeLaEmpresa, zonaDeLaEmpresa} from "@/lib/horaDeLaEmpresa";

export function DispatchDetailsContent({
  requestId,
}: {
  requestId?: string | null;
}) {
  const { t } = useTranslation();
  const [clients, setClients] = useState<DirectoryOption[]>([]);
  const [postSites, setPostSites] = useState<DirectoryOption[]>([]);
  const [incidentTypes, setIncidentTypes] = useState<NamedEntity[]>([]);
  const [clientId, setClientId] = useState<string | undefined>(undefined);
  const [siteId, setSiteId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string>("abierto");
  const [createdDate, setCreatedDate] = useState<string | undefined>(undefined);
  const [incidentDate, setIncidentDate] = useState<string | undefined>(
    undefined,
  );
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [requestPayload, setRequestPayload] = useState<any | null>(null);
  const [comments, setComments] = useState<DispatchComment[]>([]);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUploading, setFileUploading] = useState(false);

  // Handler extracted to avoid large inline JSX function
  const handleAddComment = async () => {
    if (!newComment || newComment.trim() === "") {
      toast.error(
        t("dispatcher.comment.write_error") || "Escribe un comentario",
      );
      return;
    }
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        toast.error(
          t("dispatcher.tenant_unavailable") || "Tenant no disponible",
        );
        return;
      }
      setCommentsLoading(true);
      const api = (await import("@/lib/api")).default;

      let attachment: CommentAttachment | null = null;

      if (selectedFile) {
        try {
          setFileUploading(true);
          attachment = await uploadCommentAttachment(tenantId, selectedFile);
        } catch (err) {
          // Not sent: the comment keeps its text and its file, so the person
          // can retry. It used to go out without the file, with «Comentario
          // agregado» and the error toast at the same time.
          const msg = uploadErrorText(err);

          toast.error(
            `${t("dispatcher.comment.file_upload_failed_not_sent", "No se pudo subir el archivo; el comentario no se envió.")}${msg ? ` ${msg}` : ""}`,
          );

          return;
        } finally {
          setFileUploading(false);
        }
      }

      let author: { id?: string; name?: string } | null = null;
      try {
        const possibleKeys = [
          "currentUser",
          "user",
          "me",
          "profile",
          "authUser",
        ];
        for (const k of possibleKeys) {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            if (
              obj &&
              (obj.id ||
                obj._id ||
                obj.name ||
                obj.fullName ||
                obj.username ||
                obj.email)
            ) {
              author = {
                id: obj.id || obj._id || obj.userId || undefined,
                name:
                  obj.name ||
                  obj.fullName ||
                  obj.username ||
                  obj.email ||
                  undefined,
              };
              break;
            }
          } catch (e) {
            if (raw && raw.length > 0) {
              author = { id: undefined, name: raw };
              break;
            }
          }
        }
        if (!author) {
          const uid =
            localStorage.getItem("userId") || localStorage.getItem("uid");
          const uname =
            localStorage.getItem("userName") ||
            localStorage.getItem("username") ||
            localStorage.getItem("name");
          if (uid || uname)
            author = { id: uid || undefined, name: uname || undefined };
        }
      } catch (err) {
        // ignore
      }

      const body: {
        data: {
          text: string;
          attachment?: CommentAttachment;
          author?: { id?: string; name?: string };
        };
      } = { data: { text: newComment } };
      if (attachment) body.data.attachment = attachment;
      if (author) body.data.author = author;
      try {
        const resp = await api.post(
          `/tenant/${tenantId}/request/${requestId}/comments`,
          body,
        );
        const p = resp && resp.data ? resp.data : resp;
        const created = (p && (p.comment || p.data || p)) || {
          text: newComment,
        };
        setComments((c) => [
          ...c,
          {
            id: Date.now(),
            text: created.text || newComment,
            createdAt: created.createdAt || new Date().toISOString(),
            author: created.author ||
              author || { name: t("dispatcher.you") || "Tú" },
            attachment: created.attachment || attachment,
          },
        ]);
        setNewComment("");
        setSelectedFile(null);
        setShowCommentModal(false);
        toast.success(t("dispatcher.comment.added") || "Comentario agregado");
      } catch (e) {
        setComments((c) => [
          ...c,
          {
            id: Date.now(),
            text: newComment,
            createdAt: new Date().toISOString(),
            author:
              typeof author !== "undefined" && author
                ? author
                : { name: t("dispatcher.you") || "Tú" },
            attachment,
          },
        ]);
        setNewComment("");
        setSelectedFile(null);
        setShowCommentModal(false);
        toast.success(
          t("dispatcher.comment.added_local") || "Comentario agregado (local)",
        );
      }
    } catch (err) {
      console.error("Error agregando comentario", err);
      toast.error(
        t("dispatcher.comment.add_failed") || "No se pudo agregar comentario",
      );
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [clientsResp, sitesResp] = await Promise.all([
          clientService.getClients(undefined, { limit: 1000, offset: 0 }),
          postSiteService.list({}, { limit: 1000, offset: 0 }),
        ]);

        const clientRows = (clientsResp as { rows?: DirectoryOption[] })?.rows;
        const siteRows = (sitesResp as { rows?: DirectoryOption[] })?.rows;
        if (clientsResp && Array.isArray(clientRows)) {
          setClients(clientRows);
        }
        if (sitesResp && Array.isArray(siteRows)) {
          setPostSites(siteRows);
        }
        try {
          const itResp = (await IncidentTypesService.list("", 1, 1000)) as {
            rows?: NamedEntity[];
          };
          if (itResp && Array.isArray(itResp.rows))
            setIncidentTypes(itResp.rows);
        } catch (e) {
          // ignore
        }
      } catch (e) {
        // ignore failures for demo
      }
    };

    load();
  }, []);

  useEffect(() => {
    const loadDetails = async () => {
      if (!requestId) return;
      try {
        const tenantId = localStorage.getItem("tenantId");
        if (!tenantId) return;
        const api = (await import("@/lib/api")).default;
        const resp = await api.get(`/tenant/${tenantId}/request/${requestId}`);
        const payload = resp && resp.data ? resp.data : resp;
        if (!payload) return;
        // debug log to inspect payload shape
        // eslint-disable-next-line no-console
        console.log("DispatchDetails payload:", payload);
        setRequestPayload(payload);
        setClientId(
          payload.clientId ||
            (payload.client && payload.client.id) ||
            undefined,
        );
        setSiteId(
          payload.siteId || (payload.site && payload.site.id) || undefined,
        );
        setStatus(payload.status || "todo");
        if (payload.createdAt)
          setCreatedDate(
            diaDeLaEmpresa(payload.createdAt),
          );
        if (payload.dateTime)
          setIncidentDate(
            diaDeLaEmpresa(payload.dateTime),
          );
        // initialize comments: prefer payload.comments if present
        if (payload.comments && Array.isArray(payload.comments)) {
          setComments(payload.comments);
        } else {
          // No comments provided by payload — start empty to avoid backend fallback requests
          setComments([]);
        }
      } catch (e) {
        console.warn("No se pudieron cargar detalles del Incidente", e);
      }
    };

    loadDetails();
  }, [requestId]);

  // prepare guard rows to avoid complex nested JSX/ternary
  const guardRows: React.JSX.Element[] = [];
  if (requestPayload) {
    // «Despachar a supervisor» assigns the incident to that supervisor; the
    // card only knew the guard, so the dispatch never showed here.
    if (requestPayload.assignedTo && personName(requestPayload.assignedTo)) {
      guardRows.push(
        <tr key="supervisor-dispatch" className="border-t">
          <td className="py-2 px-3">
            {personName(requestPayload.assignedTo)} ·{" "}
            {t("adminOfficeUsers.roleNames.supervisor", "Supervisor")}
          </td>
          <td className="py-2 px-3">
            {requestPayload.dispatchedAt
              ? new Date(requestPayload.dispatchedAt).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })
              : "-"}
          </td>
        </tr>,
      );
    }
    if (requestPayload.guardName) {
      guardRows.push(
        <tr key="guard-main" className="border-t">
          <td className="py-2 px-3">
            {requestPayload.guardName.fullName ||
              requestPayload.guardName.name ||
              "-"}
          </td>
          <td className="py-2 px-3">-</td>
          <td className="py-2 px-3">
            {requestPayload.dateTime
              ? new Date(requestPayload.dateTime).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })
              : requestPayload.createdAt
                ? new Date(requestPayload.createdAt).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })
                : "-"}
          </td>
        </tr>,
      );
    } else if (
      (requestPayload.guards && requestPayload.guards.length > 0) ||
      (requestPayload.assignedGuards &&
        requestPayload.assignedGuards.length > 0)
    ) {
      const list = requestPayload.guards || requestPayload.assignedGuards;
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
                ? new Date(g.dateTime || g.assignedAt).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })
                : "-"}
            </td>
          </tr>,
        );
      });
    }
  }

  // computed display values
  const ticketShort = (() => {
    const full =
      (requestPayload && (requestPayload.ticketId || requestPayload.id)) || "";
    if (!full) return "";
    const idx = full.indexOf("-");
    return idx > 0 ? full.slice(0, idx) : full;
  })();

  const coords = (() => {
    if (!requestPayload) return null;
    // common patterns: latitude/longitude, lat/lng, locationLat/locationLng, geo: { lat, lng }
    const maybe = (k: string) =>
      requestPayload[k] !== undefined ? requestPayload[k] : null;
    const lat =
      maybe("latitude") ||
      maybe("lat") ||
      maybe("locationLat") ||
      (requestPayload.geo && requestPayload.geo.lat) ||
      null;
    const lng =
      maybe("longitude") ||
      maybe("lng") ||
      maybe("locationLng") ||
      (requestPayload.geo && requestPayload.geo.lng) ||
      null;
    if (lat && lng) return { lat: Number(lat), lng: Number(lng) };
    // Prefer client coordinates when available (better location accuracy)
    try {
      const clientId = requestPayload.clientId || requestPayload.client?.id;
      if (clientId && clients && clients.length > 0) {
        const client = clients.find(
          (c) =>
            c.id === clientId ||
            c._id === clientId ||
            c.id === String(clientId),
        );
        if (client) {
          const cLat =
            client.latitude || client.lat || client.coords?.lat || null;
          const cLng =
            client.longitude || client.lng || client.coords?.lng || null;
          if (cLat && cLng) return { lat: Number(cLat), lng: Number(cLng) };
        }
      }
    } catch (e) {
      // ignore
    }
    // also handle array forms like locationCoords: [lat, lng]
    if (
      Array.isArray(requestPayload.locationCoords) &&
      requestPayload.locationCoords.length >= 2
    ) {
      const [a, b] = requestPayload.locationCoords;
      if (!isNaN(Number(a)) && !isNaN(Number(b)))
        return { lat: Number(a), lng: Number(b) };
    }
    // fallback: if `location` is a string like "12.34,56.78"
    if (
      requestPayload.location &&
      typeof requestPayload.location === "string"
    ) {
      const m = requestPayload.location.split(",").map((s: string) => s.trim());
      if (m.length === 2 && !isNaN(Number(m[0])) && !isNaN(Number(m[1])))
        return { lat: Number(m[0]), lng: Number(m[1]) };
    }
    // fallback: try to find coordinates from related postSite
    //
    // Misma sonda que en la ficha, y por la misma razón: `postSiteService.list`
    // devuelve `latitud`/`longitud` en español, así que mirar sólo `latitude`
    // dejaba el acta impresa sin mapa.
    try {
      const siteId =
        requestPayload.siteId ||
        requestPayload.postSiteId ||
        requestPayload.site?.id;
      if (siteId && postSites && postSites.length > 0) {
        const site = postSites.find(
          (s) => s.id === siteId || s._id === siteId || s.id === String(siteId),
        );
        const c = coordDeSitio(site);
        if (c) return c;
      }
    } catch (e) {
      // ignore
    }
    // fallback: try client coordinates
    try {
      const clientId = requestPayload.clientId || requestPayload.client?.id;
      if (clientId && clients && clients.length > 0) {
        const client = clients.find(
          (c) =>
            c.id === clientId ||
            c._id === clientId ||
            c.id === String(clientId),
        );
        if (client) {
          const cLat =
            client.latitude || client.lat || client.coords?.lat || null;
          const cLng =
            client.longitude || client.lng || client.coords?.lng || null;
          if (cLat && cLng) return { lat: Number(cLat), lng: Number(cLng) };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  })();

  const incidentTypeDisplay = (() => {
    if (!requestPayload) return "-";
    // If incidentType is an object with a name
    if (
      requestPayload.incidentType &&
      typeof requestPayload.incidentType === "object"
    )
      return requestPayload.incidentType.name || "-";
    // Try to resolve by id using loaded incident types
    const idString =
      (typeof requestPayload.incidentType === "string" &&
        requestPayload.incidentType) ||
      requestPayload.incidentTypeId ||
      null;
    if (idString) {
      const found = incidentTypes.find((t) => t.id === idString);
      if (found) return found.name || idString;
      return idString; // fallback to id if name not found
    }
    return "-";
  })();

  return (
    <div className="mt-6 space-y-5">
      {/* Basic Details card */}
      {requestPayload && (
        <div>
          {/* Map (if coordinates found) */}
          {coords && (
            <div className="mb-4">
              <IncidentMap
                lat={coords.lat}
                lng={coords.lng}
                label={ticketShort || undefined}
              />
            </div>
          )}
          <div className="bg-card border rounded-md overflow-hidden">
            <div className="bg-muted px-4 py-2 text-sm font-semibold flex items-center justify-between">
              <div>{t("dispatcher.basic_details") || "Basic Details"}</div>
              <div className="flex items-center gap-2 print:hidden">
                <Button variant="brand" size="sm" asChild>
                  <Link to={`/dispatch-tickets/${requestId}/edit`}>
                    {t("dispatcher.edit") || "Editar"}
                  </Link>
                </Button>
              </div>
            </div>
            <div className="p-0 text-sm">
              <table className="w-full text-sm border-collapse">
                <tbody>
                  <tr className="border-b">
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.ticket_id") || "Ticket ID"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {ticketShort}{" "}
                      <StatusBadge
                        /* Abierto = pendiente, no fallo — igual que en la lista
                           y en el detalle. */
                        tone={
                          requestPayload.status === "open" ||
                          requestPayload.status === "abierto"
                            ? "warn"
                            : "ok"
                        }
                        className="ml-2"
                      >
                        {(() => {
                          // Raw API status: translate only the known values for display.
                          const st = String(requestPayload.status ?? "").toLowerCase();

                          if (st === "abierto" || st === "open")
                            return t("dispatcher.status_open", "Abierto");
                          if (st === "cerrado" || st === "closed")
                            return t("dispatcher.status_closed", "Cerrado");

                          return requestPayload.status ?? "";
                        })()}
                      </StatusBadge>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.date_time") || "Date/Time"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {requestPayload.createdAt
                        ? new Date(requestPayload.createdAt).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })
                        : "-"}
                    </td>
                  </tr>

                  <tr className="border-b">
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.client_name") || "Client Name"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {clientDisplayName(requestPayload.client, "") ||
                        clientDisplayName(
                          clients.find((c) => c.id === requestPayload.clientId),
                          "",
                        ) ||
                        "-"}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.post_site_label") || "Post Site"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {(requestPayload.site &&
                        (requestPayload.site.name ||
                          requestPayload.site.companyName)) ||
                        postSites.find((s) => s.id === requestPayload.siteId)
                          ?.name ||
                        "-"}
                    </td>
                  </tr>

                  <tr className="border-b">
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.caller_type") || "Caller Type"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {callerTypeLabel(requestPayload.callerType) || "-"}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.caller_name") || "Caller Name"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {requestPayload.callerName || "-"}
                    </td>
                  </tr>

                  <tr className="border-b">
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.incident_type_label") || "Incident Type"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {incidentTypeDisplay}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.incident_date_time_label") ||
                        "Incident Date/Time"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {requestPayload.incidentAt || requestPayload.dateTime
                        ? new Date(
                            requestPayload.incidentAt ||
                              requestPayload.dateTime,
                          ).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })
                        : "-"}
                    </td>
                  </tr>

                  <tr className="border-b">
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.incident_location") || "Incident Location"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {requestPayload.location ||
                        requestPayload.incidentLocation ||
                        "-"}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.dispatcher_label") || "Dispatcher"}
                    </td>
                    <td className="py-3 px-4 text-sm text-foreground">
                      {/* Who filed the dispatch (this cell showed the guard). */}
                      {personName(requestPayload.createdBy) || "-"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Comment input box (toggle) */}
      {/* Comment modal (opens on Add) */}
      <Modal
        open={showCommentModal}
        onOpenChange={(o) => {
          if (!o) {
            setShowCommentModal(false);
            setNewComment("");
          }
        }}
        title={t("dispatcher.comment.new_comment_title") || "Nuevo comentario"}
        icon={<MessageSquarePlus className="h-5 w-5" />}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setNewComment("");
                setSelectedFile(null);
                setShowCommentModal(false);
              }}
            >
              {t("dispatcher.cancel") || "Cancelar"}
            </Button>
            <Button onClick={handleAddComment}>
              {t("dispatcher.comment.add") || "Agregar"}
            </Button>
          </>
        }
      >
        <label className="text-sm font-medium">
          {t("dispatcher.comment.note") || "Nota"}
        </label>
        <textarea
          className="w-full border rounded p-2 text-sm mt-2"
          rows={6}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
        />
        <div className="mt-3">
          <div className="border rounded px-3 py-2 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2">
              {t("dispatcher.comment.attach_file_optional") ||
                "Adjuntar archivo (opcional)"}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="file"
                className="flex-1"
                onChange={(e) => {
                  setSelectedFile(
                    e.target.files && e.target.files[0]
                      ? e.target.files[0]
                      : null,
                  );
                }}
              />
              {selectedFile ? (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedFile(null)}
                  aria-label={
                    t("dispatcher.comment.remove_file") || "Eliminar archivo"
                  }
                >
                  {t("dispatcher.comment.remove_file") || "Eliminar"}
                </button>
              ) : null}
            </div>
            <div className="text-xs text-foreground mt-2 truncate">
              {selectedFile
                ? selectedFile.name
                : t(
                    "dispatcher.comment.no_files_selected",
                    "Sin archivos seleccionados",
                  )}
            </div>
          </div>
        </div>
      </Modal>
      {/* Additional detail sections */}
      <div className="mt-4 space-y-4">
        <div className="bg-card border rounded-md overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-semibold">
            {t("dispatcher.incident_details") || "Incident Details"}
          </div>
          <div className="p-4 text-sm">
            {requestPayload?.content ||
              requestPayload?.incidentDetails ||
              requestPayload?.details ||
              "-"}
          </div>
        </div>

        <div className="bg-card border rounded-md overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-semibold">
            {t("dispatcher.action_taken") || "Action Taken"}
          </div>
          <div className="p-4 text-sm">
            {requestPayload?.actionsTaken ||
              requestPayload?.actionTaken ||
              requestPayload?.action ||
              "-"}
          </div>
        </div>

        <div className="bg-card border rounded-md overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-semibold">
            {t("dispatcher.internal_notes") || "Internal Notes"}
          </div>
          <div className="p-4 text-sm whitespace-pre-wrap">
            {requestPayload?.internalNotes || requestPayload?.notes || "-"}
          </div>
        </div>

        <div className="bg-card border rounded-md overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-semibold">
            {t("dispatcher.files") || "Files"}
          </div>
          <div className="p-4 text-sm">
            <DispatchFiles payload={requestPayload} />
            {/* Debug: show raw payload when ?debugPayload=1 is present */}
            {typeof window !== "undefined" &&
              new URLSearchParams(window.location.search).has("debugPayload") &&
              requestPayload && (
                <div className="bg-muted/30 border rounded-md p-4 text-xs whitespace-pre-wrap overflow-auto mt-3">
                  <pre className="text-xs">
                    {JSON.stringify(requestPayload, null, 2)}
                  </pre>
                </div>
              )}
          </div>
        </div>

        <div className="bg-card border rounded-md overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-semibold">
            {t("dispatcher.guard_assigned") || "Guard Assigned"}
          </div>
          <div className="p-4 text-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed border-collapse">
                <thead>
                  <tr className="bg-muted/30 text-left">
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.guard", "Vigilante")}
                    </th>
                    <th className="py-2 px-3 text-xs font-medium text-muted-foreground">
                      {t("dispatcher.status", "Estado")}
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
        </div>
      </div>

      {/* Comments list (bottom) */}
      <div className="mt-6 max-w-4xl mx-auto">
        <div className="bg-card border rounded-md overflow-hidden">
          <div className="bg-muted px-4 py-2 text-sm font-semibold">
            {t("dispatcher.ticket_summary") || "Ticket Summary"}
          </div>
          <div className="p-4">
            {comments.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                {t("dispatcher.no_comments_yet") || "No hay comentarios aún"}
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((c) => (
                  <div
                    key={c.id || c.createdAt}
                    className="flex items-start gap-3"
                  >
                    <Avatar
                      name={
                        c.author?.name ||
                        c.author?.fullName ||
                        c.author?.username
                      }
                      size="sm"
                      tone="neutral"
                    />
                    <div className="flex-1">
                      <div className="text-xs text-foreground/70">
                        {(c.author &&
                          (c.author.name ||
                            c.author.fullName ||
                            c.author.username)) ||
                          t("comun.usuario", "Usuario")}{" "}
                        ·{" "}
                        {c.createdAt
                          ? new Date(c.createdAt).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() })
                          : ""}
                      </div>
                      <div className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                        {c.text || c.body || c.message}
                      </div>
                      {c.attachment && c.attachment.url && (
                        <div className="mt-2">
                          <a
                            className="text-xs underline"
                            style={{ color: "var(--brand-text)" }}
                            href={c.attachment.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {t("ui.DispatchDetailsPage.adjunto", {
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
        </div>
      </div>
      <Button
        variant="brand"
        className="text-sm print:hidden"
        onClick={() => setShowCommentModal((s) => !s)}
      >
        {showCommentModal
          ? t("dispatcher.close") || "Cerrar"
          : t("dispatcher.add_comment_button") || "Agregar comentario"}
      </Button>
    </div>
  );
}

export default function DispatchDetailsPage() {
  const { id } = useParams();

  // No CRM chrome here (App.tsx renders this route bare): the sheet is what
  // goes on paper. Only the toolbar is screen-only.
  return (
    <PageContainer width="wide" className="pt-4">
      <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
        <Button asChild size="sm" variant="outline">
          <Link to={`/dispatch-tickets/${id ?? ""}`}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {i18n.t("comun.detalleDelIncidente")}
          </Link>
        </Button>
        <Button size="sm" variant="brand" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />
          {i18n.t("dispatcher.print")}
        </Button>
      </div>
      <PageHeader
        icon={<Printer />}
        title={i18n.t("comun.detalleDelIncidente")}
        subtitle={i18n.t(
          "ui.DispatchPrintablePage.vistaImprimibleDelIncidente",
        )}
      />
      <DispatchDetailsContent requestId={id ?? null} />
    </PageContainer>
  );
}

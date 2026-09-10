import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  MapPin,
  MapPinOff,
  HelpCircle,
  Camera,
  ImageOff,
  Route,
  User,
  Building2,
  Clock,
  Check,
  X,
  RotateCcw,
  Ruler,
  Compass,
  SkipForward,
} from "lucide-react";

import {
  Modal,
  Field,
  StatusBadge,
  SkeletonCards,
  EmptyState,
  SmartImage,
  InfoNote,
  FIELD_CLS_LG,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";
import StaticMapImage from "@/components/maps/StaticMapImage";
import { ApiService } from "@/services/api/apiService";
import { getTenantTimezone } from "@/utils/tenantLocation";
import { localeActual } from "@/lib/localeActual";
/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL DETALLE DE UN PUNTO DE RONDA — Y SU REVISIÓN
 *
 * El «Informe de Recorridos del Sitio» enseñaba siete columnas de texto y nada
 * más: hora, recorrido, punto, vigilante, estación, «válida / fuera de rango» y
 * los metros. Todo lo que de verdad PRUEBA que la ronda se hizo —la foto que
 * tomó el vigilante, lo que escribió, dónde estaba exactamente, a qué distancia
 * del punto de control, si la empresa exigía foto y la hubo— ya se guardaba
 * desde hacía meses, y no había una sola pantalla que lo mostrara.
 *
 * Aquí está todo junto, y con lo que faltaba del todo: que una persona pueda
 * mirar esa prueba y decir SÍ o NO. Rechazar no es un adorno — el punto deja de
 * contar como visitado y, si con eso la ronda baja de su total, la ronda deja de
 * estar completada. Es lo que convierte el informe en una revisión.
 *
 * Se usa desde el informe (pulsando una fila) y desde el historial de rondas de
 * un puesto (pulsando un punto). Mismo detalle en los dos sitios.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type VeredictoRevision = "pending" | "accepted" | "rejected";

interface DetalleEscaneo {
  id: string;
  scannedAt: string | null;
  photoUrl: string | null;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  accuracy: number | null;
  validLocation: boolean | null;
  distanceMeters: number | null;
  radiusM: number | null;
  compliance: {
    requirePhoto?: boolean;
    photoProvided?: boolean;
    requireNote?: boolean;
    noteProvided?: boolean;
    requireGeofence?: boolean;
    locationValid?: boolean | null;
    compliant?: boolean;
  } | null;
  skipped: boolean;
  checkpoint: {
    id: string;
    name: string;
    tagIdentifier?: string;
    instructions: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  tour: { id: string; name: string } | null;
  guard: { id: string; name: string } | null;
  station: { id: string; name: string; geofenceRadius: number | null } | null;
  assignment: {
    id: string;
    status: string;
    startAt: string | null;
    endAt: string | null;
  } | null;
  review: {
    status: VeredictoRevision;
    note: string | null;
    at: string | null;
    by: string | null;
  };
}

/** Fecha y hora EN LA ZONA DE LA EMPRESA — la misma regla que los informes. */
function fechaHora(v?: string | null): string {
  if (!v) return "—";
  try {
    const tz = getTenantTimezone();

    return new Date(v).toLocaleString(localeActual(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      ...(tz ? { timeZone: tz } : {}),
    });
  } catch {
    return String(v);
  }
}

/** Coordenada legible. Seis decimales ≈ 11 cm: no hace falta más. */
const coord = (n: number | null) => (n == null ? "—" : n.toFixed(6));

export function insigniaRevision(
  estado: VeredictoRevision | undefined,
  t: (k: string, d?: any) => string,
) {
  const e = estado || "pending";

  if (e === "accepted")
    return (
      <StatusBadge dot={false} tone="ok">
        <Check size={11} />{" "}
        {t("revision.aceptado", { defaultValue: "Aceptado" })}
      </StatusBadge>
    );
  if (e === "rejected")
    return (
      <StatusBadge dot={false} tone="bad">
        <X size={11} /> {t("revision.rechazado", { defaultValue: "Rechazado" })}
      </StatusBadge>
    );

  return (
    <StatusBadge dot={false} tone="neutral">
      {t("revision.pendiente", { defaultValue: "Sin revisar" })}
    </StatusBadge>
  );
}

export default function ScanDetailModal({
  open,
  onOpenChange,
  scanId,
  onRevisado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scanId: string | null;
  /** Se avisa al informe para que refresque la fila sin recargar la página. */
  onRevisado?: (scanId: string, estado: VeredictoRevision) => void;
}) {
  const { t } = useTranslation();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [d, setD] = useState<DetalleEscaneo | null>(null);
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState<VeredictoRevision | null>(null);
  const [ampliada, setAmpliada] = useState(false);

  useEffect(() => {
    if (!open || !scanId) return;
    let vivo = true;

    (async () => {
      setCargando(true);
      setError(null);
      setD(null);
      setNota("");
      setAmpliada(false);
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        const res: any = await ApiService.get(
          `/tenant/${tenantId}/site-tour/tag-scan/${encodeURIComponent(scanId)}`,
        );
        const data = res && (res.data !== undefined ? res.data : res);

        if (vivo) {
          setD(data as DetalleEscaneo);
          setNota((data?.review?.note as string) || "");
        }
      } catch (e: any) {
        if (vivo)
          setError(
            e?.message ||
              t("revision.noSePudoCargar", {
                defaultValue: "No se pudo cargar el detalle del punto.",
              }),
          );
      } finally {
        if (vivo) setCargando(false);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [open, scanId, t]);

  async function revisar(estado: VeredictoRevision) {
    if (!scanId) return;
    // Un rechazo sin motivo es una decisión que nadie podrá explicar dentro de
    // tres meses — y esta es la pantalla donde se juzga el trabajo de alguien.
    if (estado === "rejected" && !nota.trim()) {
      toast.error(
        t("revision.motivoObligatorio", {
          defaultValue: "Escribe el motivo del rechazo.",
        }),
      );

      return;
    }
    setGuardando(estado);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      const res: any = await ApiService.put(
        `/tenant/${tenantId}/site-tour/tag-scan/${encodeURIComponent(scanId)}/review`,
        { status: estado, note: nota.trim() || null },
      );
      const data = res && (res.data !== undefined ? res.data : res);

      // La respuesta no trae dirección (no hace falta volver a geocodificar):
      // se conserva la que ya se había resuelto.
      setD((prev) =>
        prev
          ? { ...prev, ...data, address: prev.address ?? data?.address ?? null }
          : data,
      );
      onRevisado?.(scanId, estado);
      toast.success(
        estado === "accepted"
          ? t("revision.puntoAceptado", { defaultValue: "Punto aceptado." })
          : estado === "rejected"
            ? t("revision.puntoRechazado", { defaultValue: "Punto rechazado." })
            : t("revision.revisionDeshecha", {
                defaultValue: "Revisión deshecha.",
              }),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("revision.noSePudoGuardar", {
            defaultValue: "No se pudo guardar la revisión.",
          }),
      );
    } finally {
      setGuardando(null);
    }
  }

  const hayCoords = d?.latitude != null && d?.longitude != null;
  const cpCoords =
    d?.checkpoint?.latitude != null && d?.checkpoint?.longitude != null;
  const estado = d?.review?.status || "pending";

  // Veredicto automático de ubicación: cumplida, fuera de rango, o sin verificar
  // — que NO es lo mismo. Un sótano sin señal no acusa a nadie.
  const insigniaUbicacion = () => {
    const suf =
      d?.distanceMeters != null ? ` · ${Math.round(d.distanceMeters)} m` : "";

    if (d?.validLocation === true)
      return (
        <StatusBadge dot={false} tone="ok">
          <MapPin size={11} />{" "}
          {t("revision.enUbicacion", { defaultValue: "En ubicación" })}
          {suf}
        </StatusBadge>
      );
    if (d?.validLocation === false)
      return (
        <StatusBadge dot={false} tone="bad">
          <MapPinOff size={11} />{" "}
          {t("revision.fueraDeRango", { defaultValue: "Fuera de rango" })}
          {suf}
        </StatusBadge>
      );

    return (
      <StatusBadge dot={false} tone="neutral">
        <HelpCircle size={11} />{" "}
        {t("revision.sinVerificar", { defaultValue: "Sin verificar" })}
      </StatusBadge>
    );
  };

  return (
    <>
      <Modal
        description={d?.tour?.name || undefined}
        footer={
          d ? (
            <div className="flex w-full flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div
                  className="flex items-center gap-2 text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {insigniaRevision(estado, t)}
                  {d.review.at && (
                    <span>
                      {d.review.by ? `${d.review.by} · ` : ""}
                      {fechaHora(d.review.at)}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {estado !== "pending" && (
                    <Button
                      disabled={!!guardando}
                      size="sm"
                      variant="ghost"
                      onClick={() => revisar("pending")}
                    >
                      <RotateCcw className="mr-1.5" size={14} />
                      {t("revision.deshacer", { defaultValue: "Deshacer" })}
                    </Button>
                  )}
                  <Button
                    disabled={!!guardando || estado === "rejected"}
                    size="sm"
                    style={{
                      color: "var(--bad-text)",
                      borderColor:
                        "color-mix(in oklab, var(--bad) 40%, transparent)",
                    }}
                    variant="outline"
                    onClick={() => revisar("rejected")}
                  >
                    <X className="mr-1.5" size={14} />
                    {t("revision.rechazar", { defaultValue: "Rechazar" })}
                  </Button>
                  <Button
                    disabled={!!guardando || estado === "accepted"}
                    size="sm"
                    onClick={() => revisar("accepted")}
                  >
                    <Check className="mr-1.5" size={14} />
                    {t("revision.aceptar", { defaultValue: "Aceptar" })}
                  </Button>
                </div>
              </div>
            </div>
          ) : undefined
        }
        icon={<Route />}
        open={open}
        size="lg"
        title={
          d?.checkpoint?.name ||
          t("revision.puntoDeRonda", { defaultValue: "Punto de ronda" })
        }
        onOpenChange={onOpenChange}
      >
        {cargando ? (
          <SkeletonCards count={4} />
        ) : error ? (
          <div className="text-sm" style={{ color: "var(--bad-text)" }}>
            {error}
          </div>
        ) : !d ? (
          <EmptyState
            icon={<Route />}
            title={t("revision.sinDatos", {
              defaultValue: "Sin datos del punto",
            })}
          />
        ) : (
          <div className="space-y-4">
            {/* Contexto */}
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              <span className="inline-flex items-center gap-1">
                <Clock size={12} />
                {fechaHora(d.scannedAt)}
              </span>
              <span className="inline-flex items-center gap-1">
                <User size={12} />
                {d.guard?.name || "—"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Building2 size={12} />
                {d.station?.name || "—"}
              </span>
              {insigniaUbicacion()}
              {d.skipped && (
                <StatusBadge dot={false} tone="warn">
                  <SkipForward size={11} />{" "}
                  {t("revision.omitido", { defaultValue: "Declarado omitido" })}
                </StatusBadge>
              )}
            </div>

            {d.checkpoint?.instructions && (
              <InfoNote
                title={t("revision.instrucciones", {
                  defaultValue: "Instrucciones del punto",
                })}
                tone="info"
              >
                {d.checkpoint.instructions}
              </InfoNote>
            )}

            {/* La observación del vigilante */}
            <div>
              <div className="cg-eyebrow mb-1">
                {t("revision.observacion", {
                  defaultValue: "Observación del vigilante",
                })}
              </div>
              {d.note ? (
                <p className="glass-sunken whitespace-pre-wrap px-3 py-2 text-sm">
                  {d.note}
                </p>
              ) : (
                <p className="text-sm" style={{ color: "var(--ink-faint)" }}>
                  {t("revision.sinObservacion", {
                    defaultValue: "No escribió ninguna observación.",
                  })}
                </p>
              )}
            </div>

            {/* La foto */}
            <div>
              <div className="cg-eyebrow mb-1">
                {t("revision.foto", { defaultValue: "Foto del punto" })}
              </div>
              {d.photoUrl ? (
                <button
                  className="cg-focus block w-full overflow-hidden rounded-lg border"
                  style={{
                    borderColor: "var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                  type="button"
                  onClick={() => setAmpliada(true)}
                >
                  <SmartImage
                    alt={t("revision.foto", { defaultValue: "Foto del punto" })}
                    className="max-h-72 w-full object-contain"
                    src={d.photoUrl}
                  />
                </button>
              ) : (
                <div
                  className="glass-sunken flex items-center gap-2 rounded-lg px-3 py-4 text-sm"
                  style={{ color: "var(--ink-faint)" }}
                >
                  <ImageOff size={16} />
                  {t("revision.sinFoto", {
                    defaultValue: "No adjuntó ninguna foto.",
                  })}
                </div>
              )}
            </div>

            {/* Dónde estaba */}
            <div>
              <div className="cg-eyebrow mb-1">
                {t("revision.ubicacion", { defaultValue: "Dónde se escaneó" })}
              </div>
              {hayCoords ? (
                <div className="space-y-2">
                  <StaticMapImage
                    alt={t("revision.ubicacion", {
                      defaultValue: "Dónde se escaneó",
                    })}
                    height="220px"
                    lat={d.latitude!}
                    lng={d.longitude!}
                    radiusMeters={
                      d.radiusM || d.station?.geofenceRadius || undefined
                    }
                    zoom={17}
                  >
                    <GoogleMapEmbed
                      geofenceRadius={
                        d.radiusM || d.station?.geofenceRadius || 100
                      }
                      height="220px"
                      lat={d.latitude!}
                      lng={d.longitude!}
                      markers={[
                        // Las dos chinchetas que hacen falta para juzgar: dónde
                        // estaba la persona y dónde debía estar. La distancia
                        // entre ambas es literalmente lo que se discute.
                        {
                          id: "scan",
                          lat: d.latitude!,
                          lng: d.longitude!,
                          label: t("revision.escaneo", {
                            defaultValue: "Escaneo",
                          }),
                        },
                        ...(cpCoords
                          ? [
                              {
                                id: "cp",
                                lat: d.checkpoint!.latitude!,
                                lng: d.checkpoint!.longitude!,
                                label: d.checkpoint!.name,
                                role: "muted",
                              },
                            ]
                          : []),
                      ]}
                      showGeofence={!!(d.radiusM || d.station?.geofenceRadius)}
                      zoom={17}
                    />
                  </StaticMapImage>
                  {d.address && <p className="text-sm">{d.address}</p>}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Field
                      numeric
                      label={
                        <span className="inline-flex items-center gap-1">
                          <Compass size={11} />
                          {t("revision.latitud", { defaultValue: "Latitud" })}
                        </span>
                      }
                      value={coord(d.latitude)}
                    />
                    <Field
                      numeric
                      label={t("revision.longitud", {
                        defaultValue: "Longitud",
                      })}
                      value={coord(d.longitude)}
                    />
                    <Field
                      numeric
                      label={
                        <span className="inline-flex items-center gap-1">
                          <Ruler size={11} />
                          {t("revision.distancia", {
                            defaultValue: "Distancia al punto",
                          })}
                        </span>
                      }
                      value={
                        d.distanceMeters != null
                          ? `${Math.round(d.distanceMeters)} m`
                          : "—"
                      }
                    />
                    <Field
                      numeric
                      label={t("revision.radio", {
                        defaultValue: "Radio permitido",
                      })}
                      value={
                        d.radiusM != null ? `${Math.round(d.radiusM)} m` : "—"
                      }
                    />
                  </div>
                </div>
              ) : (
                <InfoNote tone="warn">
                  {t("revision.sinCoordenadas", {
                    defaultValue:
                      "El teléfono no consiguió ubicación al marcar este punto. Sin coordenadas no se puede comprobar dónde estaba.",
                  })}
                </InfoNote>
              )}
            </div>

            {/* Requisitos configurados */}
            {d.compliance && (
              <div>
                <div className="cg-eyebrow mb-1">
                  {t("revision.requisitos", {
                    defaultValue: "Requisitos de la empresa",
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.compliance.requirePhoto && (
                    <StatusBadge
                      dot={false}
                      tone={d.compliance.photoProvided ? "ok" : "bad"}
                    >
                      <Camera size={11} />{" "}
                      {t("revision.reqFoto", { defaultValue: "Foto exigida" })}
                    </StatusBadge>
                  )}
                  {d.compliance.requireNote && (
                    <StatusBadge
                      dot={false}
                      tone={d.compliance.noteProvided ? "ok" : "bad"}
                    >
                      {t("revision.reqNota", {
                        defaultValue: "Observación exigida",
                      })}
                    </StatusBadge>
                  )}
                  {d.compliance.requireGeofence && (
                    <StatusBadge
                      dot={false}
                      tone={
                        d.compliance.locationValid === true
                          ? "ok"
                          : d.compliance.locationValid === false
                            ? "bad"
                            : "neutral"
                      }
                    >
                      {t("revision.reqGeocerca", {
                        defaultValue: "Geocerca exigida",
                      })}
                    </StatusBadge>
                  )}
                  {!d.compliance.requirePhoto &&
                    !d.compliance.requireNote &&
                    !d.compliance.requireGeofence && (
                      <span
                        className="text-sm"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {t("revision.sinRequisitos", {
                          defaultValue:
                            "Este puesto no exige foto, observación ni geocerca.",
                        })}
                      </span>
                    )}
                </div>
              </div>
            )}

            {/* El motivo */}
            <div>
              <label className="cg-eyebrow mb-1 block" htmlFor="nota-revision">
                {t("revision.notaRevision", {
                  defaultValue: "Motivo o comentario de la revisión",
                })}
              </label>
              <textarea
                className={FIELD_CLS_LG}
                id="nota-revision"
                maxLength={2000}
                placeholder={t("revision.notaPlaceholder", {
                  defaultValue:
                    "Obligatorio al rechazar. Ej.: la foto no corresponde al punto.",
                })}
                rows={2}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </div>

            {d.assignment && (
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t("revision.efectoRonda", {
                  defaultValue:
                    "Rechazar este punto hace que deje de contar como visitado; si la ronda queda por debajo de su total, deja de figurar como completada.",
                })}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Lupa de la foto */}
      {ampliada && d?.photoUrl && (
        <Modal
          open={ampliada}
          size="lg"
          title={d.checkpoint?.name || undefined}
          onOpenChange={setAmpliada}
        >
          <SmartImage
            alt={t("revision.foto", { defaultValue: "Foto del punto" })}
            className="max-h-[70vh] w-full object-contain"
            src={d.photoUrl}
          />
        </Modal>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Download,
  RefreshCw,
  KeyRound,
  Server,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import {
  DeviceStatusBadge,
  healthTone,
  type DeviceHealth,
} from "./deviceStatus";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  EmptyState,
  Stagger,
  GlassPanel,
  IconTile,
  StatusBadge,
  SkeletonCards,
} from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  videoService,
  type RelaySite,
  type RelayBundle,
} from "@/lib/api/videoService";

/**
 * Semánticos fijos: transmitir o no transmitir no depende del color de marca.
 * Escala común de equipos — un sitio caído deja sin vídeo a una sede entera y
 * se pinta igual de rojo que un grabador caído, no en tono neutro como antes.
 *
 * El texto guarda la CLAVE junto al español: el objeto se construye al importar
 * el módulo, antes de que i18next sepa el idioma, así que se traduce al pintar.
 */
const STATUS: Record<
  string,
  { health: DeviceHealth; label: string; labelKey: string }
> = {
  publishing: {
    health: "up",
    label: "Transmitiendo",
    labelKey: "video.relay.status.publishing",
  },
  offline: {
    health: "down",
    label: "Sin conexión",
    labelKey: "video.relay.status.offline",
  },
  unknown: {
    health: "unknown",
    label: "Sin activar",
    labelKey: "video.relay.status.unknown",
  },
};

export default function VideoRelaySites() {
  const { t } = useTranslation();
  const [sites, setSites] = useState<RelaySite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [bundle, setBundle] = useState<RelayBundle | null>(null);
  const [bundleSite, setBundleSite] = useState<RelaySite | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RelaySite | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    videoService
      .relaySites()
      .then(setSites)
      .catch((e) =>
        setError(
          (e as Error)?.message ||
            t(
              "ui.VideoRelaySites.noSePudieronCargarLosSitiosRelay",
              "No se pudieron cargar los sitios relay",
            ),
        ),
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async () => {
    if (!name.trim()) {
      toast.error(t("comun.elNombreEsObligatorio"));
      return;
    }
    setSaving(true);
    try {
      await videoService.createRelaySite({
        name: name.trim(),
        notes: notes.trim() || undefined,
      });
      toast.success(t("ui.VideoRelaySites.sitioRelayCreado", "Sitio relay creado"));
      setNewOpen(false);
      setName("");
      setNotes("");
      load();
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("video.relay.createSiteError", "No se pudo crear el sitio"),
      );
    } finally {
      setSaving(false);
    }
  };

  const openBundle = async (s: RelaySite) => {
    setBundleSite(s);
    setBundle(null);
    try {
      setBundle(await videoService.relayBundle(s.id));
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("video.relay.generateError", "No se pudo generar el relay"),
      );
      setBundleSite(null);
    }
  };

  const downloadCompose = () => {
    if (!bundle) return;
    const blob = new Blob([bundle.compose], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `docker-compose.${bundle.siteKey}.yml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const regenToken = async (s: RelaySite) => {
    try {
      await videoService.updateRelaySite(s.id, { regenToken: true });
      toast.success(t("ui.VideoRelaySites.tokenRegeneradoVuelveADescargar"));
      load();
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t(
            "video.relay.regenerateTokenError",
            "No se pudo regenerar el token",
          ),
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await videoService.deleteRelaySite(deleteTarget.id);
      toast.success(
        t("ui.VideoRelaySites.sitioRelayEliminado", "Sitio relay eliminado"),
      );
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("station.orders.deleteError", "No se pudo eliminar"),
      );
    }
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<Server />}
          title={t("ui.VideoRelaySites.sitiosRemotosRelay", "Sitios remotos (Relay)")}
          subtitle={t("ui.VideoRelaySites.paraDvrNvrDetrasDe")}
          actions={
            <Button onClick={() => setNewOpen(true)} variant="brand">
              <Plus className="mr-2 h-4 w-4" />{" "}
              {t("ui.VideoRelaySites.nuevoSitioRelay")}{" "}
            </Button>
          }
        />

        {loading ? (
          <SkeletonCards count={4} className="lg:grid-cols-2" />
        ) : error ? (
          <EmptyState
            icon={<RefreshCw />}
            title={t("ui.VideoRelaySites.noSePudieronCargarLos")}
            description={error}
            action={
              <Button variant="outline" onClick={load}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("ui.VideoRelaySites.reintentar", "Reintentar")}
              </Button>
            }
          />
        ) : sites.length === 0 ? (
          <EmptyState
            icon={<Server />}
            title={t(
              "ui.VideoRelaySites.aunNoHaySitiosRemotos",
              "Aún no hay sitios remotos",
            )}
            description={t("ui.VideoRelaySites.creaUnSitioDescargaSu")}
          />
        ) : (
          <Stagger className="grid gap-3 lg:grid-cols-2">
            {sites.map((s) => {
              const badge = STATUS[s.status || "unknown"] || STATUS.unknown;
              return (
                <GlassPanel
                  key={s.id}
                  flat
                  hover
                  className="flex items-start gap-3 p-4"
                >
                  <IconTile tone={healthTone(badge.health)}>
                    <Server />
                  </IconTile>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-foreground">
                        {s.name}
                      </p>
                      <DeviceStatusBadge
                        health={badge.health}
                        label={t(badge.labelKey, badge.label)}
                      />
                    </div>
                    <p
                      className="mt-0.5 truncate text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t(
                        "ui.VideoRelaySites.claveDelSitio",
                        "Clave del sitio:",
                      )}{" "}
                      <code>{s.siteKey}</code> ·{" "}
                      {String(s.ingestProtocol || "rtmps").toUpperCase()}
                      {s.publishTokenConfigured
                        ? ` · ${t("ui.VideoRelaySites.claveDeEnvioLista", "clave de envío lista")}`
                        : ` · ${t("ui.VideoRelaySites.sinClaveDeEnvio", "sin clave de envío")}`}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openBundle(s)}
                      >
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        {t("ui.VideoRelaySites.descargarEnlace", "Descargar enlace")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => regenToken(s)}
                      >
                        <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                        {t("ui.VideoRelaySites.regenerarClave", "Regenerar clave")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        style={{ color: "var(--bad-text)" }}
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {t("actions.delete")}{" "}
                      </Button>
                    </div>
                  </div>
                </GlassPanel>
              );
            })}
          </Stagger>
        )}
      </PageContainer>

      {/* New site */}
      <Dialog
        open={newOpen}
        onOpenChange={(o) => {
          if (!saving) {
            setNewOpen(o);
            if (!o) {
              setName("");
              setNotes("");
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("ui.VideoRelaySites.nuevoSitioRelay")}</DialogTitle>
            <DialogDescription>
              {t(
                "ui.VideoRelaySites.seGeneraraUnaClaveDe",
                "Se generará una clave de sitio y un token de publicación (cifrado).",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>{t("comun.nombreReq")}</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("ui.VideoRelaySites.ejemploNombreSitio", "BAS - Guayaquil")}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("comun.notas")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setNewOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={saving} onClick={create} variant="brand">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("ui.VideoRelaySites.crear", "Crear")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bundle viewer */}
      <Dialog
        open={!!bundleSite}
        onOpenChange={(o) => !o && (setBundleSite(null), setBundle(null))}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("ui.VideoRelaySites.relayPara", {
                defaultValue: "Relay para “{{name}}”",
                name: bundleSite?.name ?? "",
              })}
            </DialogTitle>
            <DialogDescription>
              {t(
                "ui.VideoRelaySites.ejecutaEstoEnUnEquipo",
                "Ejecuta esto en un equipo siempre encendido del sitio del DVR:",
              )}{" "}
              <code>docker compose up -d</code>.{" "}
              {t(
                "ui.VideoRelaySites.empujaCadaCanal",
                "Empuja cada canal hacia la nube (salida; no requiere abrir puertos).",
              )}
            </DialogDescription>
          </DialogHeader>
          {!bundle ? (
            <div
              className="flex items-center justify-center gap-2 py-10 text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("ui.VideoRelaySites.generando", "Generando…")}
            </div>
          ) : (
            <>
              <div className="glass-sunken grid grid-cols-2 gap-2 p-3 text-sm">
                <div>
                  <span style={{ color: "var(--ink-faint)" }}>
                    {t(
                      "ui.VideoRelaySites.direccionDeRecepcion",
                      "Dirección de recepción:",
                    )}
                  </span>{" "}
                  <code>{bundle.ingest}</code>
                </div>
                <div>
                  <span style={{ color: "var(--ink-faint)" }}>
                    {t("ui.VideoRelaySites.canales", "Canales:")}
                  </span>{" "}
                  {bundle.channelCount}
                </div>
              </div>
              {bundle.ingest.includes("INGEST_HOST") && (
                <div
                  className="rounded-xl border p-2.5 text-xs"
                  style={{
                    background:
                      "color-mix(in oklab, var(--warn) 12%, transparent)",
                    borderColor:
                      "color-mix(in oklab, var(--warn) 30%, transparent)",
                    color: "var(--warn-text)",
                  }}
                >
                  {t(
                    "ui.VideoRelaySites.direccionNoConfigurada",
                    "La dirección de recepción aún no está configurada. El enlace empezará a transmitir en cuanto lo esté.",
                  )}
                </div>
              )}
              <pre className="glass-sunken max-h-72 overflow-auto p-3 text-xs">
                {bundle.compose}
              </pre>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(bundle.compose);
                    toast.success(t("ui.VideoRelaySites.copiado", "Copiado"));
                  }}
                >
                  {t("ui.VideoRelaySites.copiar", "Copiar")}
                </Button>
                <Button onClick={downloadCompose} variant="brand">
                  <Download className="mr-2 h-4 w-4" />
                  {t(
                    "ui.VideoRelaySites.descargarDockerCompose",
                    "Descargar docker-compose",
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ui.VideoRelaySites.eliminarSitioRelay")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("ui.VideoRelaySites.eliminarConfirmacion", {
                defaultValue:
                  "¿Eliminar “{{name}}”? Los dispositivos que lo usen dejarán de transmitir.",
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="cg-btn-bad">
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

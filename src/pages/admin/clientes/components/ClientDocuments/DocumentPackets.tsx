/**
 * ════════════════════════════════════════════════════════════════════════════
 * CARPETAS ENTREGADAS AL CLIENTE
 *
 * La biblioteca de arriba es el armario de la trastienda: ahí se sube todo y el
 * cliente no ve nada. Esto es la ENTREGA — un grupo de esos documentos con
 * nombre, periodo y autor, puesto en manos del cliente por la app o por un
 * enlace que caduca, y con constancia de qué hizo con él.
 *
 * El caso que resuelve es mensual y de cobro: se sube la documentación del mes,
 * se marcan los archivos, se agrupan, y se manda para que el cliente la revise
 * y pague. Sin esto, «¿ya te llegó lo de septiembre?» sólo se podía contestar
 * mirando el correo enviado.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  FolderOpen,
  Link2,
  Send,
  Smartphone,
  Trash2,
  XCircle,
  ShieldCheck,
  Download,
  History,
} from "lucide-react";

import {
  FIELD_CLS,
  LabeledField,
  RowAction,
  RowActions,
} from "../_shared/tab-kit";

import { Button } from "@/components/ui/button";
import {
  Section,
  EmptyState,
  StatusBadge,
  Modal,
  IconTile,
} from "@/components/kit";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { clientService } from "@/lib/api/clientService";
import { localeActual } from "@/lib/localeActual";

/* ── Formas que devuelve el servidor ─────────────────────────────────────── */

export interface PacketDoc {
  itemId: string;
  attachmentId: string;
  name: string;
  sizeInBytes: number;
  downloadCount: number;
  firstDownloadedAt: string | null;
  lastDownloadedAt: string | null;
}
export interface PacketLink {
  id: string;
  state: "active" | "expired" | "revoked" | "locked";
  url: string;
  accessCode?: string | null;
  requiresCode: boolean;
  expiresAt: string;
  recipients: string[];
  openCount: number;
  firstOpenedAt: string | null;
  downloadCount: number;
  createdAt: string;
}
export interface Packet {
  id: string;
  name: string;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
  status: "draft" | "sent" | "viewed" | "approved" | "rejected";
  sharedInApp: boolean;
  sentAt: string | null;
  firstViewedAt: string | null;
  decisionAt: string | null;
  decisionComment: string | null;
  decidedByName: string | null;
  decidedVia: string | null;
  createdAt: string;
  createdByName: string;
  documentCount: number;
  downloadedCount: number;
  totalBytes: number;
  documents: PacketDoc[];
  links: PacketLink[];
}
interface Recipient {
  email: string;
  name: string;
  source: "contact" | "portal";
}
interface PacketEvent {
  id: string;
  kind: string;
  via: string;
  actor: string | null;
  detail: string | null;
  ip: string | null;
  at: string;
}

/* ── Etiquetas ───────────────────────────────────────────────────────────── */

type Tone = "neutral" | "info" | "brand" | "ok" | "bad" | "warn";

/** El estado se lee de un vistazo: es la única pregunta al llegar fin de mes. */
const ESTADO: Record<Packet["status"], { labelKey: string; tone: Tone }> = {
  draft: { labelKey: "ui.DocumentPackets.statusDraft", tone: "neutral" },
  sent: { labelKey: "ui.DocumentPackets.statusSent", tone: "info" },
  viewed: { labelKey: "ui.DocumentPackets.statusViewed", tone: "brand" },
  approved: { labelKey: "ui.DocumentPackets.statusApproved", tone: "ok" },
  rejected: { labelKey: "ui.DocumentPackets.statusRejected", tone: "bad" },
};

const ESTADO_ENLACE: Record<
  PacketLink["state"],
  { labelKey: string; tone: Tone }
> = {
  active: { labelKey: "ui.DocumentPackets.linkStateActive", tone: "ok" },
  expired: { labelKey: "ui.DocumentPackets.linkStateExpired", tone: "neutral" },
  revoked: { labelKey: "ui.DocumentPackets.linkStateRevoked", tone: "neutral" },
  locked: { labelKey: "ui.DocumentPackets.linkStateLocked", tone: "bad" },
};

const EVENTO: Record<string, string> = {
  created: "ui.DocumentPackets.eventCreated",
  shared_app: "ui.DocumentPackets.eventSharedApp",
  unshared_app: "ui.DocumentPackets.eventUnsharedApp",
  link_created: "ui.DocumentPackets.eventLinkCreated",
  link_revoked: "ui.DocumentPackets.eventLinkRevoked",
  sent: "ui.DocumentPackets.eventSent",
  link_opened: "ui.DocumentPackets.eventLinkOpened",
  code_failed: "ui.DocumentPackets.eventCodeFailed",
  viewed: "ui.DocumentPackets.eventViewed",
  downloaded: "ui.DocumentPackets.eventDownloaded",
  approved: "ui.DocumentPackets.eventApproved",
  rejected: "ui.DocumentPackets.eventRejected",
};

const VIA: Record<string, string> = {
  crm: "CRM",
  app: "App",
  link: "ui.DocumentPackets.viaLink",
};

const fmtDT = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);

  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(localeActual(), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const fmtDay = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : null);

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Cuánto le queda al enlace, en la unidad que se entiende sin pensar. */
function cuantoQueda(expiresAt: string, t: TFn): string {
  const ms = new Date(expiresAt).getTime() - Date.now();

  if (ms <= 0) return t("ui.DocumentPackets.remainingExpired");
  const h = Math.floor(ms / 3_600_000);

  if (h >= 24)
    return t("ui.DocumentPackets.remainingDaysHours", {
      dias: Math.floor(h / 24),
      horas: h % 24,
    });
  if (h >= 1) return t("ui.DocumentPackets.remainingHours", { horas: h });

  return t("ui.DocumentPackets.remainingMinutes", {
    minutos: Math.max(1, Math.round(ms / 60000)),
  });
}

const bytes = (b: number) => {
  if (!b) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));

  return `${Math.round((b / 1024 ** i) * 10) / 10} ${u[i]}`;
};

async function copiar(texto: string, queEs: string, t: TFn) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(t("ui.DocumentPackets.toastCopied", { que: queEs }));
  } catch {
    toast.error(t("ui.DocumentPackets.toastCopyFailed"));
  }
}

/* ── Componente ──────────────────────────────────────────────────────────── */

export default function DocumentPackets({
  clientId,
  refreshKey,
}: {
  clientId: string;
  /** Cambia cuando la biblioteca crea una carpeta nueva: fuerza recarga. */
  refreshKey: number;
}) {
  const { t } = useTranslation();
  const [packets, setPackets] = useState<Packet[]>([]);
  const [loading, setLoading] = useState(true);
  const [abierta, setAbierta] = useState<string | null>(null);

  const [linkFor, setLinkFor] = useState<Packet | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [elegidos, setElegidos] = useState<Record<string, boolean>>({});
  const [correoSuelto, setCorreoSuelto] = useState("");
  const [pedirClave, setPedirClave] = useState(true);
  const [horas, setHoras] = useState(72);
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recien, setRecien] = useState<{
    url: string;
    accessCode: string | null;
  } | null>(null);

  const [eventsFor, setEventsFor] = useState<Packet | null>(null);
  const [events, setEvents] = useState<PacketEvent[]>([]);

  const cargar = useCallback(async () => {
    try {
      const d = await clientService.getDocumentPackets(clientId);

      setPackets(d?.packets || []);
    } catch {
      /* la sección se queda como estaba */
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void cargar();
  }, [cargar, refreshKey]);

  const compartir = async (p: Packet, activo: boolean) => {
    try {
      await clientService.shareDocumentPacketInApp(clientId, p.id, activo);
      toast.success(
        activo
          ? t("ui.DocumentPackets.toastSharedInApp")
          : t("ui.DocumentPackets.toastUnsharedFromApp"),
      );
      await cargar();
    } catch {
      toast.error(t("ui.DocumentPackets.toastShareFailed"));
    }
  };

  const borrar = async (p: Packet) => {
    if (
      !(await confirmDialog({
        title: t("ui.DocumentPackets.deleteTitle"),
        message: t("ui.DocumentPackets.deleteMessage", { nombre: p.name }),
        confirmText: t("actions.delete"),
        tone: "danger",
      }))
    )
      return;
    try {
      await clientService.deleteDocumentPacket(clientId, p.id);
      toast.success(t("ui.DocumentPackets.toastDeleted"));
      await cargar();
    } catch {
      toast.error(t("ui.DocumentPackets.toastDeleteFailed"));
    }
  };

  const abrirEnlace = async (p: Packet) => {
    setLinkFor(p);
    setRecien(null);
    setPedirClave(true);
    setHoras(72);
    setMensaje("");
    setCorreoSuelto("");
    try {
      const d = await clientService.getDocumentPacketRecipients(clientId);
      const lista: Recipient[] = d?.recipients || [];

      setRecipients(lista);
      // Precargados y marcados: en el caso normal —el envío mensual de siempre—
      // no hay que tocar nada.
      setElegidos(Object.fromEntries(lista.map((r) => [r.email, true])));
    } catch {
      setRecipients([]);
      setElegidos({});
    }
  };

  const generar = async () => {
    if (!linkFor) return;
    const sueltos = correoSuelto
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"));
    const marcados = Object.entries(elegidos)
      .filter(([, v]) => v)
      .map(([k]) => k);
    const destinatarios = [...new Set([...marcados, ...sueltos])];

    setEnviando(true);
    try {
      const d = await clientService.createDocumentPacketLink(
        clientId,
        linkFor.id,
        {
          requireCode: pedirClave,
          recipients: destinatarios,
          expiresInHours: horas,
          message: mensaje.trim() || undefined,
        },
      );

      setRecien({
        url: d?.link?.url || "",
        accessCode: d?.link?.accessCode || null,
      });
      const enviados = d?.email?.sent?.length || 0;
      const fallidos = d?.email?.failed?.length || 0;

      toast.success(
        enviados
          ? fallidos
            ? t("ui.DocumentPackets.toastLinkSentWithFailures", {
                enviados,
                fallidos,
              })
            : t("ui.DocumentPackets.toastLinkSent", { enviados })
          : t("ui.DocumentPackets.toastLinkGenerated"),
      );
      await cargar();
    } catch {
      toast.error(t("ui.DocumentPackets.toastLinkFailed"));
    } finally {
      setEnviando(false);
    }
  };

  const revocar = async (p: Packet, l: PacketLink) => {
    if (
      !(await confirmDialog({
        title: t("ui.DocumentPackets.revokeTitle"),
        message: t("ui.DocumentPackets.revokeMessage"),
        confirmText: t("ui.DocumentPackets.revokeConfirm"),
        tone: "danger",
      }))
    )
      return;
    try {
      await clientService.revokeDocumentPacketLink(clientId, p.id, l.id);
      toast.success(t("ui.DocumentPackets.toastLinkRevoked"));
      await cargar();
    } catch {
      toast.error(t("ui.DocumentPackets.toastRevokeFailed"));
    }
  };

  const verHistorial = async (p: Packet) => {
    setEventsFor(p);
    setEvents([]);
    try {
      const d = await clientService.getDocumentPacketEvents(clientId, p.id);

      setEvents(d?.events || []);
    } catch {
      /* el diálogo enseña el vacío */
    }
  };

  if (loading) return null;

  return (
    <>
      <Section
        action={
          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
            {t("ui.DocumentPackets.folderCount", { count: packets.length })}
          </span>
        }
        icon={<FolderOpen />}
        title={t("ui.DocumentPackets.sectionTitle")}
      >
        {packets.length === 0 ? (
          <EmptyState
            description={t("ui.DocumentPackets.emptyDescription")}
            icon={<FolderOpen />}
            title={t("ui.DocumentPackets.emptyTitle")}
            variant="inline"
          />
        ) : (
          <div className="space-y-2">
            {packets.map((p) => {
              const est = ESTADO[p.status] || ESTADO.draft;
              const periodo = [fmtDay(p.periodStart), fmtDay(p.periodEnd)]
                .filter(Boolean)
                .join(" → ");
              const enlaceVivo = p.links.find((l) => l.state === "active");
              const desplegada = abierta === p.id;

              return (
                <div
                  key={p.id}
                  className="rounded-2xl border"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  {/* ── Cabecera de la carpeta ── */}
                  <div className="flex flex-wrap items-center gap-3 p-3">
                    <IconTile
                      size="sm"
                      tone={
                        p.status === "approved"
                          ? "ok"
                          : p.status === "rejected"
                            ? "bad"
                            : "brand"
                      }
                    >
                      <FolderOpen />
                    </IconTile>
                    <button
                      className="cg-focus min-w-0 flex-1 text-left"
                      type="button"
                      onClick={() => setAbierta(desplegada ? null : p.id)}
                    >
                      <div className="truncate font-semibold">{p.name}</div>
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {periodo ? `${periodo} · ` : ""}
                        {t("ui.DocumentPackets.cardMeta", {
                          docs: p.documentCount,
                          size: bytes(p.totalBytes),
                          autor: p.createdByName,
                        })}
                      </div>
                    </button>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge dot={false} tone={est.tone}>
                        {t(est.labelKey)}
                      </StatusBadge>
                      {p.sharedInApp && (
                        <StatusBadge dot={false} tone="info">
                          <Smartphone className="mr-1 inline h-3 w-3" />
                          {t("ui.DocumentPackets.badgeInApp")}
                        </StatusBadge>
                      )}
                      {enlaceVivo && (
                        <StatusBadge dot={false} tone="ok">
                          <Link2 className="mr-1 inline h-3 w-3" />
                          {cuantoQueda(enlaceVivo.expiresAt, t)}
                        </StatusBadge>
                      )}
                      {p.downloadedCount > 0 && (
                        <StatusBadge dot={false} tone="neutral">
                          <Download className="mr-1 inline h-3 w-3" />
                          {p.downloadedCount}/{p.documentCount}
                        </StatusBadge>
                      )}
                    </div>

                    <RowActions>
                      <RowAction
                        title={
                          p.sharedInApp
                            ? t("ui.DocumentPackets.actionUnshareApp")
                            : t("ui.DocumentPackets.actionShareApp")
                        }
                        onClick={() => compartir(p, !p.sharedInApp)}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                      </RowAction>
                      <RowAction
                        title={t("ui.DocumentPackets.actionGenerateLink")}
                        onClick={() => abrirEnlace(p)}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </RowAction>
                      <RowAction
                        title={t("ui.DocumentPackets.actionHistory")}
                        onClick={() => verHistorial(p)}
                      >
                        <History className="h-3.5 w-3.5" />
                      </RowAction>
                      <RowAction
                        title={t("actions.delete")}
                        tone="bad"
                        onClick={() => borrar(p)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </RowAction>
                    </RowActions>
                  </div>

                  {/* ── Detalle desplegado ── */}
                  {desplegada && (
                    <div
                      className="border-t p-3"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      {/* Línea de tiempo: la respuesta a «¿ya lo revisó?» */}
                      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <Hito
                          icon={<Send className="h-3.5 w-3.5" />}
                          label={t("ui.DocumentPackets.milestoneSent")}
                          value={fmtDT(p.sentAt)}
                        />
                        <Hito
                          icon={<Eye className="h-3.5 w-3.5" />}
                          label={t("ui.DocumentPackets.milestoneViewed")}
                          value={fmtDT(p.firstViewedAt)}
                        />
                        <Hito
                          icon={<Download className="h-3.5 w-3.5" />}
                          label={t("ui.DocumentPackets.milestoneDownloaded")}
                          value={t("ui.DocumentPackets.countOf", {
                            actual: p.downloadedCount,
                            total: p.documentCount,
                          })}
                        />
                        <Hito
                          icon={
                            p.status === "rejected" ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )
                          }
                          label={
                            p.status === "rejected"
                              ? t("ui.DocumentPackets.statusRejected")
                              : t("ui.DocumentPackets.statusApproved")
                          }
                          value={
                            p.decisionAt
                              ? `${fmtDT(p.decisionAt)}${p.decidedByName ? ` · ${p.decidedByName}` : ""}`
                              : "—"
                          }
                        />
                      </div>

                      {p.decisionComment && (
                        <div
                          className="mb-3 rounded-xl px-3 py-2 text-sm"
                          style={{
                            background: "var(--glass-sunken)",
                            color: "var(--ink-soft)",
                          }}
                        >
                          «{p.decisionComment}»
                        </div>
                      )}

                      {/* Los documentos, con lo que se sabe de cada uno */}
                      <div
                        className="divide-y"
                        style={{ borderColor: "var(--hairline)" }}
                      >
                        {p.documents.map((d) => (
                          <div
                            key={d.itemId}
                            className="flex items-center justify-between gap-3 py-2 text-sm"
                          >
                            <span className="min-w-0 truncate">{d.name}</span>
                            <span
                              className="shrink-0 text-xs tabular-nums"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {bytes(d.sizeInBytes)}
                              {d.downloadCount > 0
                                ? ` · ${t("ui.DocumentPackets.docDownloaded", {
                                    veces: d.downloadCount,
                                    fecha: fmtDT(d.lastDownloadedAt),
                                  })}`
                                : ` · ${t("ui.DocumentPackets.docNotDownloaded")}`}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Enlaces emitidos */}
                      {p.links.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {p.links.map((l) => {
                            const e = ESTADO_ENLACE[l.state];

                            return (
                              <div
                                key={l.id}
                                className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-xs"
                                style={{ background: "var(--glass-sunken)" }}
                              >
                                <StatusBadge dot={false} tone={e.tone}>
                                  {t(e.labelKey)}
                                </StatusBadge>
                                {l.requiresCode && (
                                  <span
                                    className="inline-flex items-center gap-1"
                                    style={{ color: "var(--ink-soft)" }}
                                  >
                                    <ShieldCheck className="h-3 w-3" />{" "}
                                    {t("ui.DocumentPackets.withCode")}
                                  </span>
                                )}
                                <span style={{ color: "var(--ink-soft)" }}>
                                  {t("ui.DocumentPackets.linkStats", {
                                    fecha: fmtDT(l.expiresAt),
                                    aperturas: l.openCount,
                                    descargas: l.downloadCount,
                                  })}
                                </span>
                                {l.recipients.length > 0 && (
                                  <span
                                    className="truncate"
                                    style={{ color: "var(--ink-faint)" }}
                                  >
                                    → {l.recipients.join(", ")}
                                  </span>
                                )}
                                <span className="ml-auto flex items-center gap-1.5">
                                  {l.state === "active" && (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                          copiar(
                                            l.url,
                                            t(
                                              "ui.DocumentPackets.copyLabelLink",
                                            ),
                                            t,
                                          )
                                        }
                                      >
                                        <Copy className="mr-1 h-3 w-3" />{" "}
                                        {t("ui.DocumentPackets.copyLabelLink")}
                                      </Button>
                                      {l.accessCode && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() =>
                                            copiar(
                                              l.accessCode!,
                                              t(
                                                "ui.DocumentPackets.copyLabelCode",
                                              ),
                                              t,
                                            )
                                          }
                                        >
                                          <ShieldCheck className="mr-1 h-3 w-3" />
                                          <span className="tabular-nums tracking-widest">
                                            {l.accessCode}
                                          </span>
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="danger-ghost"
                                        onClick={() => revocar(p, l)}
                                      >
                                        {t("ui.DocumentPackets.revokeConfirm")}
                                      </Button>
                                    </>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Diálogo: generar el enlace privado ── */}
      <Modal
        footer={
          recien ? (
            <Button
              onClick={() => {
                setLinkFor(null);
                setRecien(null);
              }}
            >
              {t("ui.DocumentPackets.doneButton")}
            </Button>
          ) : (
            <>
              <Button
                disabled={enviando}
                variant="outline"
                onClick={() => setLinkFor(null)}
              >
                {t("actions.cancel")}
              </Button>
              <Button disabled={enviando} onClick={generar}>
                {enviando
                  ? t("ui.DocumentPackets.generating")
                  : t("ui.DocumentPackets.generateAndSend")}
              </Button>
            </>
          )
        }
        icon={<Link2 className="h-5 w-5" />}
        open={!!linkFor}
        title={t("ui.DocumentPackets.privateLinkTitle")}
        onOpenChange={(o) => {
          if (!o && !enviando) {
            setLinkFor(null);
            setRecien(null);
          }
        }}
      >
        {recien ? (
          /* Después de generar: lo único que importa es copiar las dos cosas. */
          <div className="space-y-3">
            <div
              className="rounded-xl p-3"
              style={{ background: "var(--glass-sunken)" }}
            >
              <div className="cg-eyebrow mb-1">
                {t("ui.DocumentPackets.copyLabelLink")}
              </div>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  className={`${FIELD_CLS} font-mono text-xs`}
                  value={recien.url}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copiar(recien.url, t("ui.DocumentPackets.copyLabelLink"), t)
                  }
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {recien.accessCode ? (
              <div
                className="rounded-xl p-3"
                style={{ background: "var(--glass-sunken)" }}
              >
                <div className="cg-eyebrow mb-1">
                  {t("ui.DocumentPackets.accessCodeLabel")}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-2xl font-bold tabular-nums tracking-[0.3em]">
                    {recien.accessCode}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      copiar(
                        recien.accessCode!,
                        t("ui.DocumentPackets.copyLabelCode"),
                        t,
                      )
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {/* Esto es el motivo entero de que la clave exista. */}
                <p
                  className="mt-2 text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t("ui.DocumentPackets.codeHint")}
                </p>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {t("ui.DocumentPackets.noCodeHint")}
              </p>
            )}
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {t("ui.DocumentPackets.expiresHint", { horas })}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <LabeledField label={t("ui.DocumentPackets.recipientsLabel")}>
              {recipients.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {t("ui.DocumentPackets.noRecipientsHint")}
                </p>
              ) : (
                <div className="space-y-1">
                  {recipients.map((r) => (
                    <label
                      key={r.email}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        checked={!!elegidos[r.email]}
                        type="checkbox"
                        onChange={(e) =>
                          setElegidos((s) => ({
                            ...s,
                            [r.email]: e.target.checked,
                          }))
                        }
                      />
                      <span className="min-w-0 truncate">{r.name}</span>
                      <span
                        className="min-w-0 truncate text-xs"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {r.email} ·{" "}
                        {r.source === "portal"
                          ? t("ui.DocumentPackets.sourcePortal")
                          : t("ui.DocumentPackets.sourceContact")}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </LabeledField>

            <LabeledField label={t("ui.DocumentPackets.otherEmailsLabel")}>
              <input
                className={FIELD_CLS}
                placeholder={t("ui.DocumentPackets.otherEmailsPlaceholder")}
                value={correoSuelto}
                onChange={(e) => setCorreoSuelto(e.target.value)}
              />
            </LabeledField>

            <LabeledField label={t("ui.DocumentPackets.messageLabel")}>
              <textarea
                className={`${FIELD_CLS} h-auto py-2`}
                placeholder={t("ui.DocumentPackets.messagePlaceholder")}
                rows={2}
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
              />
            </LabeledField>

            <label
              className="flex cursor-pointer items-start gap-2 rounded-xl p-3"
              style={{ background: "var(--glass-sunken)" }}
            >
              <input
                aria-label={t("ui.DocumentPackets.requireCodeLabel")}
                checked={pedirClave}
                className="mt-1"
                type="checkbox"
                onChange={(e) => setPedirClave(e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">
                  {t("ui.DocumentPackets.requireCodeLabel")}
                </span>
                <span
                  className="block text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t("ui.DocumentPackets.requireCodeHint")}
                </span>
              </span>
            </label>

            <LabeledField label={t("ui.DocumentPackets.expiresInLabel")}>
              <select
                className={FIELD_CLS}
                value={horas}
                onChange={(e) => setHoras(Number(e.target.value))}
              >
                <option value={24}>{t("ui.DocumentPackets.expiry24h")}</option>
                <option value={72}>{t("ui.DocumentPackets.expiry72h")}</option>
                <option value={168}>{t("ui.DocumentPackets.expiry7d")}</option>
              </select>
            </LabeledField>
          </div>
        )}
      </Modal>

      {/* ── Diálogo: historial ── */}
      <Modal
        footer={
          <Button onClick={() => setEventsFor(null)}>
            {t("actions.close")}
          </Button>
        }
        icon={<History className="h-5 w-5" />}
        open={!!eventsFor}
        title={t("ui.DocumentPackets.historyTitle", {
          nombre: eventsFor?.name || "",
        })}
        onOpenChange={(o) => {
          if (!o) setEventsFor(null);
        }}
      >
        {events.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("ui.DocumentPackets.historyEmpty")}
          </p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-3 text-sm">
                <Clock
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  style={{ color: "var(--ink-faint)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {EVENTO[e.kind] ? t(EVENTO[e.kind]) : e.kind}
                  </div>
                  <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {fmtDT(e.at)} ·{" "}
                    {VIA[e.via]
                      ? VIA[e.via].startsWith("ui.")
                        ? t(VIA[e.via])
                        : VIA[e.via]
                      : e.via}
                    {e.actor ? ` · ${e.actor}` : ""}
                    {e.ip ? ` · ${e.ip}` : ""}
                  </div>
                  {e.detail && (
                    <div
                      className="truncate text-xs"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {e.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Un hito de la línea de tiempo: rótulo arriba, dato abajo. */
function Hito({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{ background: "var(--glass-sunken)" }}
    >
      <div className="cg-eyebrow flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm tabular-nums">{value}</div>
    </div>
  );
}

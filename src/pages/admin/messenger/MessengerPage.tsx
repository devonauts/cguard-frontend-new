import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { MessageSquareText, Send, Plus, Search, Loader2, X, Check, CheckCheck, Paperclip, Play, Trash2, Users, Mic, UserPlus, RefreshCw, UserCircle2, ArrowLeft } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import {
  PageHeader,
  Modal,
  EmptyState,
  SkeletonCards,
  Segmented,
  StatusBadge,
  SmartImage,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  messageService,
  type MessageAttachment,
  type GroupMember,
} from "@/lib/api/messageService";
import securityGuardService from "@/lib/api/securityGuardService";
import { postSiteService } from "@/lib/api/postSiteService";
import { clientService } from "@/lib/api/clientService";
import { useFileUrl } from "@/lib/fileUrl";
import { useAudioRecorder } from "@/lib/useAudioRecorder";

import { toast } from "sonner";

import { confirmDialog } from "@/components/ui/confirmDialog";
import i18n from "@/i18n";
import { notifyMessagesChanged } from "@/hooks/useMessagesUnread";
import { useEventoEnVivo } from "@/hooks/useEventoEnVivo";

/**
 * Renders one message attachment (image/video). The attachment `url` is a raw
 * privateUrl, so resolve a token-based download URL via `useFileUrl`. Extracted
 * as a component because the attachments are rendered inside a `.map()`, where
 * hooks can't be called directly.
 */
function MessageAttachmentView({ att }: { att: MessageAttachment }) {
  const url = useFileUrl(att.url);

  if (att.type === "video") {
    return (
      <video
        controls
        className="max-h-72 max-w-full rounded-lg"
        preload="metadata"
        src={url || undefined}
        style={{ background: 'var(--glass-sunken)' }}
      />
    );
  }
  if (att.type === "audio") {
    return (
      <audio
        src={url || undefined}
        controls
        preload="metadata"
        className="w-56 max-w-full"
      />
    );
  }

  return (
    <a href={url || "#"} rel="noreferrer" target="_blank">
      <img
        src={url || undefined}
        alt={att.name || "imagen"}
        loading="lazy"
        className="max-h-72 max-w-full rounded-lg object-cover"
      />
    </a>
  );
}

/** Thumbnail for a pending (just-uploaded) image attachment; same token logic. */
function PendingThumb({ att }: { att: MessageAttachment }) {
  const url = useFileUrl(att.url);

  return <SmartImage alt="" className="h-full w-full" src={url} />;
}

type Conversation = {
  id: string;
  recipientType: string;
  recipientUserId: string | null;
  recipientName: string;
  kind?: string;
  isGroup?: boolean;
  memberCount?: number | null;
  subject?: string | null;
  isOneWay?: boolean;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  unreadCount?: number;
};
type Message = {
  id: string;
  senderUserId: string;
  senderType: string;
  senderName: string;
  body: string;
  createdAt: string;
  attachments?: MessageAttachment[] | null;
  receipt?: { deliveryStatus: string; readAt?: string | null } | null;
};

// Autocomplete result row (clients / guards / post-sites all share this shape).
type AcRow = {
  id: string;
  label?: string;
  name?: string;
  companyName?: string;
};

const fmtTime = (d?: string | null) => {
  try {
    return new Date(d as string).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

export default function MessengerPage({
  scope = "operational",
}: {
  scope?: "operational" | "client";
}) {
  const { t } = useTranslation();
  const isClient = scope === "client";
  const pageTitle = isClient ? "Mensajes de Clientes" : "Mensajes Operativos";
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [pending, setPending] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  /* ─── El alto de la conversación se MIDE, no se adivina ────────────────────
     Esto era `h-[calc(100vh-240px)]`: 240 px a ojo para todo lo que va encima
     (barra de la app, migas de pan, cabecera de la página y sus separaciones).
     Medido en producción, lo que hay encima son 271 px, así que el panel
     terminaba 31 px POR DEBAJO del borde inferior de la pantalla — en 1600x1000,
     en 1440x780 y en 1280x720 por igual, porque el error es fijo.

     Y esos 31 px son justo donde vive la caja de escribir. Como el armazón de la
     aplicación recorta lo que sobra, no aparecía ni barra de desplazamiento: la
     caja simplemente no estaba, y para responder había que desplazar. El mismo
     patrón de medir con `getBoundingClientRect().top` ya se usa en la hoja del
     Horario. Se vuelve a medir al cambiar el tamaño de la ventana y al cambiar
     lo que va encima (el título cambia entre Operativos y Clientes). */
  const shellRef = useRef<HTMLDivElement>(null);
  const [shellTop, setShellTop] = useState(240);
  // El hueco de abajo tampoco se inventa: es el MISMO relleno que la página ya
  // se da a sí misma (16 px en móvil, 24 px de `lg` en adelante), leído del
  // contenedor. Así el panel respira igual por arriba que por abajo aunque
  // alguien cambie el `p-4 lg:p-6`.
  const [gapAbajo, setGapAbajo] = useState(16);

  useLayoutEffect(() => {
    const medir = () => {
      const el = shellRef.current;

      if (!el) return;
      setShellTop(Math.round(el.getBoundingClientRect().top));
      const cont = el.parentElement;

      if (cont)
        setGapAbajo(
          Math.round(parseFloat(getComputedStyle(cont).paddingBottom)) || 16,
        );
    };

    medir();
    window.addEventListener("resize", medir);

    return () => window.removeEventListener("resize", medir);
  }, [pageTitle]);
  const fileRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();

  const loadConversations = useCallback(async () => {
    try {
      const res = await messageService.listConversations({ limit: 50 });

      setConversations(res?.rows || []);
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.MessengerPage.noSePudieronCargarLasConversaciones",
            "No se pudieron cargar las conversaciones",
          ),
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadThread = useCallback(
    async (conv: Conversation, markRead = false) => {
      try {
        const res = await messageService.listMessages(conv.id, { limit: 50 });

        // API returns newest-first; show oldest-first.
        setMessages((res?.rows || []).slice().reverse());
        if (markRead && (conv.unreadCount || 0) > 0) {
          await messageService.markRead(conv.id).catch(() => {});
          setConversations((cs) =>
            cs.map((c) => (c.id === conv.id ? { ...c, unreadCount: 0 } : c)),
          );
          // Leer aquí baja el contador del menú lateral: sin este aviso el punto
          // seguiría encendido hasta el siguiente refresco automático.
          notifyMessagesChanged();
        }
        setTimeout(
          () =>
            threadRef.current?.scrollTo({
              top: threadRef.current.scrollHeight,
            }),
          50,
        );
      } catch (e: any) {
        toast.error(
          e?.data?.message ||
            e?.message ||
            t(
              "ui.MessengerPage.noSePudoCargarLaConversacion",
              "No se pudo cargar la conversación",
            ),
        );
      }
    },
    [],
  );

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);
  /* `message:changed` lo emite el backend para las TRES ramas de destinatario
     —oficina, cliente y vigilante—, y va a la sala del usuario, que comparten
     todos sus dispositivos. Antes esta pantalla sondeaba cada 12 s: la bandeja
     entera más el hilo abierto, 300-600 peticiones/hora. */
  useEventoEnVivo(["message:changed"], () => {
    loadConversations();
    if (selected) loadThread(selected);
  });

  // Operativos = chats with vigilantes/supervisores + grupos (recipientType !== "client").
  // Clientes = chats with customers (recipientType === "client").
  const visibleConversations = useMemo(
    () =>
      conversations.filter((c) =>
        isClient ? c.recipientType === "client" : c.recipientType !== "client",
      ),
    [conversations, isClient],
  );

  const onSelect = (c: Conversation) => {
    setSelected(c);
    setMessages([]);
    setMembersOpen(false);
    loadThread(c, true);
  };

  // Open a specific conversation when arrived via a notification (?conversation=<id>).
  // Latch so it opens ONCE — otherwise the 12s poll (new `conversations` ref)
  // re-ran this and force-jumped the user back to the URL conversation every
  // tick, wiping whatever thread they'd opened.
  const didAutoOpenRef = useRef(false);

  useEffect(() => {
    if (didAutoOpenRef.current) return;
    const cid = new URLSearchParams(window.location.search).get("conversation");

    if (!cid || !conversations.length) return;
    const conv = conversations.find((c) => c.id === cid);

    if (conv) {
      didAutoOpenRef.current = true;
      onSelect(conv);
    }
     
  }, [conversations]);

  const onSend = async () => {
    if (!selected || sending || uploading) return;
    const body = draft.trim();

    if (!body && pending.length === 0) return;
    const atts = pending;

    setSending(true);
    setDraft("");
    setPending([]);
    try {
      await messageService.sendMessage(selected.id, body, atts);
      await loadThread(selected);
      loadConversations();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.MessengerPage.noSePudoEnviar", "No se pudo enviar"),
      );
      setDraft(body);
      setPending(atts);
    } finally {
      setSending(false);
    }
  };

  const onDeleteConversation = async () => {
    if (!selected) return;
    if (
      !(await confirmDialog({
        title: t(
          "ui.MessengerPage.eliminarConversacion",
          "Eliminar conversación",
        ),
        message: `¿Eliminar la conversación con ${selected.recipientName}? Esta acción no se puede deshacer.`,
        confirmText: "Eliminar",
        tone: "danger",
      }))
    )
      return;
    const id = selected.id;

    try {
      await messageService.deleteConversation(id);
      setConversations((cs) => cs.filter((c) => c.id !== id));
      setSelected(null);
      setMessages([]);
      toast.success(t("ui.MessengerPage.conversacionEliminada"));
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.MessengerPage.noSePudoEliminarLaConversacion",
            "No se pudo eliminar la conversación",
          ),
      );
    }
  };

  // Record a voice note, upload it, and send it as an audio attachment.
  const onToggleRecord = async () => {
    if (!selected) return;
    if (recorder.recording) {
      try {
        const rec = await recorder.stop();

        if (!rec) return;
        setUploading(true);
        const att = await messageService.uploadAttachment(rec.file);

        await messageService.sendMessage(selected.id, "", [att]);
        await loadThread(selected);
        loadConversations();
      } catch (e: any) {
        toast.error(
          e?.data?.message ||
            e?.message ||
            t(
              "ui.MessengerPage.noSePudoEnviarLaNotaDeVoz",
              "No se pudo enviar la nota de voz",
            ),
        );
      } finally {
        setUploading(false);
      }

      return;
    }
    try {
      await recorder.start();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "ui.MessengerPage.noSePudoAccederAlMicrofono",
            "No se pudo acceder al micrófono",
          ),
      );
    }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        if (!/^image\/|^video\/|^audio\//.test(file.type)) {
          toast.error(`${file.name}: solo imágenes, videos o audio`);
          continue;
        }
        if (file.size > 100 * 1024 * 1024) {
          toast.error(`${file.name}: máximo 100 MB`);
          continue;
        }
        const att = await messageService.uploadAttachment(file);

        setPending((p) => [...p, att]);
      }
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "ui.MessengerPage.noSePudoSubirElArchivo",
            "No se pudo subir el archivo",
          ),
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <AppLayout>
      <div className="p-4 lg:p-6 space-y-4">
        <PageHeader
          actions={
            <Button variant="brand" onClick={() => setComposeOpen(true)}>
              <Plus size={15} className="mr-1.5" />{" "}{t('ui.MessengerPage.nuevo')}{" "}</Button>
          }
          icon={<MessageSquareText />}
          subtitle={isClient ? t("ui.MessengerPage.conversacionesConTusClientes", "Conversaciones con tus clientes.") : t("ui.MessengerPage.conversacionesConVigilantesSupervisores", "Conversaciones con vigilantes, supervisores y grupos por puesto.")}
          title={pageTitle}
        />
        <div
          ref={shellRef}
          className="glass flex overflow-hidden"
          style={{
            height: `calc(100vh - ${shellTop + gapAbajo}px)`,
            minHeight: 320,
          }}
        >
          {/* Conversation list */}
          {/* En móvil sólo cabe un panel: se ve la lista, o la conversación abierta. */}
          <aside
            className={`${selected ? "hidden md:flex" : "flex"} w-full flex-col border-r md:max-w-xs`}
            style={{ borderColor: "var(--hairline)" }}
          >
            <div
              className="flex items-center justify-between gap-2 border-b p-3"
              style={{ borderColor: "var(--hairline)" }}
            >
              <h2 className="text-sm font-bold">{pageTitle}</h2>
              <Button
                size="sm"
                variant="brand"
                onClick={() => setComposeOpen(true)}
              >
                <Plus className="mr-1" size={14} />{" "}
                {t("ui.MessengerPage.nuevo")}{" "}
              </Button>
            </div>
            <div className="flex-1 space-y-2 overflow-auto p-2">
              {loadingList ? (
                <SkeletonCards className="sm:grid-cols-1" count={4} />
              ) : visibleConversations.length === 0 ? (
                <EmptyState
                  description={isClient ? t("ui.MessengerPage.todaviaNoHayMensajesDeTusClientes", "Todavía no hay mensajes de tus clientes.") : t("ui.MessengerPage.empiezaUnaNuevaConElBoton", "Empieza una nueva con el botón «Nuevo».")}
                  icon={<MessageSquareText />}
                  title={isClient ? t("ui.MessengerPage.sinMensajesDeClientes", "Sin mensajes de clientes") : t("ui.MessengerPage.sinConversaciones", "Sin conversaciones")}
                />
              ) : (
                visibleConversations.map((c) => {
                  const activa = selected?.id === c.id;

                  return (
                    <button
                      key={c.id}
                      aria-current={activa || undefined}
                      className={`glass-flat cg-focus flex w-full items-start gap-3 px-3 py-3 text-left transition-colors ${activa ? "glass-brand brand-rail" : "hover:bg-muted/40"}`}
                      onClick={() => onSelect(c)}
                    >
                      <div
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-bold"
                        style={{
                          background: "var(--brand-wash)",
                          borderColor: "var(--brand-line)",
                          color: "var(--brand-text)",
                        }}
                      >
                        {c.isGroup ? (
                          <Users size={16} />
                        ) : (
                          (c.recipientName || "?").slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold">
                            {c.recipientName}
                          </p>
                          <span
                            className="shrink-0 text-[10px]"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {fmtTime(c.lastMessageAt)}
                          </span>
                        </div>
                        <p
                          className="truncate text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {c.lastMessagePreview ||
                            (c.isGroup
                              ? `Grupo · ${c.memberCount || 0} miembros`
                              : c.recipientType === "guard"
                                ? "Vigilante"
                                : "Cliente")}
                        </p>
                      </div>
                      {(c.unreadCount || 0) > 0 && (
                        <span
                          className="ml-1 grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[10px] font-bold tabular-nums"
                          style={{
                            background: "var(--brand)",
                            color: "var(--brand-ink)",
                          }}
                        >
                          {c.unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* Thread */}
          <section
            className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}
          >
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center p-6">
                <EmptyState
                  description={t('ui.MessengerPage.seleccionaUnaConversacionDeLa')}
                  icon={<MessageSquareText />}
                  title={t("ui.Messenger.ningunaConversacionAbierta", "Ninguna conversación abierta")}
                />
              </div>
            ) : (
              <>
                <div
                  className="flex items-center gap-3 border-b p-3"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <button
                    aria-label={t('ui.MessengerPage.volverALaLista')}
                    className="cg-focus -ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors hover:bg-muted md:hidden"
                    style={{ color: 'var(--ink-soft)' }}
                    title={t('ui.MessengerPage.volverALaLista')}
                    onClick={() => { setSelected(null); setMessages([]); }}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-xs font-bold"
                    style={{
                      background: "var(--brand-wash)",
                      borderColor: "var(--brand-line)",
                      color: "var(--brand-text)",
                    }}
                  >
                    {selected.isGroup ? (
                      <Users size={16} />
                    ) : (
                      (selected.recipientName || "?").slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {selected.recipientName}
                    </p>
                    <p
                      className="text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {selected.isGroup
                        ? `Grupo · ${selected.memberCount || 0} miembros`
                        : selected.recipientType === "guard"
                          ? "Vigilante"
                          : "Cliente"}
                    </p>
                  </div>
                  {selected.isOneWay && (
                    <StatusBadge className="ml-2 shrink-0" tone="info">
                      Solo lectura
                    </StatusBadge>
                  )}
                  {selected.isGroup && (
                    <button
                      className="cg-focus ml-auto grid h-9 w-9 place-items-center rounded-lg transition-colors hover:bg-muted"
                      style={{ color: 'var(--ink-soft)' }}
                      title={t('ui.MessengerPage.miembrosDelGrupo')}
                      onClick={() => setMembersOpen(true)}
                    >
                      <Users className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    className={`${selected.isGroup ? "" : "ml-auto"} cg-focus grid h-9 w-9 place-items-center rounded-lg transition-colors`}
                    style={{ color: 'var(--ink-soft)' }}
                    title={selected.isGroup ? t("ui.MessengerPage.eliminarGrupo", "Eliminar grupo") : t("ui.MessengerPage.eliminarConversacion", "Eliminar conversación")}
                    onClick={onDeleteConversation}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'color-mix(in oklab, var(--bad) 12%, transparent)';
                      e.currentTarget.style.color = 'var(--bad-text)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '';
                      e.currentTarget.style.color = 'var(--ink-soft)';
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div
                  ref={threadRef}
                  className="flex-1 space-y-2 overflow-auto p-4"
                >
                  {messages.map((m) => {
                    const mine = m.senderType === "staff";

                    return (
                      <div
                        key={m.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        {/* La burbuja propia va en el acento; la ajena en cristal plano
                            (plano, no `.glass`: se repite por cada mensaje del hilo). */}
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "" : "glass-flat"}`}
                          style={
                            mine
                              ? {
                                  background: "var(--brand)",
                                  color: "var(--brand-ink)",
                                }
                              : undefined
                          }
                        >
                          {!mine && (
                            <p
                              className="mb-0.5 text-[10px] font-semibold"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              {m.senderName}
                            </p>
                          )}
                          {Array.isArray(m.attachments) &&
                            m.attachments.length > 0 && (
                              <div className="mb-1 grid gap-1.5">
                                {m.attachments.map((a, i) => (
                                  <MessageAttachmentView key={i} att={a} />
                                ))}
                              </div>
                            )}
                          {m.body && (
                            <p className="whitespace-pre-wrap break-words">
                              {m.body}
                            </p>
                          )}
                          <div
                            className="mt-0.5 flex items-center justify-end gap-1 text-[10px]"
                            style={
                              mine
                                ? { color: "var(--brand-ink)", opacity: 0.72 }
                                : { color: "var(--ink-faint)" }
                            }
                          >
                            {fmtTime(m.createdAt)}
                            {mine &&
                              (m.receipt?.deliveryStatus === "read" ? (
                                <CheckCheck size={12} />
                              ) : (
                                <Check size={12} />
                              ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="glass-sunken m-3 rounded-2xl p-3">
                  {pending.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {pending.map((a, i) => (
                        <div
                          key={i}
                          className="relative h-16 w-16 overflow-hidden rounded-lg border"
                          style={{ borderColor: "var(--hairline)" }}
                        >
                          {a.type === "video" ? (
                            <div
                              className="flex h-full w-full items-center justify-center"
                              style={{
                                background: "var(--glass-sunken)",
                                color: "var(--ink-soft)",
                              }}
                            >
                              <Play size={18} />
                            </div>
                          ) : a.type === "audio" ? (
                            <div
                              className="flex h-full w-full items-center justify-center"
                              style={{
                                background: "var(--brand-wash)",
                                color: "var(--brand-text)",
                              }}
                            >
                              <Mic size={18} />
                            </div>
                          ) : (
                            <PendingThumb att={a} />
                          )}
                          <button
                            aria-label="Quitar adjunto"
                            className="cg-focus absolute right-0 top-0 grid h-5 w-5 place-items-center rounded-bl"
                            style={{ background: 'oklch(0 0 0 / 0.62)', color: 'oklch(1 0 0)' }}
                            onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*,video/*,audio/*"
                      multiple
                      className="hidden"
                      onChange={(e) => onPickFiles(e.target.files)}
                    />
                    <button
                      className="cg-btn-glass cg-focus grid h-10 w-10 shrink-0 place-items-center rounded-xl disabled:opacity-50"
                      disabled={uploading || recorder.recording}
                      title="Adjuntar imagen, video o audio"
                      onClick={() => fileRef.current?.click()}
                    >
                      {uploading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Paperclip size={16} />
                      )}
                    </button>
                    {recorder.recording ? (
                      <div
                        className="flex flex-1 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm"
                        style={{
                          borderColor:
                            "color-mix(in oklab, var(--bad) 38%, transparent)",
                          background:
                            "color-mix(in oklab, var(--bad) 10%, transparent)",
                        }}
                      >
                        <span
                          className="cc-dot"
                          style={{ background: "var(--bad)" }}
                        />
                        <span className="font-mono tabular-nums">
                          {String(
                            Math.floor(recorder.elapsedMs / 60000),
                          ).padStart(2, "0")}
                          :
                          {String(
                            Math.floor((recorder.elapsedMs % 60000) / 1000),
                          ).padStart(2, "0")}
                        </span>
                        <span style={{ color: "var(--ink-soft)" }}>
                          Grabando nota de voz…
                        </span>
                        <button
                          className="cg-focus ml-auto"
                          style={{ color: 'var(--bad-text)' }}
                          title={t('actions.cancel')}
                          onClick={() => recorder.cancel()}
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <textarea
                        className="cg-input max-h-32 min-h-[40px] flex-1 resize-none px-3.5 py-2 text-sm"
                        placeholder={t('ui.MessengerPage.escribeUnMensaje')}
                        rows={1}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
                      />
                    )}
                    {recorder.supported &&
                      !draft.trim() &&
                      pending.length === 0 && (
                        <button
                          className={`cg-focus grid h-10 w-10 shrink-0 place-items-center rounded-xl disabled:opacity-50 ${recorder.recording ? "cg-btn-bad" : "cg-btn-brand"}`}
                        disabled={uploading}
                        title={recorder.recording ? "Detener y enviar" : "Grabar nota de voz"}
                        onClick={onToggleRecord}
                        >
                          {recorder.recording ? (
                            <Send size={16} />
                          ) : (
                            <Mic size={16} />
                          )}
                        </button>
                      )}
                    {(!recorder.supported ||
                      draft.trim() ||
                      pending.length > 0) && (
                      <button
                        className="cg-btn-brand cg-focus grid h-10 w-10 shrink-0 place-items-center rounded-xl disabled:opacity-50"
                        disabled={sending || uploading || recorder.recording || (!draft.trim() && pending.length === 0)}
                        onClick={onSend}
                      >
                        {sending ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Send size={16} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {composeOpen && (
        <ComposeDialog
          scope={scope}
          onClose={() => setComposeOpen(false)}
          onSent={(conv) => {
            setComposeOpen(false);
            loadConversations();
            const c = conv as Conversation;
            setSelected(c);
            loadThread(c, true);
          }}
        />
      )}

      {membersOpen && selected?.isGroup && (
        <MembersPanel
          conversation={selected}
          onChanged={() => loadConversations()}
          onClose={() => setMembersOpen(false)}
        />
      )}
    </AppLayout>
  );
}

function ComposeDialog({
  scope,
  onClose,
  onSent,
}: {
  scope: "operational" | "client";
  onClose: () => void;
  onSent: (conv: unknown) => void;
}) {
  const { t } = useTranslation();
  const isClient = scope === "client";
  const [mode, setMode] = useState<"direct" | "group">("direct");
  // Direct mode
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);
  const [picked, setPicked] = useState<{ id: string; label: string } | null>(
    null,
  );
  const [body, setBody] = useState("");
  // Group mode
  const [groupName, setGroupName] = useState("");
  const [siteQ, setSiteQ] = useState("");
  const [siteResults, setSiteResults] = useState<
    { id: string; label: string }[]
  >([]);
  const [site, setSite] = useState<{ id: string; label: string } | null>(null);
  const [oneWay, setOneWay] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (mode !== "direct") return;
    let active = true;
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      try {
        if (isClient) {
          const res: unknown = await clientService.autocomplete(q.trim(), 15);
          const rows: AcRow[] = Array.isArray(res)
            ? (res as AcRow[])
            : (res as { rows?: AcRow[] })?.rows || [];

          if (active)
            setResults(
              rows
                .filter((r) => r && r.id)
                .map((r) => ({
                  id: r.id,
                  label: r.label || r.name || "Cliente",
                })),
            );
        } else {
          const res = await securityGuardService.autocomplete(q.trim(), 15);
          const rows = Array.isArray(res) ? res : res?.rows || [];

          if (active)
            setResults(
              rows
                .filter(
                  (r: AcRow) => r && r.id && !String(r.id).startsWith("sg:"),
                )
                .map((r: AcRow) => ({
                  id: r.id,
                  label: r.label || r.name || "Vigilante",
                })),
            );
        }
      } catch {
        /* ignore */
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, mode]);

  useEffect(() => {
    if (mode !== "group") return;
    let active = true;
    const t = setTimeout(async () => {
      if (!siteQ.trim()) {
        setSiteResults([]);
        return;
      }
      try {
        const res: unknown = await postSiteService.autocomplete(siteQ.trim());
        const rows: AcRow[] = Array.isArray(res)
          ? (res as AcRow[])
          : (res as { rows?: AcRow[]; data?: AcRow[] })?.rows ||
            (res as { data?: AcRow[] })?.data ||
            [];

        if (active)
          setSiteResults(
            rows
              .filter((r) => r && r.id)
              .map((r) => ({
                id: r.id,
                label: r.label || r.companyName || r.name || "Puesto",
              })),
          );
      } catch {
        /* ignore */
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [siteQ, mode]);

  const sendDirect = async () => {
    if (!picked || !body.trim() || sending) return;
    setSending(true);
    try {
      const res = await messageService.createConversation({
        recipientType: isClient ? "client" : "guard",
        recipientId: picked.id,
        body: body.trim(),
      });

      onSent(res?.conversation || res);
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.MessengerPage.noSePudoEnviar", "No se pudo enviar"),
      );
    } finally {
      setSending(false);
    }
  };

  const createGroup = async () => {
    if (!groupName.trim() || !site || sending) return;
    setSending(true);
    try {
      const res = await messageService.createGroup({
        name: groupName.trim(),
        anchorType: "postSite",
        anchorId: site.id,
        isOneWay: oneWay,
        body: body.trim() || undefined,
      });
      const c = res?.conversation || {};

      onSent({
        id: c.id,
        kind: "group",
        isGroup: true,
        recipientType: "guard",
        recipientName: c.subject || groupName.trim(),
        subject: c.subject,
        isOneWay: c.isOneWay,
        memberCount: (res?.members || []).length,
      });
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.MessengerPage.noSePudoCrearElGrupo",
            "No se pudo crear el grupo",
          ),
      );
    } finally {
      setSending(false);
    }
  };

  const tabLabel = (icon: ReactNode, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      {icon} {label}
    </span>
  );

  return (
    <Modal
      open
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>{i18n.t('actions.cancel')}</Button>
          {mode === "direct" ? (
            <Button onClick={sendDirect} disabled={!picked || !body.trim() || sending}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar
            </Button>
          ) : (
            <Button onClick={createGroup} disabled={!groupName.trim() || !site || sending}>
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />} Crear grupo
            </Button>
          )}
        </>
      )}
      icon={<Plus className="h-5 w-5" />}
      title={i18n.t('ui.MessengerPage.nuevo')}
      onOpenChange={(o) => { if (!o) onClose(); }}
    >
      <div className="space-y-3">
        {/* Groups are an operational feature (vigilantes by puesto); clients only get direct chats. */}
        {!isClient && (
          <Segmented
            className="w-full [&>button]:flex-1"
            options={[
              {
                value: "direct" as const,
                label: tabLabel(<UserCircle2 size={14} />, "Directo"),
              },
              {
                value: "group" as const,
                label: tabLabel(<Users size={14} />, "Grupo"),
              },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}

        {mode === "direct" ? (
          <>
            {picked ? (
              <div className="glass-flat glass-brand flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium">{picked.label}</span>
                <button
                  onClick={() => setPicked(null)}
                  className="cg-focus"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--ink-faint)" }}
                  />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={
                      isClient ? "Buscar cliente…" : "Buscar vigilante…"
                    }
                    className="cg-input w-full py-2 pl-9 pr-3 text-sm"
                  />
                </div>
                {results.length > 0 && (
                  <div
                    className="mt-2 max-h-44 overflow-auto rounded-xl border"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    {results.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setPicked(r);
                          setResults([]);
                          setQ("");
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Mensaje…"
              rows={4}
              className="cg-input w-full resize-none px-3 py-2 text-sm"
            />
          </>
        ) : (
          <>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={i18n.t("ui.MessengerPage.nombreDelGrupo")}
              className="cg-input w-full px-3 py-2 text-sm"
            />
            {site ? (
              <div className="glass-flat glass-brand flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium">
                  Puesto: {site.label}
                </span>
                <button
                  onClick={() => setSite(null)}
                  className="cg-focus"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--ink-faint)" }}
                  />
                  <input
                    value={siteQ}
                    onChange={(e) => setSiteQ(e.target.value)}
                    placeholder={i18n.t("ui.MessengerPage.buscarPuestoSitio")}
                    className="cg-input w-full py-2 pl-9 pr-3 text-sm"
                  />
                </div>
                {siteResults.length > 0 && (
                  <div
                    className="mt-2 max-h-44 overflow-auto rounded-xl border"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    {siteResults.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          setSite(r);
                          setSiteResults([]);
                          setSiteQ("");
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                )}
                <p
                  className="mt-1.5 text-[11px]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {i18n.t("ui.MessengerPage.losVigilantesAsignadosAEste")}
                </p>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={oneWay}
                onCheckedChange={(v) => setOneWay(Boolean(v))}
              />
              {t(
                "ui.MessengerPage.soloAnunciosLosMiembrosNo",
                "Solo anuncios (los miembros no pueden responder)",
              )}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Primer mensaje (opcional)…"
              rows={3}
              className="cg-input w-full resize-none px-3 py-2 text-sm"
            />
          </>
        )}
      </div>
    </Modal>
  );
}

/** Slide-over panel: list group members, add (guard autocomplete), remove, resync. */
function MembersPanel({
  conversation,
  onClose,
  onChanged,
}: {
  conversation: Conversation;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; label: string }[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await messageService.listMembers(conversation.id);
      setMembers(res?.rows || []);
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t(
            "ui.MessengerPage.noSePudieronCargarLosMiembros",
            "No se pudieron cargar los miembros",
          ),
      );
    } finally {
      setLoading(false);
    }
  }, [conversation.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([]);
        return;
      }
      try {
        const res = await securityGuardService.autocomplete(q.trim(), 15);
        const rows = Array.isArray(res) ? res : res?.rows || [];

        if (active)
          setResults(
            rows
              .filter(
                (r: AcRow) => r && r.id && !String(r.id).startsWith("sg:"),
              )
              .map((r: AcRow) => ({
                id: r.id,
                label: r.label || r.name || "Vigilante",
              })),
          );
      } catch {
        /* ignore */
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  const addMember = async (userId: string) => {
    setBusy(true);
    try {
      const res = await messageService.addMembers(conversation.id, [userId]);
      setMembers(res?.rows || []);
      setQ("");
      setResults([]);
      onChanged();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.MessengerPage.noSePudoAnadir", "No se pudo añadir"),
      );
    } finally {
      setBusy(false);
    }
  };
  const removeMember = async (userId: string) => {
    setBusy(true);
    try {
      const res = await messageService.removeMember(conversation.id, userId);
      setMembers(res?.rows || []);
      onChanged();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "No se pudo quitar");
    } finally {
      setBusy(false);
    }
  };
  const resync = async () => {
    setBusy(true);
    try {
      const res = await messageService.resyncMembers(conversation.id);
      setMembers(res?.rows || []);
      onChanged();
      toast.success(
        t("ui.MessengerPage.miembrosActualizadosDesdeLasAsignaciones"),
      );
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.MessengerPage.noSePudoSincronizar", "No se pudo sincronizar"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "oklch(0 0 0 / 0.5)" }}
      onClick={onClose}
    >
      <div
        className="glass-raised flex h-full w-full max-w-sm flex-col rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b p-4"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">
              {conversation.recipientName}
            </h3>
            <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {members.length} miembros
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("actions.close")}
            className="cg-focus"
            style={{ color: "var(--ink-soft)" }}
          >
            <X size={18} />
          </button>
        </div>
        <div
          className="border-b p-3"
          style={{ borderColor: "var(--hairline)" }}
        >
          <div className="relative">
            <UserPlus
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--ink-faint)" }}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t(
                "ui.Messenger.anadirVigilante",
                "Añadir vigilante…",
              )}
              disabled={busy}
              className="cg-input w-full py-2 pl-9 pr-3 text-sm"
            />
          </div>
          {results.length > 0 && (
            <div
              className="mt-2 max-h-40 overflow-auto rounded-xl border"
              style={{ borderColor: "var(--hairline)" }}
            >
              {results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => addMember(r.id)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={resync}
            disabled={busy}
            className="cg-btn-glass cg-focus mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw className={busy ? "animate-spin" : ""} size={13} />{" "}
            {t(
              "ui.MessengerPage.sincronizarConAsignaciones",
              "Sincronizar con asignaciones",
            )}
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-auto p-2">
          {loading ? (
            <SkeletonCards className="sm:grid-cols-1" count={4} />
          ) : members.length === 0 ? (
            <EmptyState
              description={t('ui.MessengerPage.anadeVigilantesConElBuscador')}
              icon={<Users />}
              title={t('ui.MessengerPage.elGrupoNoTieneMiembros')}
            />
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="glass-flat flex items-center gap-3 px-3 py-2"
              >
                <div
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[10px] font-bold"
                  style={{
                    background: "var(--brand-wash)",
                    borderColor: "var(--brand-line)",
                    color: "var(--brand-text)",
                  }}
                >
                  {(m.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p
                    className="text-[10px]"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {m.participantType === "staff" ? "Operador" : "Vigilante"}
                    {m.role === "admin" ? " · Admin" : ""}
                    {m.source === "auto" ? " · Auto" : ""}
                  </p>
                </div>
                {m.role !== "admin" && (
                  <button
                    className="cg-focus grid h-7 w-7 place-items-center rounded-lg disabled:opacity-50"
                    disabled={busy}
                    style={{ color: 'var(--bad-text)' }}
                    title="Quitar"
                    onClick={() => removeMember(m.userId)}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

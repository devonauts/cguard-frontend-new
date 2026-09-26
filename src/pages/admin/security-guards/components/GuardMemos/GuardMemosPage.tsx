import type { GuardDetail } from "../../guardDetailTypes";

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Plus,
  FileText,
  CheckCircle2,
  Clock,
  Trash2,
  X,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import { useRegistroDeFicha } from "@/layouts/FichaPersona";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { localeActual } from "@/lib/localeActual";
import {
  PageContainer,
  PageHeader,
  Section,
  StatusBadge,
  IconTile,
  EmptyState,
  SkeletonCards,
  Field,
  SearchInput,
} from "@/components/kit";

type Memo = {
  id: string;
  subject?: string;
  content?: string;
  dateTime?: string;
  createdAt?: string;
  wasAccepted?: boolean;
  createdBy?:
    | { firstName?: string; lastName?: string; email?: string }
    | string;
};

function authorName(m: Memo): string {
  const cb = m.createdBy;

  if (!cb) return "—";
  if (typeof cb === "string") return cb;

  return `${cb.firstName || ""} ${cb.lastName || ""}`.trim() || cb.email || "—";
}

function fmt(value?: string): string {
  if (!value) return "";
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return String(value);

  return d.toLocaleString(localeActual(), {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function GuardMemosPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [guard, setGuard] = useState<GuardDetail | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject: "", content: "" });

  const tenantId = localStorage.getItem("tenantId") || "";

  // El vigilante, para el contexto de la cabecera. Lo trae la ruta padre: esta
  // pestaña ya no lo pide por su cuenta.
  const { registro } = useRegistroDeFicha(id);

  useEffect(() => {
    if (!registro) return;
    const data = registro as
      | (GuardDetail & { firstName?: string; lastName?: string })
      | { guard: GuardDetail & { firstName?: string; lastName?: string } };
    const g = (
      "guard" in data && data.guard ? data.guard : data
    ) as GuardDetail & {
      firstName?: string;
      lastName?: string;
    };
    const fullName =
      g.fullName ?? `${g.firstName ?? ""} ${g.lastName ?? ""}`.trim();

    setGuard({ ...g, fullName });
  }, [registro]);

  const loadMemos = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: resp } = await api.get<{ rows?: Memo[] } | Memo[]>(
        `/tenant/${tenantId}/memos?filter[guardName]=${id}&orderBy=dateTime_DESC&limit=200`,
      );
      const rows: Memo[] = Array.isArray(resp) ? resp : (resp?.rows ?? []);

      setMemos(rows);
    } catch {
      toast.error(
        t("guards.memos.loadError", {
          defaultValue: "No se pudieron cargar los memos",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMemos();
  }, [id]);

  const handleCreate = async () => {
    if (!form.subject.trim()) {
      toast.error(
        t("guards.memos.subjectRequired", {
          defaultValue: "El asunto es obligatorio",
        }),
      );

      return;
    }
    setSaving(true);
    try {
      await api.post(`/tenant/${tenantId}/memos`, {
        data: {
          subject: form.subject.trim(),
          content: form.content.trim(),
          dateTime: new Date().toISOString(),
          guardName: id,
          wasAccepted: false,
        },
      });
      toast.success(
        t("guards.memos.created", {
          defaultValue: "Memo enviado al vigilante",
        }),
      );
      setShowModal(false);
      setForm({ subject: "", content: "" });
      await loadMemos();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("guards.memos.createError", {
            defaultValue: "No se pudo enviar el memo",
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (memoId: string) => {
    try {
      await api.delete(
        `/tenant/${tenantId}/memos?ids[]=${encodeURIComponent(memoId)}`,
      );
      setMemos((prev) => prev.filter((m) => m.id !== memoId));
      toast.success(
        t("guards.memos.deleted", { defaultValue: "Memo eliminado" }),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("guards.memos.deleteError", {
            defaultValue: "No se pudo eliminar",
          }),
      );
    }
  };

  const filtered = memos.filter((m) => {
    if (!query.trim()) return true;
    const s = query.toLowerCase();

    return (
      (m.subject || "").toLowerCase().includes(s) ||
      (m.content || "").toLowerCase().includes(s)
    );
  });

  const acceptedCount = memos.filter((m) => m.wasAccepted).length;
  const pendingCount = memos.length - acceptedCount;
  const guardInitials = (guard?.fullName || "")
    .split(" ")
    .map((p: string) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.memos">
        <PageContainer>
          <PageHeader
            actions={
              <Button
                onClick={() => {
                  setForm({ subject: "", content: "" });
                  setShowModal(true);
                }}
              >
                <Plus />
                {t("guards.memos.addButton", { defaultValue: "Nuevo memo" })}
              </Button>
            }
            badges={
              <>
                <StatusBadge dot={false} tone="neutral">
                  <FileText size={12} /> {memos.length}{" "}
                  {t("guards.memos.total", { defaultValue: "memos" })}
                </StatusBadge>
                <StatusBadge tone="ok">
                  {acceptedCount}{" "}
                  {t("guards.memos.accepted", { defaultValue: "Aceptado" })}
                </StatusBadge>
                <StatusBadge tone="warn">
                  {pendingCount}{" "}
                  {t("guards.memos.pending", { defaultValue: "Pendiente" })}
                </StatusBadge>
              </>
            }
            icon={
              guardInitials ? (
                <span className="text-base font-bold">{guardInitials}</span>
              ) : (
                <FileText />
              )
            }
            subtitle={
              guard?.fullName
                ? `${t("guards.memos.subtitle", { defaultValue: "Comunicados dirigidos a este vigilante." })} · ${guard.fullName}`
                : t("guards.memos.subtitle", {
                    defaultValue: "Comunicados dirigidos a este vigilante.",
                  })
            }
            title={t("guards.memos.title", { defaultValue: "Memos" })}
          />

          {/* ── FEED ─────────────────────────────────────────────────────────── */}
          <Section
            action={
              <SearchInput
                placeholder={t("guards.memos.searchPlaceholder", {
                    defaultValue: "Buscar memo...",
                  })}
                type="text"
                value={query}
                onChange={(v) => setQuery(v)}
              />
            }
            title={t("guards.memos.feedTitle", {
              defaultValue: "Historial de memos",
            })}
          >
            {/* List */}
            {loading ? (
              <SkeletonCards className="sm:grid-cols-1" count={3} />
            ) : filtered.length === 0 ? (
              <EmptyState
                action={
                  !query.trim() ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setForm({ subject: "", content: "" });
                        setShowModal(true);
                      }}
                    >
                      <Plus />
                      {t("guards.memos.addButton", {
                        defaultValue: "Nuevo memo",
                      })}
                    </Button>
                  ) : undefined
                }
                description={
                  query.trim()
                    ? t("guards.memos.noResultsHint", {
                        defaultValue: "Ningún memo coincide con tu búsqueda.",
                      })
                    : t("guards.memos.empty.message", {
                        defaultValue: "Este vigilante aún no tiene memos.",
                      })
                }
                icon={<FileText />}
                title={
                  query.trim()
                    ? t("guards.memos.noResults", {
                        defaultValue: "Sin resultados",
                      })
                    : t("guards.memos.empty.title", {
                        defaultValue: "Sin memos todavía",
                      })
                }
              />
            ) : (
              <div className="space-y-3">
                {filtered.map((m) => (
                  <div key={m.id} className="glass-flat glass-hover group p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">
                            {m.subject || "—"}
                          </span>
                          {m.wasAccepted ? (
                            <StatusBadge dot={false} tone="ok">
                              <CheckCircle2 size={12} />{" "}
                              {t("guards.memos.accepted", {
                                defaultValue: "Aceptado",
                              })}
                            </StatusBadge>
                          ) : (
                            <StatusBadge dot={false} tone="warn">
                              <Clock size={12} />{" "}
                              {t("guards.memos.pending", {
                                defaultValue: "Pendiente",
                              })}
                            </StatusBadge>
                          )}
                        </div>
                        {m.content && (
                          <p
                            className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {m.content}
                          </p>
                        )}
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mt-2.5">
                          {fmt(m.dateTime || m.createdAt)} ·{" "}
                          {t("guards.memos.by", { defaultValue: "por" })}{" "}
                          {authorName(m)}
                        </p>
                      </div>
                      <button
                        aria-label={t("ui.GuardMemosPage.eliminarMemo", "Eliminar memo")}
                        className="cg-focus shrink-0 rounded-lg p-1.5 opacity-60 transition hover:[color:var(--bad-text)] group-hover:opacity-100"
                        style={{ color: "var(--ink-faint)" }}
                        onClick={() => handleDelete(m.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </PageContainer>

        {/* Create modal */}
        {showModal && (
          <div
            className="glass-scrim fixed inset-0 z-50"
            onClick={() => setShowModal(false)}
          >
            <div
              className="glass-raised fixed bottom-0 right-0 top-0 flex w-full max-w-md flex-col overflow-y-auto rounded-l-3xl rounded-r-none"
              style={{ position: "fixed" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b sticky top-0 z-10 [background:var(--glass-solid)]">
                <div className="flex items-center gap-2.5">
                  <IconTile size="sm">
                    <Send />
                  </IconTile>
                  <h2 className="text-base font-semibold tracking-tight">
                    {t("guards.memos.modal.title", {
                      defaultValue: "Nuevo memo",
                    })}
                  </h2>
                </div>
                <Button
                  aria-label={t("common.cancel", { defaultValue: "Cancelar" })}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => setShowModal(false)}
                >
                  <X />
                </Button>
              </div>

              <div className="p-5 space-y-5 flex-1">
                {guard?.fullName && (
                  <div className="glass-sunken px-3 py-2.5">
                    <Field
                      label={t("guards.memos.modal.to", {
                        defaultValue: "Para",
                      })}
                      value={guard.fullName}
                    />
                  </div>
                )}
                <div>
                  <label className="cg-eyebrow mb-1.5 block">
                    {t("guards.memos.form.subject", { defaultValue: "Asunto" })}{" "}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </label>
                  <Input
                    className="h-9 text-sm"
                    placeholder={t("guards.memos.form.subjectPlaceholder", {
                      defaultValue: "Asunto del memo",
                    })}
                    type="text"
                    value={form.subject}
                    onChange={(e) =>
                      setForm({ ...form, subject: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="cg-eyebrow mb-1.5 block">
                    {t("guards.memos.form.content", {
                      defaultValue: "Contenido",
                    })}
                  </label>
                  <textarea
                    className="cg-input w-full resize-none px-3 py-2 text-sm leading-relaxed"
                    placeholder={t("guards.memos.form.contentPlaceholder", {
                      defaultValue: "Escribe el memo...",
                    })}
                    rows={8}
                    value={form.content}
                    onChange={(e) =>
                      setForm({ ...form, content: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 p-5 border-t sticky bottom-0 [background:var(--glass-solid)]">
                <Button variant="ghost" onClick={() => setShowModal(false)}>
                  {t("common.cancel", { defaultValue: "Cancelar" })}
                </Button>
                <Button disabled={saving} onClick={handleCreate}>
                  {saving && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {saving
                    ? t("common.saving", { defaultValue: "Enviando..." })
                    : t("guards.memos.modal.send", { defaultValue: "Enviar" })}
                </Button>
              </div>
            </div>
          </div>
        )}
      </GuardsLayout>
    </AppLayout>
  );
}

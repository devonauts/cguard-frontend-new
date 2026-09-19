import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ClipboardSignature, Repeat, ListChecks, ImageOff } from "lucide-react";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  StatusBadge,
  EmptyState,
  Modal,
  Field,
  Segmented,
  SmartImage,
} from "@/components/kit";
import passdownService, {
  type Passdown,
  type PassdownDetail,
  type PassdownStatus,
} from "@/lib/api/passdownService";
import i18n from "@/i18n";

import { localeActual } from "@/lib/localeActual";
function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(localeActual());
}

const PRIORITY_META: Record<
  string,
  { label: string; tone: "bad" | "warn" | "neutral" }
> = {
  alta: { label: "Alta", tone: "bad" },
  media: { label: "Media", tone: "warn" },
  baja: { label: "Baja", tone: "neutral" },
};

const FILTERS: Array<{ key: PassdownStatus | "all"; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "open", label: "Abiertos" },
  { key: "received", label: "Recibidos" },
];

function StatusPill({ status }: { status: PassdownStatus }) {
  return status === "received" ? (
    <StatusBadge tone="ok">Recibido</StatusBadge>
  ) : (
    <StatusBadge tone="warn">
      {i18n.t("ui.PassdownsPage.pendienteDeRecibir")}
    </StatusBadge>
  );
}

function imageSrc(img: {
  downloadUrl?: string | null;
  publicUrl?: string | null;
}): string | null {
  return img.downloadUrl || img.publicUrl || null;
}

export default function PassdownsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Passdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PassdownStatus | "all">("all");

  const [detail, setDetail] = useState<PassdownDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    passdownService
      .list({ status: filter === "all" ? undefined : filter, limit: 200 })
      .then((r) => setRows(r.rows || []))
      .catch((e: any) =>
        toast.error(e?.message || "Error al cargar los pases de turno"),
      )
      .finally(() => setLoading(false));
  }, [filter]);
  useEffect(load, [load]);

  const openDetail = async (row: Passdown) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailLoading(true);
    try {
      const r = await passdownService.get(row.id);
      setDetail(r.passdown);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("passdown.loadDetailError", "No se pudo cargar el pase de turno"),
      );
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const columns: Column<Passdown>[] = [
    {
      key: "stationName",
      header: "Puesto",
      render: (_v, r) => (
        <span className="flex items-center gap-1.5 font-semibold">
          {r.stationName ||
            ((r as any).channel === "supervisor" ? "Supervisión" : "—")}
          {(r as any).channel === "supervisor" && (
            <StatusBadge tone="warn" dot={false}>
              {t("comun.supervisor")}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      key: "outgoingGuardName",
      header: "Vigilante saliente",
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.outgoingGuardName || "—"}
        </span>
      ),
    },
    {
      key: "shiftLabel",
      header: "Turno",
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.shiftLabel || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Estado",
      render: (_v, r) => <StatusPill status={r.status} />,
    },
    {
      key: "instructionCount",
      header: "Consignas",
      render: (_v, r) => (
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          {r.instructionCount ?? 0}
        </span>
      ),
    },
    {
      key: "createdAt",
      header: "Creado",
      render: (_v, r) => (
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          {fmtDate(r.createdAt)}
        </span>
      ),
    },
    {
      key: "receivedByName",
      header: "Recibido por",
      render: (_v, r) =>
        r.status === "received" ? (
          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {r.receivedByName || "—"}
            {r.receivedAt ? ` · ${fmtDate(r.receivedAt)}` : ""}
          </span>
        ) : (
          <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
            —
          </span>
        ),
    },
  ];

  return (
    <AppLayout>
      <div>
        <PageContainer width="wide">
          <PageHeader
            icon={<ClipboardSignature />}
            title={t("ui.PassdownsPage.pasesDeTurno")}
            subtitle={t("ui.PassdownsPage.entregasDeTurnoDeLos")}
          />

          <Section
            title={t("ui.PassdownsPage.pasesDeTurno")}
            icon={<Repeat />}
            action={
              <Segmented<PassdownStatus | "all">
                value={filter}
                onChange={setFilter}
                options={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
              />
            }
          >
            {loading ? (
              <SkeletonCards count={4} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<ClipboardSignature />}
                title={t("ui.PassdownsPage.noHayPasesDeTurno")}
                description={t(
                  "ui.PassdownsPage.cuandoLosVigilantesRegistrenLa",
                )}
              />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                onRowClick={openDetail}
              />
            )}
          </Section>
        </PageContainer>
      </div>

      <Modal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        icon={<ClipboardSignature />}
        title={t("ui.PassdownsPage.paseDeTurno")}
        description={detail?.shiftLabel || undefined}
        size="lg"
      >
        {detailLoading || !detail ? (
          <SkeletonCards count={2} />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label={t("comun.puesto")} value={detail.stationName} />
              <Field
                label={t("ui.PassdownsPage.vigilanteSaliente")}
                value={detail.outgoingGuardName}
              />
              <Field label={t("comun.turno")} value={detail.shiftLabel} />
              <Field label="Creado" value={fmtDate(detail.createdAt)} />
              <div className="min-w-0">
                <div className="cg-eyebrow mb-1">{t("comun.estado")}</div>
                <StatusPill status={detail.status} />
              </div>
              {detail.status === "received" && (
                <Field
                  label={t("ui.PassdownsPage.recibidoPor")}
                  value={
                    detail.receivedByName
                      ? `${detail.receivedByName}${detail.receivedAt ? ` · ${fmtDate(detail.receivedAt)}` : ""}`
                      : "—"
                  }
                />
              )}
            </div>

            <div>
              <div className="cg-eyebrow mb-1">Novedades</div>
              <p
                className="glass-sunken whitespace-pre-wrap p-3 text-sm"
                style={{ color: "var(--ink)" }}
              >
                {detail.notes?.trim() ||
                  t("passdown.noNotes", "Sin novedades registradas.")}
              </p>
            </div>

            {detail.passdownImages && detail.passdownImages.length > 0 && (
              <div>
                <div className="cg-eyebrow mb-2">
                  {t("ui.Passdowns.imagenes", "Imágenes")}
                </div>
                <div className="flex flex-wrap gap-3">
                  {detail.passdownImages.map((img, i) => {
                    const src = imageSrc(img);
                    return src ? (
                      <a
                        key={i}
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        className="glass-flat block h-24 w-24 overflow-hidden"
                      >
                        <SmartImage
                          src={src}
                          alt={`Imagen del pase ${i + 1}`}
                          fit="cover"
                          className="h-full w-full"
                          fallback={
                            <span
                              className="grid h-full w-full place-items-center [&_svg]:size-6"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              <ImageOff />
                            </span>
                          }
                        />
                      </a>
                    ) : (
                      <div
                        key={i}
                        className="glass-sunken flex h-24 w-24 items-center justify-center [&_svg]:size-6"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        <ImageOff />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div
                className="mb-2 flex items-center gap-2 [&_svg]:size-4"
                style={{ color: "var(--brand-text)" }}
              >
                <ListChecks />
                <span className="cg-eyebrow">
                  Consignas ({detail.instructions?.length ?? 0})
                </span>
              </div>
              {detail.instructions && detail.instructions.length > 0 ? (
                <div className="space-y-2">
                  {detail.instructions.map((ins) => {
                    const pr =
                      PRIORITY_META[ins.priority || "media"] ||
                      PRIORITY_META.media;
                    return (
                      <div
                        key={ins.id}
                        className="glass-flat flex items-start justify-between gap-3 p-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            {ins.taskToDo}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <StatusBadge tone={pr.tone}>{pr.label}</StatusBadge>
                            {ins.completionNotes && (
                              <span
                                className="text-xs"
                                style={{ color: "var(--ink-soft)" }}
                              >
                                {ins.completionNotes}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {ins.wasItDone ? (
                            <StatusBadge tone="ok">Realizada</StatusBadge>
                          ) : (
                            <StatusBadge tone="neutral">
                              {t("comun.pendiente")}
                            </StatusBadge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t("ui.PassdownsPage.sinConsignasRegistradas")}
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

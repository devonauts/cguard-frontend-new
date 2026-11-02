import type { Client } from "@/types/client";
import type { LucideIcon } from "lucide-react";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  File as FileIcon,
  Files,
  HardDrive,
  FolderOpen,
  CalendarPlus,
  Upload,
  Download,
  Trash2,
  X,
  Clock,
  FolderPlus,
} from "lucide-react";

import {
  FIELD_CLS,
  LabeledField,
  TabTable,
  THead,
  Th,
  Tr,
  RowAction,
  RowActions,
  Pager,
  TabFooter,
  TabLoading,
  KpiTile,
} from "../_shared/tab-kit";

import DocumentPackets from "./DocumentPackets";

import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import { clientService } from "@/lib/api/clientService";
import securityGuardService from "@/lib/api/securityGuardService";
import {
  Section,
  EmptyState,
  StatusBadge,
  Modal,
  IconTile,
  SearchInput,
} from "@/components/kit";
import { Donut, MeterBar } from "@/components/charts";
import { seriesVar } from "@/lib/chartColors";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import i18n from "@/i18n";
// ── Shape of GET /client-account/:id/documents (clientAccountDocuments.ts) ──
interface DocRow {
  id: string;
  code: string;
  name: string;
  category: string;
  type: string;
  cls: "documents" | "images" | "videos" | "others";
  sizeInBytes: number;
  sizeLabel: string;
  uploadedBy: string;
  createdAt: string;
  downloadUrl: string | null;
}
interface DocCategory {
  name: string;
  count: number;
}
interface DocActivity {
  id: string;
  name: string;
  user: string;
  at: string;
  action: string;
}
interface DocBreakdownEntry {
  bytes: number;
  label: string;
}
interface DocBreakdown {
  documents: DocBreakdownEntry;
  images: DocBreakdownEntry;
  videos: DocBreakdownEntry;
  others: DocBreakdownEntry;
}
interface DocKpis {
  total: number;
  uploadedThisMonth: number;
  categoriesCount: number;
  storageUsedBytes: number;
  storageUsedLabel: string;
  capBytes: number;
  capLabel: string;
  usedPct: number;
}
interface DocumentsData {
  kpis: DocKpis;
  breakdown: DocBreakdown;
  categories: DocCategory[];
  recentActivity: DocActivity[];
  types: string[];
  total: number;
  page: number;
  perPage: number;
  documents: DocRow[];
  updatedAt: string;
}

/** El tipo de archivo se distingue por ICONO, no por color propio: la paleta es
 *  acromática + un acento, y ocho colores de archivo la romperían. */
type IconTone = "brand" | "neutral" | "ok" | "warn" | "bad" | "info";
const TYPE_META: Record<string, { icon: LucideIcon; tone: IconTone }> = {
  PDF: { icon: FileText, tone: "bad" },
  Excel: { icon: FileSpreadsheet, tone: "ok" },
  Word: { icon: FileText, tone: "info" },
  PowerPoint: { icon: FileText, tone: "warn" },
  Imagen: { icon: FileImage, tone: "brand" },
  Video: { icon: FileImage, tone: "brand" },
  Comprimido: { icon: FileArchive, tone: "warn" },
  Texto: { icon: FileText, tone: "neutral" },
};
const typeMeta = (t: string) =>
  TYPE_META[t] || { icon: FileIcon, tone: "neutral" as IconTone };

const CATEGORIES = [
  "Post Orders",
  "Manuales",
  "Procedimientos",
  "Reportes",
  "Políticas",
  "Contratos",
  "Mapas",
  "Capacitación",
  "Planos",
  "Otros",
];
/** La categoría se guarda en español (es un valor del API); se traduce al pintar. */
const CAT_KEY: Record<string, string> = {
  "Post Orders": "ui.ClientDocuments.cat.postOrders",
  Manuales: "ui.ClientDocuments.cat.manuales",
  Procedimientos: "ui.ClientDocuments.cat.procedimientos",
  Reportes: "ui.ClientDocuments.cat.reportes",
  Políticas: "ui.ClientDocuments.cat.politicas",
  Contratos: "ui.ClientDocuments.cat.contratos",
  Mapas: "ui.ClientDocuments.cat.mapas",
  Capacitación: "ui.ClientDocuments.cat.capacitacion",
  Planos: "ui.ClientDocuments.cat.planos",
  Otros: "ui.ClientDocuments.cat.otros",
};
const catLabel = (c?: string | null) =>
  c && CAT_KEY[c] ? i18n.t(CAT_KEY[c], c) : c || "";
/** Igual con el tipo de archivo que calcula el servidor. */
const TYPE_KEY: Record<string, string> = {
  Imagen: "ui.ClientDocuments.tipo.imagen",
  Video: "ui.ClientDocuments.tipo.video",
  Comprimido: "ui.ClientDocuments.tipo.comprimido",
  Texto: "ui.ClientDocuments.tipo.texto",
};
const typeLabel = (v?: string | null) =>
  v && TYPE_KEY[v] ? i18n.t(TYPE_KEY[v], v) : v || "";
/* Cuatro tipos de archivo: categorías sin orden, a los escalones de serie del
   acento y siempre en la misma posición. */
// Constante de módulo: guarda la CLAVE junto al texto por defecto. Se traduce
// donde se pinta (leyenda del anillo, más abajo).
const BREAK_META = [
  {
    key: "documents",
    labelKey: "clients.documents.breakdown.documents",
    label: "Documentos",
    color: seriesVar(0),
  },
  {
    key: "images",
    labelKey: "clients.documents.breakdown.images",
    label: "Imágenes",
    color: seriesVar(1),
  },
  {
    key: "videos",
    labelKey: "clients.documents.breakdown.videos",
    label: "Vídeos",
    color: seriesVar(2),
  },
  {
    key: "others",
    labelKey: "clients.documents.breakdown.others",
    label: "Otros",
    color: seriesVar(3),
  },
];

const fmtDT = (iso: string) => {
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
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);

  if (s < 60)
    return i18n.t("ui.ClientDocuments.haceInstantes", "hace instantes");
  if (s < 3600)
    return i18n.t("ui.ClientDocuments.haceMin", {
      defaultValue: "hace {{n}} min",
      n: Math.floor(s / 60),
    });
  if (s < 86400)
    return i18n.t("ui.ClientDocuments.haceH", {
      defaultValue: "hace {{n}} h",
      n: Math.floor(s / 3600),
    });

  return i18n.t("ui.ClientDocuments.haceDias", {
    defaultValue: "hace {{count}} días",
    count: Math.floor(s / 86400),
  });
};

export default function ClientDocuments({ client }: { client: Client }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [data, setData] = useState<DocumentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;

  /* ── Marcar documentos para entregarlos juntos ────────────────────────────
     La biblioteca era de sólo mirar: se subía y se borraba. Marcar es lo que
     convierte «tengo diez archivos sueltos del mes» en «esto es la entrega de
     septiembre». La selección vive por ID y sobrevive a cambiar de página del
     listado: armar una entrega de doce documentos con paginación de diez, si no,
     era imposible. */
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const marcadosIds = useMemo(
    () => Object.keys(marcados).filter((k) => marcados[k]),
    [marcados],
  );
  const [agruparOpen, setAgruparOpen] = useState(false);
  const [gNombre, setGNombre] = useState("");
  const [gDesde, setGDesde] = useState("");
  const [gHasta, setGHasta] = useState("");
  const [gNota, setGNota] = useState("");
  const [creando, setCreando] = useState(false);
  /** Sube cuando se crea una carpeta: le dice al panel de entregas que recargue. */
  const [packetsKey, setPacketsKey] = useState(0);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [upCategory, setUpCategory] = useState("Otros");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await clientService.getClientDocuments(client.id, {
        q: q.trim() || undefined,
        category: category || undefined,
        type: type || undefined,
        page,
        perPage,
      });

      setData(d);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => load(), 250);

    return () => clearTimeout(t);
  }, [q, category, type, page, client.id]);

  const kpis: Partial<DocKpis> = data?.kpis || {};
  const breakdown: Partial<Record<string, DocBreakdownEntry>> =
    (data?.breakdown || {}) as Partial<Record<string, DocBreakdownEntry>>;
  const categories: DocCategory[] = data?.categories || [];
  const activity: DocActivity[] = data?.recentActivity || [];
  const types: string[] = data?.types || [];
  const docs: DocRow[] = data?.documents || [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const fmtUpdated = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleString(localeActual(), {
        timeZone: zonaDeLaEmpresa(),
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const donutSegments = useMemo(
    () =>
      BREAK_META.map((b) => ({
        value: breakdown[b.key]?.bytes || 0,
        color: b.color,
        label: t(b.labelKey, b.label),
      })).filter((s) => s.value > 0),
    [breakdown, t],
  );
  const resetPage = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };

  const onPick = (files: FileList | null) => {
    if (files) setPending((prev) => [...prev, ...Array.from(files)]);
  };

  const doUpload = async () => {
    if (!pending.length) {
      setUploadOpen(false);

      return;
    }
    setUploading(true);
    let ok = 0;

    for (const f of pending) {
      if (f.size > 100 * 1024 * 1024) {
        toast.error(
          t("ui.ClientDocuments.archivoMayorA100", {
            defaultValue: "Archivo mayor a 100MB: {{name}}",
            name: f.name,
          }),
        );
        continue;
      }
      try {
        setProgress((p) => ({ ...p, [f.name]: 0 }));
        const uploaded: {
          privateUrl?: string | null;
          publicUrl?: string | null;
        } = await securityGuardService.uploadFileToStorageWithProgress(
          f,
          "legalDocuments",
          (pct) => setProgress((p) => ({ ...p, [f.name]: pct })),
        );

        await clientService.createClientDocument(client.id, {
          name: f.name,
          mimeType: f.type || "application/octet-stream",
          sizeInBytes: f.size,
          storageId: "legalDocuments",
          privateUrl: uploaded?.privateUrl || null,
          publicUrl: uploaded?.publicUrl || null,
          category: upCategory,
        });
        ok++;
      } catch {
        toast.error(
          t("ui.ClientDocuments.noSePudoSubir", {
            defaultValue: "No se pudo subir {{name}}",
            name: f.name,
          }),
        );
      }
    }
    setUploading(false);
    setPending([]);
    setProgress({});
    setUploadOpen(false);
    if (ok) {
      toast.success(
        t("ui.ClientDocuments.nDocumentosSubidos", {
          defaultValue: "{{count}} documento(s) subido(s)",
          count: ok,
        }),
      );
      setPage(1);
      await load();
    }
  };

  /** Nombre por defecto: el mes en curso. Es lo que se teclea el 95 % de las veces. */
  const abrirAgrupar = () => {
    const ahora = new Date();
    const mes = ahora.toLocaleDateString(localeActual(), {
      timeZone: zonaDeLaEmpresa(),
      month: "long",
      year: "numeric",
    });
    const primero = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const ultimo = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    setGNombre(
      t("ui.ClientDocuments.documentacionMes", {
        defaultValue: "Documentación {{mes}}",
        mes,
      }),
    );
    setGDesde(ymd(primero));
    setGHasta(ymd(ultimo));
    setGNota("");
    setAgruparOpen(true);
  };

  const crearCarpeta = async () => {
    if (!gNombre.trim() || !marcadosIds.length) return;
    setCreando(true);
    try {
      await clientService.createDocumentPacket(client.id, {
        name: gNombre.trim(),
        periodStart: gDesde || null,
        periodEnd: gHasta || null,
        notes: gNota.trim() || null,
        attachmentIds: marcadosIds,
      });
      toast.success(
        t("ui.ClientDocuments.carpetaCreadaCon", {
          defaultValue: "Carpeta creada con {{count}} documento(s)",
          count: marcadosIds.length,
        }),
      );
      setAgruparOpen(false);
      setMarcados({});
      setPacketsKey((k) => k + 1);
    } catch {
      toast.error(
        t(
          "ui.ClientDocuments.noSePudoCrearLaCarpeta",
          "No se pudo crear la carpeta",
        ),
      );
    } finally {
      setCreando(false);
    }
  };

  const doDelete = async (d: DocRow) => {
    if (
      !(await confirmDialog({
        message: t("ui.ClientDocuments.eliminarConfirm", {
          defaultValue: '¿Eliminar "{{name}}"?',
          name: d.name,
        }),
        tone: "danger",
      }))
    )
      return;
    try {
      await clientService.deleteClientDocument(d.id);
      toast.success(
        t("ui.ClientDocuments.documentoEliminado", "Documento eliminado"),
      );
      await load(true);
    } catch {
      toast.error(t("comun.noSePudoEliminar"));
    }
  };

  if (loading && !data) return <TabLoading />;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-semibold">
          {t(
            "ui.ClientDocuments.bibliotecaDeDocumentos",
            "Biblioteca de documentos",
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sólo aparece con documentos marcados: un botón «Agrupar» permanente
              sobre una selección vacía es un botón apagado que no explica nada. */}
          {marcadosIds.length > 0 && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setMarcados({})}>
                {t("ui.ClientDocuments.quitarSeleccionN", {
                  defaultValue: "Quitar selección ({{n}})",
                  n: marcadosIds.length,
                })}
              </Button>
              <Button size="sm" variant="brand" onClick={abrirAgrupar}>
                <FolderPlus className="mr-1.5 h-4 w-4" />{" "}
                {t("ui.ClientDocuments.agruparYEntregar", "Agrupar y entregar")}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={marcadosIds.length ? "outline" : "brand"}
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="mr-1.5 h-4 w-4" />{" "}
            {t("ui.ClientDocuments.subirDocumento", "Subir documento")}
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          accent="primary"
          icon={<Files />}
          label={t("ui.ClientDocuments.totalDeDocumentos")}
          value={kpis.total ?? 0}
        />
        <KpiTile
          accent="green"
          icon={<CalendarPlus />}
          label={t("ui.ClientDocuments.subidosEsteMes")}
          value={kpis.uploadedThisMonth ?? 0}
        />
        <KpiTile
          accent="blue"
          icon={<FolderOpen />}
          label={t("ui.ClientDocuments.categorias", "Categorías")}
          value={kpis.categoriesCount ?? 0}
        />
        <KpiTile
          accent="orange"
          bar={kpis.usedPct ?? 0}
          barTone={
            (kpis.usedPct ?? 0) >= 90
              ? "bad"
              : (kpis.usedPct ?? 0) >= 75
                ? "warn"
                : "ok"
          }
          icon={<HardDrive />}
          label={t("ui.ClientDocuments.deCapacidad", {
            defaultValue: "de {{cap}}",
            cap: kpis.capLabel ?? "100 GB",
          })}
          sub={
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {kpis.usedPct ?? 0}%
            </span>
          }
          value={kpis.storageUsedLabel ?? "0 B"}
        />
      </div>

      {/* Lo que el cliente RECIBE. Va antes de la biblioteca a propósito: al
          abrir la pestaña, la pregunta de fin de mes es «¿ya lo revisó?», no
          «¿qué archivos hay subidos?». */}
      <DocumentPackets clientId={client.id} refreshKey={packetsKey} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
        {/* LEFT — filters + table */}
        <Section
          icon={<Files />}
          title={t("ui.ClientDocuments.documentos", "Documentos")}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchInput
              className="min-w-[200px] flex-1"
              placeholder={t("ui.ClientDocuments.buscarPorNombreTipoO")}
              value={q}
              onChange={(v) => resetPage(setQ)(v)}
            />
            <select
              className={FIELD_CLS}
              value={category}
              onChange={(e) => resetPage(setCategory)(e.target.value)}
            >
              <option value="">
                {t("ui.ClientDocuments.categoriaTodas", "Categoría: Todas")}
              </option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {catLabel(c.name)}
                </option>
              ))}
            </select>
            <select
              className={FIELD_CLS}
              value={type}
              onChange={(e) => resetPage(setType)(e.target.value)}
            >
              <option value="">{t("comun.tipoTodos")}</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </div>

          {docs.length === 0 ? (
            <EmptyState
              action={
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="mr-1.5 h-4 w-4" />{" "}
                  {t("ui.ClientDocuments.subirDocumento", "Subir documento")}
                </Button>
              }
              description={t("ui.ClientDocuments.subeElPrimerDocumentoDe")}
              icon={<Files />}
              title={t("comun.sinDocumentos")}
            />
          ) : (
            <TabTable>
              <THead>
                <Th>
                  {/* Marca los de ESTA página. La selección de las otras se
                        conserva: se está armando una entrega, no filtrando. */}
                  <input
                    aria-label={t(
                      "ui.ClientDocuments.marcarLosDocumentosDeEstaPagina",
                      "Marcar los documentos de esta página",
                    )}
                    checked={
                      docs.length > 0 && docs.every((d) => marcados[d.id])
                    }
                    type="checkbox"
                    onChange={(e) => {
                      const on = e.target.checked;

                      setMarcados((prev) => {
                        const next = { ...prev };

                        for (const d of docs) {
                          if (on) next[d.id] = true;
                          else delete next[d.id];
                        }

                        return next;
                      });
                    }}
                  />
                </Th>
                <Th>{t("ui.ClientDocuments.nombreDelDocumento")}</Th>
                <Th>{t("ui.ClientDocuments.categoria", "Categoría")}</Th>
                <Th>{t("comun.tipo")}</Th>
                <Th>{t("ui.ClientDocuments.tamano", "Tamaño")}</Th>
                <Th>{t("ui.ClientDocuments.actualizadoPor")}</Th>
                <Th>{t("comun.fecha")}</Th>
                <Th align="right">{t("ui.RouteForm.acciones", "Acciones")}</Th>
              </THead>
              <tbody>
                {docs.map((d) => {
                  const tm = typeMeta(d.type);
                  const Icon = tm.icon;

                  return (
                    <Tr key={d.id} selected={!!marcados[d.id]}>
                      <td className="px-2 py-2.5">
                        <input
                          aria-label={t("ui.ClientDocuments.marcarNombre", {
                            defaultValue: "Marcar {{name}}",
                            name: d.name,
                          })}
                          checked={!!marcados[d.id]}
                          type="checkbox"
                          onChange={(e) =>
                            setMarcados((prev) => {
                              const next = { ...prev };

                              if (e.target.checked) next[d.id] = true;
                              else delete next[d.id];

                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <IconTile size="sm" tone={tm.tone}>
                            <Icon />
                          </IconTile>
                          <div className="min-w-0">
                            <div className="max-w-[220px] truncate font-medium">
                              {d.name}
                            </div>
                            <div
                              className="text-xs"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {d.code}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge dot={false} tone="neutral">
                          {catLabel(d.category)}
                        </StatusBadge>
                      </td>
                      <td className="px-2 py-2.5">{typeLabel(d.type)}</td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {d.sizeLabel}
                      </td>
                      <td className="px-2 py-2.5 truncate max-w-[130px]">
                        {d.uploadedBy}
                      </td>
                      <td className="px-2 py-2.5 tabular-nums text-xs">
                        {fmtDT(d.createdAt)}
                      </td>
                      <td className="px-2 py-2.5">
                        <RowActions>
                          <RowAction
                            disabled={!d.downloadUrl}
                            href={d.downloadUrl || undefined}
                            title={t("common.download", "Descargar")}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </RowAction>
                          <RowAction
                            title={t("actions.delete")}
                            tone="bad"
                            onClick={() => doDelete(d)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </RowAction>
                        </RowActions>
                      </td>
                    </Tr>
                  );
                })}
              </tbody>
            </TabTable>
          )}

          <Pager
            noun={t("ui.ClientDocuments.nounDocumentos", "documentos")}
            page={page}
            pageCount={pageCount}
            perPage={perPage}
            total={total}
            onPage={setPage}
          />
        </Section>

        {/* RIGHT — storage + categories + activity */}
        <div className="space-y-4">
          <Section
            icon={<HardDrive />}
            title={t("ui.ClientDocuments.almacenamiento", "Almacenamiento")}
          >
            <div className="flex items-center gap-4">
              {/* Sin datos el anillo se dibuja igual, sólo el canal: un hueco en
                  blanco haría saltar la maquetación al llegar el primer archivo. */}
              <Donut
                ariaLabel={t(
                  "ui.ClientDocuments.almacenamientoPorTipo",
                  "Almacenamiento por tipo de archivo",
                )}
                centerBottom={t("ui.ClientDocuments.usado", "Usado")}
                centerTop={kpis.storageUsedLabel ?? "0 B"}
                segments={donutSegments}
                size={140}
              />
              <div className="flex-1 space-y-2">
                {BREAK_META.map((b) => (
                  <div
                    key={b.key}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: b.color }}
                      />
                      {t(b.labelKey, b.label)}
                    </span>
                    <span
                      className="text-xs tabular-nums"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {breakdown[b.key]?.label ?? "0 B"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div
                className="mb-1 flex items-center justify-between text-xs"
                style={{ color: "var(--ink-soft)" }}
              >
                <span>
                  {t("ui.ClientDocuments.usadoDeCapacidad", {
                    defaultValue: "{{used}} de {{cap}}",
                    used: kpis.storageUsedLabel ?? "0 B",
                    cap: kpis.capLabel ?? "100 GB",
                  })}
                </span>
                <span>{kpis.usedPct ?? 0}%</span>
              </div>
              <MeterBar
                ariaLabel={t(
                  "ui.ClientDocuments.almacenamientoUsado",
                  "Almacenamiento usado",
                )}
                height={6}
                minVisiblePct={1}
                pct={kpis.usedPct ?? 0}
                tone={
                  (kpis.usedPct ?? 0) >= 90
                    ? "bad"
                    : (kpis.usedPct ?? 0) >= 75
                      ? "warn"
                      : "ok"
                }
              />
            </div>
          </Section>

          <Section
            icon={<FolderOpen />}
            title={t("ui.ClientDocuments.categorias", "Categorías")}
          >
            {categories.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.ClientDocuments.aunNoHayCategorias",
                  "Aún no hay categorías.",
                )}
              </p>
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: "var(--hairline)" }}
              >
                {categories.map((c) => (
                  <button
                    key={c.name}
                    className="cg-focus flex w-full items-center justify-between py-2 text-left text-sm transition-opacity hover:opacity-70"
                    onClick={() => resetPage(setCategory)(c.name)}
                  >
                    <span>{catLabel(c.name)}</span>
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {c.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Section>

          <Section
            icon={<Clock />}
            title={t(
              "ui.ClientDocuments.actividadReciente",
              "Actividad reciente",
            )}
          >
            {activity.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                {t("ui.ClientDocuments.sinActividadReciente")}
              </p>
            ) : (
              <div className="space-y-3">
                {activity.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{a.user}</div>
                      <div
                        className="max-w-[180px] truncate text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {a.action} {a.name}
                      </div>
                    </div>
                    <span
                      className="shrink-0 text-xs"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {ago(a.at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      <TabFooter
        icon={<HardDrive />}
        note={t(
          "ui.ClientDocuments.notaSeguridad",
          "Los documentos se almacenan de forma segura y cumplen con los estándares de protección de datos.",
        )}
        updatedAt={fmtUpdated}
        onRefresh={() => load()}
      />

      {/* Upload modal */}
      <Modal
        footer={
          <>
            <Button
              disabled={uploading}
              variant="outline"
              onClick={() => setUploadOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={uploading || !pending.length} onClick={doUpload}>
              {uploading
                ? t("ui.ClientDocuments.subiendo", "Subiendo…")
                : t("ui.ClientDocuments.subirN", {
                    defaultValue: "Subir {{n}}",
                    n: pending.length || "",
                  })}
            </Button>
          </>
        }
        icon={<Upload className="h-5 w-5" />}
        open={uploadOpen}
        title={t("ui.ClientDocuments.subirDocumento", "Subir documento")}
        onOpenChange={(o) => {
          if (!uploading) setUploadOpen(o);
        }}
      >
        <div className="space-y-3">
          <LabeledField label={t("ui.ClientDocuments.categoria", "Categoría")}>
            <select
              className={FIELD_CLS}
              value={upCategory}
              onChange={(e) => setUpCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {catLabel(c)}
                </option>
              ))}
            </select>
          </LabeledField>
          <div
            className="cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors"
            style={{
              borderColor: "var(--hairline)",
              background: "var(--glass-sunken)",
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onPick(e.dataTransfer.files);
            }}
          >
            <Upload
              className="mx-auto mb-2 h-6 w-6"
              style={{ color: "var(--ink-faint)" }}
            />
            <p className="text-sm">
              {t(
                "ui.ClientDocuments.arrastraArchivosAquiOHaz",
                "Arrastra archivos aquí o haz clic para seleccionar",
              )}
            </p>
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {t(
                "ui.ClientDocuments.pdfWordExcelImagenesZip",
                "PDF, Word, Excel, imágenes, ZIP… (máx. 100 MB)",
              )}
            </p>
            <input
              ref={fileInputRef}
              multiple
              className="hidden"
              type="file"
              onChange={(e) => onPick(e.target.files)}
            />
          </div>
          {pending.length > 0 && (
            <div className="space-y-1.5">
              {pending.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <span className="truncate">{f.name}</span>
                  <span
                    className="flex items-center gap-2 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {progress[f.name] != null
                      ? `${progress[f.name]}%`
                      : `${Math.round(f.size / 1024)} KB`}
                    <button
                      disabled={uploading}
                      onClick={() =>
                        setPending((p) => p.filter((_, j) => j !== i))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* «Agrupar y entregar»: the marked documents become a delivery folder
          (DocumentPackets). The state and `crearCarpeta` existed but the
          dialog was never rendered, so the button did nothing (QA G7). */}
      <Modal
        footer={
          <>
            <Button
              disabled={creando}
              variant="outline"
              onClick={() => setAgruparOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={creando || !gNombre.trim() || !marcadosIds.length}
              variant="brand"
              onClick={crearCarpeta}
            >
              {creando
                ? t("ui.ClientDocuments.agrupar.creando", "Creando…")
                : t("ui.ClientDocuments.agrupar.crear", "Crear carpeta")}
            </Button>
          </>
        }
        icon={<FolderPlus className="h-5 w-5" />}
        open={agruparOpen}
        title={t("ui.ClientDocuments.agruparYEntregar", "Agrupar y entregar")}
        onOpenChange={(o) => {
          if (!creando) setAgruparOpen(o);
        }}
      >
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("ui.ClientDocuments.agrupar.resumen", {
              defaultValue:
                "{{count}} documento(s) marcados. La carpeta aparece en «Entregas al cliente», desde donde se comparte en la app o por un enlace privado.",
              count: marcadosIds.length,
            })}
          </p>
          <LabeledField
            label={t("ui.ClientDocuments.agrupar.nombre", "Nombre de la carpeta")}
          >
            <input
              className={FIELD_CLS}
              maxLength={200}
              type="text"
              value={gNombre}
              onChange={(e) => setGNombre(e.target.value)}
            />
          </LabeledField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledField label={t("ui.ClientDocuments.agrupar.desde", "Periodo desde")}>
              <input
                className={FIELD_CLS}
                type="date"
                value={gDesde}
                onChange={(e) => setGDesde(e.target.value)}
              />
            </LabeledField>
            <LabeledField label={t("ui.ClientDocuments.agrupar.hasta", "Periodo hasta")}>
              <input
                className={FIELD_CLS}
                min={gDesde || undefined}
                type="date"
                value={gHasta}
                onChange={(e) => setGHasta(e.target.value)}
              />
            </LabeledField>
          </div>
          <LabeledField label={t("ui.ClientDocuments.agrupar.nota", "Nota para el cliente (opcional)")}>
            <textarea
              className={`${FIELD_CLS} h-auto resize-none py-2`}
              maxLength={2000}
              rows={3}
              value={gNota}
              onChange={(e) => setGNota(e.target.value)}
            />
          </LabeledField>
        </div>
      </Modal>
    </div>
  );
}

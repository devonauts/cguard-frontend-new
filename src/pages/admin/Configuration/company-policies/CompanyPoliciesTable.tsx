import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal, StatusBadge } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import { CatalogTable, type CatalogColumn } from "../components/CatalogTable";
import PolicyDialog, { PolicyForm } from "./PolicyDialog";
import { firstDepartmentId, policyBody } from "./policyBody";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { getServerErrorMessage } from "@/lib/utils";

type Policy = {
  id: string;
  title: string;
  content?: string | null;
  departmentIds?: string[] | string | null;
  createdAt: string;
  status: "published" | "draft";
  version?: number;
  kindLabel?: string;
  /** Del endpoint de cumplimiento: quién falta por firmar. */
  firmadas?: number;
  obligadas?: number;
};

// Guard against missing/invalid createdAt so real API rows don't render "Invalid Date".
const formatPolicyDate = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() });
};

// La pantalla estuvo marcada «Próximamente» —honestamente: no fingía guardar—
// hasta que existió el servidor. Ya existe: /tenant/:id/company-policy.
const tenantId = () => localStorage.getItem("tenantId");

export default function CompanyPoliciesTable() {
  const { t } = useTranslation();
  // Las cabeceras se arman DENTRO del componente: fuera se evaluarían al cargar
  // el módulo, antes de que el idioma esté listo, y el texto quedaría congelado.
  const columns: CatalogColumn<Policy>[] = useMemo(
    () => [
      { key: "title", header: t("settings.policies.colTitle", "Título") },
      {
        key: "status",
        header: t("ui.CompanyPoliciesTable.estado", "Estado"),
        render: (v) =>
          v === "published" ? (
            <StatusBadge tone="ok">
              {t("ui.CompanyPoliciesTable.publicada", "Publicada")}
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral">
              {t("ui.CompanyPoliciesTable.borrador", "Borrador")}
            </StatusBadge>
          ),
      },
      {
        key: "kindLabel",
        header: t("dashboard.table.headers.type", "Tipo"),
        render: (v) =>
          String(v || t("ui.CompanyPoliciesTable.reglamento", "Reglamento")),
      },
      {
        // El dato por el que existe la pantalla: un reglamento publicado que nadie
        // ha firmado es un PDF en una carpeta.
        key: "firmadas",
        header: t("ui.CompanyPoliciesTable.firmadoPor", "Firmado por"),
        render: (_v, row) =>
          row.obligadas
            ? t("ui.CompanyPoliciesTable.firmadasDeObligadas", {
                defaultValue: "{{firmadas}} de {{obligadas}}",
                firmadas: row.firmadas ?? 0,
                obligadas: row.obligadas,
              })
            : "—",
      },
      {
        key: "createdAt",
        header: t("ui.CompanyPoliciesTable.creado", "Creado"),
        align: "right",
        render: (v) => formatPolicyDate(v),
      },
    ],
    [t],
  );
  const [query, setQuery] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return policies;
    return policies.filter((p) => p.title.toLowerCase().includes(q));
  }, [query, policies]);

  // The list comes whole from the server (max 200): pages are cut here.
  const maxPage = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, maxPage);
  const visibleRows = useMemo(
    () =>
      filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  const cargar = useCallback(async () => {
    try {
      const [lista, cumpl]: any = await Promise.all([
        ApiService.get(`/tenant/${tenantId()}/company-policy`),
        ApiService.get(`/tenant/${tenantId()}/company-policy/compliance`).catch(
          () => null,
        ),
      ]);
      const filas: Policy[] = lista?.rows || lista?.data?.rows || [];
      const porId = new Map<string, any>(
        ((cumpl?.rows || cumpl?.data?.rows || []) as any[]).map((c) => [
          c.policyId,
          c,
        ]),
      );
      setPolicies(
        filas.map((p) => ({
          ...p,
          firmadas: porId.get(p.id)?.firmadas,
          obligadas: porId.get(p.id)?.obligadas,
        })),
      );
    } catch {
      // Una lista que no carga se queda vacía y lo dice el estado vacío; no se
      // inventan filas.
      setPolicies([]);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = async (data: PolicyForm, status: "published" | "draft") => {
    if (!data.title.trim()) {
      toast.error(
        t("ui.CompanyPoliciesTable.ponleUnTitulo", "Ponle un título al documento."),
      );

      return;
    }
    try {
      const body = policyBody(data, status);

      if (editing) {
        await ApiService.put(
          `/tenant/${tenantId()}/company-policy/${editing.id}`,
          body,
        );
      } else {
        await ApiService.post(`/tenant/${tenantId()}/company-policy`, body);
      }
      toast.success(
        status === "published"
          ? t("ui.CompanyPoliciesTable.documentoPublicado", "Documento publicado")
          : t("ui.CompanyPoliciesTable.borradorGuardado", "Borrador guardado"),
      );
      setOpenNew(false);
      setEditing(null);
      await cargar();
    } catch (e: any) {
      // Se dice QUÉ falló y el diálogo se queda abierto con lo escrito dentro:
      // cerrar y perder el texto es lo que hace que nadie vuelva a intentarlo.
      toast.error(
        getServerErrorMessage(
          e,
          t(
            "ui.CompanyPoliciesTable.noPudimosGuardarElDocumento",
            "No pudimos guardar el documento.",
          ),
        ),
      );
    }
  };

  const handleCreate = (data: PolicyForm) => void guardar(data, "published");
  const handleDraft = (data: PolicyForm) => void guardar(data, "draft");

  /** Runs one request per selected document and says how many failed. */
  const enLote = async (
    ids: string[],
    run: (id: string) => Promise<unknown>,
    okText: string,
  ) => {
    if (!ids.length || busy) return;
    setBusy(true);
    const results = await Promise.allSettled(ids.map((id) => run(id)));
    const failed = results.filter((r) => r.status === "rejected");

    if (failed.length === 0) {
      toast.success(okText);
    } else {
      toast.error(
        t("ui.CompanyPoliciesTable.algunosNoSePudieron", {
          defaultValue: "{{failed}} de {{total}} no se pudieron cambiar: {{reason}}",
          failed: failed.length,
          total: ids.length,
          reason: getServerErrorMessage(
            (failed[0] as PromiseRejectedResult).reason,
            "",
          ),
        }),
      );
    }
    setBusy(false);
    await cargar();
  };

  const cambiarEstado = (ids: string[], status: "published" | "draft") =>
    enLote(
      ids,
      (id) =>
        ApiService.put(`/tenant/${tenantId()}/company-policy/${id}`, { status }),
      status === "published"
        ? t("ui.CompanyPoliciesTable.documentosPublicados", "Documentos publicados")
        : t("ui.CompanyPoliciesTable.documentosABorrador", "Documentos movidos a borrador"),
    );

  const eliminar = async () => {
    const ids = deleteIds;

    setDeleteIds([]);
    await enLote(
      ids,
      (id) => ApiService.delete(`/tenant/${tenantId()}/company-policy/${id}`),
      t("ui.CompanyPoliciesTable.documentosEliminados", "Documentos eliminados"),
    );
  };

  const abrirParaEditar = (p: Policy) => {
    setEditing(p);
    setOpenNew(true);
  };

  const initial = useMemo<Partial<PolicyForm> | null>(
    () =>
      editing
        ? {
            title: editing.title,
            content: editing.content ?? "",
            departmentId: firstDepartmentId(editing.departmentIds),
          }
        : null,
    [editing],
  );

  return (
    <>
      <CatalogTable<Policy>
        rows={visibleRows}
        columns={columns}
        canEdit
        loading={busy}
        onRowClick={abrirParaEditar}
        rowActions={(r) => [
          {
            label: t("actions.edit", "Editar"),
            onClick: () => abrirParaEditar(r),
          },
          r.status === "published"
            ? {
                label: t("ui.CompanyPoliciesTable.moverABorrador", "Mover a borrador"),
                onClick: () => void cambiarEstado([r.id], "draft"),
              }
            : {
                label: t("ui.CompanyPoliciesTable.publicar", "Publicar"),
                onClick: () => void cambiarEstado([r.id], "published"),
              },
          {
            label: t("actions.delete", "Eliminar"),
            destructive: true,
            onClick: () => setDeleteIds([r.id]),
          },
        ]}
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={t(
          "ui.CompanyPoliciesTable.buscarPoliticaDeEmpresa",
          "Buscar política de empresa",
        )}
        page={currentPage}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        bulkActions={[
          {
            label: t("actions.delete", "Eliminar"),
            destructive: true,
            onRun: (ids) => setDeleteIds(ids),
          },
          {
            label: t("ui.CompanyPoliciesTable.publicar", "Publicar"),
            onRun: (ids) => void cambiarEstado(ids, "published"),
          },
          {
            label: t("ui.CompanyPoliciesTable.moverABorrador", "Mover a borrador"),
            onRun: (ids) => void cambiarEstado(ids, "draft"),
          },
        ]}
        toolbarExtra={
          <Button
            onClick={() => {
              setEditing(null);
              setOpenNew(true);
            }}
            variant="brand"
            className="whitespace-nowrap"
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("ui.CompanyPoliciesTable.nuevaPolitica", "Nueva política")}
          </Button>
        }
        empty={{
          title: query.trim()
            ? t("clients.empty.title", "No se encontraron resultados")
            : t("ui.CompanyPoliciesTable.aunNoHayPoliticas", "Aún no hay políticas"),
          description: query.trim()
            ? t(
                "ui.CompanyPoliciesTable.noPudimosEncontrarNingunElemento",
                "No pudimos encontrar ningún elemento que coincida con tu búsqueda.",
              )
            : t(
                "ui.CompanyPoliciesTable.publicaElReglamentoInterno",
                "Publica el reglamento interno y sabrás quién lo ha firmado.",
              ),
        }}
      />

      <PolicyDialog
        initial={initial}
        open={openNew}
        onOpenChange={(v) => {
          setOpenNew(v);
          if (!v) setEditing(null);
        }}
        onSubmit={handleCreate}
        onDraft={handleDraft}
      />

      <Modal
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteIds([])}>
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button variant="destructive" onClick={() => void eliminar()}>
              {t("actions.delete", "Eliminar")}
            </Button>
          </>
        }
        icon={<AlertTriangle />}
        open={deleteIds.length > 0}
        size="sm"
        title={t("ui.CompanyPoliciesTable.confirmarEliminacion", "Confirmar eliminación")}
        onOpenChange={(v) => {
          if (!v) setDeleteIds([]);
        }}
      >
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t("ui.CompanyPoliciesTable.confirmarEliminacionTexto", {
            defaultValue:
              "¿Eliminar {{count}} documento(s)? Quien tenía que firmarlos dejará de verlos. Esta acción no se puede deshacer.",
            count: deleteIds.length,
          })}
        </p>
      </Modal>
    </>
  );
}

import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Mail,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Edit,
  Trash,
  FileText,
  File,
  Upload,
  MoreVertical,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import KpiService from "@/services/kpi.service";
import { ApiService } from "@/services/api/apiService";
import { stationService } from "@/lib/api/stationService";
import KpiBarChart from "@/components/KpiBarChart";
import { useTranslation } from "react-i18next";
import MobileCardList from "@/components/responsive/MobileCardList";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusBadge, Modal, SearchInput } from "@/components/kit";
import {
  FIELD_CLS,
  FIELD_CLS_LG,
} from "@/pages/admin/clientes/components/_shared/tab-kit";
import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import type { PostSite } from "@/types";
type Props = {
  site?: PostSite;
};

export default function PostSiteKPIs({ site }: Props) {
  // Escribir KPIs exige settingsEdit (sólo admin), igual que ya exigía
  // settingsRead para leerlos. El backend lo aplica desde 2026-08-08; sin esto,
  // quien no lo tiene vería el botón, lo pulsaría y recibiría un 403 sin
  // explicación. Mejor que el botón diga la verdad.
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("settingsEdit");

  const { t } = useTranslation();
  const [actionOpen, setActionOpen] = useState(false);
  const [actionSelection, setActionSelection] = useState<string>(
    t("actions.action", "Actions"),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [kpiData, setKpiData] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(containerRef);

  const [formData, setFormData] = useState({
    frequency: "",
    description: "",
    standardReports: true,
    standardReportsNumber: "" as string | number,
    incidentReports: true,
    incidentReportsNumber: "" as string | number,
    routeReports: true,
    routeReportsNumber: "" as string | number,
    taskReports: true,
    taskReportsNumber: "" as string | number,
    verificationReports: true,
    verificationReportsNumber: "" as string | number,
    emailNotification: false,
    emails: [] as string[],
  });

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleAddEmail = () => {
    if (!currentEmail.trim()) {
      setEmailError(
        t(
          "guards.KPI.modal.errors.emailRequired",
          "Por favor ingresa un correo electrónico",
        ),
      );
      return;
    }

    if (!validateEmail(currentEmail)) {
      setEmailError(
        t(
          "guards.KPI.modal.errors.emailInvalid",
          "Correo electrónico no válido",
        ),
      );
      return;
    }

    if (formData.emails.includes(currentEmail)) {
      setEmailError(
        t(
          "guards.KPI.modal.errors.emailAlreadyAdded",
          "Este correo ya ha sido agregado",
        ),
      );
      return;
    }

    setFormData({ ...formData, emails: [...formData.emails, currentEmail] });
    setCurrentEmail("");
    setEmailError("");
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    setFormData({
      ...formData,
      emails: formData.emails.filter((email) => email !== emailToRemove),
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddEmail();
    }
  };

  const handleAddKPI = () => {
    setEditingId(null);
    setFormData({
      frequency: "",
      description: "",
      standardReports: true,
      standardReportsNumber: "" as string | number,
      incidentReports: true,
      incidentReportsNumber: "" as string | number,
      routeReports: true,
      routeReportsNumber: "" as string | number,
      taskReports: true,
      taskReportsNumber: "" as string | number,
      verificationReports: true,
      verificationReportsNumber: "" as string | number,
      emailNotification: false,
      emails: [] as string[],
    });
    setShowModal(true);
  };

  const loadKpis = async () => {
    try {
      const monthStr = selectedMonth
        ? `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`
        : undefined;
      const params: any = {
        scope: "postSite",
        postSite: site?.id,
        month: monthStr,
      };
      if (searchQuery && searchQuery.trim().length > 0) {
        params.description = searchQuery.trim();
      }
      const res: any = await KpiService.list(params);
      setKpiData(res.rows || res);
      await computeActualsForKpis(res.rows || res, selectedMonth);
    } catch (error) {
      console.error("Error loading KPIs", error);
    }
  };

  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  const prevMonth = () => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() - 1);
    setSelectedMonth(d);
  };

  const nextMonth = () => {
    const d = new Date(selectedMonth);
    d.setMonth(d.getMonth() + 1);
    setSelectedMonth(d);
  };

  const formatMonth = (d: Date) => {
    return d.toLocaleString(undefined, { month: "long" });
  };

  const formatDate = (value: any) => {
    if (!value) return "";
    try {
      const d = new Date(value);
      return d.toLocaleString();
    } catch (e) {
      return String(value);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleExportPdf = (kpi: any) => {
    try {
      // If KPI provides a direct URL to the PDF, open it
      if (kpi?.pdfUrl) {
        window.open(kpi.pdfUrl, "_blank");
        toast.success(t("postSites.KPI.toasts.pdfOpened", "PDF opened"));
        setMenuOpenId(null);
        return;
      }

      // If KPI provides a base64 encoded PDF, convert and open
      if (kpi?.pdfBase64) {
        const byteCharacters = atob(kpi.pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        toast.success(t("postSites.KPI.toasts.pdfGenerated", "PDF generated"));
        setMenuOpenId(null);
        return;
      }

      // Otherwise, request PDF from backend endpoint
      (async () => {
        try {
          const blob = await KpiService.getPdf(kpi.id);
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          toast.success(
            t("postSites.KPI.toasts.pdfGenerated", "PDF generated"),
          );
        } catch (err) {
          console.error("Error fetching PDF from backend", err);
          toast.error(
            t("postSites.KPI.toasts.pdfError", "Could not generate/get PDF"),
          );
        } finally {
          setMenuOpenId(null);
        }
      })();
    } catch (e) {
      console.error("Error opening PDF", e);
      toast.error(t("postSites.KPI.toasts.pdfOpenError", "Error opening PDF"));
      setMenuOpenId(null);
    }
  };

  const handleExportExcel = (kpi: any) => {
    try {
      (async () => {
        try {
          const blob = await KpiService.getExcel(kpi.id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `kpi-${kpi.id}.xlsx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          toast.success(
            t("postSites.KPI.toasts.excelDownloaded", "Excel downloaded"),
          );
        } catch (err) {
          console.error("Error fetching Excel from backend", err);
          toast.error(
            t(
              "postSites.KPI.toasts.excelError",
              "Could not generate/get Excel",
            ),
          );
        } finally {
          setMenuOpenId(null);
        }
      })();
    } catch (e) {
      console.error("Error exporting Excel", e);
      toast.error(
        t("postSites.KPI.toasts.excelExportError", "Error exporting Excel"),
      );
      setMenuOpenId(null);
    }
  };

  const handleSubmitKPI = async () => {
    const toNumber = (v: any) =>
      v === "" || v === null || v === undefined ? null : Number(v);

    const payload: any = {
      scope: "postSite",
      postSiteId: site?.id,
      frequency: formData.frequency,
      description: formData.description,
      standardReports: !!formData.standardReports,
      standardReportsNumber: toNumber(formData.standardReportsNumber),
      incidentReports: !!formData.incidentReports,
      incidentReportsNumber: toNumber(formData.incidentReportsNumber),
      routeReports: !!formData.routeReports,
      routeReportsNumber: toNumber(formData.routeReportsNumber),
      taskReports: !!formData.taskReports,
      taskReportsNumber: toNumber(formData.taskReportsNumber),
      verificationReports: !!formData.verificationReports,
      verificationReportsNumber: toNumber(formData.verificationReportsNumber),
      emailNotification: !!formData.emailNotification,
      emails: formData.emails || [],
    };

    try {
      if (editingId) {
        await KpiService.update(editingId, { data: payload });
        toast.success("KPI actualizado correctamente");
      } else {
        await KpiService.create({ data: payload });
        toast.success("KPI creado correctamente");
      }
      await loadKpis();
      setShowModal(false);
      setEditingId(null);
      setFormData({
        frequency: "",
        description: "",
        standardReports: true,
        standardReportsNumber: "" as string | number,
        incidentReports: true,
        incidentReportsNumber: "" as string | number,
        routeReports: true,
        routeReportsNumber: "" as string | number,
        taskReports: true,
        taskReportsNumber: "" as string | number,
        verificationReports: true,
        verificationReportsNumber: "" as string | number,
        emailNotification: false,
        emails: [] as string[],
      });
    } catch (error) {
      console.error("Error saving KPI", error);
    }
  };

  /* La carga de los indicadores vivía en DOS efectos: éste, que disparaba al
     montar, y el de más abajo, que espera 300 ms para no pedir en cada tecla
     del buscador. Como el debounce también corre al montar, abrir la pestaña
     sacaba dos veces los mismos indicadores con 300 ms de diferencia. Ahora es
     un solo efecto: la primera vez pide YA (nadie quiere esperar un tercio de
     segundo por la pantalla que acaba de abrir) y a partir de ahí espera. */

  async function computeActualsForKpis(kpis: any[], monthDate?: Date) {
    try {
      if (!kpis || !kpis.length) return;
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) return;
      const month = monthDate || selectedMonth || new Date();
      const year = month.getFullYear();
      const monthIndex = month.getMonth();
      const start = new Date(
        Date.UTC(year, monthIndex, 1, 0, 0, 0),
      ).toISOString();
      const end = new Date(
        Date.UTC(year, monthIndex + 1, 1, 0, 0, 0),
      ).toISOString();

      // NOTE: ideally the postSite/guard filter (and precomputed counts) would be pushed
      // to the backend /report query; until that endpoint exists we fetch the month's rows
      // once and tally them in a single pass below instead of filtering per-KPI.
      const q = `?generatedDateRange[]=${encodeURIComponent(start)}&generatedDateRange[]=${encodeURIComponent(end)}&limit=10000`;
      const resp: any = await ApiService.get(`/tenant/${tenantId}/report${q}`);
      if (import.meta.env.DEV)
        console.debug("[PostSiteKPIs] reports response:", resp);
      const rows = Array.isArray(resp?.rows)
        ? resp.rows
        : Array.isArray(resp)
          ? resp
          : [];

      // Reports carry a stationId (report belongs to a station), but postSite
      // KPIs are scoped to a SITE. Resolve the site's station ids so a
      // postSite-scoped count sums the reports of all its stations — the old
      // code looked up the site id directly in a station-keyed map → always 0.
      const stationIdsByPostSite: Record<string, Set<string>> = {};
      try {
        const postSiteIds = Array.from(
          new Set(
            kpis
              .filter(
                (k: any) =>
                  k.scope === "postSite" && k.postSite && k.postSite.id,
              )
              .map((k: any) => String(k.postSite.id)),
          ),
        );
        for (const psId of postSiteIds) {
          const stRes = await stationService.list({ postSite: psId } as any, {
            limit: 500,
            offset: 0,
          });
          const stRows = Array.isArray(stRes?.rows) ? stRes.rows : [];
          stationIdsByPostSite[psId] = new Set(stRows.map((s) => String(s.id)));
        }
      } catch {
        /* if station resolution fails, postSite counts fall back to 0 */
      }

      // Single pass over rows: build count maps keyed by guard id and station id.
      const countsByGuard: Record<string, number> = {};
      const countsByStation: Record<string, number> = {};
      for (const r of rows) {
        const guardId = r?.createdById ?? r?.createdBy?.id;
        if (guardId != null)
          countsByGuard[String(guardId)] =
            (countsByGuard[String(guardId)] || 0) + 1;
        const stationId = r?.stationId ?? r?.station?.id;
        if (stationId != null)
          countsByStation[String(stationId)] =
            (countsByStation[String(stationId)] || 0) + 1;
      }

      const countsByKpi: Record<string, number> = {};
      for (const kpi of kpis) {
        let cnt = 0;
        if (kpi.scope === "guard" && kpi.guard && kpi.guard.id) {
          cnt = countsByGuard[String(kpi.guard.id)] || 0;
        } else if (
          kpi.scope === "postSite" &&
          kpi.postSite &&
          kpi.postSite.id
        ) {
          const stationSet = stationIdsByPostSite[String(kpi.postSite.id)];
          if (stationSet) {
            for (const [sid, n] of Object.entries(countsByStation)) {
              if (stationSet.has(sid)) cnt += n;
            }
          }
        } else {
          cnt = rows.length;
        }
        countsByKpi[kpi.id] = cnt;
      }

      setKpiData((prev) =>
        (prev || []).map((kk: any) => ({
          ...kk,
          actual: countsByKpi[kk.id] ?? kk.actual ?? 0,
        })),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Error computing KPI actuals client-side", e);
    }
  }

  // Carga inicial + recarga al cambiar mes o búsqueda (con espera)
  const primeraCarga = useRef(true);

  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      loadKpis();

      return;
    }
    const t = setTimeout(() => {
      loadKpis();
    }, 300);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, searchQuery, site?.id]);

  // Close menu when clicking outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      if (
        target.closest("[data-kpi-menu]") ||
        target.closest("[data-kpi-menu-button]")
      )
        return;
      setMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={containerRef} className="glass min-h-[560px] p-6 animate-fade-up">
      {/* Con «Añadir Nuevo KPI» a la derecha, la fila pasa de 375 px y el
            buscador se quedaba sin sitio: se envuelve. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="relative inline-block">
          <button
            onClick={() => setActionOpen(!actionOpen)}
            className="cg-btn-glass cg-focus ml-2 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
            data-kpi-menu-button
          >
            {actionSelection}
            <ChevronDown size={16} />
          </button>

          {actionOpen && (
            <div
              className="glass-raised absolute right-0 z-40 mt-2 w-full py-1"
              data-kpi-menu
            >
              <button
                onClick={() => {
                  setActionOpen(false);
                  if (!selectedIds || selectedIds.length === 0) {
                    toast.error(
                      t(
                        "postSites.KPI.toasts.selectAtLeastOne",
                        "You must select at least one KPI",
                      ),
                    );
                    return;
                  }
                  setDeleteModalOpen(true);
                }}
                className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-muted"
              >
                {t("actions.delete", "Eliminar")}
              </button>
            </div>
          )}
        </div>

        <div className="min-w-48 flex-1 sm:max-w-xs">
          <SearchInput
            placeholder={t("postSites.KPI.kpisearch", "Buscar KPI")}
            type="text"
            value={searchQuery}
            onChange={(v) => setSearchQuery(v)}
          />
        </div>

        <Button
          variant="brand"
          onClick={handleAddKPI}
          disabled={!canEdit}
          title={
            canEdit
              ? undefined
              : t(
                  "postSites.KPI.noPermission",
                  "Solo un administrador puede crear o modificar indicadores",
                )
          }
          className="ml-2"
        >
          <Plus size={16} />
          {t("postSites.KPI.kpiadded", "Añadir Nuevo KPI")}
        </Button>
      </div>

      <div>
        <div className="md:block hidden overflow-x-auto relative min-h-[520px] pb-12">
          <table className="w-full min-h-[220px]">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="cg-eyebrow px-2 py-2">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={
                      kpiData.length > 0 &&
                      selectedIds.length === kpiData.length
                    }
                    onChange={(e) => {
                      if (e.target.checked)
                        setSelectedIds(kpiData.map((k) => k.id));
                      else setSelectedIds([]);
                    }}
                  />
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t("postSites.KPI.kpitable.kpitype", "Tipo")}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t("postSites.KPI.kpitable.kpidate", "Fecha/Hora")}
                </th>
                <th className="cg-eyebrow px-2 py-2">
                  {t("postSites.KPI.kpitable.kpicreatedfor", "Agregado por")}
                </th>
                <th className="cg-eyebrow px-2 py-2 text-right">
                  <button className="hover:text-foreground">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {kpiData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <EmptyState
                      icon={<FileText />}
                      title={t(
                        "clients.empty.title",
                        "No se encontraron resultados",
                      )}
                      description={t(
                        "clients.empty.description",
                        "No pudimos encontrar ningún elemento que coincida con su búsqueda",
                      )}
                    />
                  </td>
                </tr>
              ) : (
                kpiData.map((kpi, idx) => (
                  <React.Fragment key={kpi.id || idx}>
                    <tr
                      onClick={() =>
                        setExpandedId(expandedId === kpi.id ? null : kpi.id)
                      }
                      className="border-b hover:bg-muted/40 cursor-pointer"
                    >
                      <td className="px-2 py-2.5">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.includes(kpi.id)}
                          onChange={(e) => {
                            if (e.target.checked)
                              setSelectedIds([...selectedIds, kpi.id]);
                            else
                              setSelectedIds(
                                selectedIds.filter((id) => id !== kpi.id),
                              );
                          }}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-sm text-foreground">
                        {typeof kpi.type === "object"
                          ? kpi.type?.name || "-"
                          : kpi.type || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-sm text-foreground">
                        {formatDate(kpi.dateTime)}
                      </td>
                      <td className="px-2 py-2.5 text-sm text-foreground">
                        {typeof kpi.addedBy === "object"
                          ? kpi.addedBy?.fullName || kpi.addedBy?.name || "-"
                          : kpi.addedBy || "-"}
                      </td>
                      <td
                        className="px-2 py-2.5 text-right relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenId(
                                menuOpenId === kpi.id ? null : kpi.id,
                              );
                            }}
                            className="text-muted-foreground hover:text-foreground/70 p-1 rounded mr-2"
                            title="Options"
                          >
                            <MoreVertical size={16} />
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(
                                expandedId === kpi.id ? null : kpi.id,
                              );
                            }}
                            title={
                              expandedId === kpi.id ? "Collapse" : "Expand"
                            }
                            className="text-muted-foreground hover:text-foreground p-1 rounded"
                          >
                            {expandedId === kpi.id ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </button>

                          {menuOpenId === kpi.id && (
                            <div
                              data-kpi-menu={"kpi-" + (kpi.id || idx)}
                              className="glass-raised absolute right-4 top-full z-50 w-44 min-w-[11rem] translate-y-2 overflow-hidden py-1"
                            >
                              <button
                                disabled={!canEdit}
                                onClick={() => {
                                  if (!canEdit) return;
                                  setEditingId(kpi.id);
                                  setFormData({
                                    frequency: kpi.frequency || "",
                                    description: kpi.description || "",
                                    standardReports: !!kpi.standardReports,
                                    standardReportsNumber:
                                      kpi.standardReportsNumber || "",
                                    incidentReports: !!kpi.incidentReports,
                                    incidentReportsNumber:
                                      kpi.incidentReportsNumber || "",
                                    routeReports: !!kpi.routeReports,
                                    routeReportsNumber:
                                      kpi.routeReportsNumber || "",
                                    taskReports: !!kpi.taskReports,
                                    taskReportsNumber:
                                      kpi.taskReportsNumber || "",
                                    verificationReports:
                                      !!kpi.verificationReports,
                                    verificationReportsNumber:
                                      kpi.verificationReportsNumber || "",
                                    emailNotification: !!kpi.emailNotification,
                                    emails: kpi.emails || [],
                                  });
                                  setShowModal(true);
                                  setMenuOpenId(null);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-muted"
                              >
                                <div className="flex items-center gap-2 text-sm text-foreground">
                                  <Edit size={16} />
                                  {t("actions.edit", "Edit")}
                                </div>
                              </button>

                              <button
                                disabled={!canEdit}
                                onClick={() => {
                                  if (!canEdit) return;
                                  setToDeleteId(kpi.id);
                                  setDeleteModalOpen(true);
                                  setMenuOpenId(null);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <div
                                  className="flex items-center gap-2 text-sm"
                                  style={{ color: "var(--bad-text)" }}
                                >
                                  <Trash size={16} />
                                  {t("actions.delete", "Delete")}
                                </div>
                              </button>

                              <button
                                onClick={() => {
                                  handleExportPdf(kpi);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-muted"
                              >
                                <div className="flex items-center gap-2 text-sm text-foreground">
                                  <FileText size={16} />{" "}
                                  {t(
                                    "postSites.KPI.exportPdf",
                                    "Export as PDF",
                                  )}
                                </div>
                              </button>

                              <button
                                onClick={() => {
                                  handleExportExcel(kpi);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-muted"
                              >
                                <div className="flex items-center gap-2 text-sm text-foreground">
                                  <File size={16} />{" "}
                                  {t(
                                    "postSites.KPI.exportExcel",
                                    "Export as Excel",
                                  )}
                                </div>
                              </button>
                              <button
                                onClick={() => {
                                  toast.success(
                                    t(
                                      "postSites.KPI.emailNotImplemented",
                                      "Email report not implemented",
                                    ),
                                  );
                                  setMenuOpenId(null);
                                }}
                                className="w-full text-left px-4 py-2 hover:bg-muted"
                              >
                                <div className="flex items-center gap-2 text-sm text-foreground">
                                  <Mail size={16} />{" "}
                                  {t(
                                    "postSites.KPI.emailReport",
                                    "Email Report",
                                  )}
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedId === kpi.id && (
                      <tr style={{ background: "var(--glass-sunken)" }}>
                        <td colSpan={5} className="p-4">
                          <div className="space-y-4 min-h-[360px]">
                            <div className="flex items-start justify-between">
                              <div>
                                <strong>
                                  {t(
                                    "postSites.KPI.descriptionLabel",
                                    "DESCRIPTION :",
                                  )}
                                </strong>{" "}
                                <span className="ml-4">{kpi.description}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-foreground/70">
                                <button
                                  aria-label={t("kit.pagination.prev")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    prevMonth();
                                    loadKpis();
                                  }}
                                  className="p-1 rounded hover:bg-muted"
                                >
                                  <ChevronLeft size={16} />
                                </button>
                                <div className="px-3 py-1 border rounded">
                                  {formatMonth(selectedMonth)}
                                </div>
                                <button
                                  aria-label={t("kit.pagination.next")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    nextMonth();
                                    loadKpis();
                                  }}
                                  className="p-1 rounded hover:bg-muted"
                                >
                                  <ChevronRight size={16} />
                                </button>
                              </div>
                            </div>

                            <div>
                              {(() => {
                                const metrics: any[] = [];
                                // Real per-metric actuals from the backend (incidents/routes for the KPI
                                // month, scoped to this post-site's stations). Tasks aren't linked to a
                                // post-site (actual null → hidden); Standard/Checklist have no source.
                                const actuals = (
                                  kpi as {
                                    actuals?: {
                                      incident: number | null;
                                      task: number | null;
                                      route: number | null;
                                    };
                                  }
                                ).actuals || {
                                  incident: null,
                                  task: null,
                                  route: null,
                                };
                                const hasTarget = (v: unknown) =>
                                  v !== undefined &&
                                  v !== null &&
                                  Number(v) > 0;
                                if (
                                  hasTarget(kpi.incidentReportsNumber) &&
                                  actuals.incident !== null
                                ) {
                                  metrics.push({
                                    key: "incidentReports",
                                    name: t(
                                      "postSites.KPI.metrics.incidentReports",
                                      "Incident Reports",
                                    ),
                                    target: Number(kpi.incidentReportsNumber),
                                    actual: Number(actuals.incident),
                                  });
                                }
                                if (
                                  hasTarget(kpi.taskReportsNumber) &&
                                  actuals.task !== null
                                ) {
                                  metrics.push({
                                    key: "taskReports",
                                    name: t(
                                      "postSites.KPI.metrics.taskReports",
                                      "Task Reports",
                                    ),
                                    target: Number(kpi.taskReportsNumber),
                                    actual: Number(actuals.task),
                                  });
                                }
                                if (
                                  hasTarget(kpi.routeReportsNumber) &&
                                  actuals.route !== null
                                ) {
                                  metrics.push({
                                    key: "routeReports",
                                    name: t(
                                      "postSites.KPI.metrics.routeReports",
                                      "Route Reports",
                                    ),
                                    target: Number(kpi.routeReportsNumber),
                                    actual: Number(actuals.route),
                                  });
                                }

                                return (
                                  <>
                                    <table className="w-full border-collapse border">
                                      <thead>
                                        <tr className="bg-muted/30">
                                          <th className="cg-eyebrow px-2 py-2">
                                            {t(
                                              "postSites.KPI.table.name",
                                              "Name",
                                            )}
                                          </th>
                                          <th className="cg-eyebrow px-2 py-2">
                                            {t(
                                              "postSites.KPI.table.target",
                                              "Target",
                                            )}
                                          </th>
                                          <th className="cg-eyebrow px-2 py-2">
                                            {t(
                                              "postSites.KPI.table.actual",
                                              "Actual",
                                            )}
                                          </th>
                                          <th className="cg-eyebrow px-2 py-2">
                                            {t(
                                              "postSites.KPI.table.status",
                                              "Status",
                                            )}
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {metrics.length === 0 ? (
                                          <tr>
                                            <td
                                              className="border px-2 py-2.5"
                                              colSpan={4}
                                            >
                                              {t(
                                                "postSites.KPI.table.noTargets",
                                                "No targets defined",
                                              )}
                                            </td>
                                          </tr>
                                        ) : (
                                          metrics.map((m) => (
                                            <tr key={m.key}>
                                              <td className="border px-2 py-2.5 font-semibold">
                                                {m.name.toUpperCase()}
                                              </td>
                                              <td className="border px-2 py-2.5">
                                                {m.target}
                                              </td>
                                              <td className="border px-2 py-2.5">
                                                {m.actual}
                                              </td>
                                              <td className="border px-2 py-2.5">
                                                <StatusBadge
                                                  tone={
                                                    m.actual >= m.target
                                                      ? "ok"
                                                      : "bad"
                                                  }
                                                >
                                                  {m.actual >= m.target
                                                    ? t(
                                                        "postSites.KPI.status.achieved",
                                                        "Achieved",
                                                      )
                                                    : t(
                                                        "postSites.KPI.status.notAchieved",
                                                        "Not Achieved",
                                                      )}
                                                </StatusBadge>
                                              </td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>

                                    <div className="w-full">
                                      <KpiBarChart
                                        data={metrics.map((m) => ({
                                          name: m.name,
                                          target: m.target,
                                          actual: m.actual,
                                        }))}
                                        width={720}
                                        height={300}
                                      />
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden">
          <MobileCardList
            items={kpiData}
            renderCard={(kpi: any) => (
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold">
                    {kpi.type || "KPI"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(kpi.dateTime) || "-"}
                  </div>
                  <div className="text-sm text-foreground mt-2">
                    {kpi.description}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(kpi.id);
                      setShowModal(true);
                    }}
                    className="px-3 py-1 bg-muted rounded text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportPdf(kpi);
                    }}
                    className="px-3 py-1 bg-muted rounded text-sm"
                  >
                    PDF
                  </button>
                </div>
              </div>
            )}
            loading={false}
          />
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-60 flex items-end sm:items-center"
          onClick={handleCloseModal}
        >
          <div
            className="absolute inset-0 z-50"
            style={{ background: "oklch(0 0 0 / 0.45)" }}
            onClick={handleCloseModal}
          />

          <div
            className="glass-raised pointer-events-auto relative z-60 max-h-[90vh] w-full overflow-y-auto pb-28 sm:ml-auto sm:max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b p-6">
              <h2 className="text-lg font-semibold text-foreground">
                {t(
                  "postSites.KPI.modal.title",
                  "Add New KPIs (Key Performance Indicators)",
                )}
              </h2>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {t("postSites.KPI.modal.frequency", "Frequency")}{" "}
                  <span style={{ color: "var(--bad-text)" }}>*</span>
                </label>
                <select
                  autoFocus
                  value={formData.frequency}
                  onChange={(e) =>
                    setFormData({ ...formData, frequency: e.target.value })
                  }
                  className="cg-input cg-focus w-full px-3 py-2 text-sm"
                >
                  <option value="">
                    {t(
                      "postSites.KPI.modal.frequencyOptions.select",
                      "Select frequency",
                    )}
                  </option>
                  <option value="diario">
                    {t("postSites.KPI.modal.frequencyOptions.daily", "Daily")}
                  </option>
                  <option value="semanal">
                    {t("postSites.KPI.modal.frequencyOptions.weekly", "Weekly")}
                  </option>
                  <option value="mensual">
                    {t(
                      "postSites.KPI.modal.frequencyOptions.monthly",
                      "Monthly",
                    )}
                  </option>
                </select>
              </div>

              <div>
                <label className="cg-eyebrow mb-1.5 block">
                  {t("postSites.KPI.modal.description", "Description")}{" "}
                  <span style={{ color: "var(--bad-text)" }}>*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t(
                    "postSites.KPI.modal.descriptionPlaceholder",
                    "Enter description",
                  )}
                  className={`${FIELD_CLS_LG} resize-none`}
                  rows={4}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <label className="text-sm font-medium text-foreground">
                    {t(
                      "postSites.KPI.modal.standardReports",
                      "Standard Reports",
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.standardReports}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          standardReports: e.target.checked,
                        })
                      }
                      className="rounded w-5 h-5"
                    />
                    <input
                      type="number"
                      min={0}
                      value={formData.standardReportsNumber}
                      onChange={(e: any) => {
                        const v = e.target.value;
                        const sanitized =
                          v === "" ? "" : Math.max(0, Number(v));
                        setFormData({
                          ...formData,
                          standardReportsNumber: sanitized,
                        });
                      }}
                      disabled={!formData.standardReports}
                      placeholder={t(
                        "postSites.KPI.modal.defineNumber",
                        "Define a Number",
                      )}
                      className="cg-input cg-focus w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <label className="text-sm font-medium text-foreground">
                    {t(
                      "postSites.KPI.modal.incidentReports",
                      "Incident Reports",
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.incidentReports}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          incidentReports: e.target.checked,
                        })
                      }
                      className="rounded w-5 h-5"
                    />
                    <input
                      type="number"
                      min={0}
                      value={formData.incidentReportsNumber}
                      onChange={(e: any) => {
                        const v = e.target.value;
                        const sanitized =
                          v === "" ? "" : Math.max(0, Number(v));
                        setFormData({
                          ...formData,
                          incidentReportsNumber: sanitized,
                        });
                      }}
                      disabled={!formData.incidentReports}
                      placeholder={t(
                        "postSites.KPI.modal.defineNumber",
                        "Define a Number",
                      )}
                      className="cg-input cg-focus w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <label className="text-sm font-medium text-foreground">
                    {t("postSites.KPI.modal.routeReports", "Route Reports")}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.routeReports}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          routeReports: e.target.checked,
                        })
                      }
                      className="rounded w-5 h-5"
                    />
                    <input
                      type="number"
                      min={0}
                      value={formData.routeReportsNumber}
                      onChange={(e: any) => {
                        const v = e.target.value;
                        const sanitized =
                          v === "" ? "" : Math.max(0, Number(v));
                        setFormData({
                          ...formData,
                          routeReportsNumber: sanitized,
                        });
                      }}
                      disabled={!formData.routeReports}
                      placeholder={t(
                        "postSites.KPI.modal.defineNumber",
                        "Define a Number",
                      )}
                      className="cg-input cg-focus w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <label className="text-sm font-medium text-foreground">
                    {t("postSites.KPI.modal.taskReports", "Task Reports")}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.taskReports}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          taskReports: e.target.checked,
                        })
                      }
                      className="rounded w-5 h-5"
                    />
                    <input
                      type="number"
                      min={0}
                      value={formData.taskReportsNumber}
                      onChange={(e: any) => {
                        const v = e.target.value;
                        const sanitized =
                          v === "" ? "" : Math.max(0, Number(v));
                        setFormData({
                          ...formData,
                          taskReportsNumber: sanitized,
                        });
                      }}
                      disabled={!formData.taskReports}
                      placeholder={t(
                        "postSites.KPI.modal.defineNumber",
                        "Define a Number",
                      )}
                      className="cg-input cg-focus w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-md bg-muted/30">
                  <label className="text-sm font-medium text-foreground">
                    {t(
                      "postSites.KPI.modal.verificationReports",
                      "Checklist Reports",
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.verificationReports}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          verificationReports: e.target.checked,
                        })
                      }
                      className="rounded w-5 h-5"
                    />
                    <input
                      type="number"
                      min={0}
                      value={formData.verificationReportsNumber}
                      onChange={(e: any) => {
                        const v = e.target.value;
                        const sanitized =
                          v === "" ? "" : Math.max(0, Number(v));
                        setFormData({
                          ...formData,
                          verificationReportsNumber: sanitized,
                        });
                      }}
                      disabled={!formData.verificationReports}
                      placeholder={t(
                        "postSites.KPI.modal.defineNumber",
                        "Define a Number",
                      )}
                      className="cg-input cg-focus w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-sm font-medium text-foreground">
                    {t(
                      "postSites.KPI.modal.emailNotification",
                      "Send KPI report by email",
                    )}
                  </label>
                  <input
                    type="checkbox"
                    checked={formData.emailNotification}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        emailNotification: e.target.checked,
                      })
                    }
                    className="rounded w-5 h-5 ml-auto accent-primary"
                  />
                </div>

                {formData.emailNotification && (
                  <div className="space-y-3">
                    {formData.emails && formData.emails.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.emails.map((email) => (
                          <div
                            key={email}
                            className="flex items-center gap-2 bg-muted text-foreground px-3 py-1 rounded-full text-sm"
                          >
                            <span>{email}</span>
                            <button
                              onClick={() => handleRemoveEmail(email)}
                              className="text-muted-foreground hover:text-foreground focus:outline-none"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={currentEmail}
                          onChange={(e) => {
                            setCurrentEmail(e.target.value);
                            setEmailError("");
                          }}
                          onKeyPress={handleKeyPress}
                          placeholder={t(
                            "postSites.KPI.modal.newEmailPlaceholder",
                            "New email...",
                          )}
                          className="cg-input cg-focus flex-1 px-3 py-2 text-sm"
                          style={
                            emailError
                              ? { borderColor: "var(--bad)" }
                              : undefined
                          }
                        />
                        <Button variant="brand" onClick={handleAddEmail}>
                          {t("postSites.KPI.modal.addEmail", "Add")}
                        </Button>
                      </div>
                      {emailError && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--bad-text)" }}
                        >
                          {emailError}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t p-6">
              <Button
                variant="brand"
                onClick={handleSubmitKPI}
                className="px-6"
              >
                {t("postSites.KPI.modal.add", "ADD")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={deleteModalOpen}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteModalOpen(false);
            setToDeleteId(null);
          }
        }}
        title={t("postSites.KPI.confirmDelete.title", "Confirmar eliminación")}
        icon={<Trash className="h-5 w-5" />}
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteModalOpen(false);
                setToDeleteId(null);
              }}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  if (toDeleteId) {
                    await KpiService.destroy(toDeleteId);
                    toast.success(
                      t("postSites.KPI.toasts.kpiDeleted", "KPI deleted"),
                    );
                  } else if (selectedIds.length > 0) {
                    await Promise.all(
                      selectedIds.map((id) => KpiService.destroy(id)),
                    );
                    toast.success(
                      t("postSites.KPI.toasts.kpisDeleted", "KPIs deleted"),
                    );
                  } else {
                    toast.error(
                      t("postSites.KPI.toasts.noSelected", "No items selected"),
                    );
                    return;
                  }
                  await loadKpis();
                } catch (e) {
                  console.error(e);
                  toast.error(
                    t(
                      "postSites.KPI.toasts.deleteError",
                      "Error deleting KPI(s)",
                    ),
                  );
                } finally {
                  setDeleteModalOpen(false);
                  setToDeleteId(null);
                  setSelectedIds([]);
                }
              }}
            >
              {t("actions.delete", "Eliminar")}
            </Button>
          </>
        }
      >
        <p className="text-sm text-foreground">
          {toDeleteId
            ? t(
                "postSites.KPI.confirmDelete.messageSingle",
                "Are you sure you want to delete this KPI? This action cannot be undone.",
              )
            : t(
                "postSites.KPI.confirmDelete.messageMultiple",
                "Are you sure you want to delete {{count}} KPI(s)? This action cannot be undone.",
                { count: selectedIds.length },
              )}
        </p>
      </Modal>
    </div>
  );
}

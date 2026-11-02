import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  X,
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
  BarChart3,
  MapPin,
} from "lucide-react";
import MobileCardList from "@/components/responsive/MobileCardList";
import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import { toast } from "sonner";
import KpiBarChart from "@/components/KpiBarChart";
import GuardPerformancePanel from "./GuardPerformancePanel";
import KpiService from "@/services/kpi.service";
import { useAuth } from "@/contexts/AuthContext";
import { ApiService } from "@/services/api/apiService";
import api from "@/lib/api";
import { useTranslation } from "react-i18next";
import {
  PageContainer,
  PageHeader,
  Section,
  StatCard,
  StatsStrip,
  Stagger,
  EmptyState,
  Modal,
  IconTile,
  SearchInput,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { localeActual } from "@/lib/localeActual";
import type {
  GuardDetail,
  Kpi,
  GuardAssignmentRow,
} from "../../guardDetailTypes";

type Props = {
  guard?: GuardDetail;
};

/** Subset of a report row consumed when counting KPI actuals. */
interface ReportRow {
  createdById?: string;
  createdBy?: { id?: string } | null;
  stationId?: string;
  station?: { id?: string; stationId?: string } | null;
  postSiteId?: string;
  businessInfoId?: string;
  postSite?: { id?: string } | null;
  businessInfo?: { id?: string } | null;
}

/** One row in the KPI target-vs-actual breakdown table. */
interface KpiMetric {
  key: string;
  name: string;
  target: number;
  actual: number;
}

export default function GuardIndicators({ guard }: Props) {
  // Mismo criterio que PostSiteKPIs: escribir indicadores exige settingsEdit
  // (sólo admin), que el backend aplica desde 2026-08-08.
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("settingsEdit");
  const { t } = useTranslation();
  // The guard route (/guards/:id/indicadores) mounts this page WITHOUT a `guard`
  // prop, so all guard-scoped data must fall back to the route id (the
  // securityGuard id) — same pattern the sibling Licenses tab uses.
  const { id: routeGuardId } = useParams();
  const guardRecordId = guard?.id || routeGuardId;
  const [actionOpen, setActionOpen] = useState(false);
  const [actionSelection, setActionSelection] = useState<string>(
    t("actions.action", "Acción"),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [kpiData, setKpiData] = useState<Kpi[]>([]); // Vacío inicialmente, sin resultados
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);
  // Monotonic token so a slower in-flight loadKpis can't overwrite a newer one,
  // and so results are dropped after unmount (last-write-wins race guard).
  const loadKpisReqId = useRef(0);

  // Form state
  const [formData, setFormData] = useState({
    frequency: "",
    description: "",
    standardReports: true,
    standardReportsNumber: "",
    incidentReports: true,
    incidentReportsNumber: "",
    routeReports: true,
    routeReportsNumber: "",
    taskReports: true,
    taskReportsNumber: "",
    verificationReports: true,
    verificationReportsNumber: "",
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

    setFormData({
      ...formData,
      emails: [...formData.emails, currentEmail],
    });
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
      standardReportsNumber: "",
      incidentReports: true,
      incidentReportsNumber: "",
      routeReports: true,
      routeReportsNumber: "",
      taskReports: true,
      taskReportsNumber: "",
      verificationReports: true,
      verificationReportsNumber: "",
      emailNotification: false,
      emails: [] as string[],
    });
    setShowModal(true);
  };

  const loadKpis = async () => {
    const reqId = ++loadKpisReqId.current;
    const isStale = () => reqId !== loadKpisReqId.current;
    try {
      const monthStr = selectedMonth
        ? `${selectedMonth.getFullYear()}-${String(selectedMonth.getMonth() + 1).padStart(2, "0")}`
        : undefined;
      const guardId =
        (guard &&
          (guard.guard?.id || guard.guardId || guard.id || guard.userId)) ||
        guardRecordId;
      // Fetch KPIs explicitly for the guard
      const params: Record<string, string | undefined> = {
        scope: "guard",
        guard: guardId,
        month: monthStr,
      };
      if (searchQuery && searchQuery.trim().length > 0) {
        params.description = searchQuery.trim();
      }
      const resGuard = (await KpiService.list(params)) as
        | { rows?: Kpi[] }
        | Kpi[];
      if (import.meta.env.DEV)
        console.debug("[GuardKPIs] kpi guard response:", resGuard);
      let combinedRows: Kpi[] = Array.isArray(resGuard)
        ? resGuard
        : Array.isArray(resGuard?.rows)
          ? resGuard.rows
          : [];

      // Also fetch assigned post-sites for this guard and include KPIs attached to those post-sites
      try {
        const tenantId = localStorage.getItem("tenantId");
        if (tenantId && guardId) {
          const resp = (await ApiService.get(
            `/tenant/${tenantId}/security-guard/${guardId}/assignments`,
          )) as
            | {
                data?: { rows?: GuardAssignmentRow[] };
                rows?: GuardAssignmentRow[];
              }
            | GuardAssignmentRow[];
          if (import.meta.env.DEV)
            console.debug("[GuardKPIs] assignments response:", resp);
          const assignData = Array.isArray(resp) ? resp : (resp?.data ?? resp);
          const rows: GuardAssignmentRow[] = Array.isArray(assignData)
            ? assignData
            : Array.isArray(assignData?.rows)
              ? assignData.rows
              : [];
          const siteIds = Array.from(
            new Set(
              rows
                .map((r: GuardAssignmentRow) => {
                  // support various shapes returned by assignments
                  if (!r) return null;
                  return (
                    r.businessInfoId ||
                    r.postSiteId ||
                    r.stationId ||
                    r.business_info_id ||
                    r.post_site_id ||
                    (r.businessInfo &&
                      (r.businessInfo.id || r.businessInfoId)) ||
                    (r.postSite && (r.postSite.id || r.postSiteId)) ||
                    null
                  );
                })
                .filter(Boolean),
            ),
          );
          // Fetch all per-site KPIs in parallel instead of a serial await loop.
          const perSite = await Promise.all(
            siteIds.map(async (siteId): Promise<Kpi[]> => {
              try {
                const resSite = (await KpiService.list({
                  scope: "postSite",
                  postSite: siteId,
                  month: monthStr,
                })) as { rows?: Kpi[] } | Kpi[];
                if (import.meta.env.DEV)
                  console.debug(
                    "[GuardKPIs] kpi postSite response for",
                    siteId,
                    resSite,
                  );
                return Array.isArray(resSite)
                  ? resSite
                  : Array.isArray(resSite?.rows)
                    ? resSite.rows
                    : [];
              } catch (e) {
                console.error(
                  "[GuardKPIs] error loading kpis for site",
                  siteId,
                  e,
                );
                return [];
              }
            }),
          );
          for (const siteRows of perSite)
            combinedRows = combinedRows.concat(siteRows);
        }
      } catch (e) {
        console.error("Failed to load guard assignments for KPIs", e);
      }

      // Deduplicate by id
      const seen = new Set<string>();
      combinedRows = combinedRows.filter((r: Kpi) => {
        if (!r || !r.id) return false;
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      if (isStale()) return;
      setKpiData(combinedRows);
      await computeActualsForKpis(combinedRows, selectedMonth, isStale);
    } catch (error) {
      console.error("Error loading KPIs", error);
    }
  };

  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());
  const [assignedSitesCount, setAssignedSitesCount] = useState<number>(0);

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
    return d.toLocaleString(localeActual(), { month: "long" });
  };

  const formatDate = (value: string | number | Date | null | undefined) => {
    if (!value) return "";
    try {
      const d = new Date(value);
      return d.toLocaleString(localeActual());
    } catch {
      return "";
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({
      frequency: "",
      description: "",
      standardReports: true,
      standardReportsNumber: "",
      incidentReports: true,
      incidentReportsNumber: "",
      routeReports: true,
      routeReportsNumber: "",
      taskReports: true,
      taskReportsNumber: "",
      verificationReports: true,
      verificationReportsNumber: "",
      emailNotification: false,
      emails: [] as string[],
    });
  };

  const handleExportPdf = (kpi: Kpi) => {
    try {
      // If KPI provides a direct URL to the PDF, open it
      if (kpi?.pdfUrl) {
        window.open(kpi.pdfUrl, "_blank");
        toast.success(t("guards.KPI.toasts.pdfOpened", "PDF opened"));
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
        // Revoke after the new tab has had time to load so the Blob isn't pinned.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        toast.success(t("guards.KPI.toasts.pdfGenerated", "PDF generado"));
        setMenuOpenId(null);
        return;
      }

      // Otherwise, request PDF from backend endpoint
      (async () => {
        try {
          const blob = await KpiService.getPdf(kpi.id);
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank");
          // Revoke after the new tab has had time to load so the Blob isn't pinned.
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          toast.success(t("guards.KPI.toasts.pdfGenerated", "PDF generated"));
        } catch (err) {
          console.error("Error fetching PDF", err);
          toast.error(
            t("guards.KPI.toasts.pdfError", "Could not generate/get PDF"),
          );
        } finally {
          setMenuOpenId(null);
        }
      })();
    } catch (e) {
      console.error("Error opening PDF", e);
      toast.error(t("guards.KPI.toasts.pdfOpenError", "Error al abrir el PDF"));
      setMenuOpenId(null);
    }
  };

  const handleExportExcel = (kpi: Kpi) => {
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
            t("guards.KPI.toasts.excelDownloaded", "Excel downloaded"),
          );
        } catch (err) {
          console.error("Error fetching Excel", err);
          toast.error(
            t("guards.KPI.toasts.excelError", "Could not generate/get Excel"),
          );
        } finally {
          setMenuOpenId(null);
        }
      })();
    } catch (e) {
      console.error("Error exporting Excel", e);
      toast.error(
        t("guards.KPI.toasts.excelExportError", "Error exporting Excel"),
      );
      setMenuOpenId(null);
    }
  };

  // The server names a KPI by its description, or by its raw scope («guard»)
  // when it has none: say the scope in words.
  const tipoDeKpi = (k: Kpi): string => {
    const tipo = String((k as { type?: string }).type || "");

    if (tipo && tipo !== k.scope) return tipo;
    if (k.scope === "postSite")
      return t("guards.KPI.scope.postSite", "Sede");

    return t("guards.KPI.scope.guard", "Vigilante");
  };

  const handleSubmitKPI = async () => {
    if (!String(formData.frequency || "").trim()) {
      toast.error(
        t("guards.KPI.errors.frequencyRequired", "Elige la frecuencia."),
      );

      return;
    }
    if (!String(formData.description || "").trim()) {
      toast.error(
        t("guards.KPI.errors.descriptionRequired", "Escribe la descripción."),
      );

      return;
    }
    const toNumber = (v: string | number | null | undefined) =>
      v === "" || v === null || v === undefined ? null : Number(v);

    const payload = {
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
      emails: formData.emails,
      scope: "guard",
      guardId: guardRecordId,
      guard: guardRecordId,
    };

    try {
      if (editingId) {
        await KpiService.update(editingId, { data: payload });
        toast.success(
          t("guards.KPI.toasts.updated", "KPI actualizado correctamente"),
        );
      } else {
        await KpiService.create({ data: payload });
        toast.success(
          t("guards.KPI.toasts.created", "KPI creado correctamente"),
        );
      }
      await loadKpis();
      handleCloseModal();
    } catch (error) {
      console.error("Error saving KPI", error);
      toast.error(t("guards.KPI.toasts.saveError", "Error al guardar el KPI"));
    }
  };

  async function computeActualsForKpis(
    kpis: Kpi[],
    monthDate?: Date,
    isStale?: () => boolean,
  ) {
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

      const q = `?generatedDateRange[]=${encodeURIComponent(start)}&generatedDateRange[]=${encodeURIComponent(end)}&limit=10000`;
      const resp = (await ApiService.get(`/tenant/${tenantId}/report${q}`)) as
        | { rows?: ReportRow[] }
        | ReportRow[];
      if (import.meta.env.DEV)
        console.debug("[GuardKPIs] reports response:", resp);
      const rows: ReportRow[] = Array.isArray(resp)
        ? resp
        : Array.isArray(resp?.rows)
          ? resp.rows
          : [];

      const countsByKpi: Record<string, number> = {};
      for (const kpi of kpis) {
        let cnt = 0;
        const guardRef = kpi.guard;
        const postSiteRef = kpi.postSite;
        if (kpi.scope === "guard" && guardRef && guardRef.id) {
          cnt = rows.filter(
            (r) =>
              r.createdById === guardRef.id ||
              (r.createdBy && r.createdBy.id === guardRef.id),
          ).length;
        } else if (kpi.scope === "postSite" && postSiteRef && postSiteRef.id) {
          // match report to postSite using multiple possible report fields
          const siteId = String(postSiteRef.id);
          cnt = rows.filter((r) => {
            if (!r) return false;
            // direct stationId equals site id
            if (r.stationId && String(r.stationId) === siteId) return true;
            // nested station object
            if (
              r.station &&
              (String(r.station.id) === siteId ||
                String(r.station.stationId) === siteId)
            )
              return true;
            // report may include businessInfo/postSite fields
            if (r.postSiteId && String(r.postSiteId) === siteId) return true;
            if (r.businessInfoId && String(r.businessInfoId) === siteId)
              return true;
            if (r.postSite && r.postSite.id && String(r.postSite.id) === siteId)
              return true;
            if (
              r.businessInfo &&
              r.businessInfo.id &&
              String(r.businessInfo.id) === siteId
            )
              return true;
            return false;
          }).length;
        } else {
          cnt = rows.length;
        }
        countsByKpi[kpi.id] = cnt;
      }

      if (isStale && isStale()) return;
      setKpiData((prev) =>
        (prev || []).map((kk: Kpi) => ({
          ...kk,
          actual: countsByKpi[kk.id] ?? kk.actual ?? 0,
        })),
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Error computing KPI actuals client-side", e);
    }
  }

  useEffect(() => {
    if (!guardRecordId) return;
    let mounted = true;
    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId");
        if (!tenantId) return;
        const resp = await api.get(
          `/tenant/${tenantId}/security-guard/${guardRecordId}/assignments`,
        );
        const data = resp?.data ?? resp;
        const rows: GuardAssignmentRow[] = Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data)
            ? data
            : [];
        if (!mounted) return;
        setAssignedSitesCount(rows.length);
      } catch (e) {
        console.error("Failed loading guard assignments", e);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [guardRecordId]);

  // Single source of truth for loading KPIs: reload (debounced) when the guard,
  // month or search query changes. Consolidated from a separate [guard?.id]
  // effect to avoid the double-fetch on mount. On cleanup we bump the request id
  // so any in-flight loadKpis is treated as stale and won't setState.
  useEffect(() => {
    const timer = setTimeout(() => {
      loadKpis();
    }, 300);
    return () => {
      clearTimeout(timer);
      loadKpisReqId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, searchQuery, guardRecordId]);

  // Close menu when clicking outside (matches PostSiteKPIs behavior)
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
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.indicadores">
        <PageContainer width="wide">
          <PageHeader
            icon={<BarChart3 />}
            title={t("guards.KPI.title", {
              defaultValue: "Indicadores de rendimiento",
            })}
            subtitle={t("guards.KPI.subtitle", {
              defaultValue: "KPIs y desempeño del vigilante.",
            })}
            actions={
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
              >
                <Plus size={16} />
                {t("guards.KPI.kpiadded", "Añadir Nuevo KPI")}
              </Button>
            }
          />

          <StatsStrip className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label={t("guards.assignSites.assignedCount", {
                defaultValue: "Assigned Sites",
              })}
              value={assignedSitesCount}
              icon={<MapPin />}
              accent="info"
            />
            <StatCard
              label={t("guards.KPI.totalKpis", { defaultValue: "KPIs" })}
              value={kpiData.length}
              icon={<BarChart3 />}
              accent="brand"
            />
          </StatsStrip>

          {/* 8-factor performance score (read-only, additive to KPI tooling) */}
          <GuardPerformancePanel securityGuardId={guard?.id} />

          <Section
            title={t("guards.KPI.feedTitle", {
              defaultValue: "Indicadores clave (KPIs)",
            })}
            icon={<BarChart3 />}
            className="min-h-[560px]"
            action={
              <div className="flex items-center gap-2">
                {/* Left: Action Dropdown */}
                <div className="relative inline-block">
                  <button
                    onClick={() => setActionOpen(!actionOpen)}
                    className="cg-btn-glass cg-focus flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold"
                  >
                    {actionSelection}
                    <ChevronDown size={16} />
                  </button>
                  {actionOpen && (
                    <div
                      className="glass-raised absolute left-0 z-10 mt-1 w-full overflow-hidden"
                      style={{ position: "absolute" }}
                    >
                      <button
                        onClick={() => {
                          setActionOpen(false);
                          if (!selectedIds || selectedIds.length === 0) {
                            toast.error(
                              t(
                                "guards.KPI.toasts.selectAtLeastOne",
                                "Debes seleccionar al menos un KPI",
                              ),
                            );
                            return;
                          }
                          setDeleteModalOpen(true);
                        }}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        {t("actions.delete", "Eliminar")}
                      </button>
                    </div>
                  )}
                </div>

                {/* Center: Search */}
                <SearchInput
                  placeholder={t("guards.KPI.kpisearch", "Buscar KPI")}
                  type="text"
                  value={searchQuery}
                  onChange={(v) => setSearchQuery(v)}
                />
              </div>
            }
          >
            {/* Table */}
            <div className="overflow-x-auto min-h-[520px] pb-12">
              <div>
                <div className="md:block hidden">
                  <table className="w-full">
                    <thead>
                      <tr
                        className="border-b"
                        style={{ background: "var(--glass-sunken)" }}
                      >
                        <th className="px-4 py-3 text-left">
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
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          {t("guards.KPI.kpitable.kpitype", "Tipo")}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          {t("guards.KPI.kpitable.kpidate", "Fecha/Hora")}
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                          {t(
                            "guards.KPI.kpitable.kpicreatedfor",
                            "Agregado por",
                          )}
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">
                          <button className="hover:text-foreground">
                            <ArrowUpDown className="h-3.5 w-3.5" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpiData.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6">
                            <EmptyState
                              icon={<BarChart3 />}
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
                                setExpandedId(
                                  expandedId === kpi.id ? null : kpi.id,
                                )
                              }
                              className="border-b transition-colors hover:[background:var(--glass-sunken)]"
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  className="rounded"
                                  checked={selectedIds.includes(kpi.id)}
                                  onChange={(e) => {
                                    if (e.target.checked)
                                      setSelectedIds([...selectedIds, kpi.id]);
                                    else
                                      setSelectedIds(
                                        selectedIds.filter(
                                          (id) => id !== kpi.id,
                                        ),
                                      );
                                  }}
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                {tipoDeKpi(kpi)}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                {formatDate(kpi.dateTime)}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                {kpi.addedBy}
                              </td>
                              <td
                                className="px-4 py-3 text-right relative"
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
                                    title={t("ui.GuardKPIspage.opciones", "Opciones")}
                                    data-kpi-menu-button
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
                                      expandedId === kpi.id
                                        ? t("ui.GuardKPIspage.contraer", "Contraer")
                                        : t("ui.GuardKPIspage.expandir", "Expandir")
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
                                    /* Este menú vive DENTRO del bucle de filas.
                                       `.glass-raised` lleva el desenfoque más
                                       pesado del sistema, y aunque sólo haya uno
                                       abierto, la capa se re-rasteriza en cada
                                       fotograma mientras se desplaza la tabla.
                                       Plano: mismo aspecto, sin ese coste. */
                                    <div
                                      data-kpi-menu={"kpi-" + (kpi.id || idx)}
                                      className="glass-flat absolute right-4 top-full z-50 w-44 min-w-[11rem] translate-y-2 divide-y divide-border overflow-hidden py-1"
                                      style={{
                                        position: "absolute",
                                        background: "var(--glass-solid)",
                                      }}
                                    >
                                      <button
                                        onClick={() => {
                                          setEditingId(kpi.id);
                                          setFormData({
                                            frequency: kpi.frequency || "",
                                            description: kpi.description || "",
                                            standardReports:
                                              !!kpi.standardReports,
                                            standardReportsNumber: String(
                                              kpi.standardReportsNumber || "",
                                            ),
                                            incidentReports:
                                              !!kpi.incidentReports,
                                            incidentReportsNumber: String(
                                              kpi.incidentReportsNumber || "",
                                            ),
                                            routeReports: !!kpi.routeReports,
                                            routeReportsNumber: String(
                                              kpi.routeReportsNumber || "",
                                            ),
                                            taskReports: !!kpi.taskReports,
                                            taskReportsNumber: String(
                                              kpi.taskReportsNumber || "",
                                            ),
                                            verificationReports:
                                              !!kpi.verificationReports,
                                            verificationReportsNumber: String(
                                              kpi.verificationReportsNumber ||
                                                "",
                                            ),
                                            emailNotification:
                                              !!kpi.emailNotification,
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
                                        onClick={() => {
                                          setToDeleteId(kpi.id);
                                          setDeleteModalOpen(true);
                                          setMenuOpenId(null);
                                        }}
                                        className="w-full text-left px-4 py-2 hover:bg-muted"
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
                                            "guards.KPI.exportPdf",
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
                                            "guards.KPI.exportExcel",
                                            "Export as Excel",
                                          )}
                                        </div>
                                      </button>

                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {expandedId === kpi.id && (
                              <tr>
                                <td colSpan={5} className="p-4">
                                  <div className="space-y-4 min-h-[360px]">
                                    <div className="flex items-start justify-between">
                                      <div>
                                        <strong>
                                          {t(
                                            "guards.KPI.descriptionLabel",
                                            "DESCRIPTION :",
                                          )}
                                        </strong>{" "}
                                        <span className="ml-4">
                                          {kpi.description}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-sm text-foreground/70">
                                        <button
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
                                        const metrics: KpiMetric[] = [];
                                        // Real per-metric actuals from the backend (incidents/tasks/routes for the
                                        // KPI month). Standard/Checklist have no data source → omitted. A metric row
                                        // only shows when it has a positive target AND a computable actual.
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
                                          hasTarget(
                                            kpi.incidentReportsNumber,
                                          ) &&
                                          actuals.incident !== null
                                        ) {
                                          metrics.push({
                                            key: "incidentReports",
                                            name: t(
                                              "guards.KPI.metrics.incidentReports",
                                              "Incident Reports",
                                            ),
                                            target: Number(
                                              kpi.incidentReportsNumber,
                                            ),
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
                                              "guards.KPI.metrics.taskReports",
                                              "Task Reports",
                                            ),
                                            target: Number(
                                              kpi.taskReportsNumber,
                                            ),
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
                                              "guards.KPI.metrics.routeReports",
                                              "Route Reports",
                                            ),
                                            target: Number(
                                              kpi.routeReportsNumber,
                                            ),
                                            actual: Number(actuals.route),
                                          });
                                        }

                                        return (
                                          <>
                                            <table className="w-full border-collapse border">
                                              <thead>
                                                <tr
                                                  style={{
                                                    background:
                                                      "var(--glass-sunken)",
                                                  }}
                                                >
                                                  <th className="border px-4 py-2">
                                                    {t(
                                                      "guards.KPI.table.name",
                                                      "Name",
                                                    )}
                                                  </th>
                                                  <th className="border px-4 py-2">
                                                    {t(
                                                      "guards.KPI.table.target",
                                                      "Target",
                                                    )}
                                                  </th>
                                                  <th className="border px-4 py-2">
                                                    {t(
                                                      "guards.KPI.table.actual",
                                                      "Actual",
                                                    )}
                                                  </th>
                                                  <th className="border px-4 py-2">
                                                    {t(
                                                      "guards.KPI.table.status",
                                                      "Status",
                                                    )}
                                                  </th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {metrics.length === 0 ? (
                                                  <tr>
                                                    <td
                                                      className="border px-4 py-2"
                                                      colSpan={4}
                                                    >
                                                      {t(
                                                        "guards.KPI.table.noTargets",
                                                        "No targets defined",
                                                      )}
                                                    </td>
                                                  </tr>
                                                ) : (
                                                  metrics.map((m) => (
                                                    <tr key={m.key}>
                                                      <td className="border px-4 py-2 font-semibold">
                                                        {m.name.toUpperCase()}
                                                      </td>
                                                      <td className="border px-4 py-2">
                                                        {m.target}
                                                      </td>
                                                      <td className="border px-4 py-2">
                                                        {m.actual}
                                                      </td>
                                                      <td
                                                        className="border px-4 py-2 font-semibold"
                                                        style={{
                                                          color:
                                                            m.actual >= m.target
                                                              ? "var(--ok-text)"
                                                              : "var(--bad-text)",
                                                        }}
                                                      >
                                                        {m.actual >= m.target
                                                          ? t(
                                                              "guards.KPI.status.achieved",
                                                              "Achieved",
                                                            )
                                                          : t(
                                                              "guards.KPI.status.notAchieved",
                                                              "Not Achieved",
                                                            )}
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

                {/* Móvil: la tabla no se pinta por debajo de `md`, así que la
                    lista de KPIs va en tarjetas. Antes esta lista vivía DENTRO
                    de la fila expandida de la tabla, es decir, dentro de lo que
                    el teléfono nunca llega a pintar: en un móvil la pantalla
                    quedaba en blanco. */}
                <div className="md:hidden">
                  <MobileCardList
                    items={kpiData || []}
                    loading={false}
                    emptyMessage={
                      t("guards.KPI.empty", {
                        defaultValue: "No KPI data",
                      }) as string
                    }
                    renderCard={(k: Kpi) => (
                      <>
                      <div className="text-sm font-semibold">{tipoDeKpi(k)}</div>
                      <div className="text-xs text-muted-foreground">
                        {k.date} • {k.createdBy?.fullName ?? k.addedBy}
                      </div>
                      </>
                    )}
                  />
                </div>
              </div>

              {/* Modal */}
              {showModal && (
                <div
                  className="glass-scrim fixed inset-0 z-50"
                  onClick={handleCloseModal}
                >
                  <div
                    className="glass-raised fixed bottom-0 right-0 top-0 w-full max-w-md overflow-y-auto rounded-l-3xl rounded-r-none"
                    style={{ position: "fixed" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div
                      className="sticky top-0 flex items-center gap-2.5 border-b p-6"
                      style={{
                        borderColor: "var(--hairline)",
                        background: "var(--glass-solid)",
                      }}
                    >
                      <IconTile tone="brand" size="sm">
                        <BarChart3 />
                      </IconTile>
                      <h2 className="text-base font-semibold">
                        {t(
                          "guards.KPI.modal.title",
                          "Añadir Nuevos KPIs (Indicadores Clave de Rendimiento)",
                        )}
                      </h2>
                    </div>

                    {/* Body */}
                    <div className="p-6 space-y-6">
                      {/* Frecuencia */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          {t("guards.KPI.modal.frequency", "Frecuencia")}{" "}
                          <span style={{ color: "var(--bad-text)" }}>*</span>
                        </label>
                        <select
                          value={formData.frequency}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              frequency: e.target.value,
                            })
                          }
                          className="cg-input w-full px-3 py-2 text-sm"
                        >
                          <option value="">
                            {t(
                              "guards.KPI.modal.frequencyOptions.select",
                              "Seleccionar frecuencia",
                            )}
                          </option>
                          <option value="diario">
                            {t(
                              "guards.KPI.modal.frequencyOptions.daily",
                              "Diario",
                            )}
                          </option>
                          <option value="semanal">
                            {t(
                              "guards.KPI.modal.frequencyOptions.weekly",
                              "Semanal",
                            )}
                          </option>
                          <option value="mensual">
                            {t(
                              "guards.KPI.modal.frequencyOptions.monthly",
                              "Mensual",
                            )}
                          </option>
                        </select>
                      </div>

                      {/* Descripción */}
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">
                          {t("guards.KPI.modal.description", "Descripción")}{" "}
                          <span style={{ color: "var(--bad-text)" }}>*</span>
                        </label>
                        <textarea
                          value={formData.description}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              description: e.target.value,
                            })
                          }
                          placeholder={t(
                            "guards.KPI.modal.descriptionPlaceholder",
                            "Ingrese la descripción",
                          )}
                          className="cg-input w-full resize-none px-3 py-2 text-sm"
                          rows={4}
                        />
                      </div>

                      {/* Checkboxes */}
                      <div className="space-y-3">
                        {/* Informes Estándar */}
                        <div className="glass-sunken flex items-center justify-between p-3">
                          <label className="text-sm font-medium text-foreground">
                            {t(
                              "guards.KPI.modal.standardReports",
                              "Informes Estándar",
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
                              onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                              ) => {
                                const v = e.target.value;
                                const sanitized =
                                  v === ""
                                    ? ""
                                    : String(Math.max(0, Number(v)));
                                setFormData({
                                  ...formData,
                                  standardReportsNumber: sanitized,
                                });
                              }}
                              disabled={!formData.standardReports}
                              placeholder={t(
                                "guards.KPI.modal.defineNumber",
                                "Definir un Número",
                              )}
                              className="cg-input w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                        </div>

                        {/* Informes de Incidentes */}
                        <div className="glass-sunken flex items-center justify-between p-3">
                          <label className="text-sm font-medium text-foreground">
                            {t(
                              "guards.KPI.modal.incidentReports",
                              "Informes de Incidentes",
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
                              onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                              ) => {
                                const v = e.target.value;
                                const sanitized =
                                  v === ""
                                    ? ""
                                    : String(Math.max(0, Number(v)));
                                setFormData({
                                  ...formData,
                                  incidentReportsNumber: sanitized,
                                });
                              }}
                              disabled={!formData.incidentReports}
                              placeholder={t(
                                "guards.KPI.modal.defineNumber",
                                "Definir un Número",
                              )}
                              className="cg-input w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                        </div>

                        {/* Informes de Recorridos */}
                        <div className="glass-sunken flex items-center justify-between p-3">
                          <label className="text-sm font-medium text-foreground">
                            {t(
                              "guards.KPI.modal.routeReports",
                              "Informes de Recorridos por el Sitio",
                            )}
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
                              onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                              ) => {
                                const v = e.target.value;
                                const sanitized =
                                  v === ""
                                    ? ""
                                    : String(Math.max(0, Number(v)));
                                setFormData({
                                  ...formData,
                                  routeReportsNumber: sanitized,
                                });
                              }}
                              disabled={!formData.routeReports}
                              placeholder={t(
                                "guards.KPI.modal.defineNumber",
                                "Definir un Número",
                              )}
                              className="cg-input w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                        </div>

                        {/* Informes de Tareas */}
                        <div className="glass-sunken flex items-center justify-between p-3">
                          <label className="text-sm font-medium text-foreground">
                            {t(
                              "guards.KPI.modal.taskReports",
                              "Informes de Tareas",
                            )}
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
                              onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                              ) => {
                                const v = e.target.value;
                                const sanitized =
                                  v === ""
                                    ? ""
                                    : String(Math.max(0, Number(v)));
                                setFormData({
                                  ...formData,
                                  taskReportsNumber: sanitized,
                                });
                              }}
                              disabled={!formData.taskReports}
                              placeholder={t(
                                "guards.KPI.modal.defineNumber",
                                "Definir un Número",
                              )}
                              className="cg-input w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                        </div>

                        {/* Informes de Listas de Verificación */}
                        <div className="glass-sunken flex items-center justify-between p-3">
                          <label className="text-sm font-medium text-foreground">
                            {t(
                              "guards.KPI.modal.verificationReports",
                              "Informes de Listas de Verificación",
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
                              onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                              ) => {
                                const v = e.target.value;
                                const sanitized =
                                  v === ""
                                    ? ""
                                    : String(Math.max(0, Number(v)));
                                setFormData({
                                  ...formData,
                                  verificationReportsNumber: sanitized,
                                });
                              }}
                              disabled={!formData.verificationReports}
                              placeholder={t(
                                "guards.KPI.modal.defineNumber",
                                "Definir un Número",
                              )}
                              className="cg-input w-32 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Email Notification */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <label className="text-sm font-medium text-foreground">
                            {t(
                              "guards.KPI.modal.emailNotificationLabel",
                              "Enviar Informe KPI por Correo Electrónico",
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
                            className="ml-auto h-5 w-5 rounded-md"
                            style={{ accentColor: "var(--brand)" }}
                          />
                        </div>

                        {formData.emailNotification && (
                          <div className="space-y-3">
                            {/* Email chips */}
                            {formData.emails && formData.emails.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {formData.emails.map((email) => (
                                  <div
                                    key={email}
                                    className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm"
                                    style={{
                                      background: "var(--glass-sunken)",
                                      borderColor: "var(--hairline)",
                                    }}
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

                            {/* Email input with add button */}
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
                                    "guards.KPI.modal.newEmailPlaceholder",
                                    "Nuevo Correo Electrónico...",
                                  )}
                                  className="cg-input flex-1 px-3 py-2 text-sm"
                                  style={
                                    emailError
                                      ? { borderColor: "var(--bad)" }
                                      : undefined
                                  }
                                />
                                <button
                                  onClick={handleAddEmail}
                                  className="cg-btn-brand cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-colors"
                                >
                                  {t("guards.KPI.modal.addEmail", "Agregar")}
                                </button>
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

                    {/* Footer */}
                    <div
                      className="sticky bottom-0 flex items-center justify-end gap-3 border-t p-6"
                      style={{
                        borderColor: "var(--hairline)",
                        background: "var(--glass-solid)",
                      }}
                    >
                      <Button variant="outline" onClick={handleCloseModal}>
                        {t("actions.cancel", "Cancelar")}
                      </Button>
                      <Button variant="brand" onClick={handleSubmitKPI}>
                        {t("guards.KPI.modal.addButton", "AÑADIR")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {deleteModalOpen && (
                <Modal
                  open={deleteModalOpen}
                  onOpenChange={(o) => {
                    if (!o) {
                      setDeleteModalOpen(false);
                      setToDeleteId(null);
                    }
                  }}
                  title={t(
                    "guards.KPI.modal.confirmDeleteTitle",
                    "Confirmar eliminación",
                  )}
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
                                t("guards.KPI.toasts.deleted", "KPI eliminado"),
                              );
                            } else if (selectedIds.length > 0) {
                              await Promise.all(
                                selectedIds.map((id) => KpiService.destroy(id)),
                              );
                              toast.success(
                                t(
                                  "guards.KPI.toasts.deletedMultiple",
                                  "KPIs eliminados",
                                ),
                              );
                            } else {
                              toast.error(
                                t(
                                  "guards.KPI.toasts.deleteNoneSelected",
                                  "No hay elementos seleccionados",
                                ),
                              );
                              return;
                            }
                            await loadKpis();
                          } catch (e) {
                            console.error(e);
                            toast.error(
                              t(
                                "guards.KPI.toasts.deleteError",
                                "Error al eliminar KPI(s)",
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
                    {t(
                      "guards.KPI.modal.confirmDeleteMessage",
                      "¿Estás seguro de que deseas eliminar los KPI seleccionados? Esta acción no se puede deshacer.",
                    )}
                  </p>
                </Modal>
              )}
            </div>
          </Section>
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}

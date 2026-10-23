import type { ReactNode } from "react";
import type { Client } from "@/types/client";
import type { LucideIcon } from "lucide-react";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  FileText,
  Calendar,
  ScrollText,
  ClipboardList,
  Shield,
  Car,
  Monitor,
  Users,
  UserCheck,
  Bell,
  Lock,
  CalendarCheck,
  Plus,
  Pencil,
  Trash2,
  Clock,
  History,
  StickyNote,
  Gauge,
  Timer,
  ClipboardCheck,
  Wifi,
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
  TabLoading,
} from "../_shared/tab-kit";

import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import { MeterBar } from "@/components/charts";
import { clientService } from "@/lib/api/clientService";
import {
  Section,
  EmptyState,
  StatCard,
  StatsStrip,
  StatusBadge,
  Modal,
  Field,
  GlassPanel,
  IconTile,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa, soloFechaCivil } from "@/lib/horaDeLaEmpresa";
// ── Shape of GET /client-account/:id/contract (clientAccountContract.ts) ──
interface ContractTerms {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
  contractNumber: string | null;
  contractType: string | null;
  currency: string | null;
  paymentTerms: string | null;
  contractDate: string | null;
  contractEndDate: string | null;
  autoRenew: boolean | null;
  autoRenewDaysBefore: number | null;
  penaltyClause: string | null;
  earlyCancellationNotice: string | null;
  jurisdiction: string | null;
  contractedHoursPerMonth: number | null;
  contractNotes: string | null;
  slaUptimeTarget: number | null;
  slaResponseMinutes: number | null;
  slaRoundsTarget: number | null;
  slaReportsTarget: number | null;
}
interface ContractServiceRow {
  id: string;
  serviceKey: string;
  name: string;
  unit?: string | null;
  description?: string | null;
  contractedQty: number | null;
  slaTarget?: number | null;
  active: boolean;
  used: number | null;
  compliance: number | null;
  sortOrder?: number;
}
interface ContractRenewalRow {
  id: string;
  periodLabel?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  durationMonths?: number | null;
  status?: string | null;
}
interface ContractDerived {
  sedesCount: number;
  stationsCount: number;
  guardsCount: number;
  hoursUsed: number;
  hoursContracted: number | null;
  daysRemaining: number | null;
  durationMonths: number | null;
  incidentsThisMonth: number;
  roundsCompliance: number | null;
  tenantTimezone: string | null;
}
interface ContractData {
  contract: ContractTerms;
  services: ContractServiceRow[];
  renewals: ContractRenewalRow[];
  usage: Record<string, number | null>;
  derived: ContractDerived;
}
// Subset of a client-document row we render in the "Documentos del contrato" panel.
interface DocRow {
  id: string;
  name?: string;
  filename?: string;
  downloadUrl?: string | null;
  url?: string | null;
  createdAt?: string;
}

// Edit-modal buffer: text/number inputs held as strings; autoRenew is the only boolean.
interface ContractForm {
  contractNumber?: string;
  contractType?: string;
  currency?: string;
  paymentTerms?: string;
  contractDate?: string;
  contractEndDate?: string;
  autoRenew?: boolean;
  autoRenewDaysBefore?: string | number;
  contractedHoursPerMonth?: string | number;
  jurisdiction?: string;
  penaltyClause?: string;
  earlyCancellationNotice?: string;
  slaUptimeTarget?: string | number;
  slaResponseMinutes?: string | number;
  slaRoundsTarget?: string | number;
  slaReportsTarget?: string | number;
  contractNotes?: string;
  [k: string]: string | number | boolean | undefined;
}

// ----- service catalog metadata (drives live-usage on the backend) ----------
// Constante de módulo: se evalúa al cargar, antes de que el idioma esté listo.
// Por eso guarda la CLAVE (nameKey) y el nombre se traduce donde se pinta.
const SERVICE_PRESETS: Record<
  string,
  {
    nameKey?: string;
    name: string;
    unitKey?: string;
    unit: string;
    icon: LucideIcon;
  }
> = {
  fixed_guard: {
    nameKey: "clients.contract.service.fixedGuard",
    name: "Vigilancia fija 24/7",
    unitKey: "ui.ClientContract.unidad.estacion",
    unit: "Estación",
    icon: Shield,
  },
  mobile_patrol: {
    nameKey: "clients.contract.service.mobilePatrol",
    name: "Patrullaje móvil",
    unitKey: "ui.ClientContract.unidad.rondas",
    unit: "Rondas",
    icon: Car,
  },
  camera_monitoring: {
    nameKey: "clients.contract.service.cameraMonitoring",
    name: "Monitoreo de cámaras",
    unitKey: "ui.ClientContract.unidad.camaras",
    unit: "Cámaras",
    icon: Monitor,
  },
  access_control: {
    nameKey: "clients.contract.service.accessControl",
    name: "Control de acceso",
    unitKey: "ui.ClientContract.unidad.estacion",
    unit: "Estación",
    icon: UserCheck,
  },
  visitor_management: {
    nameKey: "clients.contract.service.visitorManagement",
    name: "Gestión de visitantes",
    unitKey: "ui.ClientContract.unidad.visitantes",
    unit: "Visitantes",
    icon: Users,
  },
  alarm_response: {
    nameKey: "clients.contract.service.alarmResponse",
    name: "Respuesta a alarmas",
    unitKey: "ui.ClientContract.unidad.eventos",
    unit: "Eventos",
    icon: Bell,
  },
  asset_custody: {
    nameKey: "clients.contract.service.assetCustody",
    name: "Custodia de activos",
    unitKey: "ui.ClientContract.unidad.servicio",
    unit: "Servicio",
    icon: Lock,
  },
  event_security: {
    nameKey: "clients.contract.service.eventSecurity",
    name: "Seguridad para eventos",
    unitKey: "ui.ClientContract.unidad.eventos",
    unit: "Eventos",
    icon: CalendarCheck,
  },
  custom: { name: "", unit: "", icon: ClipboardList },
};
const SERVICE_KEYS = Object.keys(SERVICE_PRESETS);

/* Firma, vencimiento y renovación son DÍAS CIVILES: el día que dice el contrato,
   sin hora y sin zona. Aplicarles la zona de la empresa los movería un día. */
const fmtDate = (d: string | number | Date | null | undefined) =>
  soloFechaCivil(d as string, {}, "—");
const orDash = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : (v as ReactNode);

function Bar({
  pct,
  tone = "ok",
}: {
  pct: number;
  tone?: "ok" | "warn" | "crit";
}) {
  return (
    <MeterBar
      className="min-w-[60px]"
      height={6}
      minVisiblePct={3}
      pct={pct}
      tone={tone === "crit" ? "bad" : tone === "warn" ? "warn" : "ok"}
    />
  );
}

export default function ClientContract({ client }: { client: Client }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);

  const [data, setData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  // Real contract documents (Documentos tab, categoría "Contratos") — the old
  // panel was a hardcoded EmptyState that said "Sin documentos" forever.
  const [contractDocs, setContractDocs] = useState<DocRow[]>([]);

  useEffect(() => {
    let alive = true;

    if (!client?.id) return;
    // getClientDocuments returns { documents: DocRow[], ... } — the array is
    // under `documents` (NOT rows/docs), so read that field.
    clientService
      .getClientDocuments(client.id, { category: "Contratos", perPage: 20 })
      .then((r) => {
        if (alive) setContractDocs(Array.isArray(r) ? r : (r?.documents ?? []));
      })
      .catch(() => {
        /* keep empty */
      });

    return () => {
      alive = false;
    };
  }, [client?.id]);

  const [editOpen, setEditOpen] = useState(false);
  // Controlled-form buffers: numeric inputs are held as strings while editing;
  // autoRenew is the only boolean (bound via `checked`, not `value`).
  const [form, setForm] = useState<ContractForm>({});
  const [saving, setSaving] = useState(false);

  const [svcOpen, setSvcOpen] = useState(false);
  // Service/renewal edit buffers spread a row then hold string-typed input values;
  // deliberately loose while editing.
  const [svcForm, setSvcForm] = useState<any>(null);

  const [renOpen, setRenOpen] = useState(false);
  const [renForm, setRenForm] = useState<any>(null);

  const load = async () => {
    try {
      const d = await clientService.getClientContract(client.id);

      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [client.id]);

  const c: Partial<ContractTerms> = data?.contract || {};
  const derived: Partial<ContractDerived> = data?.derived || {};
  const services: ContractServiceRow[] = data?.services || [];
  const renewals: ContractRenewalRow[] = data?.renewals || [];

  const diff = useMemo(() => {
    if (derived.hoursContracted == null) return null;

    return (derived.hoursUsed || 0) - derived.hoursContracted;
  }, [derived]);

  // ---- contract terms modal -------------------------------------------------
  const openEdit = () => {
    setForm({
      contractNumber: c.contractNumber || "",
      contractType: c.contractType || "",
      currency: c.currency || "USD",
      paymentTerms: c.paymentTerms || "",
      contractDate: c.contractDate || "",
      contractEndDate: c.contractEndDate || "",
      autoRenew: !!c.autoRenew,
      autoRenewDaysBefore: c.autoRenewDaysBefore ?? "",
      penaltyClause: c.penaltyClause || "",
      earlyCancellationNotice: c.earlyCancellationNotice || "",
      jurisdiction: c.jurisdiction || "",
      contractedHoursPerMonth: c.contractedHoursPerMonth ?? "",
      contractNotes: c.contractNotes || "",
      slaUptimeTarget: c.slaUptimeTarget ?? "",
      slaResponseMinutes: c.slaResponseMinutes ?? "",
      slaRoundsTarget: c.slaRoundsTarget ?? "",
      slaReportsTarget: c.slaReportsTarget ?? "",
    });
    setEditOpen(true);
  };
  const saveContract = async () => {
    setSaving(true);
    try {
      await clientService.updateClientContract(client.id, form);
      toast.success(
        t("ui.ClientContract.contratoActualizado", "Contrato actualizado"),
      );
      setEditOpen(false);
      await load();
    } catch {
      toast.error(t("comun.noSePudoGuardar"));
    } finally {
      setSaving(false);
    }
  };

  // ---- service modal --------------------------------------------------------
  /** El nombre del preset se traduce AQUÍ, no en la constante de módulo. */
  const nombrePreset = (p?: { nameKey?: string; name: string }) =>
    p?.nameKey ? t(p.nameKey, p.name) : (p?.name ?? "");
  /** Igual con la unidad: se rellena ya traducida en el formulario. */
  const unidadPreset = (p?: { unitKey?: string; unit: string }) =>
    p?.unitKey ? t(p.unitKey, p.unit) : (p?.unit ?? "");
  const openSvc = (s?: ContractServiceRow) => {
    setSvcForm(
      s
        ? { ...s }
        : {
            serviceKey: "fixed_guard",
            name: nombrePreset(SERVICE_PRESETS.fixed_guard),
            unit: unidadPreset(SERVICE_PRESETS.fixed_guard),
            description: "",
            contractedQty: "",
            slaTarget: "",
            active: true,
          },
    );
    setSvcOpen(true);
  };
  const saveSvc = async () => {
    if (!svcForm?.name?.trim()) {
      toast.error(t("ui.ClientContract.nombreDelServicioRequerido"));

      return;
    }
    setSaving(true);
    try {
      if (svcForm.id)
        await clientService.updateContractService(
          client.id,
          svcForm.id,
          svcForm,
        );
      else await clientService.createContractService(client.id, svcForm);
      setSvcOpen(false);
      await load();
    } catch {
      toast.error(t("ui.ClientContract.noSePudoGuardarEl"));
    } finally {
      setSaving(false);
    }
  };
  const delSvc = async (s: ContractServiceRow) => {
    if (
      !(await confirmDialog({
        message: t("ui.ClientContract.eliminarElServicioConfirm", {
          defaultValue: '¿Eliminar el servicio "{{name}}"?',
          name: s.name,
        }),
        tone: "danger",
      }))
    )
      return;
    try {
      await clientService.deleteContractService(client.id, s.id);
      await load();
    } catch {
      toast.error(t("comun.noSePudoEliminar"));
    }
  };

  // ---- renewal modal --------------------------------------------------------
  const openRen = (r?: ContractRenewalRow) => {
    setRenForm(
      r
        ? { ...r }
        : {
            periodLabel: "",
            fromDate: "",
            toDate: "",
            durationMonths: "",
            status: "active",
          },
    );
    setRenOpen(true);
  };
  const saveRen = async () => {
    setSaving(true);
    try {
      if (renForm.id)
        await clientService.updateContractRenewal(
          client.id,
          renForm.id,
          renForm,
        );
      else await clientService.createContractRenewal(client.id, renForm);
      setRenOpen(false);
      await load();
    } catch {
      toast.error(t("comun.noSePudoGuardar"));
    } finally {
      setSaving(false);
    }
  };
  const delRen = async (r: ContractRenewalRow) => {
    if (
      !(await confirmDialog({
        message: t(
          "ui.ClientContract.eliminarPeriodoConfirm",
          "¿Eliminar este periodo del historial?",
        ),
        tone: "danger",
      }))
    )
      return;
    try {
      await clientService.deleteContractRenewal(client.id, r.id);
      await load();
    } catch {
      toast.error(t("comun.noSePudoEliminar"));
    }
  };

  if (loading) return <TabLoading />;

  const renewalDate = c.contractEndDate;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Estado del contrato strip */}
      <GlassPanel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            <div>
              <div className="cg-eyebrow">
                {t("ui.ClientContract.estadoDelContrato")}
              </div>
              <div className="mt-1">
                <StatusBadge tone={c.active ? "ok" : "neutral"}>
                  {c.active
                    ? t("common.active", "Activo")
                    : t("common.inactive", "Inactivo")}
                </StatusBadge>
              </div>
            </div>
            <div>
              <div className="cg-eyebrow">
                {t("ui.ClientContract.diasRestantes", "Días restantes")}
              </div>
              <div
                className="mt-1 font-display text-2xl font-bold tabular-nums"
                style={{
                  color:
                    derived.daysRemaining != null && derived.daysRemaining < 30
                      ? "var(--warn-text)"
                      : "var(--ok-text)",
                }}
              >
                {derived.daysRemaining != null
                  ? t("ui.DataReport.nDias", {
                      defaultValue: "{{count}} días",
                      count: derived.daysRemaining,
                    })
                  : "—"}
              </div>
            </div>
            <div>
              <div className="cg-eyebrow">
                {t("ui.ClientContract.proximaRenovacion", "Próxima renovación")}
              </div>
              {/* Misma tipografía que «Días restantes»: son dos métricas de la
                  misma tira y con pesos distintos una parecía más importante. */}
              <div className="mt-1 font-display text-2xl font-bold tabular-nums">
                {fmtDate(renewalDate)}
              </div>
            </div>
          </div>
          <Button onClick={openEdit}>
            <Pencil className="mr-2 h-4 w-4" />{" "}
            {t("ui.ClientContract.editarContrato")}
          </Button>
        </div>
      </GlassPanel>

      {/* Row 1 — four info cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Section
          icon={<FileText className="h-4 w-4" />}
          title={t(
            "ui.ClientContract.informacionDelContrato",
            "Información del contrato",
          )}
        >
          <div className="space-y-2.5">
            <Field
              label={t(
                "ui.ClientContract.numeroDeContrato",
                "Número de contrato",
              )}
              value={orDash(c.contractNumber)}
            />
            <Field
              label={t("ui.ClientContract.tipoDeContrato")}
              value={orDash(c.contractType)}
            />
            <Field
              label={t("ui.ClientContract.moneda", "Moneda")}
              value={orDash(c.currency)}
            />
            <Field
              label={t("ui.ClientContract.formaDePago", "Forma de pago")}
              value={orDash(c.paymentTerms)}
            />
          </div>
        </Section>

        <Section
          icon={<Calendar className="h-4 w-4" />}
          title={t("ui.ClientContract.fechas", "Fechas")}
        >
          <div className="space-y-2.5">
            <Field
              label={t("comun.fechaDeInicio")}
              value={fmtDate(c.contractDate)}
            />
            <Field
              label={t("comun.fechaDeVencimiento")}
              value={fmtDate(c.contractEndDate)}
            />
            <Field
              label={t("ui.ClientContract.duracion", "Duración")}
              value={
                derived.durationMonths != null
                  ? t("ui.ClientContract.nMeses", {
                      defaultValue: "{{count}} meses",
                      count: derived.durationMonths,
                    })
                  : "—"
              }
            />
            <Field
              label={t(
                "ui.ClientContract.renovacionAutomatica",
                "Renovación automática",
              )}
              value={
                c.autoRenew
                  ? c.autoRenewDaysBefore
                    ? t("ui.ClientContract.siNDiasAntes", {
                        defaultValue: "Sí ({{count}} días antes)",
                        count: Number(c.autoRenewDaysBefore),
                      })
                    : t("ui.Task.si", "Sí")
                  : t("ui.Task.no", "No")
              }
            />
          </div>
        </Section>

        <Section
          icon={<ScrollText className="h-4 w-4" />}
          title={t(
            "ui.ClientContract.terminosPrincipales",
            "Términos principales",
          )}
        >
          <div className="space-y-2.5">
            <Field
              label={t("ui.ClientContract.slaAcordado", "SLA acordado")}
              value={
                c.slaUptimeTarget != null
                  ? t("ui.ClientContract.pctCumplimiento", {
                      defaultValue: "{{pct}}% de cumplimiento",
                      pct: c.slaUptimeTarget,
                    })
                  : "—"
              }
            />
            <Field
              label={t(
                "ui.ClientContract.penalizacionPorIncumplimiento",
                "Penalización por incumplimiento",
              )}
              value={orDash(c.penaltyClause)}
            />
            <Field
              label={t(
                "ui.ClientContract.cancelacionAnticipada",
                "Cancelación anticipada",
              )}
              value={orDash(c.earlyCancellationNotice)}
            />
            <Field
              label={t("ui.ClientContract.jurisdiccion", "Jurisdicción")}
              value={orDash(c.jurisdiction)}
            />
          </div>
        </Section>

        <Section
          icon={<ClipboardList className="h-4 w-4" />}
          title={t("ui.ClientContract.documentosDelContrato")}
        >
          {contractDocs.length === 0 ? (
            <EmptyState
              description={t("ui.ClientContract.subeElContratoFirmadoY")}
              icon={<FileText className="h-5 w-5" />}
              title={t("comun.sinDocumentos")}
            />
          ) : (
            <div className="divide-y">
              {contractDocs.map((d) => (
                <a
                  key={d.id}
                  className="flex items-center justify-between gap-2 rounded-md px-1 py-2.5"
                  href={d.downloadUrl || d.url || "#"}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {d.name ||
                        d.filename ||
                        t("ui.ClientContract.documento", "Documento")}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {d.createdAt
                      ? new Date(d.createdAt).toLocaleDateString(
                          localeActual(),
                          { timeZone: zonaDeLaEmpresa() },
                        )
                      : ""}
                  </span>
                </a>
              ))}
            </div>
          )}
        </Section>
      </div>

      {/* Servicios contratados */}
      <Section
        action={
          <Button size="sm" variant="outline" onClick={() => openSvc()}>
            <Plus className="mr-1.5 h-4 w-4" />{" "}
            {t("ui.ClientContract.agregarServicio")}
          </Button>
        }
        icon={<ClipboardCheck className="h-4 w-4" />}
        title={t(
          "ui.ClientContract.serviciosContratados",
          "Servicios contratados",
        )}
      >
        {services.length === 0 ? (
          <EmptyState
            action={
              <Button size="sm" onClick={() => openSvc()}>
                <Plus className="mr-1.5 h-4 w-4" />{" "}
                {t("ui.ClientContract.agregarServicio")}
              </Button>
            }
            description={t("ui.ClientContract.agregaLosServiciosDeEste")}
            icon={<ClipboardCheck className="h-5 w-5" />}
            title={t(
              "ui.ClientContract.aunNoHayServiciosContratados",
              "Aún no hay servicios contratados",
            )}
          />
        ) : (
          <TabTable>
            <THead>
              <Th>{t("ui.ClientContract.servicio", "Servicio")}</Th>
              <Th>{t("ui.ClientContract.descripcion", "Descripción")}</Th>
              <Th>{t("ui.ClientContract.unidadCol", "Unidad")}</Th>
              <Th align="right">
                {t("ui.ClientContract.contratado", "Contratado")}
              </Th>
              <Th align="right">
                {t("ui.ClientContract.utilizadoMes", "Utilizado (mes)")}
              </Th>
              <Th>{t("ui.ClientContract.cumplimiento", "Cumplimiento")}</Th>
              <Th>{t("comun.estado")}</Th>
              <Th aria-label={t("ui.RouteForm.acciones", "Acciones")} />
            </THead>
            <tbody>
              {services.map((s) => {
                const Icon =
                  SERVICE_PRESETS[s.serviceKey]?.icon || ClipboardList;
                const contracted =
                  s.contractedQty == null
                    ? t("ui.ClientContract.ilimitado", "Ilimitado")
                    : s.contractedQty;
                const used =
                  s.used == null ? "—" : s.used.toLocaleString(localeActual());
                const comp = s.compliance;
                const target = s.slaTarget ?? 90;
                const estado =
                  comp == null
                    ? "Activo"
                    : comp >= target
                      ? "Cumple"
                      : "Atención";
                const tone =
                  comp == null
                    ? "ok"
                    : comp >= target
                      ? "ok"
                      : comp >= target * 0.75
                        ? "warn"
                        : "crit";

                return (
                  <Tr key={s.id}>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2 font-medium">
                        <IconTile size="sm">
                          <Icon />
                        </IconTile>
                        {s.name}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      {s.description || "—"}
                    </td>
                    <td className="px-2 py-2.5">{s.unit || "—"}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {contracted}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {used}
                    </td>
                    <td className="px-2 py-2.5">
                      {comp == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="w-9 text-xs tabular-nums">
                            {comp}%
                          </span>
                          <Bar pct={comp} tone={tone} />
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusBadge
                        tone={
                          estado === "Cumple"
                            ? "green"
                            : estado === "Atención"
                              ? "orange"
                              : "slate"
                        }
                      >
                        {estado === "Cumple"
                          ? t("ui.ClientContract.cumple", "Cumple")
                          : estado === "Atención"
                            ? t("ui.ClientContract.atencion", "Atención")
                            : t("common.active", "Activo")}
                      </StatusBadge>
                    </td>
                    <td className="px-2 py-2.5">
                      <RowActions>
                        <RowAction
                          title={t("ui.ClientContract.editarServicio")}
                          onClick={() => openSvc(s)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </RowAction>
                        <RowAction
                          title={t("ui.ClientContract.eliminarServicio")}
                          tone="bad"
                          onClick={() => delSvc(s)}
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
      </Section>

      {/* Stat cards */}
      <StatsStrip className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          hint={t("ui.ClientContract.segunElContrato", "Según el contrato")}
          icon={<Clock className="h-4 w-4" />}
          label={t(
            "ui.ClientContract.horasContratadasMes",
            "Horas contratadas / mes",
          )}
          value={
            derived.hoursContracted != null
              ? `${derived.hoursContracted.toLocaleString(localeActual())} h`
              : "—"
          }
        />
        <StatCard
          hint={t("ui.ClientContract.deTurnosReales", "De turnos reales")}
          icon={<Timer className="h-4 w-4" />}
          label={t(
            "ui.ClientContract.horasUtilizadasMes",
            "Horas utilizadas (mes)",
          )}
          value={`${(derived.hoursUsed || 0).toLocaleString(localeActual())} h`}
        />
        <StatCard
          accent={diff != null && diff < 0 ? "red" : "green"}
          hint={
            diff == null
              ? t(
                  "ui.ClientContract.defineHorasContratadas",
                  "Define horas contratadas",
                )
              : diff < 0
                ? t(
                    "ui.ClientContract.porDebajoDeLoContratado",
                    "Por debajo de lo contratado",
                  )
                : t(
                    "ui.ClientContract.dentroSobreLoContratado",
                    "Dentro / sobre lo contratado",
                  )
          }
          icon={<Gauge className="h-4 w-4" />}
          label={t("ui.ClientContract.diferencia", "Diferencia")}
          value={
            diff == null
              ? "—"
              : `${diff > 0 ? "+" : ""}${diff.toLocaleString(localeActual())} h`
          }
        />
        <StatCard
          hint={t("ui.ClientContract.rondasDelMesVsContratado")}
          icon={<ClipboardCheck className="h-4 w-4" />}
          label={t(
            "ui.ClientContract.cumplimientoDeRondas",
            "Cumplimiento de rondas",
          )}
          value={
            derived.roundsCompliance != null
              ? `${derived.roundsCompliance}%`
              : "—"
          }
        />
      </StatsStrip>

      {/* Row 3 — SLA, notas, historial */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section
          icon={<Gauge className="h-4 w-4" />}
          title={t(
            "ui.ClientContract.acuerdoDeNivelDeServicioSla",
            "Acuerdo de nivel de servicio (SLA)",
          )}
        >
          <div className="grid grid-cols-2 gap-4">
            <SlaCell
              icon={<Wifi className="h-4 w-4" />}
              label={t("ui.ClientContract.uptimeDelServicio")}
              suffix="%"
              value={c.slaUptimeTarget}
            />
            <SlaCell
              icon={<Timer className="h-4 w-4" />}
              label={t(
                "ui.ClientContract.tiempoDeRespuesta",
                "Tiempo de respuesta",
              )}
              suffix=" min"
              value={c.slaResponseMinutes}
            />
            <SlaCell
              actual={derived.roundsCompliance}
              icon={<ClipboardCheck className="h-4 w-4" />}
              label={t(
                "ui.ClientContract.cumplimientoDeRondas",
                "Cumplimiento de rondas",
              )}
              suffix="%"
              value={c.slaRoundsTarget}
            />
            <SlaCell
              icon={<FileText className="h-4 w-4" />}
              label={t(
                "ui.ClientContract.reportesEntregados",
                "Reportes entregados",
              )}
              suffix="%"
              value={c.slaReportsTarget}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("ui.ClientContract.objetivosAcordadosEnElContrato")}
          </p>
        </Section>

        <Section
          icon={<StickyNote className="h-4 w-4" />}
          title={t("ui.ClientContract.notasDelContrato")}
        >
          {c.contractNotes ? (
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {c.contractNotes}
            </p>
          ) : (
            <EmptyState
              description={t("ui.ClientContract.agregaNotasDelContratoAl")}
              icon={<StickyNote className="h-5 w-5" />}
              title={t("ui.ClientContract.sinNotas")}
            />
          )}
        </Section>

        <Section
          action={
            <Button size="sm" variant="outline" onClick={() => openRen()}>
              <Plus className="mr-1.5 h-4 w-4" /> {t("actions.add")}
            </Button>
          }
          icon={<History className="h-4 w-4" />}
          title={t(
            "ui.ClientContract.historialDeRenovaciones",
            "Historial de renovaciones",
          )}
        >
          {renewals.length === 0 ? (
            <EmptyState
              description={t(
                "ui.ClientContract.registraLosPeriodosDelContrato",
              )}
              icon={<History className="h-5 w-5" />}
              title={t("ui.ClientContract.sinHistorial")}
            />
          ) : (
            <TabTable minWidth={560}>
              <THead>
                <Th>{t("ui.ClientContract.periodo", "Periodo")}</Th>
                <Th>{t("comun.desde")}</Th>
                <Th>{t("comun.hasta")}</Th>
                <Th>{t("ui.ClientContract.duracion", "Duración")}</Th>
                <Th>{t("comun.estado")}</Th>
                <Th aria-label={t("ui.RouteForm.acciones", "Acciones")} />
              </THead>
              <tbody>
                {renewals.map((r) => (
                  <Tr key={r.id}>
                    <td className="px-2 py-2.5 font-medium">
                      {r.periodLabel || "—"}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {fmtDate(r.fromDate)}
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {fmtDate(r.toDate)}
                    </td>
                    <td className="px-2 py-2.5">
                      {r.durationMonths
                        ? t("ui.ClientContract.nMeses", {
                            defaultValue: "{{count}} meses",
                            count: Number(r.durationMonths),
                          })
                        : "—"}
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusBadge
                        tone={r.status === "active" ? "green" : "slate"}
                      >
                        {r.status === "active"
                          ? t("common.active", "Activo")
                          : t("ui.ClientContract.finalizado", "Finalizado")}
                      </StatusBadge>
                    </td>
                    <td className="px-2 py-2.5">
                      <RowActions>
                        <RowAction
                          title={t("ui.ClientContract.editarPeriodo")}
                          onClick={() => openRen(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </RowAction>
                        <RowAction
                          title={t("ui.ClientContract.eliminarPeriodo")}
                          tone="bad"
                          onClick={() => delRen(r)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </RowAction>
                      </RowActions>
                    </td>
                  </Tr>
                ))}
              </tbody>
            </TabTable>
          )}
        </Section>
      </div>

      {/* ---- Contract terms modal ---- */}
      <Modal
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button disabled={saving} onClick={saveContract}>
              {saving
                ? t("common.saving", "Guardando…")
                : t("actions.save", "Guardar")}
            </Button>
          </>
        }
        icon={<FileText className="h-5 w-5" />}
        open={editOpen}
        size="lg"
        title={t("ui.ClientContract.editarContrato")}
        onOpenChange={setEditOpen}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledField
            label={t(
              "ui.ClientContract.numeroDeContrato2",
              "Número de contrato",
            )}
          >
            <input
              className={FIELD_CLS}
              value={form.contractNumber}
              onChange={(e) =>
                setForm({ ...form, contractNumber: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField label={t("ui.ClientContract.tipoDeContrato")}>
            <input
              className={FIELD_CLS}
              placeholder={t(
                "ui.ClientContract.phServicioIntegral",
                "Servicio integral",
              )}
              value={form.contractType}
              onChange={(e) =>
                setForm({ ...form, contractType: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField label={t("ui.ClientContract.moneda", "Moneda")}>
            <input
              className={FIELD_CLS}
              placeholder="USD"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </LabeledField>
          <LabeledField
            label={t("ui.ClientContract.formaDePago", "Forma de pago")}
          >
            <input
              className={FIELD_CLS}
              placeholder={t("ui.ClientContract.phMensual", "Mensual")}
              value={form.paymentTerms}
              onChange={(e) =>
                setForm({ ...form, paymentTerms: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField label={t("comun.fechaDeInicio")}>
            <input
              className={FIELD_CLS}
              type="date"
              value={form.contractDate || ""}
              onChange={(e) =>
                setForm({ ...form, contractDate: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField label={t("comun.fechaDeVencimiento")}>
            <input
              className={FIELD_CLS}
              type="date"
              value={form.contractEndDate || ""}
              onChange={(e) =>
                setForm({ ...form, contractEndDate: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField
            label={t(
              "ui.ClientContract.renovacionAutomatica2",
              "Renovación automática",
            )}
          >
            <div className="flex items-center gap-2 h-9">
              <input
                checked={!!form.autoRenew}
                className="h-4 w-4"
                id="autoRenew"
                type="checkbox"
                onChange={(e) =>
                  setForm({ ...form, autoRenew: e.target.checked })
                }
              />
              <label
                className="text-sm text-muted-foreground"
                htmlFor="autoRenew"
              >
                {t(
                  "ui.ClientContract.renovarAutomaticamente",
                  "Renovar automáticamente",
                )}
              </label>
            </div>
          </LabeledField>
          <LabeledField
            label={t(
              "ui.ClientContract.avisoDeRenovacionDiasAntes",
              "Aviso de renovación (días antes)",
            )}
          >
            <input
              className={FIELD_CLS}
              type="number"
              value={form.autoRenewDaysBefore}
              onChange={(e) =>
                setForm({ ...form, autoRenewDaysBefore: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField
            label={t(
              "ui.ClientContract.horasContratadasMes",
              "Horas contratadas / mes",
            )}
          >
            <input
              className={FIELD_CLS}
              type="number"
              value={form.contractedHoursPerMonth}
              onChange={(e) =>
                setForm({ ...form, contractedHoursPerMonth: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField
            label={t("ui.ClientContract.jurisdiccion2", "Jurisdicción")}
          >
            <input
              className={FIELD_CLS}
              placeholder={t("ui.ClientContract.phJurisdiccion", "Ecuador")}
              value={form.jurisdiction}
              onChange={(e) =>
                setForm({ ...form, jurisdiction: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField
            full
            label={t(
              "ui.ClientContract.penalizacionPorIncumplimiento2",
              "Penalización por incumplimiento",
            )}
          >
            <input
              className={FIELD_CLS}
              placeholder={t(
                "ui.ClientContract.creditoDel5Mensual",
                "Crédito del 5% mensual",
              )}
              value={form.penaltyClause}
              onChange={(e) =>
                setForm({ ...form, penaltyClause: e.target.value })
              }
            />
          </LabeledField>
          <LabeledField
            full
            label={t(
              "ui.ClientContract.cancelacionAnticipada2",
              "Cancelación anticipada",
            )}
          >
            <input
              className={FIELD_CLS}
              placeholder={t(
                "ui.ClientContract.60DiasDeNotificacion",
                "60 días de notificación",
              )}
              value={form.earlyCancellationNotice}
              onChange={(e) =>
                setForm({ ...form, earlyCancellationNotice: e.target.value })
              }
            />
          </LabeledField>
          <div className="sm:col-span-2 mt-1 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LabeledField
              label={t("ui.ClientContract.slaUptimePct", "SLA uptime (%)")}
            >
              <input
                className={FIELD_CLS}
                type="number"
                value={form.slaUptimeTarget}
                onChange={(e) =>
                  setForm({ ...form, slaUptimeTarget: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField
              label={t("ui.ClientContract.respuestaMin", "Respuesta (min)")}
            >
              <input
                className={FIELD_CLS}
                type="number"
                value={form.slaResponseMinutes}
                onChange={(e) =>
                  setForm({ ...form, slaResponseMinutes: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField
              label={t("ui.ClientContract.rondasPct", "Rondas (%)")}
            >
              <input
                className={FIELD_CLS}
                type="number"
                value={form.slaRoundsTarget}
                onChange={(e) =>
                  setForm({ ...form, slaRoundsTarget: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField
              label={t("ui.ClientContract.reportesPct", "Reportes (%)")}
            >
              <input
                className={FIELD_CLS}
                type="number"
                value={form.slaReportsTarget}
                onChange={(e) =>
                  setForm({ ...form, slaReportsTarget: e.target.value })
                }
              />
            </LabeledField>
          </div>
          <LabeledField full label={t("ui.ClientContract.notasDelContrato")}>
            <textarea
              className={`${FIELD_CLS} h-auto py-2`}
              rows={3}
              value={form.contractNotes}
              onChange={(e) =>
                setForm({ ...form, contractNotes: e.target.value })
              }
            />
          </LabeledField>
        </div>
      </Modal>

      {/* ---- Service modal ---- */}
      <Modal
        footer={
          <>
            <Button variant="outline" onClick={() => setSvcOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button disabled={saving} onClick={saveSvc}>
              {saving
                ? t("common.saving", "Guardando…")
                : t("actions.save", "Guardar")}
            </Button>
          </>
        }
        icon={<ClipboardCheck className="h-5 w-5" />}
        open={svcOpen}
        title={
          svcForm?.id
            ? t("ui.ClientContract.editarServicio", "Editar servicio")
            : t("ui.ClientContract.agregarServicio", "Agregar servicio")
        }
        onOpenChange={setSvcOpen}
      >
        {svcForm && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledField full label={t("ui.ClientContract.tipoDeServicio")}>
              <select
                className={FIELD_CLS}
                value={svcForm.serviceKey}
                onChange={(e) => {
                  const k = e.target.value;
                  const p = SERVICE_PRESETS[k];

                  setSvcForm({
                    ...svcForm,
                    serviceKey: k,
                    name:
                      (svcForm.id ? svcForm.name : nombrePreset(p)) ||
                      svcForm.name,
                    unit:
                      (svcForm.id ? svcForm.unit : unidadPreset(p)) ||
                      svcForm.unit,
                  });
                }}
              >
                {SERVICE_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k === "custom"
                      ? t("clients.contract.service.custom", "Personalizado")
                      : nombrePreset(SERVICE_PRESETS[k])}
                  </option>
                ))}
              </select>
            </LabeledField>
            <LabeledField full label={t("comun.nombre")}>
              <input
                className={FIELD_CLS}
                value={svcForm.name}
                onChange={(e) =>
                  setSvcForm({ ...svcForm, name: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField
              full
              label={t("ui.ClientContract.descripcion", "Descripción")}
            >
              <input
                className={FIELD_CLS}
                value={svcForm.description || ""}
                onChange={(e) =>
                  setSvcForm({ ...svcForm, description: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField label={t("ui.ClientContract.unidadCol", "Unidad")}>
              <input
                className={FIELD_CLS}
                placeholder={t(
                  "ui.ClientContract.estacionRondas",
                  "Estación, Rondas…",
                )}
                value={svcForm.unit || ""}
                onChange={(e) =>
                  setSvcForm({ ...svcForm, unit: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField
              label={t(
                "ui.ClientContract.cantidadContratada",
                "Cantidad contratada",
              )}
            >
              <input
                className={FIELD_CLS}
                placeholder={t(
                  "ui.ClientContract.vacioIlimitado",
                  "Vacío = ilimitado",
                )}
                type="number"
                value={svcForm.contractedQty ?? ""}
                onChange={(e) =>
                  setSvcForm({ ...svcForm, contractedQty: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField
              label={t("ui.ClientContract.objetivoSlaPct", "Objetivo SLA (%)")}
            >
              <input
                className={FIELD_CLS}
                type="number"
                value={svcForm.slaTarget ?? ""}
                onChange={(e) =>
                  setSvcForm({ ...svcForm, slaTarget: e.target.value })
                }
              />
            </LabeledField>
          </div>
        )}
      </Modal>

      {/* ---- Renewal modal ---- */}
      <Modal
        footer={
          <>
            <Button variant="outline" onClick={() => setRenOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button disabled={saving} onClick={saveRen}>
              {saving
                ? t("common.saving", "Guardando…")
                : t("actions.save", "Guardar")}
            </Button>
          </>
        }
        icon={<History className="h-5 w-5" />}
        open={renOpen}
        title={
          renForm?.id
            ? t("ui.ClientContract.editarPeriodo", "Editar periodo")
            : t("ui.ClientContract.agregarPeriodo", "Agregar periodo")
        }
        onOpenChange={setRenOpen}
      >
        {renForm && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LabeledField
              full
              label={t("ui.ClientContract.periodo", "Periodo")}
            >
              <input
                className={FIELD_CLS}
                placeholder={t("ui.ClientContract.actualAnterior")}
                value={renForm.periodLabel}
                onChange={(e) =>
                  setRenForm({ ...renForm, periodLabel: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField label={t("comun.desde")}>
              <input
                className={FIELD_CLS}
                type="date"
                value={renForm.fromDate || ""}
                onChange={(e) =>
                  setRenForm({ ...renForm, fromDate: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField label={t("comun.hasta")}>
              <input
                className={FIELD_CLS}
                type="date"
                value={renForm.toDate || ""}
                onChange={(e) =>
                  setRenForm({ ...renForm, toDate: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField
              label={t("ui.ClientContract.duracionMeses", "Duración (meses)")}
            >
              <input
                className={FIELD_CLS}
                type="number"
                value={renForm.durationMonths ?? ""}
                onChange={(e) =>
                  setRenForm({ ...renForm, durationMonths: e.target.value })
                }
              />
            </LabeledField>
            <LabeledField label={t("comun.estado")}>
              <select
                className={FIELD_CLS}
                value={renForm.status}
                onChange={(e) =>
                  setRenForm({ ...renForm, status: e.target.value })
                }
              >
                <option value="active">{t("common.active")}</option>
                <option value="finished">
                  {t("ui.ClientContract.finalizado", "Finalizado")}
                </option>
              </select>
            </LabeledField>
          </div>
        )}
      </Modal>
    </div>
  );
}

function SlaCell({
  icon,
  label,
  value,
  suffix,
  actual,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  suffix?: string;
  actual?: number | null;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="cg-eyebrow flex items-center gap-1.5 [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-bold tabular-nums">
        {value != null && value !== "" ? `${value}${suffix || ""}` : "—"}
      </div>
      {actual != null && (
        <div className="text-xs" style={{ color: "var(--ink-faint)" }}>
          {t("ui.ClientContract.realPct", {
            defaultValue: "Real: {{pct}}%",
            pct: actual,
          })}
        </div>
      )}
    </div>
  );
}

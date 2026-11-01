/**
 * ROLES DE PAGO — las planillas (corridas) de la empresa: una por periodo.
 * Crear una pide las tarjetas de horas del periodo y liquida a todos.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileSpreadsheet, Plus } from "lucide-react";

import {
  AvisoSoloLectura,
  PresentacionDelModulo,
  usePayrollAccess,
  dinero,
  useEtiquetas,
} from "./comun";

import EtiquetaDeSucursal from "@/components/sucursales/EtiquetaDeSucursal";
import { useEtiquetasDeSucursal } from "@/hooks/useEtiquetasDeSucursal";
import { useSucursales } from "@/hooks/useSucursales";
import { useEspacio } from "@/hooks/useEspacio";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  EmptyState,
  Modal,
  FormField,
  FIELD_CLS,
  StatusBadge,
  ListRow,
} from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import payrollSlipsService, {
  type PayrollRun,
  type Population,
  type RunStatus,
} from "@/lib/api/payrollSlipsService";
import { ErrorDeCarga } from "@/components/kit/ErrorDeCarga";

export function useEstadoDeCorrida() {
  const { t } = useTranslation();
  const label: Record<RunStatus, string> = {
    generating: t(
      "ui.RolesDePago.corridas.estado.generating",
      "Calculando horas…",
    ),
    review: t("ui.RolesDePago.corridas.estado.review", "En revisión"),
    published: t("ui.RolesDePago.corridas.estado.published", "Publicada"),
    voided: t("ui.RolesDePago.corridas.estado.voided", "Anulada"),
    error: t("ui.RolesDePago.corridas.estado.error", "Error"),
  };
  const tone: Record<RunStatus, string> = {
    generating: "info",
    review: "warn",
    published: "ok",
    voided: "neutral",
    error: "bad",
  };

  return { label, tone };
}

export default function CorridasDePago() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("payrollSlipEdit");
  const [nueva, setNueva] = useState(false);
  // Sucursales (vista global): de quién es cada planilla.
  const etiquetasSuc = useEtiquetasDeSucursal();
  // Switched off (read-only): only the issued sheets, and no /settings call.
  const acceso = usePayrollAccess();
  const vista = useQuery({
    queryKey: ["payroll-slips", "settings"],
    queryFn: () => payrollSlipsService.settings(),
    retry: false,
    enabled: acceso.full,
  });
  const corridas = useQuery({
    // Read-only answers only published sheets: never mix them with the full list.
    queryKey: acceso.readOnly
      ? ["payroll-slips", "runs", "issued"]
      : ["payroll-slips", "runs"],
    queryFn: () => payrollSlipsService.runs(),
    retry: false,
    enabled: acceso.canRead,
    refetchInterval: (q) =>
      (q.state.data?.rows ?? []).some((r) => r.status === "generating")
        ? 4000
        : false,
  });
  const modo = acceso.resolve(vista.error, corridas.error);
  const sinModulo = modo !== "full" && modo !== "readOnly";
  const soloLectura = modo === "readOnly";
  const puedeCrear = modo === "full" && canEdit;
  const estado = useEstadoDeCorrida();
  const decimalsOf = (r: PayrollRun) =>
    vista.data?.settings.decimals ?? r.settingsSnapshot?.decimals ?? 2;

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          actions={
            puedeCrear ? (
              <Button variant="brand" onClick={() => setNueva(true)}>
                <Plus size={14} />{" "}
                {t("ui.RolesDePago.corridas.nueva", "Nueva planilla")}
              </Button>
            ) : undefined
          }
          icon={<FileSpreadsheet />}
          subtitle={t(
            "ui.RolesDePago.corridas.subtitulo",
            "Una planilla por periodo: se calculan las horas, revisas cada rol, publicas y descargas los documentos.",
          )}
          title={t("ui.RolesDePago.corridas.titulo", "Planillas de pago")}
        />
        {soloLectura && (
          <div className="mb-4">
            <AvisoSoloLectura />
          </div>
        )}
        {sinModulo ? (
          <PresentacionDelModulo modo={modo} />
        ) : corridas.isLoading ? (
          <SkeletonCards count={3} />
        ) : corridas.isError && !(corridas.data?.rows ?? []).length ? (
          <ErrorDeCarga onRetry={() => corridas.refetch()} />
        ) : !(corridas.data?.rows ?? []).length ? (
          <EmptyState
            action={
              puedeCrear ? (
                <Button variant="brand" onClick={() => setNueva(true)}>
                  {t("ui.RolesDePago.corridas.nueva", "Nueva planilla")}
                </Button>
              ) : undefined
            }
            description={
              soloLectura
                ? t(
                    "ui.RolesDePago.soloLectura.vacioDesc",
                    "Mientras Roles de pago esté apagado solo se muestran las planillas publicadas.",
                  )
                : t(
                    "ui.RolesDePago.corridas.vacioDesc",
                    "Crea la primera eligiendo el día en que empieza el periodo.",
                  )
            }
            icon={<FileSpreadsheet />}
            title={
              soloLectura
                ? t(
                    "ui.RolesDePago.soloLectura.vacio",
                    "No hay planillas emitidas",
                  )
                : t("ui.RolesDePago.corridas.vacio", "Todavía no hay planillas")
            }
          />
        ) : (
          <Section>
            <div className="space-y-2">
              {(corridas.data?.rows ?? []).map((r) => (
                <ListRow
                  key={r.id}
                  badges={
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {/* Sucursales: de quién es la planilla (sólo en la vista global). */}
                      {etiquetasSuc.activo &&
                        ((r.population?.branchIds ?? []).length ? (
                          (r.population?.branchIds ?? []).map((b) => (
                            <EtiquetaDeSucursal
                              key={b}
                              sucursal={etiquetasSuc.sucursal(b)}
                            />
                          ))
                        ) : (
                          <EtiquetaDeSucursal empresa sucursal={null} />
                        ))}
                      <StatusBadge tone={estado.tone[r.status]}>
                        {estado.label[r.status]}
                      </StatusBadge>
                    </span>
                  }
                  meta={
                    r.totals?.alerts
                      ? t("ui.RolesDePago.corridas.alertas", "{{n}} alertas", {
                          n: r.totals.alerts,
                        })
                      : undefined
                  }
                  subtitle={
                    r.totals?.people
                      ? t(
                          "ui.RolesDePago.corridas.resumen",
                          "{{n}} personas · neto {{neto}}",
                          {
                            n: r.totals.people,
                            neto: dinero(
                              r.totals.net || 0,
                              r.currency,
                              decimalsOf(r),
                            ),
                          },
                        )
                      : undefined
                  }
                  title={`${r.number} · ${r.periodFrom} → ${r.periodTo}`}
                  onClick={() => navigate(`/nomina/roles/planillas/${r.id}`)}
                />
              ))}
            </div>
          </Section>
        )}
        {nueva && puedeCrear && vista.data && (
          <NuevaCorrida
            frequency={vista.data.settings.frequency}
            onClose={() => setNueva(false)}
            onCreated={(r) => {
              setNueva(false);
              navigate(`/nomina/roles/planillas/${r.id}`);
            }}
          />
        )}
      </PageContainer>
    </AppLayout>
  );
}

export function NuevaCorrida({
  frequency,
  onClose,
  onCreated,
}: {
  frequency: string;
  onClose: () => void;
  onCreated: (r: PayrollRun) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const etiquetas = useEtiquetas();
  const hoy = new Date();
  const [from, setFrom] = useState(
    `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`,
  );
  const [to, setTo] = useState("");
  const [poblaciones, setPoblaciones] = useState<Population[]>([
    "vigilante",
    "supervisor",
    "oficina",
  ]);
  const [saving, setSaving] = useState(false);
  // Sucursales: en la vista global se elige; dentro de una sucursal, es ella (lo fija el servidor).
  const suc = useSucursales();
  const etiquetasSuc = useEtiquetasDeSucursal();
  const espacio = useEspacio();
  const [sucursal, setSucursal] = useState("");

  const crear = async () => {
    setSaving(true);
    try {
      const r = await payrollSlipsService.createRun({
        from,
        to: to || undefined,
        populations: poblaciones,
        branchIds: etiquetasSuc.activo && sucursal ? [sucursal] : undefined,
      });

      toast.success(
        t(
          "ui.RolesDePago.corridas.creada",
          "Planilla {{n}} creada: calculando las horas del periodo",
          { n: r.number },
        ),
      );
      await qc.invalidateQueries({ queryKey: ["payroll-slips"] });
      onCreated(r);
    } catch (e) {
      toast.error(
        (e as { message?: string })?.message ||
          t("ui.RolesDePago.errorAlGuardar", "No se pudo guardar"),
      );
    } finally {
      setSaving(false);
    }
  };

  const alternar = (p: Population) =>
    setPoblaciones((x) =>
      x.includes(p) ? x.filter((y) => y !== p) : [...x, p],
    );

  return (
    <Modal
      open
      description={t(
        "ui.RolesDePago.corridas.nuevaDesc",
        "Frecuencia de la empresa: {{f}}. Si no pones fin, se calcula con la frecuencia.",
        {
          f:
            etiquetas.frequency[
              frequency as keyof typeof etiquetas.frequency
            ] || frequency,
        },
      )}
      footer={
        <div className="cg-acciones justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("ui.RolesDePago.cancelar", "Cancelar")}
          </Button>
          <Button
            disabled={saving || !from || !poblaciones.length}
            variant="brand"
            onClick={crear}
          >
            {saving
              ? t("ui.RolesDePago.guardando", "Guardando…")
              : t("ui.RolesDePago.corridas.crear", "Crear y calcular")}
          </Button>
        </div>
      }
      size="md"
      title={t("ui.RolesDePago.corridas.nueva", "Nueva planilla")}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          required
          label={t("ui.RolesDePago.corridas.desde", "El periodo empieza el")}
        >
          <input
            className={FIELD_CLS}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </FormField>
        <FormField
          hint={t(
            "ui.RolesDePago.corridas.hastaHint",
            "Vacío = según la frecuencia",
          )}
          label={t("ui.RolesDePago.corridas.hasta", "y termina el")}
        >
          <input
            className={FIELD_CLS}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </FormField>
        {etiquetasSuc.activo ? (
          <div className="sm:col-span-2">
            <FormField
              hint={t("ui.RolesDePago.corridas.sucursalAyuda")}
              label={t("ui.RolesDePago.corridas.sucursal")}
            >
              <select
                className={FIELD_CLS}
                value={sucursal}
                onChange={(e) => setSucursal(e.target.value)}
              >
                <option value="">
                  {t("ui.RolesDePago.corridas.todaLaEmpresa")}
                </option>
                {(suc.lista.data?.sucursales ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        ) : espacio.activo && espacio.actual && !espacio.actual.global ? (
          <p
            className="text-sm sm:col-span-2"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("ui.RolesDePago.corridas.deEstaSucursal", {
              nombre: espacio.actual.nombre,
            })}
          </p>
        ) : null}
        <div className="sm:col-span-2">
          <div className="cg-eyebrow mb-1">
            {t("ui.RolesDePago.corridas.poblaciones", "A quién incluir")}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["vigilante", "supervisor", "oficina"] as Population[]).map(
              (p) => (
                <label
                  key={p}
                  className="glass-flat flex cursor-pointer items-center gap-2 px-3 py-2 text-sm"
                >
                  <input
                    checked={poblaciones.includes(p)}
                    className="cg-focus size-4"
                    style={{ accentColor: "var(--brand)" }}
                    type="checkbox"
                    onChange={() => alternar(p)}
                  />
                  {etiquetas.population[p]}
                </label>
              ),
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

import type { ExportFormat } from "@/lib/export/reportExport";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle, RefreshCw, Inbox } from "lucide-react";

import {
  AuditRow as AuditTr,
  AuditSearch,
  AuditSkeleton,
  AuditTable,
  SeverityRail,
  fmtStamp,
  metaFor,
} from "./shared";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  Section,
  Toolbar,
  StatusBadge,
  EmptyState,
} from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import ExportMenu from "@/components/reports/ExportMenu";
import { descargarInforme } from "@/lib/export/serverDownload";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";

type AuditRow = {
  id: string;
  event: string;
  outcome?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  platform?: string | null;
  detail?: string | null;
  at: string;
  userId?: string | null;
};

export default function AuditLogs() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [bajando, setBajando] = useState(false);
  const tid = () => localStorage.getItem("tenantId") || "";

  /**
   * Descarga la bitácora en el formato pedido: CSV, Excel o PDF.
   *
   * No se podía exportar en absoluto: la pantalla listaba y paginaba, y la
   * única salida era copiar a mano. Es lo primero que pide un auditor externo —
   * y desde que la retención de datos borra de verdad, es lo que hay que poder
   * sacar ANTES de que se purgue.
   *
   * Los tres los arma el SERVIDOR, no esta pantalla: aquí sólo hay las 300
   * filas que se cargan para pintar la tabla, y una bitácora recortada a 300
   * líneas no le sirve a nadie que la esté auditando. El servidor exporta lo
   * que corresponde al filtro, hasta su tope de cincuenta mil.
   */
  const exportar = async (format: ExportFormat) => {
    setBajando(true);
    try {
      const params = new URLSearchParams({ format });

      if (q.trim()) params.set("search", q.trim());
      await descargarInforme(
        `/tenant/${tid()}/security/audit-logs/export?${params.toString()}`,
        {
          format,
          nombreBase: `bitacora-accesos-${hoyEnLaEmpresa()}`,
        },
      );
    } catch {
      toast.error(t("ui.AuditLogs.noSePudoDescargarEl"));
    } finally {
      setBajando(false);
    }
  };

  const load = () => {
    setLoading(true);
    setError(false);
    ApiService.get(`/tenant/${tid()}/security/audit-logs?limit=300`)
      .then((r: any) => setRows(Array.isArray(r) ? r : (r?.rows ?? [])))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const blob =
      `${r.event} ${r.email || ""} ${r.ip || ""} ${r.platform || ""} ${r.detail || ""}`.toLowerCase();

    return blob.includes(q.toLowerCase());
  });

  // Un fallo de acceso es lo que se busca aquí: se cuenta aparte.
  const fallidos = filtered.filter((r) => r.event === "login_failed").length;

  return (
    <AppLayout>
      <PageContainer className="pt-4 sm:pt-6" width="wide">
        <PageHeader
          badges={
            !loading && !error ? (
              <>
                <StatusBadge dot={false} tone="neutral">
                  {filtered.length === 1
                    ? "1 evento"
                    : `${filtered.length} eventos`}
                </StatusBadge>
                {fallidos > 0 && (
                  <StatusBadge tone="bad">
                    {fallidos === 1
                      ? "1 intento fallido"
                      : `${fallidos} intentos fallidos`}
                  </StatusBadge>
                )}
              </>
            ) : undefined
          }
          icon={<ShieldCheck />}
          subtitle={t("ui.AuditLogs.iniciosYCierresDeSesion")}
          title={t("ui.AuditLogs.registroDeSeguridad", "Registro de seguridad")}
        />

        <Toolbar>
          <AuditSearch
            placeholder={t(
              "ui.AuditLogs.buscarPorUsuarioDireccionO",
              "Buscar por usuario, dirección o dispositivo…",
            )}
            value={q}
            onChange={setQ}
          />
          <div className="ml-auto">
            <ExportMenu
              busy={bajando}
              disabled={loading}
              label={t("ui.AuditLogs.descargar", "Descargar")}
              onExport={exportar}
            />
          </div>
          <Button
            aria-label="Recargar"
            size="icon"
            title="Recargar"
            variant="outline"
            onClick={load}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </Toolbar>

        <Section contentClassName="-mx-5 -mb-5">
          {loading ? (
            <AuditSkeleton />
          ) : error ? (
            <div className="p-6">
              <EmptyState
                action={
                  <Button className="gap-2" variant="outline" onClick={load}>
                    <RefreshCw className="size-4" /> Reintentar
                  </Button>
                }
                className="border-0"
                description="Vuelve a intentarlo en unos segundos."
                icon={<AlertTriangle />}
                title={t("ui.AuditLogs.noSePudoCargarEl")}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                className="border-0"
                description={
                  q.trim()
                    ? `Ningún evento coincide con “${q}”.`
                    : "Todavía no hay eventos de seguridad."
                }
                icon={<Inbox />}
                title={t("comun.sinRegistros")}
              />
            </div>
          ) : (
            <AuditTable
              flush
              head={
                <>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-3 py-3">{t("comun.usuario")}</th>
                  <th className="px-3 py-3">
                    {t("ui.AuditLogs.direccion", "Dirección")}
                  </th>
                  <th className="px-3 py-3">Plataforma</th>
                  <th className="px-3 py-3">{t("comun.detalle")}</th>
                  <th className="px-3 py-3 text-right">{t("comun.fecha")}</th>
                </>
              }
            >
              {filtered.map((r) => {
                const m = metaFor(r.event);

                return (
                  <AuditTr key={r.id} tone={m.tone}>
                    <td className="relative px-4 py-2.5" data-rotulo="Evento">
                      <SeverityRail tone={m.tone} />
                      <StatusBadge dot={false} tone={m.tone}>
                        {m.icon}
                        {m.label}
                      </StatusBadge>
                    </td>
                    <td
                      data-rotulo={t("comun.usuario")}
                      className="px-3 py-2.5"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {r.email || "—"}
                    </td>
                    <td
                      data-rotulo={t("ui.AuditLogs.direccion", "Dirección")}
                      className="px-3 py-2.5 font-mono text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {r.ip || "—"}
                    </td>
                    <td
                      data-rotulo="Plataforma"
                      className="px-3 py-2.5"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {r.platform || "—"}
                    </td>
                    <td
                      data-rotulo={t("comun.detalle")}
                      className="px-3 py-2.5 text-xs"
                      style={{ color: "var(--ink-faint)" }}
                      title={r.detail || ""}
                    >
                      {(r.detail || "").slice(0, 60)}
                    </td>
                    <td
                      data-rotulo={t("comun.fecha")}
                      className="px-3 py-2.5 text-right text-xs tabular-nums"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {fmtStamp(r.at)}
                    </td>
                  </AuditTr>
                );
              })}
            </AuditTable>
          )}
        </Section>
      </PageContainer>
    </AppLayout>
  );
}

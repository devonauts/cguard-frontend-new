import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer, PageHeader, Section, Toolbar, StatusBadge, EmptyState,
} from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import {
  AuditRow as AuditTr, AuditSearch, AuditSkeleton, AuditTable, SeverityRail,
  fmtStamp, metaFor,
} from "./shared";

type AuditRow = {
  id: string; event: string; outcome?: string | null; email?: string | null;
  ip?: string | null; userAgent?: string | null; deviceId?: string | null;
  platform?: string | null; detail?: string | null; at: string; userId?: string | null;
};

export default function AuditLogs() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const tid = () => localStorage.getItem("tenantId") || "";

  const load = () => {
    setLoading(true);
    setError(false);
    ApiService.get(`/tenant/${tid()}/security/audit-logs?limit=300`)
      .then((r: any) => setRows(Array.isArray(r) ? r : (r?.rows ?? [])))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const blob = `${r.event} ${r.email || ""} ${r.ip || ""} ${r.platform || ""} ${r.detail || ""}`.toLowerCase();
    return blob.includes(q.toLowerCase());
  });

  // Un fallo de acceso es lo que se busca aquí: se cuenta aparte.
  const fallidos = filtered.filter((r) => r.event === "login_failed").length;

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<ShieldCheck />}
          title="Registro de seguridad"
          subtitle="Inicios y cierres de sesión, intentos fallidos y eventos de dispositivos."
          badges={
            !loading && !error ? (
              <>
                <StatusBadge tone="neutral" dot={false}>
                  {filtered.length === 1 ? "1 evento" : `${filtered.length} eventos`}
                </StatusBadge>
                {fallidos > 0 && (
                  <StatusBadge tone="bad">
                    {fallidos === 1 ? "1 intento fallido" : `${fallidos} intentos fallidos`}
                  </StatusBadge>
                )}
              </>
            ) : undefined
          }
        />

        <Toolbar>
          <AuditSearch value={q} onChange={setQ} placeholder="Buscar por usuario, dirección o dispositivo…" />
          <Button variant="outline" size="icon" className="ml-auto" onClick={load} title="Recargar" aria-label="Recargar">

            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </Toolbar>

        <Section contentClassName="-mx-5 -mb-5">
          {loading ? (
            <AuditSkeleton />
          ) : error ? (
            <div className="p-6">
              <EmptyState
                className="border-0"
                icon={<AlertTriangle />}
                title="No se pudo cargar el registro de seguridad"
                description="Vuelve a intentarlo en unos segundos."
                action={
                  <Button variant="outline" className="gap-2" onClick={load}>
                    <RefreshCw className="size-4" /> Reintentar
                  </Button>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                className="border-0"
                icon={<Inbox />}
                title="Sin registros"
                description={q.trim() ? `Ningún evento coincide con “${q}”.` : "Todavía no hay eventos de seguridad."}
              />
            </div>
          ) : (
            <AuditTable
              flush
              head={
                <>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-3 py-3">Usuario</th>
                  <th className="px-3 py-3">Dirección</th>
                  <th className="px-3 py-3">Plataforma</th>
                  <th className="px-3 py-3">Detalle</th>
                  <th className="px-3 py-3 text-right">Fecha</th>
                </>
              }
            >
              {filtered.map((r) => {
                const m = metaFor(r.event);
                return (
                  <AuditTr key={r.id} tone={m.tone}>
                    <td className="relative px-4 py-2.5">
                      <SeverityRail tone={m.tone} />
                      <StatusBadge tone={m.tone} dot={false}>{m.icon}{m.label}</StatusBadge>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--ink-soft)" }}>{r.email || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--ink-soft)" }}>{r.ip || "—"}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--ink-soft)" }}>{r.platform || "—"}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: "var(--ink-faint)" }} title={r.detail || ""}>{(r.detail || "").slice(0, 60)}</td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums" style={{ color: "var(--ink-faint)" }}>{fmtStamp(r.at)}</td>
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

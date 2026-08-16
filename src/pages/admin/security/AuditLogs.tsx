import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle, RefreshCw, Inbox, Download } from "lucide-react";
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
  const [bajando, setBajando] = useState(false);
  const tid = () => localStorage.getItem("tenantId") || "";

  /**
   * Descarga la bitácora en CSV.
   *
   * No se podía exportar: la pantalla listaba y paginaba, y la única salida era
   * copiar a mano. Es lo primero que pide un auditor externo — y desde que la
   * retención de datos borra de verdad, es lo que hay que poder sacar ANTES de
   * que se purgue.
   *
   * Va con `fetch` y no con ApiService porque esto no devuelve JSON: es un
   * archivo, y hace falta el blob y el nombre que manda el servidor.
   */
  const exportar = async () => {
    setBajando(true);
    try {
      const params = q.trim() ? `?search=${encodeURIComponent(q.trim())}` : "";
      // Mismas base y clave de token que ApiService (`authToken`, no `jwt`) — con
      // la clave equivocada la descarga daría 401 sin decir por qué.
      const base = (import.meta.env.VITE_API_URL ?? "http://localhost:3001/api").replace(/\/+$/, "");
      const resp = await fetch(
        `${base}/tenant/${tid()}/security/audit-logs/export${params}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("authToken") || ""}` } },
      );
      if (!resp.ok) throw new Error(String(resp.status));
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bitacora-accesos-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo descargar el registro.");
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
          <Button
            variant="outline"
            className="ml-auto"
            onClick={exportar}
            disabled={bajando || loading}
            title="Descargar en CSV lo que estás viendo"
          >
            <Download className="mr-2 size-4" />
            {bajando ? "Preparando…" : "Descargar CSV"}
          </Button>
          <Button variant="outline" size="icon" onClick={load} title="Recargar" aria-label="Recargar">

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

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { RefreshCw, History, Inbox } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer, PageHeader, Section, Toolbar, Segmented, StatusBadge, EmptyState,
} from "@/components/kit";
import { useInfiniteAuditList } from "./useInfiniteAuditList";
import {
  AuditRow, AuditSearch, AuditSkeleton, AuditTable, InfiniteFooter, SeverityRail,
  fmtStamp, metaFor,
} from "./shared";

type Row = {
  id: string; event: string; outcome?: string | null; email?: string | null;
  ip?: string | null; userAgent?: string | null; deviceId?: string | null;
  platform?: string | null; detail?: string | null; at: string; userId?: string | null;
};

const PAGE_SIZE = 100;

// Chip key → backend `event` param (comma-separated allowed).
const FILTERS = [
  { key: "", label: "Todos", event: "" },
  { key: "login", label: "Inicios", event: "login" },
  { key: "login_failed", label: "Fallidos", event: "login_failed" },
  { key: "logout", label: "Cierres", event: "logout" },
  { key: "device", label: "Dispositivos", event: "device_registered,device_evicted" },
  { key: "provider", label: "Soporte", event: "provider_access" },
];

export default function LoginHistory() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState("");

  const tid = () => localStorage.getItem("tenantId") || "";

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(h);
  }, [q]);

  const buildParams = useCallback(
    (offset: number, limit: number) => {
      const eventParam = FILTERS.find((f) => f.key === filter)?.event || "";
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (eventParam) params.set("event", eventParam);
      if (debouncedQ.trim()) params.set("search", debouncedQ.trim());
      return params;
    },
    [filter, debouncedQ],
  );

  const { items, total, loading, hasMore, load, sentinelRef } = useInfiniteAuditList<Row>({
    endpoint: `/tenant/${tid()}/security/audit-logs`,
    pageSize: PAGE_SIZE,
    buildParams,
    deps: [filter, debouncedQ],
  });

  const primeraCarga = loading && items.length === 0;

  return (
    <AppLayout>
      <PageContainer width="wide" className="px-4 pt-4 sm:px-6 sm:pt-6">
        <PageHeader
          icon={<History />}
          title={t("ui.LoginHistory.historialDeInicioDeSesion", "Historial de Inicio de Sesión")}
          subtitle={t('ui.LoginHistory.iniciosYCierresDeSesion')}
          badges={
            !primeraCarga ? (
              <StatusBadge tone="neutral" dot={false}>
                {items.length}{total ? ` de ${total}` : ""} evento{items.length === 1 ? "" : "s"}
              </StatusBadge>
            ) : undefined
          }
        />

        <Toolbar>
          <AuditSearch value={q} onChange={setQ} placeholder={t("ui.LoginHistory.buscarPorUsuarioDireccionO", "Buscar por usuario, dirección o dispositivo…")} />

          <Segmented
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
            className="max-w-full overflow-x-auto"
          />

          <Button variant="outline" size="icon" className="ml-auto" onClick={() => load(true)} title="Recargar" aria-label="Recargar">
            <RefreshCw className={`size-4 ${primeraCarga ? "animate-spin" : ""}`} />
          </Button>
        </Toolbar>

        <Section contentClassName="-mx-5 -mb-5">
          {primeraCarga ? (
            <AuditSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                className="border-0"
                icon={<Inbox />}
                title={t('ui.LoginHistory.sinEventos')}
                description={
                  q.trim() || filter
                    ? "Ningún evento coincide con la búsqueda o el filtro elegido."
                    : "Todavía no se ha registrado ningún acceso."
                }
              />
            </div>
          ) : (
            <AuditTable
              head={
                <>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-3 py-3">{t('comun.usuario')}</th>
                  <th className="px-3 py-3">{t("ui.LoginHistory.direccion", "Dirección")}</th>
                  <th className="px-3 py-3">Plataforma</th>
                  <th className="px-3 py-3">{t('comun.detalle')}</th>
                  <th className="px-3 py-3 text-right">{t('comun.fecha')}</th>
                </>
              }
            >
              {items.map((r) => {
                const m = metaFor(r.event);
                return (
                  <AuditRow key={r.id} tone={m.tone}>
                    <td className="relative px-4 py-2.5">
                      <SeverityRail tone={m.tone} />
                      <StatusBadge tone={m.tone} dot={false}>{m.icon}{m.label}</StatusBadge>
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--ink-soft)" }}>{r.email || "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--ink-soft)" }}>{r.ip || "—"}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--ink-soft)" }}>{r.platform || "—"}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: "var(--ink-faint)" }} title={r.detail || ""}>{(r.detail || "").slice(0, 60)}</td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums" style={{ color: "var(--ink-faint)" }}>{fmtStamp(r.at)}</td>
                  </AuditRow>
                );
              })}
            </AuditTable>
          )}

          <InfiniteFooter
            sentinelRef={sentinelRef}
            loading={loading}
            hasMore={hasMore}
            count={items.length}
            endLabel="Fin del historial"
          />
        </Section>
      </PageContainer>
    </AppLayout>
  );
}

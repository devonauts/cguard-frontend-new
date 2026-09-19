import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollText,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  PencilLine,
  Trash2,
  Activity,
  Inbox,
} from "lucide-react";
import type { ReactNode } from "react";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  Section,
  Toolbar,
  Segmented,
  StatusBadge,
  EmptyState,
} from "@/components/kit";
import { useInfiniteAuditList } from "./useInfiniteAuditList";
import {
  AuditRow,
  AuditSearch,
  AuditSkeleton,
  AuditTable,
  InfiniteFooter,
  SeverityRail,
  fmtStamp,
  type SeverityTone,
} from "./shared";

type LogRow = {
  id: string;
  entityName: string;
  entityId: string;
  action: string;
  createdById?: string | null;
  createdByEmail?: string | null;
  timestamp: string;
  values?: any;
};

const PAGE_SIZE = 50;

/**
 * Tono de cada acción. Un borrado es lo único irreversible de esta pantalla, así
 * que va en `bad`; un cambio, en `warn`; un alta, en `ok`. Son tonos del sistema
 * y no colores propios: la severidad no cambia con el acento de la empresa.
 */
function actionMeta(action: string): {
  label: string;
  labelKey?: string;
  tone: SeverityTone;
  icon: ReactNode;
} {
  const a = String(action || "").toLowerCase();
  if (a.includes("create"))
    return {
      label: "Creación",
      labelKey: "security.logs.actionCreate",
      tone: "ok",
      icon: <PlusCircle className="size-3.5" />,
    };
  if (a.includes("update"))
    return {
      label: "Actualización",
      labelKey: "security.logs.actionUpdate",
      tone: "warn",
      icon: <PencilLine className="size-3.5" />,
    };
  if (a.includes("delete") || a.includes("destroy"))
    return {
      label: "Eliminación",
      labelKey: "security.logs.actionDelete",
      tone: "bad",
      icon: <Trash2 className="size-3.5" />,
    };
  return {
    label: action || "—",
    tone: "neutral",
    icon: <Activity className="size-3.5" />,
  };
}

const FILTERS = [
  { key: "", label: "Todas" },
  { key: "create", label: "Creaciones" },
  { key: "update", label: "Actualizaciones" },
  { key: "delete", label: "Eliminaciones" },
];

export default function SystemLogs() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [action, setAction] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const tid = () => localStorage.getItem("tenantId") || "";

  // Debounce the search box (server-side search).
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), 350);
    return () => clearTimeout(h);
  }, [q]);

  const buildParams = useCallback(
    (offset: number, limit: number) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      params.set("orderBy", "timestamp_DESC");
      if (action) params.set("filter[action]", action);
      if (debouncedQ.trim()) params.set("filter[search]", debouncedQ.trim());
      return params;
    },
    [action, debouncedQ],
  );

  const { items, total, loading, hasMore, load, sentinelRef } =
    useInfiniteAuditList<LogRow>({
      endpoint: `/tenant/${tid()}/audit-log`,
      pageSize: PAGE_SIZE,
      buildParams,
      deps: [action, debouncedQ],
      onReset: () => setExpanded(null),
    });

  const primeraCarga = loading && items.length === 0;

  return (
    <AppLayout>
      <PageContainer width="wide" className="pt-4 sm:pt-6">
        <PageHeader
          icon={<ScrollText />}
          title={t("ui.SystemLogs.registrosDelSistema")}
          subtitle={t("ui.SystemLogs.todasLasAccionesCreacionesCambios")}
          badges={
            !primeraCarga ? (
              <StatusBadge tone="neutral" dot={false}>
                {items.length}
                {total ? ` de ${total}` : ""} registro
                {items.length === 1 ? "" : "s"}
              </StatusBadge>
            ) : undefined
          }
        />

        <Toolbar>
          <AuditSearch
            value={q}
            onChange={setQ}
            placeholder={t(
              "ui.SystemLogs.buscarPorRegistroUsuarioO",
              "Buscar por registro, usuario o código…",
            )}
          />

          <Segmented
            value={action}
            onChange={setAction}
            options={FILTERS.map((f) => ({ value: f.key, label: f.label }))}
            className="max-w-full overflow-x-auto"
          />

          <Button
            variant="outline"
            size="icon"
            className="ml-auto"
            onClick={() => load(true)}
            title="Recargar"
            aria-label="Recargar"
          >
            <RefreshCw
              className={`size-4 ${primeraCarga ? "animate-spin" : ""}`}
            />
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
                title={t("comun.sinRegistros")}
                description={
                  q.trim() || action
                    ? "Ninguna acción coincide con la búsqueda o el filtro elegido."
                    : "Todavía no se ha registrado ninguna acción."
                }
              />
            </div>
          ) : (
            <AuditTable
              head={
                <>
                  <th className="px-4 py-3">
                    {t("ui.SystemLogs.accion", "Acción")}
                  </th>
                  <th className="px-3 py-3">Registro</th>
                  <th className="px-3 py-3">{t("comun.usuario")}</th>
                  <th className="px-3 py-3 text-right">{t("comun.fecha")}</th>
                  <th className="px-2 py-3"></th>
                </>
              }
            >
              {items.map((r) => {
                const m = actionMeta(r.action);
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <AuditRow
                      tone={m.tone}
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                    >
                      <td className="relative px-4 py-2.5">
                        <SeverityRail tone={m.tone} />
                        <StatusBadge tone={m.tone} dot={false}>
                          {m.icon}
                          {m.labelKey ? t(m.labelKey, m.label) : m.label}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium">{r.entityName}</span>
                        <span
                          className="ml-1 font-mono text-[10px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {(r.entityId || "").slice(0, 8)}
                        </span>
                      </td>
                      <td
                        className="px-3 py-2.5"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {r.createdByEmail || "—"}
                      </td>
                      <td
                        className="px-3 py-2.5 text-right text-xs tabular-nums"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {fmtStamp(r.timestamp)}
                      </td>
                      <td
                        className="px-2 py-2.5"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {isOpen ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </td>
                    </AuditRow>
                    {isOpen && (
                      <tr
                        className="border-b"
                        style={{
                          borderColor: "var(--hairline)",
                          background: "var(--glass-sunken)",
                        }}
                      >
                        <td colSpan={5} className="px-4 py-3">
                          <div
                            className="mb-1.5 text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            Código:{" "}
                            <span className="font-mono">{r.entityId}</span>
                          </div>
                          <pre className="glass-sunken max-h-72 overflow-auto p-3 text-xs">
                            {JSON.stringify(r.values ?? {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </AuditTable>
          )}

          <InfiniteFooter
            sentinelRef={sentinelRef}
            loading={loading}
            hasMore={hasMore}
            count={items.length}
            endLabel="Fin de los registros"
          />
        </Section>
      </PageContainer>
    </AppLayout>
  );
}

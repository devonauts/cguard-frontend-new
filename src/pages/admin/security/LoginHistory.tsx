import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, History, Inbox } from "lucide-react";

import { useInfiniteAuditList } from "./useInfiniteAuditList";
import SesionesActivas from "./SesionesActivas";
import {
  AuditRow,
  AuditSearch,
  AuditSkeleton,
  AuditTable,
  InfiniteFooter,
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
  Segmented,
  StatusBadge,
  EmptyState,
} from "@/components/kit";

type Row = {
  id: string;
  event: string;
  outcome?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  platform?: string | null;
  /** «Chrome · macOS», leído del user-agent por el servidor. */
  device?: string | null;
  detail?: string | null;
  at: string;
  /** Sólo en «Mis accesos»: la empresa a la que entró esa sesión. */
  company?: string | null;
  userId?: string | null;
};

const PAGE_SIZE = 100;

// Chip key → backend `event` param (comma-separated allowed).
// `labelKey` se traduce donde se pinta: esta constante se evalúa al importar.
const FILTERS = [
  {
    key: "",
    label: "Todos",
    labelKey: "ui.LoginHistory.filter.all",
    event: "",
  },
  {
    key: "login",
    label: "Inicios",
    labelKey: "ui.LoginHistory.filter.login",
    event: "login",
  },
  {
    key: "login_failed",
    label: "Fallidos",
    labelKey: "ui.LoginHistory.filter.loginFailed",
    event: "login_failed",
  },
  {
    key: "logout",
    label: "Cierres",
    labelKey: "ui.LoginHistory.filter.logout",
    event: "logout",
  },
  {
    key: "device",
    label: "Dispositivos",
    labelKey: "ui.LoginHistory.filter.device",
    event: "device_registered,device_evicted",
  },
];

export default function LoginHistory() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState("");

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

  const { items, total, loading, hasMore, load, sentinelRef } =
    useInfiniteAuditList<Row>({
      // SIEMPRE los accesos de quien mira, en todas sus empresas: nada ajeno.
      endpoint: "/auth/access-history",
      pageSize: PAGE_SIZE,
      buildParams,
      deps: [filter, debouncedQ],
    });

  const primeraCarga = loading && items.length === 0;

  return (
    <AppLayout>
      <PageContainer className="pt-4 sm:pt-6" width="wide">
        <PageHeader
          badges={
            !primeraCarga ? (
              <StatusBadge dot={false} tone="neutral">
                {total
                  ? t("ui.LoginHistory.nDeTotalEventos", {
                      defaultValue: "{{count}} de {{total}} eventos",
                      count: items.length,
                      total,
                    })
                  : t("ui.LoginHistory.nEventos", {
                      defaultValue: "{{count}} eventos",
                      count: items.length,
                    })}
              </StatusBadge>
            ) : undefined
          }
          icon={<History />}
          subtitle={t(
            "ui.LoginHistory.soloTu",
            "Tus inicios, cierres, intentos fallidos y dispositivos, en cada empresa a la que perteneces. Sólo tú los ves.",
          )}
          title={t(
            "ui.LoginHistory.historialDeInicioDeSesion",
            "Historial de Inicio de Sesión",
          )}
        />

        {/* Los dispositivos de MI cuenta, y cerrar sus sesiones a distancia. */}
        <SesionesActivas />

        <Toolbar>
          <AuditSearch
            placeholder={t(
              "ui.LoginHistory.buscarPorUsuarioDireccionO",
              "Buscar por usuario, dirección o dispositivo…",
            )}
            value={q}
            onChange={setQ}
          />

          <Segmented
            className="max-w-full overflow-x-auto"
            options={FILTERS.map((f) => ({
              value: f.key,
              label: t(f.labelKey, f.label),
            }))}
            value={filter}
            onChange={setFilter}
          />

          <Button
            aria-label={t("ui.AuditLogs.recargar", "Recargar")}
            className="ml-auto"
            size="icon"
            title={t("ui.AuditLogs.recargar", "Recargar")}
            variant="outline"
            onClick={() => load(true)}
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
                description={
                  q.trim() || filter
                    ? t(
                        "ui.LoginHistory.ningunEventoCoincide",
                        "Ningún evento coincide con la búsqueda o el filtro elegido.",
                      )
                    : t(
                        "ui.LoginHistory.todaviaNoSeHaRegistrado",
                        "Todavía no se ha registrado ningún acceso.",
                      )
                }
                icon={<Inbox />}
                title={t("ui.LoginHistory.sinEventos")}
              />
            </div>
          ) : (
            <AuditTable
              head={
                <>
                  <th className="px-4 py-3">
                    {t("ui.AuditLogs.evento", "Evento")}
                  </th>
                  <th className="px-3 py-3">
                    {t("ui.LoginHistory.empresa", "Empresa")}
                  </th>
                  <th className="px-3 py-3">
                    {t("ui.LoginHistory.direccion", "Dirección")}
                  </th>
                  <th className="px-3 py-3">
                    {t("ui.AuditLogs.plataforma", "Plataforma")}
                  </th>
                  <th className="px-3 py-3">{t("comun.detalle")}</th>
                  <th className="px-3 py-3 text-right">{t("comun.fecha")}</th>
                </>
              }
            >
              {items.map((r) => {
                const m = metaFor(r.event);

                return (
                  <AuditRow key={r.id} tone={m.tone}>
                    <td
                      className="relative px-4 py-2.5"
                      data-rotulo={t("ui.AuditLogs.evento", "Evento")}
                    >
                      <SeverityRail tone={m.tone} />
                      <StatusBadge dot={false} tone={m.tone}>
                        {m.icon}
                        {m.label}
                      </StatusBadge>
                    </td>
                    <td
                      className="px-3 py-2.5"
                      data-rotulo={t("ui.LoginHistory.empresa", "Empresa")}
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {r.company || "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 font-mono text-xs"
                      data-rotulo={t("ui.LoginHistory.direccion", "Dirección")}
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {r.ip || "—"}
                    </td>
                    <td
                      className="px-3 py-2.5"
                      data-rotulo={t("ui.AuditLogs.plataforma", "Plataforma")}
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {r.device || r.platform || "—"}
                    </td>
                    <td
                      className="px-3 py-2.5 text-xs"
                      data-rotulo={t("comun.detalle")}
                      style={{ color: "var(--ink-faint)" }}
                      title={r.detail || ""}
                    >
                      {(r.detail || "").slice(0, 60)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right text-xs tabular-nums"
                      data-rotulo={t("comun.fecha")}
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {fmtStamp(r.at)}
                    </td>
                  </AuditRow>
                );
              })}
            </AuditTable>
          )}

          <InfiniteFooter
            count={items.length}
            endLabel={t("ui.LoginHistory.finDelHistorial", "Fin del historial")}
            hasMore={hasMore}
            loading={loading}
            sentinelRef={sentinelRef}
          />
        </Section>
      </PageContainer>
    </AppLayout>
  );
}

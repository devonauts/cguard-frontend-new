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
import { usePermissions } from "@/hooks/usePermissions";
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
  {
    key: "provider",
    label: "Soporte",
    labelKey: "ui.LoginHistory.filter.provider",
    event: "provider_access",
  },
];

export default function LoginHistory() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState("");
  // De QUIÉN son los accesos: los míos (en todas mis empresas, sólo los veo
  // yo) o los de esta empresa (sólo lo que pasó en ella; dirección para arriba).
  const { hasPermission } = usePermissions();
  const puedeVerEmpresa = hasPermission("businessInfoRead");
  const [alcance, setAlcance] = useState<"mios" | "empresa">("mios");
  const mios = alcance === "mios" || !puedeVerEmpresa;

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

  const { items, total, loading, hasMore, load, sentinelRef } =
    useInfiniteAuditList<Row>({
      endpoint: mios
        ? "/auth/access-history"
        : `/tenant/${tid()}/security/audit-logs`,
      pageSize: PAGE_SIZE,
      buildParams,
      deps: [filter, debouncedQ, mios],
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
          subtitle={
            mios
              ? t(
                  "ui.LoginHistory.soloTu",
                  "Tus inicios, cierres, intentos fallidos y dispositivos, en cada empresa a la que perteneces. Sólo tú los ves.",
                )
              : t("ui.LoginHistory.iniciosYCierresDeSesion")
          }
          title={t(
            "ui.LoginHistory.historialDeInicioDeSesion",
            "Historial de Inicio de Sesión",
          )}
        />

        {/* Los dispositivos de MI cuenta, y cerrar sus sesiones a distancia. */}
        <SesionesActivas />

        {puedeVerEmpresa && (
          <Segmented
            className="self-start"
            options={[
              {
                value: "mios",
                label: t("ui.LoginHistory.alcance.mios", "Mis accesos"),
              },
              {
                value: "empresa",
                label: t("ui.LoginHistory.alcance.empresa", "Esta empresa"),
              },
            ]}
            value={alcance}
            onChange={(v) => setAlcance(v as "mios" | "empresa")}
          />
        )}

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
            options={FILTERS.filter((f) => !mios || f.key !== "provider").map(
              (f) => ({
                value: f.key,
                label: t(f.labelKey, f.label),
              }),
            )}
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
                    {mios
                      ? t("ui.LoginHistory.empresa", "Empresa")
                      : t("comun.usuario")}
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
                      data-rotulo={
                        mios
                          ? t("ui.LoginHistory.empresa", "Empresa")
                          : t("comun.usuario")
                      }
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {(mios ? r.company : r.email) || "—"}
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

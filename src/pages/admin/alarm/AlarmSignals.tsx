import * as React from "react";
import { useTranslation } from 'react-i18next';
import { toast } from "sonner";
import {
  Radio,
  RefreshCw,
  Loader2,
  Search,
  ArrowDownUp,
  ArrowUpRight,
  Wifi,
  Signal,
  Server,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  alarmService,
  type AlarmSignal,
} from "@/lib/api/alarmService";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  StatusBadge,
  Segmented,
  Toolbar,
  SkeletonCards,
} from "@/components/kit";
import { Chip, formatWhenFull as formatWhen } from "./shared";

/* ------------------------------------------------------------------ */
/* Metadata (Spanish labels)                                           */
/* ------------------------------------------------------------------ */

/* El FORMATO de la señal es una clasificación técnica, no una severidad: iba en
   cinco colores distintos que no significaban nada. Ahora es una píldora neutra
   y el color queda libre para lo que sí lo necesita — el calificador. */
const FORMAT_META: Record<string, { label: string }> = {
  sia: { label: "SIA DC-09" },
  contactid: { label: "Contact ID" },
  surgard: { label: "Sur-Gard" },
  webhook: { label: "Aviso web" },
  manual: { label: "Manual" },
};

/** Aquí sí hay severidad: un evento es una alarma que entra; una restauración es
 *  que algo volvió a la normalidad. Semánticos fijos. */
const QUALIFIER_META: Record<string, { label: string; tone: string }> = {
  event: { label: "Evento", tone: "bad" },
  restore: { label: "Restauración", tone: "ok" },
  status: { label: "Estado", tone: "neutral" },
};

const CHANNEL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  ip: { label: "IP", icon: <Wifi className="size-3.5" /> },
  cellular: { label: "Celular", icon: <Signal className="size-3.5" /> },
  receiver: { label: "Receptor", icon: <Server className="size-3.5" /> },
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AlarmSignals() {
  const { t } = useTranslation();
  const [signals, setSignals] = React.useState<AlarmSignal[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [limit, setLimit] = React.useState(100);

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const rows = await alarmService.signals({ limit });
        setSignals(Array.isArray(rows) ? rows : []);
      } catch (e) {
        const err = e as { data?: { message?: string }; message?: string };
        toast.error(err?.data?.message || err?.message || "No se pudieron cargar las señales");
      } finally {
        setLoading(false);
      }
    },
    [limit]
  );

  React.useEffect(() => {
    load();
  }, [load]);

  // Sort newest first by receivedAt
  const sorted = React.useMemo(() => {
    return [...signals].sort((a, b) => {
      const ta = new Date(a.receivedAt).getTime() || 0;
      const tb = new Date(b.receivedAt).getTime() || 0;
      return tb - ta;
    });
  }, [signals]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((s) => {
      const hay = [
        s.accountNumber,
        s.eventCode,
        s.zoneNumber,
        s.format,
        s.qualifier,
        s.channel,
        s.receiverId,
        s.raw,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sorted, query]);

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<Radio />}
          title={t("ui.AlarmSignals.registroDeSenales", "Registro de señales")}
          subtitle={t('ui.AlarmSignals.todoLoQueHanEnviado')}
          actions={
            <Button
              variant="outline"
              onClick={() => load()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Actualizar
            </Button>
          }
        />

        {/* Controles */}
        <Toolbar>
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("ui.AlarmSignals.buscarPorCuentaCodigoZona", "Buscar por cuenta, código, zona…")}
              className="pl-9"
            />
          </div>
          <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--ink-soft)' }}>
            <ArrowDownUp className="size-3.5" />
            Mostrar
          </span>
          <Segmented
            value={String(limit)}
            onChange={(v) => setLimit(Number(v))}
            options={[100, 250, 500].map((n) => ({ value: String(n), label: n }))}
          />
        </Toolbar>

        {/* Table */}
        {loading ? (
          <SkeletonCards count={4} className="sm:grid-cols-1" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Radio />}
            title={t("ui.AlarmSignals.sinSenales", "Sin señales")}
            description={
              query
                ? "Ninguna señal coincide con la búsqueda."
                : "Aún no se han recibido señales."
            }
          />
        ) : (
          <Section contentClassName="-mx-1">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr
                    className="border-b text-left text-xs uppercase tracking-wide"
                    style={{ background: 'var(--glass-sunken)', borderColor: 'var(--hairline)', color: 'var(--ink-faint)' }}
                  >
                    <th className="px-4 py-3 font-medium">Recibida</th>
                    <th className="px-4 py-3 font-medium">Cuenta</th>
                    <th className="px-4 py-3 font-medium">Formato</th>
                    <th className="px-4 py-3 font-medium">{t("ui.AlarmSignals.codigo", "Código")}</th>
                    <th className="px-4 py-3 font-medium">Calificador</th>
                    <th className="px-4 py-3 font-medium">Zona</th>
                    <th className="px-4 py-3 font-medium">Canal</th>
                    <th className="px-4 py-3 font-medium">Mensaje original</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const fmt = (s.format && FORMAT_META[s.format]) || null;
                    const qual = (s.qualifier && QUALIFIER_META[s.qualifier]) || null;
                    const chan = (s.channel && CHANNEL_META[s.channel]) || null;
                    return (
                      <tr
                        key={s.id}
                        className="border-b align-top transition-colors last:border-0"
                        style={{ borderColor: 'var(--hairline)' }}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {formatWhen(s.receivedAt)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">
                          {s.accountNumber || "—"}
                        </td>
                        <td className="px-4 py-3">
                          {fmt ? (
                            <Chip>{fmt.label}</Chip>
                          ) : (
                            <span className="text-muted-foreground">{s.format || "—"}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <code className="rounded px-1.5 py-0.5 text-xs" style={{ background: 'var(--glass-sunken)' }}>
                            {s.eventCode || "—"}
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          {qual ? (
                            <StatusBadge tone={qual.tone}>{qual.label}</StatusBadge>
                          ) : (
                            <span className="text-muted-foreground">{s.qualifier || "—"}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {s.zoneNumber || "—"}
                          {s.partition ? ` · P${s.partition}` : ""}
                        </td>
                        <td className="px-4 py-3">
                          {chan ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              {chan.icon}
                              {chan.label}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{s.channel || "—"}</span>
                          )}
                          {s.receiverId ? (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                              <ArrowUpRight className="size-3" />
                              {s.receiverId}
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[260px] px-4 py-3">
                          <code
                            className="block truncate text-xs text-muted-foreground"
                            title={s.raw || undefined}
                          >
                            {s.raw || "—"}
                          </code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {!loading && filtered.length > 0 ? (
          <p className="text-right text-xs" style={{ color: 'var(--ink-faint)' }}>
            {filtered.length} señal{filtered.length === 1 ? "" : "es"}
            {query ? ` (de ${signals.length})` : ""}
          </p>
        ) : null}
      </PageContainer>
    </AppLayout>
  );
}

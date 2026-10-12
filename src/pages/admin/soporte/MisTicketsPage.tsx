/**
 * ════════════════════════════════════════════════════════════════════════════
 * MIS TICKETS — los tickets de soporte de la empresa y lo que soporte respondió
 *
 * El dueño (2026-10-11): cuando soporte responde o resuelve un ticket, el
 * cliente tiene que VERLO, no sólo recibir un correo si acaso. La respuesta
 * llega siempre a la campana, y la campana trae aquí, con ese ticket abierto
 * (`?ticket=<id>`). También se llega desde Ayuda › «Mis tickets».
 *
 * La respuesta es `adminNotes` del ticket: un solo campo, la última palabra de
 * soporte. No es un hilo — no se finge uno.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Inbox, ChevronDown, MessageSquareReply, RefreshCw } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  EmptyState,
  SkeletonCards,
  Segmented,
} from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import { fechaYHora } from "@/lib/horaDeLaEmpresa";

type EstadoDeTicket = "open" | "in_progress" | "resolved" | "closed";

interface TicketDeSoporte {
  id: string;
  subject: string;
  message?: string | null;
  category: string;
  priority: string;
  status: EstadoDeTicket;
  adminNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

const TONO: Record<EstadoDeTicket, string> = {
  open: "bad",
  in_progress: "warn",
  resolved: "ok",
  closed: "neutral",
};

type Filtro = "todos" | "abiertos" | "cerrados";

const ABIERTOS: EstadoDeTicket[] = ["open", "in_progress"];

export default function MisTicketsPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const enfocado = params.get("ticket");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abiertos, setAbiertos] = useState<Set<string>>(
    () => new Set(enfocado ? [enfocado] : []),
  );
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  const tenantId =
    typeof window !== "undefined" ? localStorage.getItem("tenantId") || "" : "";

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["mis-tickets", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<TicketDeSoporte[]> => {
      const res: any = await ApiService.get(
        `/tenant/${tenantId}/support/tickets`,
      );

      return Array.isArray(res) ? res : res?.rows || [];
    },
  });

  // Llegar desde la campana: abrir ese ticket y llevarlo a la vista.
  useEffect(() => {
    if (!enfocado || !data) return;
    setAbiertos((prev) => new Set(prev).add(enfocado));
    const el = refs.current[enfocado];

    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [enfocado, data]);

  const filas = useMemo(() => {
    const todas = data || [];

    if (filtro === "abiertos")
      return todas.filter((x) => ABIERTOS.includes(x.status));
    if (filtro === "cerrados")
      return todas.filter((x) => !ABIERTOS.includes(x.status));

    return todas;
  }, [data, filtro]);

  const alternar = (id: string) =>
    setAbiertos((prev) => {
      const n = new Set(prev);

      if (n.has(id)) n.delete(id);
      else n.add(id);

      return n;
    });

  const etiquetaDeEstado = (s: EstadoDeTicket) =>
    t(`misTickets.estado.${s}`, { defaultValue: s });

  return (
    <AppLayout>
      <PageContainer width="narrow">
        <PageHeader
          actions={
            <Button
              disabled={isFetching}
              size="sm"
              variant="outline"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {t("misTickets.actualizar")}
            </Button>
          }
          icon={<Inbox />}
          subtitle={t("misTickets.subtitulo")}
          title={t("misTickets.titulo")}
        />

        <Segmented<Filtro>
          options={[
            { value: "todos", label: t("misTickets.filtro.todos") },
            { value: "abiertos", label: t("misTickets.filtro.abiertos") },
            { value: "cerrados", label: t("misTickets.filtro.cerrados") },
          ]}
          value={filtro}
          onChange={setFiltro}
        />

        {isLoading ? (
          <SkeletonCards count={3} />
        ) : isError ? (
          <EmptyState
            action={
              <Button variant="outline" onClick={() => refetch()}>
                {t("misTickets.reintentar")}
              </Button>
            }
            icon={<Inbox />}
            title={t("misTickets.error")}
          />
        ) : filas.length === 0 ? (
          <EmptyState
            description={t("misTickets.vacioDetalle")}
            icon={<Inbox />}
            title={t("misTickets.vacio")}
          />
        ) : (
          <div className="space-y-3">
            {filas.map((tk) => {
              const abierto = abiertos.has(tk.id);
              const resaltado = tk.id === enfocado;

              return (
                <div
                  key={tk.id}
                  ref={(el) => {
                    refs.current[tk.id] = el;
                  }}
                  className="glass-flat overflow-hidden"
                  style={
                    resaltado
                      ? { boxShadow: "0 0 0 2px var(--brand)" }
                      : undefined
                  }
                >
                  <button
                    aria-expanded={abierto}
                    className="flex w-full items-start gap-3 p-4 text-left"
                    type="button"
                    onClick={() => alternar(tk.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-semibold"
                        style={{ color: "var(--ink)" }}
                      >
                        {tk.subject}
                      </p>
                      <p
                        className="mt-0.5 text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("misTickets.enviado")} {fechaYHora(tk.createdAt)}
                        {tk.adminNotes ? ` · ${t("misTickets.conRespuesta")}` : ""}
                      </p>
                    </div>
                    <StatusBadge tone={TONO[tk.status] || "neutral"}>
                      {etiquetaDeEstado(tk.status)}
                    </StatusBadge>
                    <ChevronDown
                      className="mt-0.5 h-4 w-4 shrink-0 transition-transform"
                      style={{
                        color: "var(--ink-faint)",
                        transform: abierto ? "rotate(180deg)" : undefined,
                      }}
                    />
                  </button>

                  {abierto && (
                    <div className="space-y-3 px-4 pb-4">
                      {tk.message && (
                        <div>
                          <p
                            className="mb-1 text-[11px] font-bold uppercase tracking-wider"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {t("misTickets.tuMensaje")}
                          </p>
                          <p
                            className="whitespace-pre-wrap text-sm"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {tk.message}
                          </p>
                        </div>
                      )}

                      <div
                        className="rounded-xl p-3"
                        style={{ background: "var(--glass-sunken)" }}
                      >
                        <p
                          className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          <MessageSquareReply className="h-3.5 w-3.5" />
                          {t("misTickets.respuesta")}
                        </p>
                        <p
                          className="whitespace-pre-wrap text-sm"
                          style={{ color: "var(--ink)" }}
                        >
                          {tk.adminNotes || t("misTickets.sinRespuesta")}
                        </p>
                      </div>

                      {tk.resolvedAt && (
                        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                          {t("misTickets.resuelto")} {fechaYHora(tk.resolvedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}

/**
 * OFERTAS — the live searches: one card per gap with the state of every offer
 * (who has it, who said no, who did not answer, who got it), the wave it is in
 * and when the next one goes out. From here the office raises the bonus or
 * cancels, and launches new ones.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  Hourglass,
  Radio,
  TrendingUp,
  UserX,
  X,
  Zap,
} from "lucide-react";

import LanzarDoblete from "./LanzarDoblete";
import {
  MoneyInput,
  NivelBadge,
  TONO_BUSQUEDA,
  TONO_OFERTA,
  dinero,
  minutosHasta,
  nombreDePuesto,
  useEtiquetasDobletes,
  usePuedeGestionarDobletes,
} from "./comun";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  EmptyState,
  GlassPanel,
  InfoNote,
  Modal,
  Segmented,
  SkeletonCards,
  StatCard,
  StatusBadge,
} from "@/components/kit";
import dobletesService, { type OfferSearch } from "@/lib/api/dobletesService";
import { fechaYHora, soloHora } from "@/lib/horaDeLaEmpresa";
import { REASON_LABEL } from "@/lib/api/coverageService";

type Filtro = "activas" | "todas";

export default function TabOfertas({
  resaltada,
}: {
  resaltada?: string | null;
}) {
  const { t } = useTranslation();
  const puede = usePuedeGestionarDobletes();
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const [lanzar, setLanzar] = useState(false);
  const [ahora, setAhora] = useState(Date.now());

  // All of them (the stats need the history); «En curso» filters here.
  const busquedas = useQuery({
    queryKey: ["dobletes", "searches", "todas"],
    queryFn: () => dobletesService.searches({}),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((s) => s.status === "active") ? 10_000 : 60_000,
  });
  const ajustes = useQuery({
    queryKey: ["dobletes", "settings"],
    queryFn: () => dobletesService.settings(),
    staleTime: 60_000,
  });

  // Countdowns to the next wave move on their own.
  useEffect(() => {
    const iv = setInterval(() => setAhora(Date.now()), 30_000);

    return () => clearInterval(iv);
  }, []);

  const todas = busquedas.data ?? [];
  const filas =
    filtro === "activas" ? todas.filter((s) => s.status === "active") : todas;
  const cifras = useMemo(() => {
    const activas = todas.filter((s) => s.status === "active").length;
    const cubiertas = todas.filter((s) => s.status === "filled");
    const agotadas = todas.filter((s) => s.status === "exhausted").length;
    const tiempos = cubiertas
      .map(
        (s) =>
          (new Date(s.updatedAt).getTime() - new Date(s.createdAt).getTime()) /
          60000,
      )
      .filter((m) => Number.isFinite(m) && m >= 0);
    const medio = tiempos.length
      ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length)
      : null;

    return { activas, cubiertas: cubiertas.length, agotadas, medio };
  }, [todas]);

  const ordenadas = useMemo(
    () =>
      [...filas].sort((a, b) => {
        if ((a.status === "active") !== (b.status === "active"))
          return a.status === "active" ? -1 : 1;

        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }),
    [filas],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Radio />}
          label={t("dobletes.ofertas.buscandoAhora", "Buscando ahora")}
          value={cifras.activas}
        />
        <StatCard
          icon={<CheckCircle2 />}
          label={t("dobletes.ofertas.cubiertos", "Cubiertos")}
          value={cifras.cubiertas}
        />
        <StatCard
          icon={<UserX />}
          label={t("dobletes.ofertas.nadieAcepto", "Nadie aceptó")}
          value={cifras.agotadas}
        />
        <StatCard
          icon={<Hourglass />}
          label={t("dobletes.ofertas.tiempoMedio", "Tiempo medio para cubrir")}
          value={
            cifras.medio == null
              ? "—"
              : t("dobletes.ofertas.minutos", {
                  defaultValue: "{{n}} min",
                  n: cifras.medio,
                })
          }
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Filtro>
          options={[
            {
              value: "activas",
              label: t("dobletes.ofertas.activas", "En curso"),
            },
            { value: "todas", label: t("dobletes.ofertas.todas", "Todas") },
          ]}
          value={filtro}
          onChange={setFiltro}
        />
        {puede && (
          <Button variant="brand" onClick={() => setLanzar(true)}>
            <CalendarPlus className="mr-1.5 size-4" />
            {t("dobletes.lanzar.titulo", "Ofrecer doblete")}
          </Button>
        )}
      </div>

      {busquedas.isLoading ? (
        <SkeletonCards count={3} />
      ) : !ordenadas.length ? (
        <EmptyState
          description={t(
            "dobletes.ofertas.vacioDesc",
            "Cuando falte alguien, ofrece el turno desde aquí o desde Cobertura en vivo. Verás cada oferta en tiempo real.",
          )}
          icon={<CalendarPlus />}
          title={
            filtro === "activas"
              ? t("dobletes.ofertas.vacioActivas", "Ninguna búsqueda en curso")
              : t(
                  "dobletes.ofertas.vacio",
                  "Todavía no se ha ofrecido ningún doblete",
                )
          }
        />
      ) : (
        <div className="space-y-3">
          {ordenadas.map((s) => (
            <TarjetaDeBusqueda
              key={s.id}
              ahora={ahora}
              decimales={ajustes.data?.decimals ?? 2}
              puede={puede}
              resaltada={s.id === resaltada}
              s={s}
            />
          ))}
        </div>
      )}

      <LanzarDoblete open={lanzar} onOpenChange={setLanzar} />
    </div>
  );
}

function TarjetaDeBusqueda({
  s,
  ahora,
  puede,
  decimales,
  resaltada,
}: {
  s: OfferSearch;
  ahora: number;
  puede: boolean;
  decimales: 0 | 2;
  resaltada: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const et = useEtiquetasDobletes();
  const [subir, setSubir] = useState(false);
  const [nuevoBono, setNuevoBono] = useState<number | null>(s.bonusCents);
  const [ocupado, setOcupado] = useState(false);
  const ofertas = s.offers ?? [];
  const activa = s.status === "active";
  const proxima = minutosHasta(s.nextWaveAt, ahora);
  const plan = s.waveSizes?.length ? s.waveSizes : [3, 5];
  const ganador = ofertas.find((o) => o.status === "accepted");
  const pendientes = ofertas.filter((o) => o.status === "pending").length;

  const cancelar = async () => {
    const ok = await confirmDialog({
      title: t("dobletes.ofertas.cancelarTitulo", "¿Cancelar la búsqueda?"),
      message: t(
        "dobletes.ofertas.cancelarMensaje",
        "Las ofertas pendientes se retiran y a quienes las tienen les llega que ya no está disponible. El puesto sigue sin cubrir.",
      ),
      confirmText: t("dobletes.ofertas.cancelar", "Cancelar búsqueda"),
      tone: "danger",
    });

    if (!ok) return;
    setOcupado(true);
    try {
      await dobletesService.cancel(s.id);
      toast.success(t("dobletes.ofertas.cancelada", "Búsqueda cancelada"));
      void qc.invalidateQueries({ queryKey: ["dobletes"] });
    } catch {
      /* shown by the API layer */
    } finally {
      setOcupado(false);
    }
  };

  const guardarBono = async () => {
    if (nuevoBono == null) return;
    setOcupado(true);
    try {
      await dobletesService.raiseBonus(s.id, nuevoBono);
      toast.success(
        t("dobletes.ofertas.bonoSubido", {
          defaultValue:
            "Bono subido a {{bono}}. Se avisa a quienes ya tenían la oferta.",
          bono: dinero(nuevoBono, s.currency, decimales),
        }),
      );
      setSubir(false);
      void qc.invalidateQueries({ queryKey: ["dobletes"] });
    } catch {
      /* shown by the API layer */
    } finally {
      setOcupado(false);
    }
  };

  return (
    <GlassPanel
      flat
      className="p-4"
      style={
        resaltada
          ? {
              borderColor: "var(--brand-line)",
              boxShadow: "0 0 0 1px var(--brand-line)",
            }
          : undefined
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            <span className="truncate">{nombreDePuesto(s.event?.station)}</span>
            {s.urgent && (
              <StatusBadge dot={false} tone="warn">
                <span className="inline-flex items-center gap-1">
                  <Zap className="size-3" />
                  {t("dobletes.lanzar.urgente", "Urgente")}
                </span>
              </StatusBadge>
            )}
          </p>
          <p
            className="mt-0.5 text-xs tabular-nums"
            style={{ color: "var(--ink-soft)" }}
          >
            {s.event?.reason
              ? `${REASON_LABEL[s.event.reason] || s.event.reason} · `
              : ""}
            {s.event
              ? `${fechaYHora(s.event.windowStart)}–${soloHora(s.event.windowEnd)}`
              : ""}
            {s.event?.absentGuardName
              ? ` · ${t("dobletes.ofertas.falta", { defaultValue: "falta {{nombre}}", nombre: s.event.absentGuardName })}`
              : ""}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
            {et.origen[s.source] ?? s.source}
            {s.startedBy?.name ? ` · ${s.startedBy.name}` : ""}
            {" · "}
            {fechaYHora(s.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {s.bonusCents ? (
            <StatusBadge dot={false} tone="brand">
              {t("dobletes.ofertas.bono", {
                defaultValue: "Bono {{bono}}",
                bono: dinero(s.bonusCents, s.currency, decimales),
              })}
            </StatusBadge>
          ) : null}
          <StatusBadge tone={TONO_BUSQUEDA[s.status]}>
            {et.busqueda[s.status]}
          </StatusBadge>
        </div>
      </div>

      {activa && (
        <p
          className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
          style={{ color: "var(--ink-soft)" }}
        >
          <span className="flex items-center gap-1">
            <Radio className="size-3.5" style={{ color: "var(--info-text)" }} />
            {t("dobletes.ofertas.oleada", {
              defaultValue: "Oleada {{n}} de {{total}}",
              n: s.wave,
              total: plan.length,
            })}
          </span>
          <span>
            {t("dobletes.ofertas.pendientes", {
              defaultValue: "{{n}} esperando respuesta",
              n: pendientes,
            })}
          </span>
          {proxima != null && s.wave < plan.length && (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              {t("dobletes.ofertas.proximaOleada", {
                defaultValue: "Siguiente oleada en {{min}} min",
                min: proxima,
              })}
            </span>
          )}
        </p>
      )}

      {s.status === "filled" && ganador && (
        <InfoNote className="mt-3" tone="ok">
          {t("dobletes.ofertas.loCubre", {
            defaultValue:
              "Lo cubre {{nombre}}: ya tiene el turno asignado y puede fichar.",
            nombre: ganador.guardName || t("comun.vigilante", "Vigilante"),
          })}
        </InfoNote>
      )}
      {s.status === "exhausted" && (
        <InfoNote className="mt-3" tone="warn">
          {t(
            "dobletes.ofertas.agotada",
            "Se ofreció a todos los disponibles y nadie aceptó. Cúbrelo a mano en Cobertura en vivo, o vuelve a ofrecerlo con más bono.",
          )}
        </InfoNote>
      )}

      {ofertas.length > 0 && (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {ofertas.map((o) => (
            <li
              key={o.id}
              className="glass-sunken flex items-center gap-2 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  <span className="truncate">
                    {o.guardName || t("comun.vigilante", "Vigilante")}
                  </span>
                  <NivelBadge nivel={o.level} />
                </p>
                <p
                  className="text-[11px] tabular-nums"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {et.canal[o.channel] ?? o.channel}
                  {" · "}
                  {t("dobletes.ofertas.oleadaCorta", {
                    defaultValue: "oleada {{n}}",
                    n: o.wave,
                  })}
                  {o.respondedAt ? ` · ${soloHora(o.respondedAt)}` : ""}
                </p>
              </div>
              <StatusBadge tone={TONO_OFERTA[o.status]}>
                {et.oferta[o.status] ?? o.status}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}

      {activa && puede && (
        <div className="cg-acciones mt-3 flex flex-wrap justify-end gap-2">
          <Button
            disabled={ocupado}
            size="sm"
            variant="outline"
            onClick={() => {
              setNuevoBono(s.bonusCents);
              setSubir(true);
            }}
          >
            <TrendingUp className="mr-1 size-3.5" />
            {t("dobletes.ofertas.subirBono", "Subir bono")}
          </Button>
          <Button
            disabled={ocupado}
            size="sm"
            variant="ghost"
            onClick={cancelar}
          >
            <X className="mr-1 size-3.5" />
            {t("dobletes.ofertas.cancelar", "Cancelar búsqueda")}
          </Button>
        </div>
      )}

      <Modal
        description={nombreDePuesto(s.event?.station)}
        footer={
          <>
            <Button variant="outline" onClick={() => setSubir(false)}>
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button
              disabled={
                ocupado || nuevoBono == null || nuevoBono <= (s.bonusCents ?? 0)
              }
              variant="brand"
              onClick={guardarBono}
            >
              {t("dobletes.ofertas.subirBono", "Subir bono")}
            </Button>
          </>
        }
        icon={<TrendingUp />}
        open={subir}
        size="sm"
        title={t(
          "dobletes.ofertas.subirBonoTitulo",
          "Subir el bono de esta oferta",
        )}
        onOpenChange={setSubir}
      >
        <div className="space-y-3">
          <label className="block">
            <span className="cg-eyebrow mb-1 block">
              {t("dobletes.ofertas.nuevoBono", {
                defaultValue: "Nuevo bono ({{moneda}})",
                moneda: s.currency,
              })}
            </span>
            <MoneyInput
              cents={nuevoBono}
              className="cg-input w-full px-3 py-2 text-sm"
              decimals={decimales}
              onCents={setNuevoBono}
            />
          </label>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t(
              "dobletes.ofertas.subirBonoHint",
              "Quien ya tenía la oferta ve el bono nuevo, y la siguiente oleada sale con él. Sólo se puede subir.",
            )}
          </p>
        </div>
      </Modal>
    </GlassPanel>
  );
}

/**
 * DOBLETES — shared pieces of the module's screens: the gate («no tienes el
 * módulo»), status labels and tones, level badges and money formatting.
 */
import type {
  CtaAction,
  OfferChannel,
  OfferStatus,
  ReserveLevel,
  SearchSource,
  SearchStatus,
  Slot,
} from "@/lib/api/dobletesService";

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Award, CalendarPlus, Medal, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Section, StatusBadge } from "@/components/kit";
import { useEntitlement } from "@/hooks/useEntitlement";
import { localeActual } from "@/lib/localeActual";
import { usePermissions } from "@/hooks/usePermissions";
import { sinModulo as errorSinModulo } from "@/lib/api/dobletesService";

export { dinero, MoneyInput } from "@/pages/admin/nomina/roles/comun";

export const MODULO = "dobletes";

/** Does the company have the module? A 402 from any call also means «no». */
export function useModuloDobletes(error?: unknown): {
  tiene: boolean;
  sinModulo: boolean;
} {
  const tiene = useEntitlement(MODULO);

  return { tiene, sinModulo: !tiene || errorSinModulo(error) };
}

/**
 * Who can launch offers: the new `dobletesManage` plus `coverageCreate` (the
 * assignment itself is a coverage). Fails open while the permission list is
 * not loaded, like the menu; the server checks either way.
 */
export function usePuedeGestionarDobletes(): boolean {
  const { hasPermission, hasAny } = usePermissions();
  const conocidos = hasAny(["userRead", "stationRead", "businessInfoRead"]);

  if (!conocidos) return true;

  return hasPermission("dobletesManage") && hasPermission("coverageCreate");
}

export const TONO_BUSQUEDA: Record<SearchStatus, string> = {
  active: "info",
  filled: "ok",
  exhausted: "bad",
  cancelled: "neutral",
};

export const TONO_OFERTA: Record<OfferStatus, string> = {
  pending: "info",
  accepted: "ok",
  declined: "neutral",
  expired: "warn",
  lost: "neutral",
  withdrawn: "neutral",
  failed: "bad",
};

export const TONO_NIVEL: Record<ReserveLevel, string> = {
  bronce: "warn",
  plata: "neutral",
  oro: "brand",
};

export const SLOTS: Slot[] = ["D", "T", "N"];

export function useEtiquetasDobletes() {
  const { t } = useTranslation();

  const busqueda: Record<SearchStatus, string> = {
    active: t("dobletes.estadoBusqueda.active", "Buscando"),
    filled: t("dobletes.estadoBusqueda.filled", "Cubierto"),
    exhausted: t("dobletes.estadoBusqueda.exhausted", "Nadie aceptó"),
    cancelled: t("dobletes.estadoBusqueda.cancelled", "Cancelada"),
  };
  const oferta: Record<OfferStatus, string> = {
    pending: t("dobletes.estadoOferta.pending", "Esperando respuesta"),
    accepted: t("dobletes.estadoOferta.accepted", "Aceptó"),
    declined: t("dobletes.estadoOferta.declined", "No puede"),
    expired: t("dobletes.estadoOferta.expired", "No contestó"),
    lost: t("dobletes.estadoOferta.lost", "Llegó tarde"),
    withdrawn: t("dobletes.estadoOferta.withdrawn", "Retirada"),
    failed: t("dobletes.estadoOferta.failed", "No se pudo enviar"),
  };
  const canal: Record<OfferChannel, string> = {
    app: t("dobletes.canal.app", "App"),
    whatsapp: t("dobletes.canal.whatsapp", "WhatsApp"),
    voice: t("dobletes.canal.voice", "Llamada"),
  };
  const origen: Record<SearchSource, string> = {
    office: t("dobletes.origen.office", "Oficina"),
    despachador: t("dobletes.origen.despachador", "Despachador automático"),
    supervisor_app: t("dobletes.origen.supervisor_app", "App del supervisor"),
    vigia_chat: t("dobletes.origen.vigia_chat", "Asistente"),
  };
  const nivel: Record<ReserveLevel, string> = {
    bronce: t("dobletes.nivel.bronce", "Bronce"),
    plata: t("dobletes.nivel.plata", "Plata"),
    oro: t("dobletes.nivel.oro", "Oro"),
  };
  const franja: Record<Slot, string> = {
    D: t("dobletes.franja.D", "Día"),
    T: t("dobletes.franja.T", "Tarde"),
    N: t("dobletes.franja.N", "Noche"),
  };
  const cta: Record<CtaAction, string> = {
    join_reserve: t("dobletes.cta.join_reserve", "Unirse a la reserva"),
    available_today: t(
      "dobletes.cta.available_today",
      "Marcar «hoy estoy disponible»",
    ),
    open_offers: t("dobletes.cta.open_offers", "Ver ofertas abiertas"),
    qualify_post: t(
      "dobletes.cta.qualify_post",
      "Apuntarse para cubrir otro puesto",
    ),
    route: t("dobletes.cta.route", "Abrir una pantalla de la app"),
  };
  /** Short weekday names, Sunday first (0-6), in the screen's language. */
  const dias = [0, 1, 2, 3, 4, 5, 6].map((d) =>
    new Intl.DateTimeFormat(localeActual(), {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, 0, 4 + d))),
  );

  return { busqueda, oferta, canal, origen, nivel, franja, cta, dias };
}

export function NivelBadge({
  nivel,
}: {
  nivel: ReserveLevel | null | undefined;
}) {
  const { nivel: etiqueta } = useEtiquetasDobletes();

  if (!nivel) return null;
  const Icono = nivel === "oro" ? Trophy : nivel === "plata" ? Medal : Award;

  return (
    <StatusBadge dot={false} tone={TONO_NIVEL[nivel]}>
      <span className="inline-flex items-center gap-1">
        <Icono className="size-3" />
        {etiqueta[nivel]}
      </span>
    </StatusBadge>
  );
}

/** Without the module: what it does, in four steps, and where to get it. */
export function PresentacionDelModulo() {
  const { t } = useTranslation();
  const pasos = [
    t(
      "dobletes.modulo.paso1",
      "Cuando falta alguien, ofreces el turno a tu reserva con un toque: primero a quienes están disponibles y mejor clasificados, por oleadas.",
    ),
    t(
      "dobletes.modulo.paso2",
      "El primero que acepta en la app se queda el turno. Sin llamadas una por una y sin aprobaciones.",
    ),
    t(
      "dobletes.modulo.paso3",
      "Premias a quien cubre: bono por doblete, puntos, niveles Bronce, Plata y Oro, y el «Respaldo del mes».",
    ),
    t(
      "dobletes.modulo.paso4",
      "Mantienes la banca llena con campañas dentro de la app de tus vigilantes y ves qué puestos se quedan sin suplentes.",
    ),
  ];

  return (
    <Section
      icon={<CalendarPlus />}
      title={t(
        "dobletes.modulo.titulo",
        "Cada hueco, cubierto por tu propia reserva",
      )}
    >
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {t(
          "dobletes.modulo.desc",
          "Con el módulo «Dobletes», las ausencias y renuncias dejan de ser una noche de llamadas: tu gente ve la oferta, la acepta y queda asignada.",
        )}
      </p>
      <ol className="mt-4 space-y-2">
        {pasos.map((p, i) => (
          <li key={i} className="glass-flat flex items-start gap-3 p-3 text-sm">
            <span
              className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums"
              style={{
                background: "var(--brand-wash)",
                color: "var(--brand-text)",
              }}
            >
              {i + 1}
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ol>
      <div className="cg-acciones mt-4 justify-end">
        <Button asChild variant="brand">
          <Link to="/modulos-adicionales">
            {t("dobletes.modulo.enlace", "Ver en Módulos adicionales")}
          </Link>
        </Button>
      </div>
    </Section>
  );
}

export { mesActual, minutosHasta } from "./logica";

/** Label of a station: «P-031 · Puerta norte» (one place for it). */
export { stationLabel as nombreDePuesto } from "@/lib/stationName";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Clock,
  MapPin,
  Radio,
  ShieldX,
  Smartphone,
} from "lucide-react";

import attendanceService, {
  type ClockAttempt,
} from "@/lib/api/attendanceService";
import {
  EmptyState,
  Section,
  SkeletonCards,
  StatusBadge,
} from "@/components/kit";
import { localeActual } from "@/lib/localeActual";
import { getTenantTimezone } from "@/utils/tenantLocation";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LOS FICHAJES QUE NO LLEGARON A SER.
 *
 * Un fichaje rechazado no dejaba rastro en ninguna parte: los tres relojes
 * —vigilante, supervisor y oficina— devuelven `{success:false, error:'…'}`
 * dentro de un HTTP 200 y ahí se acababa. De modo que «llegó al puesto, pulsó,
 * y la app le dijo que no» y «no se presentó» se escribían igual: con silencio.
 * Y esa diferencia es la que decide si a alguien se le descuenta el día.
 *
 * ── UN SOLO COMPONENTE PARA LAS TRES FICHAS ────────────────────────────────
 * Vigilante, supervisor y personal administrativo tienen tres relojes y tres
 * tablas de turnos, pero un solo id de usuario y un solo suceso que contar. Por
 * eso esto recibe `userId` y nada más, y por eso las tres pestañas «Registros»
 * son esta misma pantalla en vez de tres copias que se irían separando.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Rojo lo que deja un puesto sin cubrir; ámbar lo que sólo estorba. */
const TONO: Record<string, string> = {
  geofence_failed: "warn",
  too_early: "warn",
  late_needs_approval: "warn",
  already_clocked_in: "slate",
  already_clocked_in_elsewhere: "warn",
  not_clocked_in: "warn",
  approval_required: "warn",
  selfie_required: "warn",
  location_required: "warn",
  // Éstos son los que dejan a alguien EN LA PUERTA sin poder fichar.
  not_scheduled_here_today: "bad",
  not_assigned_to_post: "bad",
  time_clock_disabled: "bad",
  license_expired: "bad",
  guard_profile_not_found: "bad",
  station_not_found: "bad",
};

/** El texto por defecto de cada motivo, en el idioma del CRM. */
const ETIQUETA: Record<string, string> = {
  geofence_failed: "Fuera del área del puesto",
  too_early: "Demasiado pronto",
  late_needs_approval: "Llegada tarde sin aprobación",
  already_clocked_in: "Ya tenía una entrada activa",
  already_clocked_in_elsewhere: "Entrada activa en otro puesto",
  not_clocked_in: "No tenía entrada activa",
  approval_required: "Salida anticipada sin aprobación",
  selfie_required: "Faltaba la selfie",
  location_required: "Sin ubicación del teléfono",
  not_scheduled_here_today: "Hoy no le tocaba en ese puesto",
  not_assigned_to_post: "No está asignado a ese puesto",
  time_clock_disabled: "El reloj estaba desactivado",
  license_expired: "Credencial vencida",
  guard_profile_not_found: "Sin ficha de vigilante",
  station_not_found: "El puesto no existe",
};

const RELOJ: Record<string, string> = {
  guard: "Vigilante",
  supervisor: "Supervisor",
  staff: "Oficina",
};

export default function RegistroDeIntentos({
  userId,
}: {
  userId?: string | null;
}) {
  const { t } = useTranslation();
  const [filas, setFilas] = useState<ClockAttempt[] | null>(null);
  const [error, setError] = useState(false);
  const [recortado, setRecortado] = useState(false);

  useEffect(() => {
    if (!userId) {
      setFilas([]);

      return;
    }
    let vivo = true;

    setFilas(null);
    setError(false);
    attendanceService
      .clockAttempts({ userId, limit: 100 })
      .then((r) => {
        if (!vivo) return;
        setFilas(Array.isArray(r?.rows) ? r.rows : []);
        setRecortado(!!r?.truncated);
      })
      .catch(() => {
        if (vivo) setError(true);
      });

    return () => {
      vivo = false;
    };
  }, [userId]);

  /* La hora SIEMPRE en la zona de la empresa, nunca en la del navegador de
     quien mira: un intento de las 19:00 leído como las 02:00 desde otro huso
     convierte una llegada puntual en una madrugada inexplicable. */
  const cuando = (iso: string | null) => {
    if (!iso) return "—";
    const tz = getTenantTimezone();

    try {
      return new Date(iso).toLocaleString(localeActual(), {
        dateStyle: "medium",
        timeStyle: "short",
        ...(tz ? { timeZone: tz } : {}),
      });
    } catch {
      return String(iso);
    }
  };

  const titulo = t("logs.title", {
    defaultValue: "Intentos de fichaje rechazados",
  });

  if (error) {
    return (
      <Section icon={<ShieldX className="h-4 w-4" />} title={titulo}>
        <EmptyState
          description={t("logs.errorDesc", {
            defaultValue: "Vuelve a intentarlo en un momento.",
          })}
          icon={<AlertTriangle className="h-5 w-5" />}
          title={t("logs.error", {
            defaultValue: "No se pudo leer el registro",
          })}
          variant="inline"
        />
      </Section>
    );
  }

  if (filas === null) {
    return (
      <Section icon={<ShieldX className="h-4 w-4" />} title={titulo}>
        <SkeletonCards count={3} />
      </Section>
    );
  }

  if (!filas.length) {
    return (
      <Section icon={<ShieldX className="h-4 w-4" />} title={titulo}>
        {/* Que no haya nada es la noticia BUENA, y hay que decirlo así: un
            vacío sin explicar se lee como «esto no funciona». */}
        <EmptyState
          description={t("logs.emptyDesc", {
            defaultValue:
              "Aquí aparece cada vez que el reloj le impide marcar entrada o salida, y por qué. Vacío significa que no le ha pasado.",
          })}
          icon={<ShieldX className="h-5 w-5" />}
          title={t("logs.empty", { defaultValue: "Ningún fichaje rechazado" })}
          variant="inline"
        />
      </Section>
    );
  }

  return (
    <Section
      action={
        <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
          {recortado
            ? t("logs.truncated", {
                n: filas.length,
                defaultValue: "Últimos {{n}}",
              })
            : t("logs.count", {
                n: filas.length,
                defaultValue: "{{n}} en total",
              })}
        </span>
      }
      icon={<ShieldX className="h-4 w-4" />}
      title={titulo}
    >
      <ul className="flex flex-col gap-2">
        {filas.map((f) => (
          <li
            key={f.id}
            className="rounded-2xl border p-3"
            style={{ borderColor: "var(--hairline)" }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={TONO[f.reason] ?? "slate"}>
                {t(`logs.reason.${f.reason}`, {
                  defaultValue: ETIQUETA[f.reason] ?? f.reason,
                })}
              </StatusBadge>
              <StatusBadge dot={false} tone="slate">
                {f.kind === "out"
                  ? t("logs.kindOut", { defaultValue: "Salida" })
                  : t("logs.kindIn", { defaultValue: "Entrada" })}
              </StatusBadge>
              <span
                className="ml-auto text-xs tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                {cuando(f.attemptedAt)}
              </span>
            </div>

            <div
              className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {f.stationName && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {f.stationName}
                </span>
              )}

              {/* La distancia SIN la precisión no afirma nada: a ±2 km, «estaba
                  a 300 m» no acusa a nadie. Por eso van siempre juntas. */}
              {f.distanceMeters != null && (
                <span className="inline-flex items-center gap-1">
                  <Radio className="h-3 w-3" />
                  {t("logs.distance", {
                    m: f.distanceMeters,
                    defaultValue: "A {{m}} m del puesto",
                  })}
                  {f.accuracy != null && (
                    <span style={{ color: "var(--ink-faint)" }}>
                      {t("logs.accuracy", {
                        m: Math.round(f.accuracy),
                        defaultValue: " (±{{m}} m)",
                      })}
                    </span>
                  )}
                </span>
              )}

              {/* Contra qué hora se le midió: un «demasiado pronto» sin esto no
                  se puede juzgar seis meses después. */}
              {f.scheduledStart && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t("logs.scheduled", {
                    h: cuando(f.scheduledStart),
                    defaultValue: "Su turno: {{h}}",
                  })}
                </span>
              )}
              {f.availableAt && (
                <span className="inline-flex items-center gap-1">
                  {t("logs.availableAt", {
                    h: cuando(f.availableAt),
                    defaultValue: "Podía desde: {{h}}",
                  })}
                </span>
              )}

              {(f.platform || f.deviceId) && (
                <span className="inline-flex items-center gap-1">
                  <Smartphone className="h-3 w-3" />
                  {f.platform || t("logs.device", { defaultValue: "Teléfono" })}
                </span>
              )}

              {f.subjectType !== "guard" && (
                <span style={{ color: "var(--ink-faint)" }}>
                  {RELOJ[f.subjectType] ?? f.subjectType}
                </span>
              )}
            </div>

            {/* El mensaje EXACTO que vio la persona. Es lo que zanja la
                discusión: no hay que reconstruir qué le dijo la app. */}
            {f.message && (
              <p
                className="mt-1.5 text-xs italic"
                style={{ color: "var(--ink-faint)" }}
              >
                «{f.message}»
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

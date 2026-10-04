/**
 * «DÓNDE TIENES LA SESIÓN INICIADA» — los dispositivos de MI cuenta.
 *
 * Como la lista de Meta: cada sesión abierta con su dispositivo, su lugar y su
 * última actividad; «Este dispositivo» marcado; un botón para cerrar cada una
 * de las otras y otro para cerrarlas todas. Debajo, los dispositivos
 * anteriores con el motivo por el que su sesión terminó.
 *
 * Los datos son de `GET /auth/sessions` (services/auth/dispositivos en el
 * servidor). Hoy hay UNA sesión por canal (CRM, app del vigilante, app del
 * supervisor): entrar en un segundo navegador sustituye al primero, y eso se
 * ve aquí como un dispositivo anterior «sustituido».
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Laptop, LogOut, MapPin, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { ApiService } from "@/services/api/apiService";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { Section, StatusBadge } from "@/components/kit";
import { localeActual } from "@/lib/localeActual";

type Sesion = {
  id: string;
  channel: string;
  device: string | null;
  location: string | null;
  ip: string | null;
  deviceId: string | null;
  createdAt: string | null;
  lastSeenAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  current: boolean;
  active: boolean;
};

const ES_MOVIL = /android|ios|iphone|ipad/i;

export default function SesionesActivas() {
  const { t } = useTranslation();
  const [activas, setActivas] = useState<Sesion[]>([]);
  const [anteriores, setAnteriores] = useState<Sesion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [cerrando, setCerrando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r: any = await ApiService.get("/auth/sessions");
      const d = r?.activas ? r : r?.data || {};

      setActivas(Array.isArray(d.activas) ? d.activas : []);
      // El mismo dispositivo entra muchas veces: de los anteriores se enseña
      // sólo su última sesión, no una fila por cada inicio.
      const vistos = new Set<string>();

      setAnteriores(
        (Array.isArray(d.anteriores) ? (d.anteriores as Sesion[]) : []).filter(
          (s) => {
            const clave = s.deviceId || `${s.channel}|${s.device}|${s.location || s.ip}`;

            if (vistos.has(clave)) return false;
            vistos.add(clave);

            return true;
          },
        ),
      );
    } catch {
      /* sin lista: la sección no se pinta */
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const canal = (c: string) =>
    c === "web"
      ? t("ui.SesionesActivas.canalWeb", "Panel web")
      : c === "worker"
        ? t("ui.SesionesActivas.canalWorker", "App del vigilante")
        : c === "supervisor"
          ? t("ui.SesionesActivas.canalSupervisor", "App del supervisor")
          : c === "client"
            ? t("ui.SesionesActivas.canalClient", "App del cliente")
            : c;

  const fecha = (iso: string | null, cerrada = false) => {
    if (!iso) return "";
    const d = new Date(iso);
    const min = Math.round((Date.now() - d.getTime()) / 60000);

    if (min < 6 && !cerrada)
      return t("ui.SesionesActivas.ahora", "Activa ahora");
    try {
      const rtf = new Intl.RelativeTimeFormat(localeActual(), {
        numeric: "auto",
      });

      if (min < 60) return rtf.format(-Math.max(min, 1), "minute");
      if (min < 60 * 24) return rtf.format(-Math.round(min / 60), "hour");
      if (min < 60 * 24 * 14) return rtf.format(-Math.round(min / 1440), "day");
    } catch {
      /* sin Intl: fecha larga */
    }

    return d.toLocaleDateString(localeActual(), {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const motivo = (m: string | null) =>
    m === "revoked"
      ? t("ui.SesionesActivas.motivoRevoked", "Cerrada a distancia")
      : m === "signout"
        ? t("ui.SesionesActivas.motivoSignout", "Cerró sesión")
        : t(
            "ui.SesionesActivas.motivoSuperseded",
            "Sustituida por otro inicio de sesión",
          );

  const cerrar = async (s: Sesion) => {
    const ok = await confirmDialog({
      title: t("ui.SesionesActivas.cerrarTitulo", "Cerrar esta sesión"),
      message: t("ui.SesionesActivas.cerrarMensaje", {
        defaultValue:
          "Se cerrará la sesión en {{dispositivo}}. Para volver a entrar habrá que escribir la contraseña.",
        dispositivo: s.device || canal(s.channel),
      }),
      confirmText: t("ui.SesionesActivas.cerrarSesion", "Cerrar sesión"),
      tone: "danger",
    });

    if (!ok) return;
    setCerrando(s.id);
    try {
      await ApiService.delete(`/auth/sessions/${s.id}`);
      toast.success(
        t("ui.SesionesActivas.cerrada", "Sesión cerrada en ese dispositivo."),
      );
      await cargar();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("ui.SesionesActivas.noSePudo", "No se pudo cerrar la sesión."),
      );
    } finally {
      setCerrando(null);
    }
  };

  const cerrarLasDemas = async () => {
    const ok = await confirmDialog({
      title: t(
        "ui.SesionesActivas.cerrarTodasTitulo",
        "Cerrar las demás sesiones",
      ),
      message: t(
        "ui.SesionesActivas.cerrarTodasMensaje",
        "Se cerrará tu sesión en todos los demás dispositivos. Este se queda dentro.",
      ),
      confirmText: t("ui.SesionesActivas.cerrarTodas", "Cerrar las demás"),
      tone: "danger",
    });

    if (!ok) return;
    setCerrando("todas");
    try {
      await ApiService.post("/auth/sessions/sign-out-others", {});
      toast.success(
        t(
          "ui.SesionesActivas.cerradasTodas",
          "Sesiones cerradas en los demás dispositivos.",
        ),
      );
      await cargar();
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("ui.SesionesActivas.noSePudo", "No se pudo cerrar la sesión."),
      );
    } finally {
      setCerrando(null);
    }
  };

  if (cargando || activas.length === 0) return null;
  const otras = activas.filter((s) => !s.current);

  const Fila = ({ s }: { s: Sesion }) => {
    const Icono =
      s.channel !== "web" || ES_MOVIL.test(s.device || "")
        ? Smartphone
        : Laptop;

    return (
      <li className="flex flex-wrap items-center gap-3 py-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-xl"
          style={{
            background: s.active ? "var(--brand-wash)" : "var(--glass-sunken)",
            color: s.active ? "var(--brand-text)" : "var(--ink-faint)",
          }}
        >
          <Icono className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">
              {s.device ||
                t(
                  "ui.SesionesActivas.dispositivoDesconocido",
                  "Dispositivo sin identificar",
                )}
            </span>
            {s.current && (
              <StatusBadge tone="ok">
                {t("ui.SesionesActivas.esteDispositivo", "Este dispositivo")}
              </StatusBadge>
            )}
          </div>
          <div
            className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
            style={{ color: "var(--ink-soft)" }}
          >
            <span>{canal(s.channel)}</span>
            {s.deviceId && (
              <span title={t("ui.SesionesActivas.huella", "Huella del dispositivo")}>
                · <span className="font-mono">{s.deviceId.slice(0, 8)}</span>
              </span>
            )}
            {(s.location || s.ip) && (
              <span className="inline-flex items-center gap-1">
                · <MapPin aria-hidden className="size-3" />
                {s.location || s.ip}
              </span>
            )}
            <span>
              ·{" "}
              {s.active
                ? s.current
                  ? t("ui.SesionesActivas.ahora", "Activa ahora")
                  : fecha(s.lastSeenAt || s.createdAt)
                : `${motivo(s.endReason)} · ${fecha(s.endedAt, true)}`}
            </span>
          </div>
        </div>
        {s.active && !s.current && (
          <Button
            disabled={cerrando !== null}
            size="sm"
            variant="outline"
            onClick={() => cerrar(s)}
          >
            <LogOut className="size-4" />
            {t("ui.SesionesActivas.cerrarSesion", "Cerrar sesión")}
          </Button>
        )}
      </li>
    );
  };

  return (
    <Section
      action={
        otras.length > 0 ? (
          <Button
            disabled={cerrando !== null}
            size="sm"
            variant="outline"
            onClick={cerrarLasDemas}
          >
            <LogOut className="size-4" />
            {t("ui.SesionesActivas.cerrarTodas", "Cerrar las demás")}
          </Button>
        ) : undefined
      }
      icon={<Laptop />}
      title={t("ui.SesionesActivas.titulo", "Dónde tienes la sesión iniciada")}
    >
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {activas.map((s) => (
          <Fila key={s.id} s={s} />
        ))}
      </ul>
      {anteriores.length > 0 && (
        <details className="mt-2">
          <summary
            className="cursor-pointer text-xs font-semibold"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("ui.SesionesActivas.anteriores", {
              defaultValue: "Dispositivos anteriores ({{count}})",
              count: anteriores.length,
            })}
          </summary>
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {anteriores.map((s) => (
              <Fila key={s.id} s={s} />
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

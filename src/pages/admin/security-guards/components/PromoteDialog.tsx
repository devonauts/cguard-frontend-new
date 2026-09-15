import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  ShieldCheck,
  UserCog,
  AlertTriangle,
  History,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { securityGuardService } from "@/lib/api/securityGuardService";

/**
 * Promover o devolver al campo a una persona, conservando su expediente.
 *
 * ── LA DUDA QUE TIENE QUE RESOLVER LA PANTALLA ─────────────────────────────
 * Quien asciende a alguien siempre pregunta lo mismo: «¿pierdo su historial?».
 * Hasta ahora la única forma de ascender era dar de baja y crear de nuevo, y sí
 * se perdía. Por eso este diálogo enseña, con números, lo que se CONSERVA — sus
 * fichajes y sus novedades siguen colgando de la misma persona.
 *
 * Y enseña también lo que hay que resolver antes: un turno abierto (que
 * bloquea) y las asignaciones a puestos que quedarán sin cubrir (que avisan,
 * pero no bloquean — descubrir un puesto es decisión de quien programa).
 */

type Opcion = {
  slug: string;
  authority: number;
  actual: boolean;
  sinCambio: boolean;
  permitido: boolean;
};
type Avisos = {
  turnoAbierto: boolean;
  asignacionesActivas: number;
  fichajes: number;
  incidentes: number;
};

const ICONO: Record<string, typeof ShieldCheck> = {
  securityGuard: ShieldCheck,
  securitySupervisor: UserCog,
};

export function PromoteDialog({
  userId,
  personName,
  open,
  onOpenChange,
  onDone,
}: {
  userId: string | null;
  personName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * Se avisa CON EL ROL NUEVO, no a secas.
   *
   * Antes esto no llevaba argumento y el único llamador hacía
   * `window.location.reload()`: recargar la MISMA url, que es la ficha de
   * vigilante desde donde se asciende. O sea que ascender a alguien te dejaba
   * exactamente donde estabas, mirándolo como vigilante. Quien decide a dónde
   * ir es el llamador —esto es un diálogo, no un router—, pero necesita saber
   * en qué se ha convertido la persona para poder llevarte a su ficha nueva.
   */
  onDone?: (rolNuevo: string) => void;
}) {
  const { t } = useTranslation();
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [avisos, setAvisos] = useState<Avisos | null>(null);
  const [rolesActuales, setRolesActuales] = useState<string[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) return;
    let vivo = true;

    setCargando(true);
    setElegido(null);
    securityGuardService
      .roleOptions(userId)
      .then((d: any) => {
        if (!vivo) return;
        setOpciones(d?.opciones || []);
        setRolesActuales(d?.rolesActuales || []);
        setAvisos(d?.avisos || null);
      })
      .catch(() => {
        if (vivo)
          toast.error(
            t(
              "guards.promote.loadError",
              "No se pudieron cargar los roles disponibles.",
            ),
          );
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
  }, [open, userId, t]);

  const nombreDeRol = (slug: string) =>
    slug === "securitySupervisor"
      ? t("roles.securitySupervisor", "Supervisor")
      : t("roles.securityGuard", "Vigilante");

  const descripcionDeRol = (slug: string) =>
    slug === "securitySupervisor"
      ? t(
          "guards.promote.supervisorDesc",
          "Entra por la app de supervisor: patrullaje, inspecciones y aprobación de asistencia.",
        )
      : t(
          "guards.promote.guardDesc",
          "Entra por la app del vigilante: fichaje en puesto, rondas y novedades.",
        );

  const confirmar = async () => {
    if (!userId || !elegido || enviando) return;
    setEnviando(true);
    try {
      const r: any = await securityGuardService.changeRole(userId, elegido);

      toast.success(
        t(
          "guards.promote.done",
          "{{name}} ahora es {{role}}. Su historial se conservó.",
          {
            name: personName || t("guards.promote.thePerson", "La persona"),
            role: nombreDeRol(elegido),
          },
        ),
      );
      // La sesión anterior se cierra en el servidor: hay que decirlo, o parecerá
      // que la cuenta se rompió cuando la persona no pueda entrar en su app vieja.
      if (r?.sesionCerrada) {
        toast.info(
          t(
            "guards.promote.mustSignIn",
            "Deberá volver a iniciar sesión, ahora en {{app}}.",
            {
              app:
                elegido === "securitySupervisor"
                  ? t("guards.promote.supervisorApp", "la app de supervisor")
                  : t("guards.promote.guardApp", "la app del vigilante"),
            },
          ),
        );
      }
      // El correo de bienvenida sale solo al ascender. Decirlo evita que quien
      // promueve escriba a la persona por su cuenta para explicarle el cambio.
      if (r?.correoEnviado) {
        toast.info(
          t(
            "guards.promote.welcomeSent",
            "Le enviamos un correo de bienvenida con el enlace para descargar la app de supervisor.",
          ),
        );
      }
      onOpenChange(false);
      onDone?.(elegido);
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("guards.promote.error", "No se pudo cambiar el rol."),
      );
    } finally {
      setEnviando(false);
    }
  };

  const bloqueado = !!avisos?.turnoAbierto;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />{" "}
            {t("guards.promote.title", "Cambiar de rol")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "guards.promote.subtitle",
              "Mueve a esta persona a otro puesto conservando su expediente.",
            )}
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div
            className="py-8 text-center text-sm"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("common.loading", "Cargando…")}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Turno abierto: bloquea, porque cambiar de rol a mitad de turno
                deja el fichaje sin cerrar y la asistencia de ese día rota. */}
            {bloqueado && (
              <div
                className="flex items-start gap-2 rounded-xl border p-3 text-sm"
                style={{
                  background:
                    "color-mix(in oklab, var(--warn) 12%, transparent)",
                  borderColor:
                    "color-mix(in oklab, var(--warn) 30%, transparent)",
                  color: "var(--warn-text)",
                }}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t(
                    "guards.promote.clockedIn",
                    "Tiene un turno abierto. Debe fichar salida antes de cambiar de rol.",
                  )}
                </span>
              </div>
            )}

            {rolesActuales.length > 1 && (
              <div
                className="flex items-start gap-2 rounded-xl border p-3 text-xs"
                style={{
                  borderColor: "var(--hairline)",
                  color: "var(--ink-soft)",
                }}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t(
                    "guards.promote.hasBothRoles",
                    "Ahora tiene los dos papeles. Al elegir uno, se quedará sólo con ese.",
                  )}
                </span>
              </div>
            )}

            {opciones.map((o) => {
              const Icono = ICONO[o.slug] || ShieldCheck;
              const desactivado = o.sinCambio || !o.permitido || bloqueado;

              return (
                <button
                  key={o.slug}
                  className="flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50"
                  disabled={desactivado}
                  style={{
                    borderColor:
                      elegido === o.slug
                        ? "var(--brand-line)"
                        : "var(--hairline)",
                    background:
                      elegido === o.slug ? "var(--brand-wash)" : "transparent",
                  }}
                  type="button"
                  onClick={() => setElegido(o.slug)}
                >
                  <Icono
                    className="mt-0.5 h-5 w-5 shrink-0"
                    style={{ color: "var(--brand-text)" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">
                        {nombreDeRol(o.slug)}
                      </span>
                      {o.actual && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px]"
                          style={{
                            background: "var(--glass-sunken)",
                            color: "var(--ink-soft)",
                          }}
                        >
                          {t("guards.promote.current", "Rol actual")}
                        </span>
                      )}
                      {!o.permitido && !o.sinCambio && (
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {t(
                            "guards.promote.notAllowed",
                            "Tu nivel no alcanza para asignarlo",
                          )}
                        </span>
                      )}
                    </span>
                    <span
                      className="mt-0.5 block text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {descripcionDeRol(o.slug)}
                    </span>
                  </span>
                </button>
              );
            })}

            {/* Lo que se conserva, con números: es la duda real de quien asciende. */}
            {avisos && (avisos.fichajes > 0 || avisos.incidentes > 0) && (
              <div
                className="flex items-start gap-2 rounded-xl border p-3 text-xs"
                style={{
                  borderColor: "var(--hairline)",
                  color: "var(--ink-soft)",
                }}
              >
                <History className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t(
                    "guards.promote.keeps",
                    "Se conserva su historial: {{shifts}} asistencia(s) y {{incidents}} novedad(es).",
                    {
                      shifts: avisos.fichajes,
                      incidents: avisos.incidentes,
                    },
                  )}
                </span>
              </div>
            )}

            {/* Asignaciones: avisa, no bloquea — descubrir un puesto es decisión
                de quien programa, no de esta pantalla. */}
            {!!avisos?.asignacionesActivas && (
              <div
                className="flex items-start gap-2 rounded-xl border p-3 text-xs"
                style={{
                  borderColor: "var(--hairline)",
                  color: "var(--ink-soft)",
                }}
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {t(
                    "guards.promote.assignments",
                    "Sigue asignado a {{n}} puesto(s). Revisa la cobertura en Horario después del cambio.",
                    {
                      n: avisos.asignacionesActivas,
                    },
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            disabled={enviando}
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button
            disabled={!elegido || enviando || bloqueado}
            variant="brand"
            onClick={confirmar}
          >
            {enviando
              ? t("common.saving", "Guardando…")
              : t("guards.promote.confirm", "Cambiar rol")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

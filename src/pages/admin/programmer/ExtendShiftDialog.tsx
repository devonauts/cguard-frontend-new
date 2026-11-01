import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock3 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Modal } from "@/components/kit";
import { coverageService, coverageErrorCode } from "@/lib/api/coverageService";
import { ApiService } from "@/services/api/apiService";
import {
  desdeInputFechaHora,
  paraInputFechaHora,
  zonaDeLaEmpresa,
} from "@/lib/horaDeLaEmpresa";
import { localeActual } from "@/lib/localeActual";
import { todosLosVigilantes } from "@/lib/listarCompleto";

/**
 * «Extender turno» desde el Horario: el vigilante que ya cubrió el día se queda
 * además con la noche porque su relevo no llegó.
 *
 * Mismo servicio que usa el tablero de Cobertura y la app del supervisor, así
 * que la regla y el registro son idénticos se decida donde se decida.
 *
 * ── POR QUÉ AVISA EN VEZ DE BLOQUEAR ──────────────────────────────────────
 * Cuando a las 18:00 no aparece el relevo, el supervisor TIENE que dejar a
 * alguien en el puesto. Un sistema que se niega es un sistema que se saltan por
 * fuera — y entonces se pierde el registro, que es lo único que vale después.
 * Las consecuencias se MUESTRAN y se envía cuáles se advirtieron.
 */

export interface ExtendTarget {
  guardId: string;
  guardName: string;
  stationName?: string | null;
  /**
   * El puesto de la casilla desde la que se abrió. Se envía SIEMPRE que se
   * conozca: quien pulsa sabe en qué puesto está, y hacérselo deducir al
   * servidor de «su último turno» fallaba justo en los casos que importan —
   * turno del día anulado, o un vigilante traído de otro puesto.
   */
  stationId?: string | null;
  /** Fin previsto de su turno, para proponer un «hasta» razonable. */
  scheduledEnd?: string | null;
  /** Inicio del tramo nuevo. Por defecto, donde termina el suyo. */
  scheduledStart?: string | null;
}

/* `v` is the API value; `clave` is the i18n key for the displayed label. */
const MOTIVOS: { v: string; label: string; clave: string }[] = [
  {
    v: "no_call_no_show",
    label: "El relevo no llegó ni avisó",
    clave: "ui.ExtendShiftDialog.motivoNoLlegoNiAviso",
  },
  {
    v: "enfermedad",
    label: "El relevo se reportó enfermo",
    clave: "ui.ExtendShiftDialog.motivoEnfermo",
  },
  {
    v: "permiso_con_sueldo",
    label: "El relevo tenía permiso",
    clave: "ui.ExtendShiftDialog.motivoPermiso",
  },
  {
    v: "calamidad_domestica",
    label: "Calamidad doméstica del relevo",
    clave: "ui.ExtendShiftDialog.motivoCalamidad",
  },
  {
    v: "transporte",
    label: "Problema de transporte",
    clave: "ui.ExtendShiftDialog.motivoTransporte",
  },
  {
    v: "refuerzo_cliente",
    label: "El cliente pidió horas adicionales",
    clave: "ui.ExtendShiftDialog.motivoRefuerzoCliente",
  },
  { v: "otro", label: "Otro motivo", clave: "ui.ExtendShiftDialog.motivoOtro" },
];

const SIN_AUSENTE = "__nadie__";

export default function ExtendShiftDialog({
  target,
  onClose,
  onDone,
}: {
  target: ExtendTarget | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  // Doce horas más allá de donde termina lo suyo: es lo que dura el turno que
  // va a cubrir. Se puede cambiar.
  const inicial = useMemo(() => {
    const base = target?.scheduledEnd
      ? new Date(target.scheduledEnd)
      : new Date();
    const d = Number.isNaN(base.getTime()) ? new Date() : base;

    // The input shows the COMPANY wall clock, whatever the viewer's zone.
    return paraInputFechaHora(new Date(d.getTime() + 12 * 3600000));
  }, [target?.scheduledEnd]);

  const [hasta, setHasta] = useState(inicial);
  const [motivo, setMotivo] = useState("no_call_no_show");
  const [nota, setNota] = useState("");
  const [ausenteId, setAusenteId] = useState(SIN_AUSENTE);
  const [avisarCliente, setAvisarCliente] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [companeros, setCompaneros] = useState<{ id: string; label: string }[]>(
    [],
  );

  useEffect(() => {
    setHasta(inicial);
  }, [inicial]);

  // Quién faltó es OPCIONAL: a veces no falta nadie (el cliente pidió horas de
  // más). La lista es una comodidad, no un requisito.
  useEffect(() => {
    if (!target) return;
    let vivo = true;

    todosLosVigilantes(localStorage.getItem("tenantId") || "")
      .then((r: any) => {
        if (!vivo) return;
        const filas = Array.isArray(r) ? r : r?.rows || r?.data || [];

        setCompaneros(
          filas
            .map((g: any) => ({
              id: g.guardId || g.userId || g.id,
              label: g.label || g.fullName || g.name,
            }))
            .filter(
              (g: any) =>
                g.id && g.label && String(g.id) !== String(target.guardId),
            ),
        );
      })
      .catch(() => {
        /* sin lista, el campo simplemente no se ofrece */
      });

    return () => {
      vivo = false;
    };
  }, [target]);

  // Desde dónde empalma el tramo nuevo: el fin de su turno cuando se conoce.
  // Se manda al servidor en vez de dejar que lo deduzca — quien abre el diálogo
  // está mirando la casilla exacta.
  const desde = useMemo(() => {
    const raw = target?.scheduledStart || target?.scheduledEnd;

    if (!raw) return null;
    const d = new Date(raw);

    return Number.isNaN(d.getTime()) ? null : d;
  }, [target?.scheduledStart, target?.scheduledEnd]);

  // Las consecuencias, en vivo mientras se mueve la hora. No impiden nada.
  const horas = useMemo(() => {
    const fin = new Date(desdeInputFechaHora(hasta));

    if (Number.isNaN(fin.getTime()) || !desde) return null;

    return (fin.getTime() - desde.getTime()) / 3600000;
  }, [hasta, desde]);

  // Con código además del texto: el código es lo que queda guardado en el
  // registro de la extensión, y es con lo que después se puede contar «cuántas
  // veces se autorizó una jornada de 24 h».
  const avisos = useMemo(() => {
    const out: { code: string; text: string }[] = [];

    if (horas != null && horas > 0)
      out.push({
        code: "horas_extra",
        text: t("ui.ExtendShiftDialog.sonNHorasMas", {
          defaultValue: "Son {{n}} h más de las previstas.",
          n: Math.round(horas),
        }),
      });
    if (horas != null && horas >= 12)
      out.push({
        code: "jornada_24h",
        text: t(
          "ui.ExtendShiftDialog.quedarianCercaDe24h",
          "Contando su turno, quedarían cerca de 24 h seguidas.",
        ),
      });
    if (horas != null && horas <= 0)
      out.push({
        code: "fin_antes_del_inicio",
        text: t(
          "ui.ExtendShiftDialog.finAnteriorAlInicio",
          "La hora de fin es anterior al inicio del tramo.",
        ),
      });

    return out;
  }, [horas, t]);

  const guardar = async () => {
    if (!target) return;
    const fin = new Date(desdeInputFechaHora(hasta));

    if (Number.isNaN(fin.getTime())) {
      toast.error(
        t("ui.ExtendShiftDialog.revisaLaHoraDeFin", "Revisa la hora de fin."),
      );

      return;
    }
    setGuardando(true);
    try {
      await coverageService.extension({
        guardId: target.guardId,
        until: fin.toISOString(),
        from: desde ? desde.toISOString() : undefined,
        stationId: target.stationId || undefined,
        reason: motivo as any,
        reasonNote: nota.trim() || undefined,
        absentGuardId: ausenteId === SIN_AUSENTE ? undefined : ausenteId,
        notifyClient: avisarCliente,
        // Se guarda QUÉ se advirtió y aun así se confirmó. En una disputa
        // laboral eso pesa más que un bloqueo que alguien esquivó por fuera.
        acknowledgedWarnings: avisos.map((a) => a.code),
      });
      toast.success(
        t("ui.ExtendShiftDialog.quedaCubriendoHasta", {
          defaultValue: "{{nombre}} queda cubriendo hasta las {{hora}}",
          nombre: target.guardName,
          hora: fin.toLocaleTimeString(localeActual(), {
            timeZone: zonaDeLaEmpresa(),
            hour: "2-digit",
            minute: "2-digit",
          }),
        }),
      );
      onDone?.();
      onClose();
    } catch (e: any) {
      const codigo = coverageErrorCode(e);

      toast.error(
        e?.response?.data?.message ||
          (codigo === "post_ya_cubierto"
            ? t(
                "ui.ExtendShiftDialog.puestoYaCubierto",
                "Ese puesto ya tiene a otro vigilante en esa franja.",
              )
            : t(
                "ui.ExtendShiftDialog.noSePudoRegistrarLaExtension",
                "No se pudo registrar la extensión.",
              )),
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      description={
        `${target?.guardName || ""}` +
        `${target?.stationName ? ` · ${target.stationName}` : ""}` +
        (desde
          ? t("ui.ExtendShiftDialog.elTramoNuevoEmpiezaALas", {
              defaultValue: " · el tramo nuevo empieza a las {{hora}}",
              hora: desde.toLocaleTimeString(localeActual(), {
                timeZone: zonaDeLaEmpresa(),
                hour: "2-digit",
                minute: "2-digit",
              }),
            })
          : t(
              "ui.ExtendShiftDialog.seCreaElTramoDesdeDondeTermino",
              " · se crea el tramo en el horario desde donde terminó el suyo",
            ))
      }
      footer={
        <>
          <Button disabled={guardando} variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancelar")}
          </Button>
          <Button disabled={guardando} onClick={() => void guardar()}>
            {guardando
              ? t("ui.ExtendShiftDialog.registrando", "Registrando…")
              : t("ui.ExtendShiftDialog.autorizar", "Autorizar")}
          </Button>
        </>
      }
      icon={<Clock3 />}
      open={!!target}
      title={t("ui.ExtendShiftDialog.extenderTurno", "Extender turno")}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="space-y-4">
        <div>
          <label className="cg-eyebrow mb-1.5 block" htmlFor="ext-hasta">
            {t("ui.ExtendShiftDialog.seQuedaHasta", "Se queda hasta")}
          </label>
          <input
            className="cg-input w-full px-3 py-2 text-sm"
            id="ext-hasta"
            type="datetime-local"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>

        <div>
          <label className="cg-eyebrow mb-1.5 block">
            {t("comun.motivo", "Motivo")}
          </label>
          <Select value={motivo} onValueChange={setMotivo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOTIVOS.map((m) => (
                <SelectItem key={m.v} value={m.v}>
                  {t(m.clave, m.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {companeros.length > 0 && (
          <div>
            <label className="cg-eyebrow mb-1.5 block">
              {t("ui.ExtendShiftDialog.quienFaltoOpcional", "¿Quién faltó? (opcional)")}
            </label>
            <Select value={ausenteId} onValueChange={setAusenteId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_AUSENTE}>
                  {t("ui.ExtendShiftDialog.nadieNoAplica", "Nadie / no aplica")}
                </SelectItem>
                {companeros.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "ui.ExtendShiftDialog.siLoIndicasSeMarcaComoFalta",
                "Si lo indicas, su turno de esa noche se marca como falta y queda en su historial.",
              )}
            </p>
          </div>
        )}

        <div>
          <label className="cg-eyebrow mb-1.5 block" htmlFor="ext-nota">
            {t(
              "ui.ExtendShiftDialog.queGestionSeHizo",
              "Qué gestión se hizo (opcional)",
            )}
          </label>
          <Textarea
            id="ext-nota"
            placeholder={t(
              "ui.ExtendShiftDialog.placeholderGestion",
              "Se llamó a tres vigilantes, ninguno pudo cubrir…",
            )}
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        </div>

        {/* Apagado por defecto: avisar es contarle al cliente que te falló un
            vigilante, y esa es una decisión por caso. Cuando se enciende, el
            mensaje habla de la COBERTURA, nunca del problema interno. */}
        <label className="glass-flat flex cursor-pointer items-start gap-3 rounded-lg p-3">
          <input
            checked={avisarCliente}
            className="mt-0.5"
            type="checkbox"
            onChange={(e) => setAvisarCliente(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">
              {t("ui.ExtendShiftDialog.avisarAlCliente", "Avisar al cliente")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t(
                "ui.ExtendShiftDialog.seLeInformaQueSuPuestoQuedaCubierto",
                "Se le informa de que su puesto queda cubierto y hasta qué hora. No se le dice quién faltó ni por qué.",
              )}
            </span>
          </span>
        </label>

        {avisos.length > 0 && (
          <div
            className="rounded-lg p-3"
            style={{
              background: "color-mix(in oklab, var(--warn) 12%, transparent)",
            }}
          >
            <p className="cg-eyebrow" style={{ color: "var(--warn-text)" }}>
              {t("ui.ExtendShiftDialog.antesDeConfirmar", "Antes de confirmar")}
            </p>
            <ul className="mt-1 space-y-0.5">
              {avisos.map((a) => (
                <li
                  key={a.code}
                  className="text-xs"
                  style={{ color: "var(--warn-text)" }}
                >
                  · {a.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t("ui.ExtendShiftDialog.elTurnoDelDia", "El turno del día")}{" "}
          <strong>{t("ui.ExtendShiftDialog.noSeToca", "no se toca")}</strong>
          {t(
            "ui.ExtendShiftDialog.seAnadeElTramoNuevoMarcado",
            ". Se añade el tramo nuevo al horario en ámbar, marcado",
          )}{" "}
          <strong>2×</strong>
          {t(
            "ui.ExtendShiftDialog.yElVigilanteYaPuedeFichar",
            ", y el vigilante ya puede fichar en él. Las horas entran a su rol como",
          )}{" "}
          <strong>
            {t(
              "ui.ExtendShiftDialog.tiempoExtraAutorizado",
              "tiempo extra autorizado",
            )}
          </strong>
          {t(
            "ui.ExtendShiftDialog.conEsteMotivoYTuNombre",
            ", con este motivo y tu nombre.",
          )}
        </p>
      </div>
    </Modal>
  );
}

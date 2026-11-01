import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Copy,
  KeyRound,
  Mail,
  MessageCircle,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoNote, Section } from "@/components/kit";
import { enlaceDeWhatsApp, mensajeDeAcceso } from "@/lib/agregarPersona";

export interface AccesoCreado {
  username: string | null;
  link: string | null;
  correo: string | null;
}

/**
 * After a full profile is saved: their access and the next step, the same
 * close as «Agregar persona» (it reuses its texts). The schedule is not set in
 * a full profile, so «Ponerle horario» is always offered.
 */
export function PerfilCreado({
  nombre,
  acceso,
  fichaUrl,
  horarioUrl,
  onOtra,
  onVer,
}: {
  nombre: string;
  acceso: AccesoCreado;
  fichaUrl: string | null;
  horarioUrl: string;
  onOtra: () => void;
  onVer: (url: string) => void;
}) {
  const { t } = useTranslation();
  const mensaje = mensajeDeAcceso(
    { nombre, username: acceso.username, link: acceso.link },
    t,
  );

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(t("usuarioDeAcceso.compartir.copiado", "Copiado"));
    } catch {
      toast.error(
        t(
          "usuarioDeAcceso.compartir.noSeCopio",
          "No se pudo copiar. Selecciona el texto y cópialo a mano.",
        ),
      );
    }
  };

  return (
    <Section
      icon={<CheckCircle2 />}
      title={t("agregarPersona.listo.titulo", {
        defaultValue: "Listo: {{nombre}} ya está en el sistema",
        nombre,
      })}
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_1fr]">
          <dt className="cg-eyebrow">
            {t("agregarPersona.resumen.acceso", "Su acceso")}
          </dt>
          <dd className="min-w-0 space-y-2 text-sm">
            {acceso.link ? (
              <>
                {acceso.username && (
                  <div className="flex items-center gap-2">
                    <KeyRound size={14} style={{ color: "var(--ink-soft)" }} />
                    {t("agregarPersona.listo.usuario", "Usuario:")}{" "}
                    <code className="font-mono font-semibold">
                      {acceso.username}
                    </code>
                  </div>
                )}
                <Input
                  readOnly
                  className="font-mono text-xs"
                  id="perfil-enlace"
                  value={acceso.link}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => copiar(acceso.link || "")}
                  >
                    <Copy size={14} />
                    {t(
                      "usuarioDeAcceso.compartir.copiarEnlace",
                      "Copiar enlace",
                    )}
                  </Button>
                  <Button asChild size="sm" variant="brand">
                    <a
                      href={enlaceDeWhatsApp(mensaje)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <MessageCircle size={14} />
                      {t(
                        "usuarioDeAcceso.compartir.whatsapp",
                        "Compartir por WhatsApp",
                      )}
                    </a>
                  </Button>
                </div>
                <InfoNote tone="warn">
                  {t(
                    "agregarPersona.listo.enlacePrivado",
                    "El enlace es solo para esta persona: con él pone la contraseña de su cuenta. No lo publiques en grupos.",
                  )}
                </InfoNote>
              </>
            ) : acceso.correo ? (
              <span className="flex items-center gap-2">
                <Mail size={14} style={{ color: "var(--ink-soft)" }} />
                {t("agregarPersona.listo.correoEnviado", {
                  defaultValue:
                    "Le enviamos un correo a {{correo}} para que cree su contraseña.",
                  correo: acceso.correo,
                })}
              </span>
            ) : (
              <span style={{ color: "var(--ink-soft)" }}>
                {t(
                  "agregarPersona.listo.accesoEnFicha",
                  "Su acceso está en su ficha («Reenviar invitación»).",
                )}
              </span>
            )}
          </dd>
        </dl>

        <InfoNote
          icon={<CalendarClock />}
          title={t("agregarPersona.listo.faltaHorario", "Falta su horario")}
          tone="warn"
        >
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => onVer(horarioUrl)}
          >
            {t("agregarPersona.listo.ponerHorario", "Ponerle horario")}
            <ArrowRight size={14} />
          </Button>
        </InfoNote>

        <div
          className="flex flex-wrap gap-2 border-t pt-4"
          style={{ borderColor: "var(--hairline)" }}
        >
          {fichaUrl && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onVer(fichaUrl)}
            >
              {t("agregarPersona.listo.verFicha", "Ver ficha")}
            </Button>
          )}
          <Button type="button" variant="brand" onClick={onOtra}>
            <UserPlus size={14} />
            {t("agregarPersona.listo.otra", "Agregar otra persona")}
          </Button>
        </div>
      </div>
    </Section>
  );
}

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, KeyRound, MessageCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoNote, Modal } from "@/components/kit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «USUARIO: jmiranda · COMPARTE ESTE ENLACE PARA QUE PONGA SU CONTRASEÑA»
 *
 * Quien no tiene correo no recibe la invitación ni el «olvidé mi contraseña»:
 * no hay buzón al que mandarlos. El servidor devuelve entonces el enlace a
 * quien hizo el alta (o pidió el restablecimiento) y esta ventana se lo pone
 * en la mano: su usuario para entrar, el enlace, «Copiar» y «Compartir por
 * WhatsApp» con un mensaje corto ya escrito.
 *
 * El enlace es una CREDENCIAL —con él se pone la contraseña de esa cuenta—,
 * así que se avisa: sólo para esa persona.
 *
 * Una sola pieza para vigilantes, supervisores, altas e invitaciones. Admite
 * varias personas a la vez (un alta de varios bloques sin correo).
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface AccesoParaCompartir {
  nombre?: string | null;
  username?: string | null;
  link?: string | null;
}

/** Invitación (crear la contraseña) o restablecimiento (poner una nueva). */
export type MotivoDelEnlace = "invitacion" | "restablecer";

export function CompartirAcceso({
  open,
  onOpenChange,
  accesos,
  motivo = "invitacion",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accesos: AccesoParaCompartir[];
  motivo?: MotivoDelEnlace;
}) {
  const { t } = useTranslation();

  const mensajeDe = (a: AccesoParaCompartir) => {
    const datos = {
      nombre: (a.nombre || "").trim().split(/\s+/)[0] || "",
      usuario: a.username || "",
      enlace: a.link || "",
    };

    if (motivo === "restablecer")
      return t("usuarioDeAcceso.compartir.mensajeRestablecer", {
        ...datos,
        defaultValue:
          "Hola {{nombre}}. Tu usuario para entrar a la app es: {{usuario}}. Pon tu nueva contraseña aquí: {{enlace}}",
      });

    return t("usuarioDeAcceso.compartir.mensajeInvitacion", {
      ...datos,
      defaultValue:
        "Hola {{nombre}}. Tu usuario para entrar a la app es: {{usuario}}. Crea tu contraseña aquí: {{enlace}}",
    });
  };

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

  const porWhatsApp = (a: AccesoParaCompartir) => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(mensajeDe(a))}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <Modal
      description={
        motivo === "restablecer"
          ? t(
              "usuarioDeAcceso.compartir.descripcionRestablecer",
              "No tiene correo: comparte este enlace para que ponga su nueva contraseña.",
            )
          : t(
              "usuarioDeAcceso.compartir.descripcionInvitacion",
              "Comparte este enlace para que ponga su contraseña.",
            )
      }
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("usuarioDeAcceso.compartir.listo", "Listo")}
        </Button>
      }
      icon={<KeyRound />}
      open={open}
      size="lg"
      title={
        accesos.length > 1
          ? t("usuarioDeAcceso.compartir.tituloVarios", "Accesos para compartir")
          : t("usuarioDeAcceso.compartir.titulo", "Su acceso a la app")
      }
      onOpenChange={onOpenChange}
    >
      <div className="space-y-5">
        {accesos.map((a, i) => (
          <div key={`${a.username || ""}-${i}`} className="space-y-2.5">
            {a.nombre && accesos.length > 1 && (
              <p className="text-sm font-semibold">{a.nombre}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span style={{ color: "var(--ink-soft)" }}>
                {t("usuarioDeAcceso.compartir.usuario", "Usuario:")}
              </span>
              <span className="font-mono font-semibold">
                {a.username || "—"}
              </span>
              {a.username && (
                <Button
                  aria-label={t(
                    "usuarioDeAcceso.compartir.copiarUsuario",
                    "Copiar usuario",
                  )}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => copiar(a.username!)}
                >
                  <Copy />
                </Button>
              )}
            </div>
            {a.link ? (
              <>
                <Input
                  readOnly
                  aria-label={t("usuarioDeAcceso.compartir.enlace", "Enlace")}
                  className="font-mono text-xs"
                  value={a.link}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copiar(a.link!)}
                  >
                    <Copy />
                    {t("usuarioDeAcceso.compartir.copiarEnlace", "Copiar enlace")}
                  </Button>
                  <Button size="sm" onClick={() => porWhatsApp(a)}>
                    <MessageCircle />
                    {t(
                      "usuarioDeAcceso.compartir.whatsapp",
                      "Compartir por WhatsApp",
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "usuarioDeAcceso.compartir.sinEnlace",
                  "No llegó un enlace. Prueba «Reenviar invitación» desde su ficha.",
                )}
              </p>
            )}
          </div>
        ))}
        <InfoNote icon={<ShieldAlert />} tone="warn">
          {t(
            "usuarioDeAcceso.compartir.aviso",
            "El enlace es sólo para esta persona: con él pone la contraseña de su cuenta. No lo publiques en grupos.",
          )}
        </InfoNote>
      </div>
    </Modal>
  );
}

/**
 * La ventana y su estado, para no repetirlos en cada pantalla:
 *
 *   const compartir = useCompartirAcceso();
 *   compartir.abrir([{ nombre, username, link }], "restablecer");
 *   …
 *
 * `alCerrar`: lo que toca después (p. ej. volver a la lista tras un alta); si
 * se navegara antes, la ventana desaparecería con la página.
 *   {compartir.dialogo}
 */
export function useCompartirAcceso() {
  const [estado, setEstado] = useState<{
    accesos: AccesoParaCompartir[];
    motivo: MotivoDelEnlace;
    alCerrar?: () => void;
  } | null>(null);

  const abrir = useCallback(
    (
      accesos: AccesoParaCompartir[],
      motivo: MotivoDelEnlace = "invitacion",
      alCerrar?: () => void,
    ) => {
      if (accesos.length) setEstado({ accesos, motivo, alCerrar });
      else alCerrar?.();
    },
    [],
  );

  const dialogo = (
    <CompartirAcceso
      accesos={estado?.accesos || []}
      motivo={estado?.motivo}
      open={!!estado}
      onOpenChange={(o) => {
        if (o) return;
        const despues = estado?.alCerrar;

        setEstado(null);
        despues?.();
      }}
    />
  );

  return { abrir, dialogo, abierto: !!estado };
}

export default CompartirAcceso;

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebounce";
import {
  limpiarAlias,
  usuarioDeAccesoService,
} from "@/lib/api/usuarioDeAccesoService";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CAMPO «USUARIO PARA ENTRAR», CON SU COMPROBACIÓN EN VIVO
 *
 * Una sola pieza para las altas (vigilante, supervisor) y para las fichas:
 *
 *   · Mientras nadie haya escrito, se rellena con la SUGERENCIA del servidor
 *     (inicial del nombre + primer apellido, ya libre: `jmiranda2` si
 *     `jmiranda` está tomado) — `sugerir` y los nombres.
 *   · Lo escrito se comprueba con calma (400 ms sin teclear) y se dice al lado
 *     si está libre, ocupado, reservado o mal formado. El servidor es quien
 *     manda: vuelve a validar al guardar.
 *   · `actual` es el alias que ya tiene la persona: no se le dice «ocupado»
 *     por su propio usuario.
 *
 * `onValidez(true | false | null)`: null mientras comprueba o si está vacío,
 * para que el formulario no se bloquee por una red lenta.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Estado =
  | "vacio"
  | "comprobando"
  | "libre"
  | "propio"
  | "formato"
  | "reservado"
  | "ocupado"
  | "sinRespuesta";

export interface CampoUsuarioDeAccesoProps {
  value: string;
  onChange: (v: string) => void;
  /** La persona que se edita (su propio alias cuenta como libre). */
  userId?: string | null;
  /** El alias que ya tiene: no se comprueba. */
  actual?: string | null;
  firstName?: string;
  lastName?: string;
  /** Rellenar con la sugerencia del servidor mientras nadie haya escrito. */
  sugerir?: boolean;
  onValidez?: (ok: boolean | null) => void;
  id?: string;
  disabled?: boolean;
  /** La línea de ayuda «Con este usuario (o su correo) entra a la app…». */
  ayuda?: boolean;
  /** Intro: dentro de otra ficha no debe enviar el formulario de la ficha. */
  onEnter?: () => void;
}

export function CampoUsuarioDeAcceso({
  value,
  onChange,
  userId,
  actual,
  firstName,
  lastName,
  sugerir = false,
  onValidez,
  id,
  disabled,
  ayuda = true,
  onEnter,
}: CampoUsuarioDeAccesoProps) {
  const { t } = useTranslation();
  const [estado, setEstado] = useState<Estado>(value ? "comprobando" : "vacio");
  // Una vez que alguien escribe, la sugerencia ya no pisa lo suyo.
  const tocado = useRef(false);
  // Lo último que se rellenó solo: si los nombres cambian, se puede renovar.
  const sugerido = useRef<string | null>(null);
  // El alias ya comprobado (el sugerido llega libre: no se pregunta dos veces).
  const comprobado = useRef<string | null>(null);
  // Sólo cuenta la ÚLTIMA respuesta; las lentas que llegan tarde se tiran.
  const turno = useRef(0);

  const valor = useDebouncedValue(value, 400);
  const nombre = useDebouncedValue(firstName || "", 400);
  const apellido = useDebouncedValue(lastName || "", 400);

  useEffect(() => {
    if (!value) setEstado("vacio");
    else if (actual && value === actual) setEstado("propio");
    else if (value !== comprobado.current) setEstado("comprobando");
  }, [value, actual]);

  useEffect(() => {
    const pedirSugerencia =
      sugerir &&
      !tocado.current &&
      !!(nombre.trim() || apellido.trim()) &&
      (!valor || valor === sugerido.current);
    const v = valor.trim();

    if (!pedirSugerencia) {
      if (!v) return;
      if (actual && v === actual) return;
      if (v === comprobado.current) return;
    }
    const mio = ++turno.current;

    usuarioDeAccesoService
      .disponibilidad({
        username: pedirSugerencia ? undefined : v,
        userId: userId || undefined,
        firstName: pedirSugerencia ? nombre : undefined,
        lastName: pedirSugerencia ? apellido : undefined,
      })
      .then((r) => {
        if (mio !== turno.current) return;
        if (pedirSugerencia) {
          if (r?.sugerencia && !tocado.current) {
            sugerido.current = r.sugerencia;
            comprobado.current = r.sugerencia;
            setEstado("libre");
            onChange(r.sugerencia);
          }

          return;
        }
        comprobado.current = v;
        setEstado(
          r?.available
            ? "libre"
            : r?.motivo === "formato" || r?.motivo === "reservado"
              ? r.motivo
              : r?.motivo === "ocupado"
                ? "ocupado"
                : "formato",
        );
      })
      .catch(() => {
        if (mio === turno.current) setEstado("sinRespuesta");
      });
    // `onChange` cambia en cada render del padre: no es una dependencia real.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, nombre, apellido, sugerir, userId, actual]);

  useEffect(() => {
    if (!onValidez) return;
    if (estado === "libre" || estado === "propio") onValidez(true);
    else if (
      estado === "formato" ||
      estado === "reservado" ||
      estado === "ocupado"
    )
      onValidez(false);
    else onValidez(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const linea = (() => {
    switch (estado) {
      case "comprobando":
        return {
          tono: "var(--ink-soft)",
          icono: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
          texto: t("usuarioDeAcceso.comprobando", "Comprobando…"),
        };
      case "libre":
        return {
          tono: "var(--ok-text)",
          icono: <CheckCircle2 className="h-3.5 w-3.5" />,
          texto: t("usuarioDeAcceso.libre", "Disponible"),
        };
      case "ocupado":
        return {
          tono: "var(--bad-text)",
          icono: <CircleAlert className="h-3.5 w-3.5" />,
          texto: t(
            "usuarioDeAcceso.ocupado",
            "Ese usuario ya lo tiene otra persona.",
          ),
        };
      case "reservado":
        return {
          tono: "var(--bad-text)",
          icono: <CircleAlert className="h-3.5 w-3.5" />,
          texto: t(
            "usuarioDeAcceso.reservado",
            "Esa palabra está reservada. Elige otra.",
          ),
        };
      case "formato":
        return {
          tono: "var(--bad-text)",
          icono: <CircleAlert className="h-3.5 w-3.5" />,
          texto: t(
            "usuarioDeAcceso.formato",
            "De 3 a 32 caracteres: letras sin tildes, números, punto, guion o guion bajo. Empieza por una letra.",
          ),
        };
      case "sinRespuesta":
        return {
          tono: "var(--ink-soft)",
          icono: null,
          texto: t(
            "usuarioDeAcceso.sinRespuesta",
            "No pudimos comprobarlo ahora; lo revisamos al guardar.",
          ),
        };
      default:
        return null;
    }
  })();

  return (
    <div>
      <Input
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        disabled={disabled}
        id={id}
        inputMode="text"
        maxLength={32}
        placeholder={t("usuarioDeAcceso.placeholder", "jmiranda")}
        spellCheck={false}
        value={value}
        onChange={(e) => {
          tocado.current = true;
          onChange(limpiarAlias(e.target.value));
        }}
        onKeyDown={
          onEnter
            ? (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                onEnter();
              }
            : undefined
        }
      />
      {linea && (
        <p
          aria-live="polite"
          className="mt-1.5 flex items-center gap-1.5 text-xs"
          style={{ color: linea.tono }}
        >
          {linea.icono}
          {linea.texto}
        </p>
      )}
      {ayuda && (
        <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
          {t(
            "usuarioDeAcceso.ayuda",
            "Con este usuario (o su correo) entra a la app. Lo puedes cambiar; la contraseña no cambia.",
          )}
        </p>
      )}
    </div>
  );
}

export default CampoUsuarioDeAcceso;

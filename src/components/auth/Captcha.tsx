import { useEffect, useMemo, useRef, useState } from "react";

import {
  leerMensajeDelMarco,
  urlDelMarco,
  usarMarcoDeCaptcha,
  type TemaDelMarco,
} from "./marcoDeCaptcha";

/**
 * El captcha del alta (Cloudflare Turnstile).
 *
 * NO se pinta si el servidor dice que no hay clave configurada — y en ese caso
 * el formulario sigue funcionando. Un registro que rechaza a todo el mundo
 * porque falta un secreto es peor que uno sin captcha; el servidor toma la
 * misma decisión del lado de allá (ver services/auth/signupGuard).
 *
 * El script se carga UNA vez por pestaña y bajo demanda: no tiene por qué
 * viajar en el paquete de quien sólo va a iniciar sesión.
 *
 * On a partner's own domain the Turnstile widget goes inside a frame served
 * from app.cguardpro.com (see ./marcoDeCaptcha.ts): Cloudflare only accepts
 * our key on our hostnames. Callers do not change: same props, same
 * `onToken`.
 */

export type ProveedorCaptcha = "turnstile" | "recaptcha";

/**
 * DOS PROVEEDORES. Esto se escribió para Turnstile y en producción se
 * configuraron claves de Google reCAPTCHA — con lo que el widget no pintaba y
 * el registro quedaba cerrado para todo el mundo. El proveedor lo dice el
 * servidor (lo deduce del formato de la clave), y aquí se pinta el que toque.
 */
const FUENTES: Record<
  ProveedorCaptcha,
  { id: string; src: string; global: string }
> = {
  turnstile: {
    id: "cf-turnstile-script",
    src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    global: "turnstile",
  },
  recaptcha: {
    id: "g-recaptcha-script",
    src: "https://www.google.com/recaptcha/api.js?render=explicit",
    global: "grecaptcha",
  },
};

const cargando: Partial<Record<ProveedorCaptcha, Promise<void>>> = {};

function cargarScript(prov: ProveedorCaptcha): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const f = FUENTES[prov];

  if ((window as any)[f.global]) return Promise.resolve();
  if (cargando[prov]) return cargando[prov]!;

  cargando[prov] = new Promise<void>((resolve, reject) => {
    const ya = document.getElementById(f.id) as HTMLScriptElement | null;

    if (ya) {
      ya.addEventListener("load", () => resolve());

      return;
    }
    const s = document.createElement("script");

    s.id = f.id;
    s.src = f.src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(prov + " no cargó"));
    document.head.appendChild(s);
  });

  return cargando[prov]!;
}

/** reCAPTCHA expone su API dentro de `grecaptcha.ready`; Turnstile no. */
function cuandoListo(prov: ProveedorCaptcha): Promise<void> {
  if (prov !== "recaptcha") return Promise.resolve();

  return new Promise<void>((resolve) => {
    const g = (window as any).grecaptcha;

    if (g && typeof g.ready === "function") g.ready(() => resolve());
    else resolve();
  });
}

type PropsDelCaptcha = {
  siteKey: string;
  provider?: ProveedorCaptcha;
  /** Superficie protegida (Turnstile). El servidor la verifica. */
  action?: string;
  /** Se llama con el token, o con '' cuando caduca y hay que rehacerlo. */
  onToken: (token: string) => void;
  className?: string;
};

export default function Captcha(props: PropsDelCaptcha) {
  const enMarco =
    (props.provider ?? "turnstile") === "turnstile" &&
    typeof window !== "undefined" &&
    usarMarcoDeCaptcha(window.location.hostname, import.meta.env.DEV);

  return enMarco ? (
    <CaptchaEnMarco {...props} />
  ) : (
    <CaptchaDirecto {...props} />
  );
}

function temaActual(): TemaDelMarco {
  if (typeof document === "undefined") return "auto";

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** The widget inside our frame (partner domains). The frame knows the site key. */
function CaptchaEnMarco({ action, onToken, className }: PropsDelCaptcha) {
  const marco = useRef<HTMLIFrameElement | null>(null);
  const alAvisar = useRef(onToken);
  const [alto, setAlto] = useState(65);
  const [fallo, setFallo] = useState(false);

  alAvisar.current = onToken;
  const src = useMemo(
    () =>
      urlDelMarco({
        base: import.meta.env.VITE_CAPTCHA_MARCO_URL,
        origen: window.location.origin,
        accion: action,
        idioma: (document.documentElement.lang || navigator.language || "")
          .slice(0, 2)
          .toLowerCase(),
        tema: temaActual(),
      }),
    [action],
  );

  useEffect(() => {
    const origen = new URL(src).origin;
    const oir = (e: MessageEvent) => {
      const m = leerMensajeDelMarco(e, origen, marco.current?.contentWindow);

      if (!m) return;
      if (m.tipo === "token") alAvisar.current(m.token);
      else if (m.tipo === "expirado") alAvisar.current("");
      else if (m.tipo === "alto") setAlto(m.alto);
      else {
        alAvisar.current("");
        // Cloudflare did not load inside the frame: like the direct widget,
        // nobody is trapped; the server decides (and lets people in on an outage).
        if (m.codigo === "carga") setFallo(true);
      }
    };

    window.addEventListener("message", oir);

    return () => window.removeEventListener("message", oir);
  }, [src]);

  if (fallo) return null;

  return (
    <div className={className}>
      <iframe
        ref={marco}
        height={alto}
        referrerPolicy="origin"
        src={src}
        style={{ border: 0, display: "block", maxWidth: "100%" }}
        title="Captcha"
        width={300}
      />
    </div>
  );
}

/** The widget on our own page (our domain, dev and test hosts). */
function CaptchaDirecto({
  siteKey,
  provider = "turnstile",
  action,
  onToken,
  className,
}: PropsDelCaptcha) {
  const caja = useRef<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;

    cargarScript(provider)
      .then(() => cuandoListo(provider))
      .then(() => {
        if (!vivo || !caja.current) return;
        const api = (window as any)[FUENTES[provider].global];

        if (!api || typeof api.render !== "function") {
          setFallo(true);

          return;
        }
        // Las dos APIs comparten `render(elemento, opciones)` y el nombre de
        // las opciones; sólo cambia cómo se limpia.
        widget.current = api.render(caja.current, {
          sitekey: siteKey,
          // La SUPERFICIE protegida. Cloudflare la devuelve al verificar y el
          // servidor comprueba que coincide: así un token resuelto en otro
          // formulario nuestro no se puede replayar en el alta.
          ...(provider === "turnstile" && action ? { action } : {}),
          callback: (token: string) => onToken(token),
          // Caducado o fallido: se borra el token para que el formulario no
          // envíe uno muerto y el usuario vea el widget pedirlo otra vez.
          "expired-callback": () => onToken(""),
          "error-callback": () => onToken(""),
        });
      })
      .catch(() => vivo && setFallo(true));

    return () => {
      vivo = false;
      try {
        const api = (window as any)[FUENTES[provider].global];

        if (!api || widget.current === null) return;
        // Turnstile borra el widget; reCAPTCHA sólo sabe reiniciarlo.
        if (provider === "turnstile" && typeof api.remove === "function")
          api.remove(widget.current);
        else if (typeof api.reset === "function") api.reset(widget.current);
      } catch {
        /* el widget ya no está */
      }
    };
  }, [siteKey, provider, action]);

  // Si Cloudflare no carga (red del usuario, bloqueador), no se le deja
  // atrapado: el servidor decide, y ahí un fallo de red también deja pasar.
  if (fallo) return null;

  return <div ref={caja} className={className} />;
}

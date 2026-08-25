import { useEffect, useRef, useState } from 'react';

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
 */

const SCRIPT_ID = 'cf-turnstile-script';
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let cargando: Promise<void> | null = null;

function cargarScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).turnstile) return Promise.resolve();
  if (cargando) return cargando;

  cargando = new Promise<void>((resolve, reject) => {
    const ya = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (ya) { ya.addEventListener('load', () => resolve()); return; }
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile no cargó'));
    document.head.appendChild(s);
  });
  return cargando;
}

export default function CaptchaTurnstile({
  siteKey,
  onToken,
  className,
}: {
  siteKey: string;
  /** Se llama con el token, o con '' cuando caduca y hay que rehacerlo. */
  onToken: (token: string) => void;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    cargarScript()
      .then(() => {
        if (!vivo || !caja.current) return;
        const ts = (window as any).turnstile;
        if (!ts) { setFallo(true); return; }
        widget.current = ts.render(caja.current, {
          sitekey: siteKey,
          callback: (token: string) => onToken(token),
          // Caducado o fallido: se borra el token para que el formulario no
          // envíe uno muerto y el usuario vea el widget pedirlo otra vez.
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
      })
      .catch(() => vivo && setFallo(true));

    return () => {
      vivo = false;
      try {
        const ts = (window as any).turnstile;
        if (ts && widget.current) ts.remove(widget.current);
      } catch { /* el widget ya no está */ }
    };
  }, [siteKey]);

  // Si Cloudflare no carga (red del usuario, bloqueador), no se le deja
  // atrapado: el servidor decide, y ahí un fallo de red también deja pasar.
  if (fallo) return null;

  return <div ref={caja} className={className} />;
}

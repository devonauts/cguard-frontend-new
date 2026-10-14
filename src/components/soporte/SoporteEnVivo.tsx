import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { MARCA_DE_PLATAFORMA, useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { getAuthToken } from "@/lib/api";
import { cerrarSocket, crearSocket } from "@/lib/socket";
import {
  consultarSoporteEnVivo,
  leerSesionDeSoporte,
  type SoporteEnVivo as Soporte,
} from "@/lib/sesionDeSoporte";

/** Mientras hay banner se vuelve a preguntar: la caducidad sin latido no avisa. */
const MS_REPASO = 60_000;
/** Color de soporte: el mismo que la barra de quien entra. */
const COLOR = "#b45309";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «SOPORTE ESTÁ CONECTADO EN VIVO» — lo que ve la gente de la empresa
 *
 * Cuando el soporte de la plataforma o el del socio entra al CRM de esta
 * empresa, quien esté trabajando en él tiene derecho a saberlo en el momento:
 * un MARCO alrededor de la pantalla y un BANNER arriba que dice quién y, si lo
 * hay, por qué ticket. No es una bitácora que se lee después.
 *
 * El estado lo lleva el servidor (`/tenant/:t/soporte-en-vivo`): se pregunta al
 * montar, llega al instante por el socket compartido (`soporte:en-vivo` /
 * `soporte:fin`) y, mientras está encendido, se repasa cada minuto — si el
 * soporte cerró la pestaña sin pulsar «Salir», la entrada caduca sola en el
 * servidor y aquí desaparece en el siguiente repaso.
 *
 * Quien ES el soporte ve el mismo marco, pero no este banner: tiene su propia
 * barra abajo (`BarraDeSoporte`), con los minutos y la salida.
 *
 * El marco no captura clics (`pointer-events: none`) ni desplaza nada.
 * ════════════════════════════════════════════════════════════════════════════
 */
export default function SoporteEnVivo() {
  const { t } = useTranslation();
  const marca = useWhiteLabel()?.platformName || "";
  const [soporte, setSoporte] = useState<Soporte | null>(null);
  const [soyElSoporte, setSoyElSoporte] = useState<boolean>(() => !!leerSesionDeSoporte());
  const vivo = useRef(true);

  const preguntar = async () => {
    const r = await consultarSoporteEnVivo();

    if (!vivo.current) return;
    setSoporte(r.soporte);
    setSoyElSoporte(r.soyElSoporte || !!leerSesionDeSoporte());
  };

  // Al montar, y cuando haya sesión: el componente vive en la raíz, también en
  // la pantalla de acceso, así que espera a tener token y empresa.
  useEffect(() => {
    vivo.current = true;
    let socket: any = null;
    let espera: ReturnType<typeof setInterval> | null = null;

    const conectar = (): boolean => {
      const token = getAuthToken();
      let tenantId = "";

      try {
        tenantId = localStorage.getItem("tenantId") || "";
      } catch {
        /* sin almacenamiento, sin banner */
      }
      if (!token || !tenantId) return false;
      void preguntar();
      socket = crearSocket(token, tenantId);
      socket.on("soporte:en-vivo", (p: Soporte) => {
        if (p && typeof p === "object") setSoporte(p);
      });
      socket.on("soporte:fin", () => setSoporte(null));

      return true;
    };

    if (!conectar()) {
      espera = setInterval(() => {
        if (conectar() && espera) {
          clearInterval(espera);
          espera = null;
        }
      }, 2000);
    }

    return () => {
      vivo.current = false;
      if (espera) clearInterval(espera);
      cerrarSocket(socket);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mientras está encendido, repaso cada minuto.
  useEffect(() => {
    if (!soporte && !soyElSoporte) return;
    const id = window.setInterval(() => void preguntar(), MS_REPASO);

    return () => window.clearInterval(id);
  }, [soporte, soyElSoporte]); // eslint-disable-line react-hooks/exhaustive-deps

  // Una sesión que ya venció no se enseña aunque no haya llegado el repaso.
  const vencido = soporte && new Date(soporte.venceSesion).getTime() <= Date.now();
  const enVivo = !!soporte && !vencido;

  if (!enVivo && !soyElSoporte) return null;

  // En el anfitrión de un socio no se escribe nuestro nombre: la plataforma
  // se llama como el anfitrión. El soporte DEL SOCIO va con su nombre.
  // Except platform support that came in through the partner panel: it acted
  // as the partner's admin, so the company is told it was the platform's
  // support (the server sends that name), not the partner's nor the host's.
  const quien = soporte?.viaSocio
    ? soporte.nombreDelSoporte || MARCA_DE_PLATAFORMA.platformName
    : soporte?.quien === "plataforma"
      ? marca || soporte.nombreDelSoporte
      : soporte?.nombreDelSoporte || "";

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[2147483001]"
        style={{
          pointerEvents: "none",
          boxShadow: `inset 0 0 0 4px ${COLOR}`,
        }}
      />
      {enVivo && !soyElSoporte && (
        <div
          aria-live="polite"
          className="fixed inset-x-0 top-0 z-[2147483002] flex items-center justify-center gap-2 px-3 text-xs sm:text-sm font-medium text-white shadow-md"
          role="status"
          style={{
            background: COLOR,
            minHeight: 28,
            paddingTop: "max(4px, env(safe-area-inset-top))",
            paddingBottom: 4,
          }}
        >
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-white"
          />
          <span className="truncate">
            {soporte?.ticketAsunto
              ? t("soporte.enVivoTicket", { quien, ticket: soporte.ticketAsunto })
              : t("soporte.enVivo", { quien })}
          </span>
        </div>
      )}
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Link2, Unlink, RefreshCw, Info, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { GlassPanel, InfoNote, SkeletonBlock, StatusBadge } from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import { gustoService, type EstadoDeGusto } from "@/lib/api/gustoService";

/**
 * GUSTO — la tarjeta de «Conexiones y API».
 *
 * Sólo se pinta para empresas de EE. UU. (el servidor lo dice en `disponible`)
 * y si la plataforma tiene la integración configurada. Conectar lleva a Gusto
 * en la misma pestaña; al autorizar, Gusto devuelve aquí con `?gusto=…` y se
 * avisa del resultado en palabras de persona (nunca el error crudo de Gusto).
 */

const MOTIVOS: Record<string, [string, string]> = {
  auth_revoked: ["ui.Gusto.motivoRevocado", "Gusto dejó de aceptar la conexión (se revocó el acceso). Vuelve a conectar."],
  forbidden_scope: ["ui.Gusto.motivoPermisos", "Gusto no nos dio todos los permisos necesarios. Vuelve a conectar con un administrador principal de Gusto."],
  not_us: ["ui.Gusto.motivoNoEEUU", "Gusto sólo está disponible para empresas de Estados Unidos."],
  bad_state: ["ui.Gusto.motivoCaducado", "La solicitud caducó. Vuelve a intentarlo."],
  code_invalid: ["ui.Gusto.motivoCodigo", "Gusto no aceptó la autorización (caducó o ya se usó). Vuelve a conectar."],
  not_configured: ["ui.Gusto.motivoNoConfigurado", "La integración con Gusto todavía no está disponible."],
};

/** El nombre de la ventanita: así la página sabe que está DENTRO de ella. */
const VENTANA = "gusto-oauth";

export default function ConexionGusto() {
  const { t, i18n } = useTranslation();
  const { hasPermission } = usePermissions();
  const puedeGestionar = hasPermission("payrollIntegrationManage");
  const [params, setParams] = useSearchParams();
  const [estado, setEstado] = useState<EstadoDeGusto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);

  const motivo = (codigo?: string | null) => {
    const m = MOTIVOS[String(codigo || "")];

    return m
      ? t(m[0], m[1])
      : t("ui.Gusto.motivoGenerico", "Gusto no respondió como esperábamos. Inténtalo de nuevo en unos minutos.");
  };

  const avisar = (r: string, m?: string | null) => {
    if (r === "conectado") toast.success(t("ui.Gusto.conectado", "Gusto conectado."));
    else if (r === "cancelado") toast(t("ui.Gusto.cancelado", "No se conectó: se canceló la autorización en Gusto."));
    else toast.error(motivo(m));
  };

  const cargar = useCallback(async () => {
    try {
      setEstado(await gustoService.estado());
    } catch {
      setEstado(null);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /* El resultado llega EN VIVO por el websocket de la empresa (`gusto:conexion`
     → `cg:gusto`, ver lib/socket). No se depende de la ventanita: Gusto corta
     su vínculo con esta pestaña (Cross-Origin-Opener-Policy), así que ni
     `window.opener` ni `postMessage` sirven a la vuelta. */
  const ventanaRef = useRef<Window | null>(null);

  useEffect(() => {
    const alRecibir = (e: Event) => {
      const d = (e as CustomEvent).detail || {};

      avisar(String(d.resultado || ""), d.motivo);
      setOcupado(false);
      try {
        ventanaRef.current?.close();
      } catch {
        /* ya cerrada o sin vínculo */
      }
      void cargar();
    };

    window.addEventListener("cg:gusto", alRecibir);

    return () => window.removeEventListener("cg:gusto", alRecibir);
  }, [cargar]); // eslint-disable-line react-hooks/exhaustive-deps

  /* La vuelta de Gusto en la MISMA pestaña (el navegador bloqueó la
     ventanita): se avisa aquí y se limpia la dirección. La vuelta DENTRO de la
     ventanita (`?ventana=1`) ni siquiera monta el CRM: la atiende
     `lib/vueltaDeGusto` antes de arrancar la app. */
  useEffect(() => {
    const r = params.get("gusto");

    if (!r) return;
    avisar(r, params.get("motivo"));
    params.delete("gusto");
    params.delete("motivo");
    setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (cargando) return <SkeletonBlock className="mb-5 h-36" />;
  // Fuera de EE. UU., o sin la integración configurada: no se ofrece.
  if (!estado || !estado.disponible || !estado.configurado) return null;

  /* Gusto se abre en una VENTANITA centrada, como cualquier «Conectar con…».
     Se abre YA, dentro del clic, para que el bloqueador no la frene; la
     dirección llega después. Si el navegador la bloquea igualmente, se va en
     la misma pestaña y la vuelta trae a la persona a esta pantalla. */
  const conectar = async () => {
    setOcupado(true);
    const ancho = 520;
    const alto = 720;
    const izq = window.screenX + Math.max(0, (window.outerWidth - ancho) / 2);
    const arriba = window.screenY + Math.max(0, (window.outerHeight - alto) / 2);
    const ventana = window.open(
      "",
      VENTANA,
      `width=${ancho},height=${alto},left=${izq},top=${arriba},resizable=yes,scrollbars=yes`,
    );

    try {
      const { url } = await gustoService.conectar(!!ventana && !ventana.closed);

      if (!ventana || ventana.closed) {
        window.location.assign(url);

        return;
      }
      ventanaRef.current = ventana;
      ventana.location.href = url;
      // Si la cierran a mano, se vuelve a mirar el estado igual.
      const reloj = window.setInterval(() => {
        if (ventana.closed) {
          window.clearInterval(reloj);
          setOcupado(false);
          void cargar();
        }
      }, 800);
    } catch (e: any) {
      ventana?.close();
      toast.error(e?.message || motivo(null));
      setOcupado(false);
    }
  };

  const desconectar = async () => {
    const ok = await confirmDialog({
      title: t("ui.Gusto.desconectarTitulo", "¿Desconectar Gusto?"),
      message: t(
        "ui.Gusto.desconectarTexto",
        "Dejaremos de enviar horas a la nómina de Gusto. Lo ya enviado se queda en Gusto. Puedes volver a conectar cuando quieras.",
      ),
      confirmText: t("ui.Gusto.desconectar", "Desconectar"),
      tone: "danger",
    });

    if (!ok) return;
    setOcupado(true);
    try {
      await gustoService.desconectar();
      toast.success(t("ui.Gusto.desconectado", "Gusto desconectado."));
      await cargar();
    } catch (e: any) {
      toast.error(e?.message || motivo(null));
    } finally {
      setOcupado(false);
    }
  };

  const conError = estado.estado === "error";
  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(i18n.language, { day: "numeric", month: "short", year: "numeric" }) : "";

  return (
    <GlassPanel className="mb-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-xl text-lg font-black"
            style={{ background: "var(--brand-wash)", color: "var(--brand-text)" }}
          >
            G
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Gusto</h2>
              {estado.conectado ? (
                <StatusBadge tone="ok">{t("ui.Gusto.estadoConectado", "Conectado")}</StatusBadge>
              ) : conError ? (
                <StatusBadge tone="bad">{t("ui.Gusto.estadoError", "Necesita atención")}</StatusBadge>
              ) : (
                <StatusBadge tone="neutral">{t("ui.Gusto.estadoSinConectar", "Sin conectar")}</StatusBadge>
              )}
              {estado.entorno === "demo" && (
                <StatusBadge dot={false} tone="warn">{t("ui.Gusto.pruebas", "Pruebas")}</StatusBadge>
              )}
            </div>
            <p className="mt-0.5 text-sm" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.Gusto.descripcion",
                "Envía las horas aprobadas de tus vigilantes, supervisores y personal de oficina a tu nómina de Gusto.",
              )}
            </p>
          </div>
        </div>

        {puedeGestionar && (
          <div className="flex shrink-0 gap-2">
            {estado.conectado || conError ? (
              <>
                {estado.conectado && (
                  <Button asChild variant="outline">
                    <Link to="/setting/integraciones/gusto">
                      <Users /> {t("ui.Gusto.emparejar", "Empleados")}
                    </Link>
                  </Button>
                )}
                {conError && (
                  <Button disabled={ocupado} onClick={conectar}>
                    <RefreshCw /> {t("ui.Gusto.reconectar", "Volver a conectar")}
                  </Button>
                )}
                <Button disabled={ocupado} variant="danger-ghost" onClick={desconectar}>
                  <Unlink /> {t("ui.Gusto.desconectar", "Desconectar")}
                </Button>
              </>
            ) : (
              <Button disabled={ocupado} onClick={conectar}>
                <Link2 /> {t("ui.Gusto.conectar", "Conectar con Gusto")}
              </Button>
            )}
          </div>
        )}
      </div>

      {(estado.conectado || conError) && estado.compania && (
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt style={{ color: "var(--ink-faint)" }}>{t("ui.Gusto.compania", "Compañía en Gusto")}</dt>
            <dd className="font-medium">{estado.compania.nombre || "—"}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--ink-faint)" }}>{t("ui.Gusto.conectadoEl", "Conectado el")}</dt>
            <dd className="font-medium">{fecha(estado.conectadoEn) || "—"}</dd>
          </div>
        </dl>
      )}

      {conError && (
        <InfoNote className="mt-4" icon={<Info />} tone="bad">
          {motivo(estado.errorCodigo)}
        </InfoNote>
      )}

      {!estado.conectado && !conError && (
        <InfoNote className="mt-4" icon={<Info />} tone="info">
          {t(
            "ui.Gusto.requisitos",
            "Hace falta un administrador principal (o con acceso completo) de tu cuenta de Gusto. Tus empleados deben estar dados de alta en Gusto: aquí los emparejaremos con tu personal.",
          )}{" "}
          {t(
            "ui.Gusto.requisitosEntrar",
            "En la ventana de Gusto entra con el usuario de tu EMPRESA en Gusto, no con una cuenta de desarrollador.",
          )}
        </InfoNote>
      )}

      {!puedeGestionar && (
        <p className="mt-3 text-xs" style={{ color: "var(--ink-faint)" }}>
          {t("ui.Gusto.sinPermiso", "Sólo un administrador o Recursos Humanos puede conectar o desconectar Gusto.")}
        </p>
      )}
    </GlassPanel>
  );
}

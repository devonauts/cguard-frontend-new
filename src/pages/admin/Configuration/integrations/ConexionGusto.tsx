import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Link2, Unlink, RefreshCw, Info } from "lucide-react";

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
  not_configured: ["ui.Gusto.motivoNoConfigurado", "La integración con Gusto todavía no está disponible."],
};

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

  // La vuelta de Gusto: se avisa una vez y se limpia la dirección.
  useEffect(() => {
    const r = params.get("gusto");

    if (!r) return;
    if (r === "conectado") toast.success(t("ui.Gusto.conectado", "Gusto conectado."));
    else if (r === "cancelado") toast(t("ui.Gusto.cancelado", "No se conectó: se canceló la autorización en Gusto."));
    else toast.error(motivo(params.get("motivo")));
    params.delete("gusto");
    params.delete("motivo");
    setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (cargando) return <SkeletonBlock className="mb-5 h-36" />;
  // Fuera de EE. UU., o sin la integración configurada: no se ofrece.
  if (!estado || !estado.disponible || !estado.configurado) return null;

  const conectar = async () => {
    setOcupado(true);
    try {
      const { url } = await gustoService.conectar();

      window.location.assign(url);
    } catch (e: any) {
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

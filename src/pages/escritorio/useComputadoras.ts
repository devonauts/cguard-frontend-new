/**
 * The company's desktop computers, live: the list, who may decide, and the
 * three decisions (each one confirmed first). Shared by the «App de
 * escritorio» page («Mis computadoras», step 3 of the guide) and Settings ›
 * «Computadoras de escritorio».
 *
 * Realtime: the API emits `desktop:devices` to the tenant room when a
 * request arrives or any row changes; the list reloads (grouped, 400 ms). It
 * also reloads when the socket reconnects and when the tab becomes visible.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { agrupar, describirSistema } from "./computadoras";

import { useAuth } from "@/contexts/AuthContext";
import { getAuthToken } from "@/lib/api";
import {
  DESKTOP_DEVICES_EVENT,
  desktopService,
  type DesktopDevice,
  type DesktopDeviceList,
} from "@/lib/api/desktopService";
import { cerrarSocket, crearSocket } from "@/lib/socket";
import { confirmDialog } from "@/components/ui/confirmDialog";

/** Permission that lets a non-admin role decide on computers (admins always can). */
export const PERMISO_COMPUTADORAS = "desktopDevicesManage";

const leerTenant = () => {
  try {
    return localStorage.getItem("tenantId") || "";
  } catch {
    return "";
  }
};

export type Accion = "approve" | "reject" | "revoke";

export function useComputadoras() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const tenantId = leerTenant();
  const [datos, setDatos] = useState<DesktopDeviceList | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const vivo = useRef(true);

  const cargar = useCallback(async () => {
    if (!tenantId) {
      setCargando(false);

      return;
    }
    try {
      const r = await desktopService.list(tenantId);

      if (!vivo.current) return;
      setDatos(r);
      setError(false);
    } catch {
      if (vivo.current) setError(true);
    } finally {
      if (vivo.current) setCargando(false);
    }
  }, [tenantId]);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    let agrupado: ReturnType<typeof setTimeout> | null = null;
    const alCambiar = () => {
      if (agrupado) clearTimeout(agrupado);
      agrupado = setTimeout(() => void cargar(), 400);
    };
    const alVerse = () => {
      if (document.visibilityState === "visible") alCambiar();
    };
    let socket: ReturnType<typeof crearSocket> | null = null;

    if (tenantId) {
      try {
        socket = crearSocket(getAuthToken() || "", tenantId);
        socket.on(DESKTOP_DEVICES_EVENT, alCambiar);
        socket.on("connect", alCambiar);
      } catch {
        socket = null;
      }
    }
    document.addEventListener("visibilitychange", alVerse);

    return () => {
      vivo.current = false;
      if (agrupado) clearTimeout(agrupado);
      document.removeEventListener("visibilitychange", alVerse);
      if (socket) {
        socket.off(DESKTOP_DEVICES_EVENT, alCambiar);
        socket.off("connect", alCambiar);
        cerrarSocket(socket);
      }
    };
  }, [cargar, tenantId]);

  const administra = datos?.canManage ?? hasPermission(PERMISO_COMPUTADORAS);
  const yo = user?.id ? String(user.id) : "";
  const grupos = useMemo(() => agrupar(datos?.devices ?? [], yo), [datos, yo]);

  const equipoDe = (d: DesktopDevice) =>
    d.name ||
    t("desktopApp.devices.unknownComputer", {
      defaultValue: "Computadora sin nombre",
    });
  const personaDe = (d: DesktopDevice) =>
    d.userName ||
    d.userEmail ||
    t("desktopApp.devices.unknownUser", { defaultValue: "Persona sin nombre" });

  const decidir = async (
    accion: Accion,
    d: DesktopDevice,
  ): Promise<boolean> => {
    const equipo = equipoDe(d);
    const persona = personaDe(d);
    const textos = {
      approve: {
        title: t("desktopApp.devices.confirmApproveTitle"),
        message: t("desktopApp.devices.confirmApprove", {
          persona,
          equipo,
          codigo: d.pairingCode || "—",
          sistema: describirSistema(d),
        }),
        confirmText: t("desktopApp.devices.approve"),
        tone: "default" as const,
        ok: t("desktopApp.devices.approvedOk"),
      },
      reject: {
        title: t("desktopApp.devices.confirmRejectTitle"),
        message: t("desktopApp.devices.confirmReject", { persona, equipo }),
        confirmText: t("desktopApp.devices.reject"),
        tone: "danger" as const,
        ok: t("desktopApp.devices.rejectedOk"),
      },
      revoke: {
        title: t("desktopApp.devices.confirmRevokeTitle"),
        message: t("desktopApp.devices.confirmRevoke", { persona, equipo }),
        confirmText: t("desktopApp.devices.revoke"),
        tone: "danger" as const,
        ok: t("desktopApp.devices.revokedOk"),
      },
    }[accion];

    const si = await confirmDialog({
      title: textos.title,
      message: textos.message,
      confirmText: textos.confirmText,
      tone: textos.tone,
    });

    if (!si) return false;
    setOcupado(d.id);
    try {
      await desktopService[accion](tenantId, d.id);
      toast.success(textos.ok);
      await cargar();

      return true;
    } catch (e: any) {
      toast.error(
        (typeof e?.message === "string" &&
          e.status &&
          e.status < 500 &&
          e.message) ||
          t("desktopApp.devices.actionError"),
      );

      return false;
    } finally {
      if (vivo.current) setOcupado(null);
    }
  };

  return {
    tenantId,
    yo,
    cargando,
    error,
    recargar: cargar,
    administra,
    grupos,
    ocupado,
    decidir,
    equipoDe,
    personaDe,
  };
}

export type Computadoras = ReturnType<typeof useComputadoras>;

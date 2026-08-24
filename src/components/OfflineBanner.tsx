import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { WifiOff, RefreshCw, CloudUpload } from "lucide-react";
import { getNetworkStatus, subscribeNetworkStatus, type NetStatus } from "@/lib/offline/networkStatus";
import { subscribePending, flush } from "@/lib/offline/offlineQueue";

/**
 * Banner global de estado de red. Invisible el 99.9% del tiempo — solo aparece
 * cuando algo está mal (sin conexión / reconectando) o cuando hay escrituras
 * encoladas esperando red. Es la pieza que convierte un corte de internet de
 * "el CRM se rompió" a "el CRM avisa y sigue": el operador sabe que está viendo
 * datos cacheados y que lo que registre saldrá solo al volver la conexión.
 */
export default function OfflineBanner() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<NetStatus>(getNetworkStatus());
  const [pending, setPending] = useState(0);

  useEffect(() => subscribeNetworkStatus(setStatus), []);
  useEffect(() => subscribePending(setPending), []);

  const offline = status === "offline";
  const reconnecting = status === "reconnecting";
  if (!offline && !reconnecting && pending === 0) return null;

  const bg = offline ? "var(--bad, #b91c1c)" : reconnecting ? "var(--warn, #b45309)" : "var(--brand, #b45309)";

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[9999] flex items-center justify-center gap-2 px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-md"
      style={{ background: bg }}
    >
      {offline ? (
        <>
          <WifiOff size={14} />
          <span>{t("ui.OfflineBanner.sinConexionMostrandoLosUltimos", "Sin conexión — mostrando los últimos datos conocidos.")}</span>
        </>
      ) : reconnecting ? (
        <>
          <RefreshCw size={14} className="animate-spin" />
          <span>Reconectando…</span>
        </>
      ) : (
        <CloudUpload size={14} />
      )}
      {pending > 0 && (
        <button
          type="button"
          onClick={() => void flush()}
          className="ml-2 rounded-full bg-white/20 px-2.5 py-0.5 text-[11.5px] font-bold hover:bg-white/30"
          title="Enviar ahora"
        >
          {pending} {pending === 1 ? "cambio pendiente" : "cambios pendientes"}
        </button>
      )}
    </div>
  );
}

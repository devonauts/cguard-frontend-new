import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldAlert, Film, Clock } from "lucide-react";
import { EmptyState, IconTile } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";

import { localeActual } from '@/lib/localeActual'
interface SharedClip {
  label?: string;
  url?: string;
  thumbnailUrl?: string;
  startAt?: string;
  endAt?: string;
}

/**
 * Public, no-login viewer for a tokened clip share link sent to a customer.
 * Backend: GET /api/video/clip/shared/:token (allow-listed in authMiddleware).
 */
export default function VideoSharedClip() {
  const { token } = useParams();
  const { t } = useTranslation();
  const [clip, setClip] = useState<SharedClip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const res = await ApiService.get(`/video/clip/shared/${encodeURIComponent(String(token))}`, { skipAuth: true } as { skipAuth?: boolean }) as (SharedClip & { data?: SharedClip }) | null;
        if (on) setClip(res?.data ?? res);
      } catch {
        if (on) setError("Este enlace no es válido o ya expiró.");
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => { on = false; };
  }, [token]);

  const fmt = (v?: string) => { try { return v ? new Intl.DateTimeFormat(localeActual(), { dateStyle: "medium", timeStyle: "short" }).format(new Date(v)) : ""; } catch { return v || ""; } };

  return (
    /* `app-shell` trae los halos del lienzo: es lo que le da al cristal algo que
       desenfocar por detrás. Sin él, esta página pública sería un rectángulo. */
    <div className="app-shell flex min-h-screen flex-col items-center justify-center p-4" style={{ color: 'var(--ink)' }}>
      <div className="w-full max-w-3xl">
        <div className="mb-4 flex items-center gap-2.5">
          {/* Es exactamente lo que `IconTile size="sm"` emite: estaba copiado a
              mano en la única página que el cliente llega a ver. */}
          <IconTile size="sm"><Film /></IconTile>
          <div>
            <p className="text-sm font-bold tracking-tight">
              CGUARD<span style={{ color: 'var(--brand-text)' }}>PRO</span>
            </p>
            <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{t("ui.VideoSharedClip.videoCompartidoDeFormaSegura", "Video compartido de forma segura")}</p>
          </div>
        </div>

        <div className="glass overflow-hidden p-1.5">
          <div className="overflow-hidden rounded-[calc(var(--r-xl)-6px)]" style={{ background: 'var(--glass-sunken)' }}>
            {loading ? (
              <div className="flex h-72 items-center justify-center">
                <Loader2 className="animate-spin" style={{ color: 'var(--brand-text)' }} />
              </div>
            ) : error ? (
              /* Los dos estados vacíos iban a mano y sin el icono del sistema.
                 Es la única pantalla que ve un cliente: tiene que parecer el
                 mismo producto que el resto. */
              <EmptyState
                className="h-72 justify-center border-0"
                icon={<ShieldAlert />}
                title={t("ui.VideoSharedClip.enlaceNoDisponible", "Enlace no disponible")}
                description={error}
              />
            ) : clip?.url ? (
              <video src={clip.url} poster={clip.thumbnailUrl} controls autoPlay className="h-auto w-full" />
            ) : (
              <EmptyState
                className="h-72 justify-center border-0"
                icon={<Clock />}
                title={t("ui.VideoSharedClip.procesandoElVideo", "Procesando el video")}
                description="El video aún se está procesando. Vuelve a intentarlo en unos minutos."
              />
            )}
          </div>
        </div>

        {clip && !error && (
          <div className="mt-4 px-1">
            <p className="text-base font-semibold">{clip.label || "Clip de video"}</p>
            {(clip.startAt || clip.endAt) && (
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
                {fmt(clip.startAt)}{clip.endAt ? ` — ${fmt(clip.endAt)}` : ""}
              </p>
            )}
          </div>
        )}
        <p className="mt-6 text-center text-[11px]" style={{ color: 'var(--ink-faint)' }}>
          {t("ui.VideoSharedClip.esteEnlaceEsPrivadoYPuedeCaducarNoLoCompartas", "Este enlace es privado y puede caducar. No lo compartas.")}
        </p>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Video, Scissors, Film, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { TrimShareModal } from "@/components/video/VideoActionModals";
import { alarmService } from "@/lib/api/alarmService";

/** Video verification for an alarm case: live view of the linked camera(s) +
 *  the auto-captured verification clip(s), with one-click trim-and-send to the
 *  customer. Self-contained; hides itself when no camera/clip is linked. */
export default function AlarmVideoVerification({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const [cameras, setCameras] = useState<any[]>([]);
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [trimCam, setTrimCam] = useState<any | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(() => {
    Promise.all([alarmService.caseCameras(caseId), alarmService.caseClips(caseId)])
      .then(([cams, cl]) => {
        if (!mountedRef.current) return;
        setCameras(Array.isArray(cams) ? cams : []); setClips(Array.isArray(cl) ? cl : []);
      })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
  }, [caseId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;
  if (!cameras.length && !clips.length) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Video className="size-4 text-primary" /> Verificación por video
        {clips.length > 0 && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
            {clips.length} clip{clips.length > 1 ? "s" : ""} de verificación
          </span>
        )}
      </div>

      {cameras.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cameras.map((cam) => (
            <div key={cam.id} className="overflow-hidden rounded-lg border border-border/60 bg-black/40">
              <VideoPlayer camera={cam} className="aspect-video w-full" />
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate text-xs font-medium text-foreground" title={cam.name}>{cam.name || t("ui.AlarmVideoVerification.camara", "Cámara")}</span>
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setTrimCam(cam)}>
                  <Scissors className="size-3.5" /> Recortar y enviar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {clips.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {clips.map((cl) => (
            <div key={cl.id} className="flex items-center gap-2 rounded-lg border border-border/50 bg-background px-3 py-2 text-xs">
              <Film className="size-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-foreground" title={cl.label}>{cl.label || t("ui.AlarmVideoVerification.clipDeVerificacion", "Clip de verificación")}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{cl.status || "pending"}</span>
              {cl.shareToken && (
                <a
                  href={`/video/shared/${cl.shareToken}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <ExternalLink className="size-3" /> Enlace
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {trimCam && (
        <TrimShareModal
          camera={trimCam}
          open={!!trimCam}
          onClose={() => setTrimCam(null)}
          onShared={() => { setTrimCam(null); load(); }}
        />
      )}
    </Card>
  );
}

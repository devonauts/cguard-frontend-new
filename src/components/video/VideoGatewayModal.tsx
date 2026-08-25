import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { createPortal } from "react-dom";
import { X, Loader2, Copy, Server } from "lucide-react";
import { toast } from "sonner";
import { videoService, type Device } from "@/lib/api/videoService";

/**
 * Configure the media gateway (go2rtc) for a device so its cameras play live in
 * the browser. Browsers can't play RTSP; go2rtc converts RTSP -> WebRTC/HLS.
 */
export default function VideoGatewayModal({
  device, open, onClose, onSaved,
}: { device: Device | null; open: boolean; onClose: () => void; onSaved?: () => void }) {
  const { t } = useTranslation();
  const [base, setBase] = useState("");
  const [format, setFormat] = useState<"hls" | "webrtc">("hls");
  const [saving, setSaving] = useState(false);
  const [yaml, setYaml] = useState("");
  const [loadingYaml, setLoadingYaml] = useState(false);

  useEffect(() => {
    if (open && device) {
      setBase(device.streamGatewayBase || "");
      setFormat((device.streamFormat as any) || "hls");
      setYaml("");
      setLoadingYaml(true);
      videoService.gatewayConfig(device.id).then((r) => setYaml(r.yaml || "")).catch(() => setYaml("")).finally(() => setLoadingYaml(false));
    }
  }, [open, device]);

  if (!open || !device) return null;

  const save = async () => {
    setSaving(true);
    try {
      const r: any = await videoService.setGateway(device.id, { streamGatewayBase: base.trim(), streamFormat: format });
      toast.success(base.trim() ? `Gateway configurado · ${r?.camerasUpdated ?? 0} cámaras` : "Gateway desconectado");
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar el gateway");
    } finally {
      setSaving(false);
    }
  };

  const copyYaml = async () => {
    try { await navigator.clipboard.writeText(yaml); toast.success("Configuración go2rtc copiada"); } catch { /* ignore */ }
  };

  const inputCls = "cg-input cg-focus w-full px-3 py-2.5 text-sm";

  return createPortal(
    // Velo negro en los dos temas: un token acromático se invertiría y en claro
    // dejaría el modal sobre un gris pálido, sin separación del fondo.
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 backdrop-blur-sm sm:items-center sm:p-4"
      style={{ background: "oklch(0 0 0 / 0.55)" }}
      onClick={onClose}
    >
      <div className="glass-raised flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden sm:max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl border"
              style={{ background: "var(--brand-wash)", borderColor: "var(--brand-line)", color: "var(--brand-text)" }}
            ><Server size={18} /></div>
            <div>
              <h4 className="font-display text-base font-semibold" style={{ color: "var(--ink)" }}>Gateway de video</h4>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{device.name} · convierte RTSP → WebRTC/HLS para el navegador</p>
            </div>
          </div>
          <button onClick={onClose} className="cg-focus rounded-full p-1.5 transition-colors hover:bg-[var(--glass-sunken)]" style={{ color: "var(--ink-faint)" }}><X size={16} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="cg-eyebrow mb-1.5 block">URL base del gateway (go2rtc)</label>
            <input className={inputCls} value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://gateway.tu-dominio.com  (o http://IP-del-bridge:1984)" />
            <p className="mt-1 text-[11px]" style={{ color: "var(--ink-faint)" }}>Donde corre go2rtc — en la nube (si el DVR es accesible por DDNS) o un bridge en sitio.</p>
          </div>
          <div>
            <label className="cg-eyebrow mb-1.5 block">Formato</label>
            <div className="flex flex-wrap gap-2">
              {(["hls", "webrtc"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFormat(f)}
                  className="cg-focus rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
                  style={format === f
                    ? { borderColor: "var(--brand-line)", background: "var(--brand-wash)", color: "var(--brand-text)" }
                    : { borderColor: "var(--hairline)", color: "var(--ink-soft)" }}
                >
                  {f === "hls" ? "HLS (compatible)" : "WebRTC (baja latencia)"}
                </button>
              ))}
            </div>
          </div>

          <div className="glass-sunken p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{t("ui.VideoGatewayModal.configuracionGo2rtcPegalaEnGo2rtc", "Configuración go2rtc (pégala en go2rtc.yaml)")}</p>
              <button onClick={copyYaml} disabled={!yaml} className="cg-focus inline-flex items-center gap-1 text-xs font-medium hover:underline disabled:opacity-40" style={{ color: "var(--brand-text)" }}><Copy size={12} /> Copiar</button>
            </div>
            {loadingYaml ? (
              <div className="flex items-center gap-2 py-2 text-xs" style={{ color: "var(--ink-soft)" }}><Loader2 size={12} className="animate-spin" /> Generando…</div>
            ) : (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[11px]" style={{ background: "var(--glass-solid)", color: "var(--ink-soft)" }}>{yaml || "Sincroniza las cámaras del dispositivo primero."}</pre>
            )}
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>Despliega go2rtc con este config; toma el RTSP del DVR y lo sirve al CRM.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--hairline)", background: "var(--glass-sunken)" }}>
          <button onClick={onClose} className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-medium">Cancelar</button>
          <button onClick={save} disabled={saving} className="cg-btn-brand cg-focus inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-[filter] hover:brightness-105 disabled:opacity-50">
            {saving && <Loader2 size={14} className="animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import {
  Camera,
  Upload,
  X,
  RotateCcw,
  Check,
  AlertCircle,
  Shield,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ProfilePhotoCaptureProps {
  value?: File | string | null;
  onChange: (file: File | null) => void;
  previewUrl?: string | null;
}

export default function ProfilePhotoCapture({ value, onChange, previewUrl }: ProfilePhotoCaptureProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);

  // Object URL for a File `value`. Created once per File (not on every render)
  // and revoked when the File changes / on unmount so we don't leak blob URLs.
  const valueFile = value instanceof File ? value : null;
  const valueObjectUrl = useMemo(
    () => (valueFile ? URL.createObjectURL(valueFile) : null),
    [valueFile]
  );
  useEffect(() => {
    return () => {
      if (valueObjectUrl) URL.revokeObjectURL(valueObjectUrl);
    };
  }, [valueObjectUrl]);

  // Compute current preview
  const currentPreview = capturedUrl
    ?? valueObjectUrl
    ?? (typeof value === "string" ? value : null)
    ?? previewUrl
    ?? null;

  // ─── Camera helpers ────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCapturedBlob(null);
    setCapturedUrl(null);
    setCameraReady(false);
    setCameraOpen(true);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
        };
      }
    } catch (err: any) {
      const msg =
        err?.name === "NotAllowedError"
          ? "Permiso de cámara denegado. Por favor, permita el acceso a la cámara en su navegador."
          : err?.name === "NotFoundError"
          ? "No se encontró una cámara en este dispositivo."
          : "No se pudo acceder a la cámara. Intente usar 'Seleccionar archivo' en su lugar.";
      setCameraError(msg);
      setCameraReady(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setCameraReady(false);
  }, [stream]);

  const closeCamera = useCallback(() => {
    stopCamera();
    setCameraOpen(false);
    setCapturedBlob(null);
    setCapturedUrl(null);
    setCameraError(null);
  }, [stopCamera]);

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setCapturedUrl(url);
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }, [stopCamera]);

  const retakePhoto = useCallback(() => {
    setCapturedBlob(null);
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    startCamera();
  }, [capturedUrl, startCamera]);

  const confirmPhoto = useCallback(() => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `guard-photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    onChange(file);
    setCameraOpen(false);
    setCapturedBlob(null);
    setCapturedUrl(null);
  }, [capturedBlob, onChange]);

  // ─── Library helper ────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onChange(file);
    e.target.value = "";
  };

  const handleRemove = () => {
    onChange(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Photo preview + action buttons */}
      <div className="flex flex-col items-center gap-4">
        {/* Avatar circle */}
        <div className="relative">
          <div
            className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4"
            style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)', boxShadow: 'var(--lift-2)' }}
          >
            {currentPreview ? (
              <img
                src={currentPreview}
                alt="Foto de perfil"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-1" style={{ color: 'var(--brand-text)' }}>
                <Shield className="h-10 w-10" />
                <span className="text-[10px] font-medium tracking-wide uppercase">Foto</span>
              </div>
            )}
          </div>
          {currentPreview && (
            <button
              type="button"
              onClick={handleRemove}
              className="cg-btn-bad cg-focus absolute -right-1 -top-1 flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              title={t('ui.ProfilePhotoCapture.eliminarFoto')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Instruction label */}
        <p className="max-w-[200px] text-center text-xs leading-snug" style={{ color: 'var(--ink-soft)' }}>
          {t('ui.ProfilePhotoCapture.fotoDelVigilanteConUniforme', 'Foto del vigilante con uniforme completo en fondo neutro')}
        </p>

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startCamera}
            className="gap-1.5"
          >
            <Camera className="w-4 h-4" />
            Tomar foto
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5"
          >
            <Upload className="w-4 h-4" />
            {t('ui.ProfilePhotoCapture.galeria', 'Galería')}
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Camera Dialog */}
      <Dialog open={cameraOpen} onOpenChange={(open) => { if (!open) closeCamera(); }}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="brand-text h-5 w-5" />
              {t('ui.ProfilePhotoCapture.capturarFotoDelVigilante', 'Capturar Foto del Vigilante')}
            </DialogTitle>
          </DialogHeader>

          {/* Instructions banner */}
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              background: 'color-mix(in oklab, var(--info) 12%, transparent)',
              borderColor: 'color-mix(in oklab, var(--info) 28%, transparent)',
              color: 'var(--info-text)',
            }}
          >
            <p className="font-semibold mb-1 flex items-center gap-1.5"><ClipboardList className="h-4 w-4" />{" "}{t('ui.ProfilePhotoCapture.instruccionesParaLaFoto')}</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>{t('ui.ProfilePhotoCapture.elVigilanteDebeVestir')}{" "}<strong>uniforme completo</strong> y presentable</li>
              <li>{t('ui.ProfilePhotoCapture.useUnFondo')}{" "}<strong>neutro</strong> (pared blanca o gris)</li>
              <li>{t('ui.ProfilePhotoCapture.laFotoDebeMostrar')}{" "}<strong>{t('ui.ProfilePhotoCapture.rostroYParteSuperiorDel')}</strong></li>
              <li>{t("ui.ProfilePhotoCapture.buenaIluminacionEviteSombrasY", "Buena iluminación — evite sombras y contraluz")}</li>
              <li>{t('ui.ProfilePhotoCapture.noUseLentesOscurosNi')}</li>
            </ul>
          </div>

          {cameraError && (
            <Alert variant="destructive">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{cameraError}</AlertDescription>
            </Alert>
          )}

          {/* Video / captured preview */}
          {/* Bandas del vídeo: pozo hundido del sistema, no un negro escrito a mano. */}
          <div className="glass-sunken relative aspect-video overflow-hidden rounded-xl">
            {capturedUrl ? (
              <img src={capturedUrl} alt="Foto capturada" className="w-full h-full object-contain" />
            ) : (
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                playsInline
                muted
              />
            )}
            {!cameraReady && !capturedUrl && !cameraError && (
              <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: 'var(--ink-soft)' }}>
                Iniciando cámara…
              </div>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          {/* Buttons */}
          <div className="flex justify-center gap-3 pt-1">
            {capturedUrl ? (
              <>
                <Button type="button" variant="outline" onClick={retakePhoto} className="gap-1.5">
                  <RotateCcw className="w-4 h-4" />
                  Retomar
                </Button>
                <Button type="button" variant="brand" onClick={confirmPhoto} className="gap-1.5">
                  <Check className="w-4 h-4" />
                  {t('ui.ProfilePhotoCapture.usarEstaFoto', 'Usar esta foto')}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="ghost" onClick={closeCamera}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={!cameraReady}
                  onClick={capturePhoto}
                  className="gap-1.5"
                >
                  <Camera className="w-4 h-4" />
                  Capturar
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

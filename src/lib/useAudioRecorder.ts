import i18n from "@/i18n";
import { useCallback, useRef, useState } from "react";

/**
 * WhatsApp-style voice-note recorder for the web CRM, built on MediaRecorder +
 * getUserMedia (mirrors the worker-app's audioRecorder.ts so both clients
 * produce the same kind of audio attachment). Returns a File on stop.
 */

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof (globalThis as any).MediaRecorder !== "undefined"
  );
}

const MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg",
];
const pickMime = (): string => {
  const MR: any = (globalThis as any).MediaRecorder;

  for (const m of MIMES) {
    try {
      if (MR?.isTypeSupported?.(m)) return m;
    } catch {
      /* ignore */
    }
  }

  return "";
};
const extFor = (mime: string): string => {
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";

  return "webm";
};

export type Recording = { file: File; durationMs: number; url: string };

export function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<any>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!isRecordingSupported())
      throw new Error(
        i18n.t(
          "ui.useAudioRecorder.grabacionNoCompatible",
          "La grabación de audio no es compatible con este navegador",
        ),
      );
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    streamRef.current = stream;
    const mime = pickMime();
    const MR: any = (globalThis as any).MediaRecorder;
    const rec = mime ? new MR(stream, { mimeType: mime }) : new MR(stream);

    chunksRef.current = [];
    rec.ondataavailable = (e: any) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    rec.start();
    setRecording(true);
    tickRef.current = setInterval(
      () => setElapsedMs(Date.now() - startedAtRef.current),
      200,
    );
  }, []);

  const stop = useCallback(async (): Promise<Recording | null> => {
    const rec = recorderRef.current;

    if (!rec) {
      cleanup();
      setRecording(false);

      return null;
    }
    const durationMs = Date.now() - startedAtRef.current;
    const result = await new Promise<Recording | null>((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = extFor(type);
        const file = new File(
          [blob],
          `nota-voz-${startedAtRef.current}.${ext}`,
          { type },
        );

        resolve({ file, durationMs, url: URL.createObjectURL(blob) });
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });

    cleanup();
    setRecording(false);

    return result;
  }, [cleanup]);

  const cancel = useCallback(() => {
    const rec = recorderRef.current;

    try {
      if (rec) {
        rec.onstop = null;
        rec.stop();
      }
    } catch {
      /* ignore */
    }
    cleanup();
    setRecording(false);
    setElapsedMs(0);
  }, [cleanup]);

  return {
    recording,
    elapsedMs,
    start,
    stop,
    cancel,
    supported: isRecordingSupported(),
  };
}

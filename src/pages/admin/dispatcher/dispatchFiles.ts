/**
 * Every file of an incident, whatever table it lives in.
 *
 * An incident's files arrive from three places: `attachments` (what the CRM
 * create form uploads, notableType «incident»), `imageUrl` (the evidence photos
 * of the field apps) and `requestDocumentPDF` (the legacy request rows). The
 * detail and print views only read the last one, so a photo added on «Nuevo
 * incidente» was saved and never shown.
 */
export interface DispatchFile {
  key: string;
  name: string;
  url: string | null;
  isImage: boolean;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|heic)(\?|#|$)/i;

/** Only http(s) (or same-origin relative) links are rendered as hrefs. */
export function safeFileUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://local";
    const u = new URL(raw, base);

    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    // not a URL
  }

  return null;
}

function nameOf(f: any): string {
  if (typeof f === "string") return f;

  return String(f?.name || f?.fileName || f?.originalName || "");
}

export function collectDispatchFiles(payload: any): DispatchFile[] {
  if (!payload || typeof payload !== "object") return [];
  const sources: unknown[][] = [
    Array.isArray(payload.attachments) ? payload.attachments : [],
    Array.isArray(payload.imageUrl) ? payload.imageUrl : [],
    Array.isArray(payload.requestDocumentPDF) ? payload.requestDocumentPDF : [],
  ];
  const out: DispatchFile[] = [];
  const seen = new Set<string>();

  sources.forEach((list, s) => {
    list.forEach((f: any, i) => {
      if (!f) return;
      const url = safeFileUrl(
        typeof f === "string" ? null : f.downloadUrl || f.publicUrl || f.url,
      );
      const name = nameOf(f) || (url ? decodeURIComponent(url.split("?")[0].split("/").pop() || "") : "");

      if (!name && !url) return;
      const dedupe = url || `${s}:${name}`;

      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      const mime = typeof f === "string" ? "" : String(f.mimeType || f.type || "");

      out.push({
        key: String((typeof f === "object" && f.id) || `${s}-${i}`),
        name: name || url || "",
        url,
        isImage: mime.startsWith("image/") || IMAGE_EXT.test(name),
      });
    });
  });

  return out;
}

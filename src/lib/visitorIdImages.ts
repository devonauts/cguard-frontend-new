/**
 * The ID images of a visitor log, ready to show.
 *
 * The ID image lives in `idPhoto` (the station tab, the guard app and, since
 * 2026-11-02, the /visitors form). Before that the /visitors «Añadir
 * visitante» form stored it as an attachment row, which the API now returns
 * as `attachments`; those are listed after `idPhoto` so older visitors still
 * show theirs.
 */
export type StoredFileLike = {
  id?: string | number;
  name?: string;
  mimeType?: string;
  downloadUrl?: string | null;
  publicUrl?: string | null;
};

export type VisitorIdImage = {
  key: string;
  url: string;
  name: string;
  isImage: boolean;
};

const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i;

function asList(value: unknown): StoredFileLike[] {
  return Array.isArray(value)
    ? value.filter((f): f is StoredFileLike => !!f && typeof f === "object")
    : [];
}

export function visitorIdImages(
  log: { idPhoto?: unknown; attachments?: unknown } | null | undefined,
): VisitorIdImage[] {
  if (!log) return [];
  const seen = new Set<string>();
  const out: VisitorIdImage[] = [];
  const sources: Array<[string, StoredFileLike[]]> = [
    ["idPhoto", asList(log.idPhoto)],
    ["attachment", asList(log.attachments)],
  ];
  for (const [source, files] of sources) {
    files.forEach((file, index) => {
      const url = file.downloadUrl || file.publicUrl || "";
      if (!url || seen.has(url)) return;
      seen.add(url);
      const name = file.name || "";
      out.push({
        key: `${source}-${file.id ?? index}`,
        url,
        name,
        isImage:
          (file.mimeType || "").toLowerCase().startsWith("image/") ||
          IMAGE_EXTENSION.test(name),
      });
    });
  }
  return out;
}

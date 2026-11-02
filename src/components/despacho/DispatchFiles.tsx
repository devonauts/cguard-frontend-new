import { Paperclip } from "lucide-react";

import { collectDispatchFiles } from "./dispatchFiles";

/** The incident's photos (as thumbnails) and other files (as links). */
export default function DispatchFiles({ payload }: { payload: any }) {
  const files = collectDispatchFiles(payload);

  if (files.length === 0) {
    return <div className="text-sm text-muted-foreground">-</div>;
  }
  const images = files.filter((f) => f.isImage && f.url);
  const others = files.filter((f) => !(f.isImage && f.url));

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((f) => (
            <a
              key={f.key}
              className="block h-32 w-32 overflow-hidden rounded-lg border print:h-48 print:w-48"
              href={f.url as string}
              rel="noreferrer"
              target="_blank"
              title={f.name}
            >
              <img
                alt={f.name}
                className="h-full w-full object-cover"
                loading="lazy"
                src={f.url as string}
              />
            </a>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="space-y-1">
          {others.map((f) => (
            <li key={f.key} className="flex items-center gap-1.5 truncate">
              <Paperclip className="shrink-0" size={12} />
              {f.url ? (
                <a
                  className="truncate underline"
                  href={f.url}
                  rel="noreferrer"
                  style={{ color: "var(--brand-text)" }}
                  target="_blank"
                >
                  {f.name}
                </a>
              ) : (
                <span className="truncate">{f.name}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

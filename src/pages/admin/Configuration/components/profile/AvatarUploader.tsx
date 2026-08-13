import { useRef, useState } from "react";
import { Camera, UserRound } from "lucide-react";

type Props = {
  src?: string | null;
  onChange: (file: File) => void;
  size?: number;
};

/**
 * Zona de subida de la foto: hueco de cristal con filo discontinuo. Al arrastrar
 * un archivo encima el filo y el fondo pasan al acento — es la única señal de
 * «suelta aquí» que se lee sin texto.
 */
export default function AvatarUploader({ src, onChange, size = 128 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (file?: File | null) => {
    if (file && file.type.startsWith("image/")) onChange(file);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            take(e.dataTransfer.files?.[0]);
          }}
          aria-label="Cambiar foto de perfil"
          className="glass-sunken cg-focus group grid h-full w-full place-items-center overflow-hidden transition-colors"
          style={{
            borderStyle: "dashed",
            borderColor: dragging ? "var(--brand-line)" : "var(--hairline)",
            background: dragging ? "var(--brand-wash)" : undefined,
            borderRadius: "var(--r-lg)",
          }}
        >
          {src ? (
            <img src={src} alt="Foto de perfil" className="h-full w-full object-cover" />
          ) : (
            <span
              className="flex flex-col items-center gap-1.5 px-2 text-center [&_svg]:size-9"
              style={{ color: dragging ? "var(--brand-text)" : "var(--ink-faint)" }}
            >
              <UserRound />
              <span className="text-[11px] font-medium leading-tight">Añadir foto</span>
            </span>
          )}
        </button>

        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border [&_svg]:size-4"
          style={{
            background: "var(--brand)",
            borderColor: "var(--brand-line)",
            color: "var(--brand-ink)",
            boxShadow: "var(--lift-2)",
          }}
        >
          <Camera />
        </span>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
        Haz clic o arrastra una imagen
      </p>
    </div>
  );
}

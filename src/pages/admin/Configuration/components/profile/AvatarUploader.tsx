import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (file?: File | null) => {
    if (file && file.type.startsWith("image/")) onChange(file);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <button
          aria-label={t(
            "ui.AvatarUploader.cambiarFotoDePerfil",
            "Cambiar foto de perfil",
          )}
          className="glass-sunken cg-focus group grid h-full w-full place-items-center overflow-hidden transition-colors"
          style={{
            borderStyle: "dashed",
            borderColor: dragging ? "var(--brand-line)" : "var(--hairline)",
            background: dragging ? "var(--brand-wash)" : undefined,
            borderRadius: "var(--r-lg)",
          }}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragLeave={() => setDragging(false)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            take(e.dataTransfer.files?.[0]);
          }}
        >
          {src ? (
            <img
              alt={t("ui.AvatarUploader.fotoDePerfil", "Foto de perfil")}
              className="h-full w-full object-cover"
              src={src}
            />
          ) : (
            <span
              className="flex flex-col items-center gap-1.5 px-2 text-center [&_svg]:size-9"
              style={{
                color: dragging ? "var(--brand-text)" : "var(--ink-faint)",
              }}
            >
              <UserRound />
              <span className="text-[11px] font-medium leading-tight">
                {t("ui.AvatarUploader.anadirFoto", "Añadir foto")}
              </span>
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
          accept="image/*"
          className="hidden"
          type="file"
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
        {t(
          "ui.AvatarUploader.hazClicOArrastraUnaImagen",
          "Haz clic o arrastra una imagen",
        )}
      </p>
    </div>
  );
}

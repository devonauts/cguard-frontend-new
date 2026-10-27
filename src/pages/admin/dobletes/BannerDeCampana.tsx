/**
 * How a company campaign looks inside the guard app (off-duty home screen):
 * image on top, title, text with `{{empresa}}` / `{{bono}}` filled in, and
 * one button. Drawn with the APP's colours (accent, card, text), not the
 * CRM's tokens — the preview must not lie about what the guard will see.
 */
import type { Campaign } from "@/lib/api/dobletesService";

import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

import { rellenar } from "./logica";

export interface ColoresDeLaApp {
  accent: string;
  card: string;
  text: string;
  muted: string;
  border: string;
}

export default function BannerDeCampana({
  c,
  colores,
  empresa,
  bono,
}: {
  c: Pick<Campaign, "title" | "body" | "ctaLabel" | "accent"> & {
    imagen?: string | null;
  };
  colores: ColoresDeLaApp;
  empresa: string;
  bono: string;
}) {
  const { t } = useTranslation();
  const acento = c.accent || colores.accent;

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        borderColor: `${acento}66`,
        background: colores.card,
        color: colores.text,
      }}
    >
      {c.imagen ? (
        <img alt="" className="h-32 w-full object-cover" src={c.imagen} />
      ) : (
        <div
          aria-hidden
          className="h-2 w-full"
          style={{
            background: `linear-gradient(90deg, ${acento}, ${acento}55)`,
          }}
        />
      )}
      <div className="relative p-4">
        <span
          aria-hidden
          className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full"
          style={{ background: `${colores.muted}22`, color: colores.muted }}
        >
          <X size={13} />
        </span>
        <p className="pr-7 text-[16px] font-bold leading-snug">
          {rellenar(c.title, empresa, bono) ||
            t("dobletes.campanas.tituloVacio", "Título de la campaña")}
        </p>
        <p
          className="mt-1 text-[13px] leading-snug"
          style={{ color: colores.muted }}
        >
          {rellenar(c.body, empresa, bono) ||
            t(
              "dobletes.campanas.textoVacio",
              "El texto que verán tus vigilantes.",
            )}
        </p>
        <span
          className="mt-3 inline-flex h-9 items-center rounded-xl px-4 text-[13px] font-bold"
          style={{ background: acento, color: "oklch(0.15 0 0)" }}
        >
          {c.ctaLabel || t("dobletes.campanas.botonVacio", "Botón")}
        </span>
      </div>
    </div>
  );
}

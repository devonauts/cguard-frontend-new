"use client";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

export function SubmitBar({
  primaryLabel,
  secondaryLabel,
  loading = false,
  onPrimary,
  onSecondary,
  primaryClassName,
  secondaryClassName,
}: {
  primaryLabel?: string;
  secondaryLabel?: string;
  loading?: boolean;
  onPrimary: () => void;
  onSecondary?: () => void;
  primaryClassName?: string;
  secondaryClassName?: string;
}) {
  const { t } = useTranslation();
  const primary = primaryLabel ?? t("components.submitBar.primary");
  const sending = t("components.submitBar.sending");

  return (
    <div className="sticky bottom-0 z-10 mt-6 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-wrap items-center justify-end gap-3 border-t px-2 py-3 sm:px-0">
        {secondaryLabel && (
          <Button
            className={secondaryClassName}
            disabled={loading}
            // Sin `type`, un <button> dentro de un <form> vale "submit": el clic
            // ejecutaba el manejador Y el envío nativo del formulario, así que el
            // alta salía DOS veces (la primera devolvía 500 y la segunda 200).
            type="button"
            variant="secondary"
            onClick={onSecondary}
          >
            {secondaryLabel}
          </Button>
        )}
        <Button
          className={primaryClassName}
          disabled={loading}
          type="button"
          onClick={onPrimary}
        >
          {loading ? sending : primary}
        </Button>
      </div>
    </div>
  );
}

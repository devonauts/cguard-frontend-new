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
            variant="secondary"
            onClick={onSecondary}
          >
            {secondaryLabel}
          </Button>
        )}
        <Button
          className={primaryClassName}
          disabled={loading}
          onClick={onPrimary}
        >
          {loading ? sending : primary}
        </Button>
      </div>
    </div>
  );
}

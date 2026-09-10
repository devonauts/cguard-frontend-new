"use client";
import { Clipboard } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function Copyable({ text }: { text: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <div className="max-w-[70vw] truncate rounded-md border-2 border-dashed border-primary/60 px-6 py-3 text-lg font-medium">
        {text}
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                toast.success(t("components.copyable.copied"));
              }}
            >
              <Clipboard className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("components.copyable.copy")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

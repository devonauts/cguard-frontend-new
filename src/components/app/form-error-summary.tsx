"use client";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import i18n from "@/i18n";

export function FormErrorSummary({ hasErrors }: { hasErrors: boolean }) {
  const { t } = useTranslation();
  if (!hasErrors) return null;
  return (
    <Alert variant="destructive" className="mt-2">
      <TriangleAlert className="h-4 w-4" />
      <AlertTitle>{i18n.t("kit.form.errorSummaryTitle")}</AlertTitle>
      <AlertDescription>{t("ui.formerrorsummary.faltanDatosOHayValores", "Faltan datos o hay valores inválidos.")}</AlertDescription>
    </Alert>
  );
}

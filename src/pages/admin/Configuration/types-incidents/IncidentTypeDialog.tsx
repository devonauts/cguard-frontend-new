import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/kit";

const schema = z.object({
  name: z.string().min(2, "Ingresa un nombre válido"),
});

export type IncidentTypeDialogValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  defaultValues?: IncidentTypeDialogValues | null;
  onSubmit: (v: IncidentTypeDialogValues) => void | Promise<void>;
};

export default function IncidentTypeDialog({
  open,
  onOpenChange,
  title,
  defaultValues,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  // Same shape as `schema`, but with the validation message in the current language.
  const localizedSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(
            2,
            t("ui.IncidentTypeDialog.ingresaUnNombreValido", "Ingresa un nombre válido"),
          ),
      }),
    [t],
  );
  const form = useForm<IncidentTypeDialogValues>({
    resolver: zodResolver(localizedSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    form.reset(defaultValues ?? { name: "" });
  }, [defaultValues, form]);
  const submitting = form.formState.isSubmitting;

  return (
    <Modal
      description={t("ui.IncidentTypeDialog.asignaUnNombreParaIdentificar")}
      icon={<AlertTriangle />}
      open={open}
      title={
        title ??
        t("settings.incidentTypes.dialogNewTitle", "Nuevo Tipo de Incidente")
      }
      onOpenChange={onOpenChange}
    >
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("ui.IncidentTypeDialog.nombreDelIncidente")}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t(
                      "ui.IncidentTypeDialog.pEjRoboLesionAlarma",
                      "p. ej. Robo, Lesión, Alarma de incendio…",
                    )}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div
            className="flex items-center justify-end gap-2 border-t pt-4"
            style={{ borderColor: "var(--hairline)" }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              className="px-8 min-w-28"
              disabled={submitting}
              type="submit"
              variant="brand"
            >
              {submitting
                ? t("common.saving", "Guardando…")
                : t("actions.save", "Guardar")}
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}

import { useEffect, useMemo } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { IdCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Modal } from "@/components/kit";

const schema = z.object({
  name: z.string().min(1, "Requerido"),
});

export type LicenseTypeDialogValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  defaultValues?: LicenseTypeDialogValues | null;
  onSubmit: (values: LicenseTypeDialogValues) => Promise<void> | void;
};

export default function LicenseTypeDialog({
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
        name: z.string().min(1, t("ui.DepartmentDialog.requerido", "Requerido")),
      }),
    [t],
  );
  const form = useForm<LicenseTypeDialogValues>({
    resolver: zodResolver(localizedSchema),
    defaultValues: { name: "" },
  });

  useEffect(() => {
    if (defaultValues) form.reset(defaultValues);
    else form.reset({ name: "" });
  }, [defaultValues]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Modal
      description={t("licenseTypes.dialog.description", {
        defaultValue: "Formulario para crear o editar un tipo de licencia.",
      })}
      icon={<IdCard />}
      open={open}
      title={
        title ?? t("licenseTypes.dialog.title.create", "Nuevo Tipo de Licencia")
      }
      onOpenChange={onOpenChange}
    >
      <Form {...form}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("licenseTypes.dialog.form.nameLabel", {
                    defaultValue: "Nombre del Tipo de Licencia",
                  })}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("licenseTypes.dialog.form.namePlaceholder", {
                      defaultValue: "Escribe un nombre",
                    })}
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
              {t("licenseTypes.dialog.cancel", { defaultValue: "Cancelar" })}
            </Button>
            <Button className="px-8" type="submit" variant="brand">
              {t("licenseTypes.dialog.save", { defaultValue: "Guardar" })}
            </Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}

import { useEffect } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useTranslation } from 'react-i18next';
import { Modal } from "@/components/kit";
import { IdCard } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, 'Requerido'),
});

export type LicenseTypeDialogValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  defaultValues?: LicenseTypeDialogValues | null;
  onSubmit: (values: LicenseTypeDialogValues) => Promise<void> | void;
};

export default function LicenseTypeDialog({ open, onOpenChange, title, defaultValues, onSubmit }: Props) {
  const { t } = useTranslation();
  const form = useForm<LicenseTypeDialogValues>({
    resolver: zodResolver(schema),
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
      open={open}
      onOpenChange={onOpenChange}
      icon={<IdCard />}
      title={title ?? t('licenseTypes.dialog.title.create', 'Nuevo Tipo de Licencia')}
      description={t('licenseTypes.dialog.description', { defaultValue: 'Formulario para crear o editar un tipo de licencia.' })}
    >
      <Form {...form}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('licenseTypes.dialog.form.nameLabel', { defaultValue: 'Nombre del Tipo de Licencia' })}</FormLabel>
                <FormControl>
                  <Input placeholder={t('licenseTypes.dialog.form.namePlaceholder', { defaultValue: 'Escribe un nombre' })} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--hairline)' }}>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('licenseTypes.dialog.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button type="submit" variant="brand" className="px-8">{t('licenseTypes.dialog.save', { defaultValue: 'Guardar' })}</Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}

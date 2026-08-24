import { useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/kit";
import { AlertTriangle } from "lucide-react";

const schema = z.object({ name: z.string().min(2, "Ingresa un nombre válido") });
export type IncidentTypeDialogValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  defaultValues?: IncidentTypeDialogValues | null;
  onSubmit: (v: IncidentTypeDialogValues) => void | Promise<void>;
};

export default function IncidentTypeDialog({ open, onOpenChange, title = "Nuevo Tipo de Incidente", defaultValues, onSubmit }: Props) {
  const { t } = useTranslation();
  const form = useForm<IncidentTypeDialogValues>({ resolver: zodResolver(schema), defaultValues: { name: "" } });
  useEffect(() => { form.reset(defaultValues ?? { name: "" }); }, [defaultValues, form]);
  const submitting = form.formState.isSubmitting;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      icon={<AlertTriangle />}
      title={title}
      description="Asigna un nombre para identificar el tipo de incidente."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del incidente</FormLabel>
                <FormControl><Input placeholder={t("ui.IncidentTypeDialog.pEjRoboLesionAlarma", "p. ej. Robo, Lesión, Alarma de incendio…")} {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--hairline)' }}>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" variant="brand" disabled={submitting} className="px-8 min-w-28">{submitting ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </Form>
    </Modal>
  );
}

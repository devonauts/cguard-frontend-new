import { useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Building2 } from "lucide-react";
import { Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

const schema = z.object({
  name: z.string().min(1, "Requerido"),
  description: z.string().optional(),
  managerId: z.string().optional().nullable(),
});

export type DepartmentDialogValues = z.infer<typeof schema>;

type ManagerOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  defaultValues?: DepartmentDialogValues | null;
  managers?: ManagerOption[];
  saving?: boolean;
  onSubmit: (values: DepartmentDialogValues) => Promise<void> | void;
};

export default function DepartmentDialog({
  open,
  onOpenChange,
  title = "Nuevo Departamento",
  defaultValues,
  managers = [],
  saving = false,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const form = useForm<DepartmentDialogValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", managerId: null },
  });

  useEffect(() => {
    if (defaultValues) form.reset(defaultValues);
    else form.reset({ name: "", description: "", managerId: null });
  }, [defaultValues, open]);

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Los departamentos organizan a tu equipo interno (Operaciones, Talento Humano, Nómina…)."
      icon={<Building2 />}
    >
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre*</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej. Operaciones" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("ui.DepartmentDialog.descripcion", "Descripción")}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t("ui.DepartmentDialog.queHaceEsteDepartamentoOpcional", "Qué hace este departamento (opcional)")}
                      rows={4}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="managerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Responsable (opcional)</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === NONE ? null : v)}
                    value={field.value ?? NONE}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sin responsable" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin responsable</SelectItem>
                      {managers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    Persona a cargo del departamento; recibirá escalamientos y aprobaciones en futuras versiones.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="brand" disabled={saving}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </Form>
    </Modal>
  );
}

import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo } from "react";

import { Modal } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  name: z
    .string("El nombre del rol es obligatorio.")
    .trim()
    .min(3, "Debe tener al menos 3 caracteres.")
    .max(80, "Máximo 80 caracteres."),
  description: z
    .string()
    .trim()
    .max(500, "Máximo 500 caracteres.")
    .optional()
    .or(z.literal("")),
  permissions: z.array(z.string()).optional(),
});

export type UserRoleDialogValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  defaultValues: UserRoleDialogValues | null;
  onSubmit: (v: UserRoleDialogValues) => Promise<void> | void;
};

export default function UserRoleDialog({
  open,
  onOpenChange,
  title,
  defaultValues,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  // Same shape as `schema`, but with the validation messages in the current language.
  const localizedSchema = useMemo(
    () =>
      z.object({
        name: z
          .string(
            t(
              "ui.UserRoleDialog.elNombreDelRolEsObligatorio",
              "El nombre del rol es obligatorio.",
            ),
          )
          .trim()
          .min(
            3,
            t(
              "ui.UserRoleDialog.debeTenerAlMenos3Caracteres",
              "Debe tener al menos 3 caracteres.",
            ),
          )
          .max(
            80,
            t("ui.UserRoleDialog.maximoNCaracteres", {
              defaultValue: "Máximo {{max}} caracteres.",
              max: 80,
            }),
          ),
        description: z
          .string()
          .trim()
          .max(
            500,
            t("ui.UserRoleDialog.maximoNCaracteres", {
              defaultValue: "Máximo {{max}} caracteres.",
              max: 500,
            }),
          )
          .optional()
          .or(z.literal("")),
        permissions: z.array(z.string()).optional(),
      }),
    [t],
  );

  useEffect(() => {
    console.debug("[UserRoleDialog] mount/open state", open);
  }, [open]);
  const form = useForm<UserRoleDialogValues>({
    resolver: zodResolver(localizedSchema),
    defaultValues: defaultValues ?? {
      name: "",
      description: "",
      permissions: [],
    },
    values: defaultValues ?? { name: "", description: "", permissions: [] },
    mode: "onBlur",
  });

  const submitting = form.formState.isSubmitting;

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    form.reset();
  });

  return (
    <Modal
      description={t("ui.UserRoleDialog.proporcioneUnNombreYOpcionalmente")}
      icon={<ShieldCheck />}
      open={open}
      title={title}
      onOpenChange={onOpenChange}
    >
      <Form {...form}>
        <form className="grid gap-4" onSubmit={submit}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t("settings.userRoles.colRole", "Rol")}{" "}
                  <span style={{ color: "var(--bad-text)" }}>*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("ui.UserRoleDialog.nombreDelRol")}
                    {...field}
                    aria-invalid={!!form.formState.errors.name}
                  />
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
                <FormLabel>
                  {t("ui.UserRoleDialog.descripcion", "Descripción")}
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={t("ui.UserRoleDialog.describeElRolOpcional")}
                    rows={5}
                    {...field}
                    aria-invalid={!!form.formState.errors.description}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div
            className="flex justify-end gap-2 border-t pt-4"
            style={{ borderColor: "var(--hairline)" }}
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button disabled={submitting} type="submit" variant="brand">
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

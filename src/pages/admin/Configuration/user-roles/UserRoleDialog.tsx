import { z } from "zod";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo } from "react";

import { Modal } from "@/components/kit";
import { useAuth } from "@/contexts/AuthContext";
import { nivelEnLaEmpresa } from "@/hooks/usePuede";
import { NIVEL } from "@/lib/reglasDeAcciones";
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
  authorityLevel: z.number().nullable().optional(),
});

export type UserRoleDialogValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  defaultValues: UserRoleDialogValues | null;
  onSubmit: (v: UserRoleDialogValues) => Promise<void> | void;
  /** Custom roles carry a level; built-in ones use the platform's. */
  mostrarNivel?: boolean;
};

export default function UserRoleDialog({
  open,
  onOpenChange,
  title,
  defaultValues,
  onSubmit,
  mostrarNivel = true,
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
        authorityLevel: z.number().nullable().optional(),
      }),
    [t],
  );
  /* THE LEVEL OF A CUSTOM ROLE (backend security/staffTierGuard): what the
     server's floors read. Only levels up to the person's own are offered. */
  const { user } = useAuth() as any;
  const miNivel = nivelEnLaEmpresa(user) ?? NIVEL.GERENCIA;
  const niveles = [
    { v: NIVEL.OFICINA, label: t("ui.nivelDeRol.oficina", "Oficina: ve y trabaja turnos, cobertura y asistencia") },
    { v: NIVEL.CENTRAL, label: t("ui.nivelDeRol.central", "Centro de operaciones: además monitoreo en vivo (cámaras, alarmas, mapa)") },
    { v: NIVEL.RRHH, label: t("ui.nivelDeRol.rrhh", "Recursos humanos: además datos del personal y pago") },
    { v: NIVEL.SUPERVISION, label: t("ui.nivelDeRol.supervision", "Supervisión: además aprueba horas") },
    { v: NIVEL.GERENCIA, label: t("ui.nivelDeRol.gerencia", "Gerencia: además reportes y acciones de dirección") },
  ].filter((n) => n.v <= miNivel);

  useEffect(() => {
    console.debug("[UserRoleDialog] mount/open state", open);
  }, [open]);
  const form = useForm<UserRoleDialogValues>({
    resolver: zodResolver(localizedSchema),
    defaultValues: defaultValues ?? {
      name: "",
      description: "",
      permissions: [],
      authorityLevel: null,
    },
    values: defaultValues ?? { name: "", description: "", permissions: [], authorityLevel: null },
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
          {mostrarNivel && (
            <FormField
              control={form.control}
              name="authorityLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("ui.nivelDeRol.titulo", "Nivel")}</FormLabel>
                  <FormControl>
                    <select
                      className="cg-input cg-focus w-full px-3 py-2 text-sm"
                      value={field.value ?? NIVEL.OFICINA}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    >
                      {niveles.map((n) => (
                        <option key={n.v} value={n.v}>
                          {n.label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t(
                      "ui.nivelDeRol.ayuda",
                      "Los permisos dicen qué pantallas usa; el nivel, qué datos sensibles alcanza. Nunca llega a administrador ni a gerente de sucursal.",
                    )}
                  </p>
                </FormItem>
              )}
            />
          )}
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

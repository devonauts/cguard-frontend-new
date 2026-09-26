import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Check, Circle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";

export type ChangePasswordValues = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type Props = {
  defaultValues?: Partial<ChangePasswordValues>;
  onSubmit?: (values: ChangePasswordValues) => Promise<void> | void;
  showOldField?: boolean;
};

export default function ChangePasswordForm({
  defaultValues,
  onSubmit,
  showOldField = true,
}: Props) {
  const { t } = useTranslation();
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Build schema conditionally so the oldPassword field can be omitted (useful for password reset flows)
  const baseSchema: any = {
    newPassword: z
      .string()
      .min(8, t("auth.validation_min8"))
      .regex(/[A-Z]/, t("auth.validation_uppercase"))
      .regex(/[a-z]/, t("auth.validation_lowercase"))
      .regex(/\d/, t("auth.validation_number")),
    confirmPassword: z.string().min(1, t("auth.validation_confirm_required")),
  };

  if (showOldField) {
    baseSchema.oldPassword = z.string().min(6, t("auth.validation_min6"));
  }

  const schema: z.ZodTypeAny = z
    .object(baseSchema)
    .refine((v: any) => v.newPassword === v.confirmPassword, {
      path: ["confirmPassword"],
      message: t("auth.validation_passwords_not_match"),
    });

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      oldPassword: defaultValues?.oldPassword ?? "",
      newPassword: defaultValues?.newPassword ?? "",
      confirmPassword: defaultValues?.confirmPassword ?? "",
    },
  });

  const submit = form.handleSubmit(async (values) => {
    await onSubmit?.(values);
    form.reset({ oldPassword: "", newPassword: "", confirmPassword: "" });
  });

  // Espejo visual de las mismas reglas del esquema de validación de arriba.
  // Los estados van en semánticos: cumplido en `--ok`, pendiente apagado. El
  // acento no se usa aquí — «correcto» no cambia con las preferencias de color.
  const nueva = form.watch("newPassword") ?? "";
  const confirma = form.watch("confirmPassword") ?? "";
  const requisitos = [
    { ok: nueva.length >= 8, texto: t("auth.validation_min8") },
    { ok: /[A-Z]/.test(nueva), texto: t("auth.validation_uppercase") },
    { ok: /[a-z]/.test(nueva), texto: t("auth.validation_lowercase") },
    { ok: /\d/.test(nueva), texto: t("auth.validation_number") },
  ];
  const coinciden = nueva.length > 0 && nueva === confirma;

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={submit}>
        {showOldField && (
          <FormField
            control={form.control}
            name="oldPassword"
            render={({ field }) => (
              <FormItem>
                <Label>{t("auth.old_password_label")}*</Label>
                <FormControl>
                  <div className="relative">
                    <Input
                      autoComplete="current-password"
                      className="h-12 pr-10"
                      type={showOldPassword ? "text" : "password"}
                      {...field}
                    />

                    <button
                      aria-label={t(
                        "ui.ChangePasswordForm.mostrarContrasena",
                        "Mostrar contraseña",
                      )}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      type="button"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                    >
                      {showOldPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <Label>{t("auth.new_password_label")}*</Label>
              <FormControl>
                <div className="relative">
                  <Input
                    autoComplete="new-password"
                    className="h-12 pr-10"
                    type={showNewPassword ? "text" : "password"}
                    {...field}
                  />

                  <button
                    aria-label={t(
                      "ui.ChangePasswordForm.mostrarContrasena",
                      "Mostrar contraseña",
                    )}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ul className="glass-sunken grid gap-2 p-4 sm:grid-cols-2">
          {requisitos.map((r) => (
            <li key={r.texto} className="flex items-center gap-2 text-xs">
              <span
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full [&_svg]:size-3"
                style={{
                  background: r.ok
                    ? "color-mix(in oklab, var(--ok) 18%, transparent)"
                    : "transparent",
                  color: r.ok ? "var(--ok-text)" : "var(--ink-faint)",
                }}
              >
                {r.ok ? <Check strokeWidth={3} /> : <Circle strokeWidth={3} />}
              </span>
              <span
                style={{ color: r.ok ? "var(--ok-text)" : "var(--ink-faint)" }}
              >
                {r.texto}
              </span>
            </li>
          ))}
        </ul>

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <Label>{t("auth.confirm_new_password_label")}*</Label>
              <FormControl>
                <div className="relative">
                  <Input
                    autoComplete="new-password"
                    className="h-12 pr-10"
                    type={showConfirmPassword ? "text" : "password"}
                    {...field}
                  />

                  <button
                    aria-label={t(
                      "ui.ChangePasswordForm.mostrarContrasena2",
                      "Mostrar contraseña",
                    )}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
              {confirma.length > 0 && (
                <p
                  className="flex items-center gap-1.5 text-xs"
                  style={{
                    color: coinciden ? "var(--ok-text)" : "var(--bad-text)",
                  }}
                >
                  {coinciden ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : null}
                  {coinciden
                    ? t(
                        "ui.ChangePasswordForm.lasContrasenasCoinciden",
                        "Las contraseñas coinciden",
                      )
                    : t("auth.validation_passwords_not_match")}
                </p>
              )}
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Button className="px-6" type="submit" variant="brand">
            {t("auth.save_changes")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

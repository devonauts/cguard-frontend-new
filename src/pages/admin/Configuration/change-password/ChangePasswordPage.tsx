import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { KeyRound, ShieldCheck } from "lucide-react";

import SettingsPageShell from "../components/SettingsPageShell";

import ChangePasswordForm, { ChangePasswordValues } from "./ChangePasswordForm";

import { Section } from "@/components/kit";
import AccountService from "@/services/accountService";
import { useAuth } from "@/contexts/AuthContext";
import { getServerErrorMessage } from "@/lib/utils";

export default function PasswordChangePage() {
  const { t } = useTranslation();
  const { signOut } = useAuth();

  const handleSubmit = async (values: ChangePasswordValues) => {
    try {
      const resp = (await AccountService.changePassword(
        values.oldPassword,
        values.newPassword,
      )) as
        | {
            message?: string;
            messageCode?: string;
            data?: { message?: string };
          }
        | undefined;

      // Backend returns either { messageCode, message } or plain data
      const message =
        (resp && (resp.message || resp.data?.message)) ||
        (resp && resp.message) ||
        t("auth.change_password_success", { defaultValue: "Password updated" });

      toast.success(message);
      // The server ends every session of the account on a password change, so
      // the next request bounced to /login with no word of why. Say it there.
      try {
        sessionStorage.setItem(
          "authExitReason",
          t("auth.passwordChangedSignInAgain", {
            defaultValue:
              "Cambiaste tu contraseña. Inicia sesión con la nueva.",
          }),
        );
      } catch {
        /* no storage: the toast above still said it */
      }
    } catch (err: any) {
      toast.error(
        getServerErrorMessage(
          err,
          t("auth.change_password_error", {
            defaultValue: "Error changing password",
          }),
        ),
      );

      return;
    }
    await signOut({ avisarAlServidor: false });
  };

  return (
    <SettingsPageShell
      icon={<KeyRound />}
      subtitle={t("auth.change_password_subtitle", {
        defaultValue: "Actualiza tu contraseña de acceso.",
      })}
      title={t("auth.change_password_title", {
        defaultValue: "Change password",
      })}
    >
      <Section
        icon={<ShieldCheck />}
        title={t("auth.new_password_label", {
          defaultValue: "Nueva contraseña",
        })}
      >
        <ChangePasswordForm onSubmit={handleSubmit} />
      </Section>
    </SettingsPageShell>
  );
}

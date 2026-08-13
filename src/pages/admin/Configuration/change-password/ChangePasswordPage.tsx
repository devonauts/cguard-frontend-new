import ChangePasswordForm, { ChangePasswordValues } from "./ChangePasswordForm";
import AccountService from "@/services/accountService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Section } from "@/components/kit";
import SettingsPageShell from "../components/SettingsPageShell";

export default function PasswordChangePage() {
  const { t } = useTranslation();

  const handleSubmit = async (values: ChangePasswordValues) => {
    try {
      const resp = (await AccountService.changePassword(values.oldPassword, values.newPassword)) as
        | { message?: string; messageCode?: string; data?: { message?: string } }
        | undefined;

      // Backend returns either { messageCode, message } or plain data
      const message = (resp && (resp.message || resp.data?.message)) || (resp && resp.message) || t('auth.change_password_success', { defaultValue: 'Password updated' });
      toast.success(message);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || t('auth.change_password_error', { defaultValue: 'Error changing password' });
      toast.error(msg);
    }
  };

  return (
    <SettingsPageShell
      icon={<KeyRound />}
      title={t('auth.change_password_title', { defaultValue: 'Change password' })}
      subtitle={t('auth.change_password_subtitle', { defaultValue: 'Actualiza tu contraseña de acceso.' })}
    >
      <Section icon={<ShieldCheck />} title={t('auth.new_password_label', { defaultValue: 'Nueva contraseña' })}>
        <ChangePasswordForm onSubmit={handleSubmit} />
      </Section>
    </SettingsPageShell>
  );
}

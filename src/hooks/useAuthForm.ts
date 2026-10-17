import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { isStrongPassword, passwordPolicyMessage } from "@/lib/passwordPolicy";
interface UseAuthFormReturn {
  email: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  isLoading: boolean;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  setConfirmPassword: (password: string) => void;
  toggleShowPassword: () => void;
  setIsLoading: (loading: boolean) => void;
  resetForm: () => void;
  validateEmail: () => boolean;
  validateLoginId: () => boolean;
  validatePassword: (minLength?: number) => boolean;
  validateStrongPassword: () => boolean;
  validatePasswordMatch: () => boolean;
}

export const useAuthForm = (): UseAuthFormReturn => {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const toggleShowPassword = () => setShowPassword(!showPassword);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setIsLoading(false);
  };

  const validateEmail = (): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
      toast.error(
        t("auth.enter_email", { defaultValue: "Please enter your email" }),
      );

      return false;
    }
    if (!emailRegex.test(email)) {
      toast.error(
        t("auth.invalid_email", { defaultValue: "Invalid email address" }),
      );

      return false;
    }

    return true;
  };

  /**
   * El campo de acceso del login: correo O usuario para entrar (`jmiranda`).
   * Sólo se exige que no esté vacío. Validar formato de correo aquí dejaba
   * fuera a quien no tiene correo; el servidor distingue por la `@`.
   */
  const validateLoginId = (): boolean => {
    if (!email.trim()) {
      toast.error(
        t("auth.enterLoginId", {
          defaultValue: "Escribe tu correo o tu usuario",
        }),
      );

      return false;
    }

    return true;
  };

  const validatePassword = (minLength = 6): boolean => {
    if (!password) {
      toast.error(
        t("auth.enter_password", {
          defaultValue: "Please enter your password",
        }),
      );

      return false;
    }
    if (password.length < minLength) {
      toast.error(
        t("auth.password_min_length", {
          defaultValue: `La contraseña debe tener al menos ${minLength} caracteres`,
        }),
      );

      return false;
    }

    return true;
  };

  const validateStrongPassword = (): boolean => {
    if (!password) {
      toast.error(
        t("auth.enter_password", {
          defaultValue: "Please enter your password",
        }),
      );

      return false;
    }
    if (!isStrongPassword(password)) {
      const msg = passwordPolicyMessage();

      toast.error(msg);

      return false;
    }

    return true;
  };

  const validatePasswordMatch = (): boolean => {
    if (password !== confirmPassword) {
      toast.error(
        t("auth.passwords_mismatch", {
          defaultValue: "Passwords do not match",
        }),
      );

      return false;
    }

    return true;
  };

  return {
    email,
    password,
    confirmPassword,
    showPassword,
    isLoading,
    setEmail,
    setPassword,
    setConfirmPassword,
    toggleShowPassword,
    setIsLoading,
    resetForm,
    validateEmail,
    validateLoginId,
    validatePassword,
    validateStrongPassword,
    validatePasswordMatch,
  };
};

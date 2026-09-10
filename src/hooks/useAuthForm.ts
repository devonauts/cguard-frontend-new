import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { isStrongPassword, PASSWORD_POLICY_TEXT } from "@/lib/passwordPolicy";
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
          defaultValue: `Password must be at least ${minLength} characters`,
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
      const msg = t("auth.weakPassword", {
        defaultValue: `La contraseña es muy débil. Requisitos: ${PASSWORD_POLICY_TEXT}`,
      });

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
    validatePassword,
    validateStrongPassword,
    validatePasswordMatch,
  };
};

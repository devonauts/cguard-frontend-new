import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useSearchParams, useNavigate } from "react-router-dom";
import { Eye, EyeOff, CheckCircle2, Smartphone, Clock } from "lucide-react";
import { toast } from "sonner";

import GuardInviteLayout from "./GuardInviteLayout";

import { Input } from "@/components/ui/input";
import { ApiService } from "@/services/api/apiService";
import securityGuardService from "@/lib/api/securityGuardService";
import userService from "@/lib/api/userService";
import { AuthService } from "@/services/auth/authService";
import { PhoneInput } from "@/components/phone/PhoneInput";
import { InfoNote } from "@/components/kit";

/**
 * Mirror the BACKEND password policy (securityGuardCreate.isStrongPassword):
 * ≥8 chars + uppercase + lowercase + number + special char. Keeping this in sync
 * is what stops a password the form accepts but the server rejects (which used to
 * surface as a misleading "Extraviado"/404). Returns an error message or undefined.
 */
function passwordPolicyError(pw: string): string | undefined {
  if (!pw || pw.length < 8)
    return "La contraseña debe tener al menos 8 caracteres";
  if (!/[A-Z]/.test(pw)) return "Debe contener al menos una letra mayúscula";
  if (!/[a-z]/.test(pw)) return "Debe contener al menos una letra minúscula";
  if (!/[0-9]/.test(pw)) return "Debe contener al menos un número";
  if (!/[^A-Za-z0-9]/.test(pw))
    return "Debe contener al menos un carácter especial (p. ej. ! @ # $ %)";

  return undefined;
}

export default function GuardRegistration() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const rawInviteToken =
    searchParams.get("token") ||
    searchParams.get("invitationToken") ||
    searchParams.get("invite") ||
    undefined;
  const inviteToken =
    rawInviteToken &&
    rawInviteToken !== "null" &&
    rawInviteToken !== "undefined"
      ? rawInviteToken
      : undefined;
  const securityGuardId = searchParams.get("securityGuardId") || undefined;
  const inviteType = searchParams.get("inviteType") || undefined;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [lockedFirstName, setLockedFirstName] = useState(false);
  const [lockedLastName, setLockedLastName] = useState(false);
  const [governmentId, setGovernmentId] = useState("");
  const [hiringContractDate, setHiringContractDate] = useState("");
  const [gender, setGender] = useState("");
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [bloodType, setBloodType] = useState("");
  const [guardCredentials, setGuardCredentials] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [academicInstruction, setAcademicInstruction] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [lockedEmail, setLockedEmail] = useState(false);
  const [lockedPhone, setLockedPhone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fetched, setFetched] = useState<any>(null);
  const [inviteNotFound, setInviteNotFound] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState(1);
  const totalSteps = 3;
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const shownToastRef = useRef<string | null>(null);

  /* El filo de error con el token, para que el borde y el mensaje sean el MISMO
     rojo del sistema (y no dos rojos parecidos que no casan en oscuro). */
  const errorStyle = (field: string): React.CSSProperties | undefined =>
    errors[field]
      ? {
          borderColor: "var(--bad)",
          boxShadow:
            "0 0 0 3px color-mix(in oklab, var(--bad) 22%, transparent)",
        }
      : undefined;

  const formControl =
    "cg-input h-11 w-full px-3.5 text-sm transition-colors motion-reduce:transition-none disabled:opacity-60 disabled:cursor-not-allowed";
  const labelClass =
    "mb-1.5 block min-h-[32px] text-[11px] font-semibold uppercase leading-snug tracking-wide text-muted-foreground";
  // Native textarea/select share the input look but manage their own height.
  const textareaControl =
    "w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm min-h-[84px] resize-none text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/25 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

  const validateEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

  useEffect(() => {
    const fetchInvite = async () => {
      if (import.meta.env.DEV)
        console.log("[registration] params ->", {
          inviteToken,
          securityGuardId,
          inviteType,
        });

      // Si hay un token de invitación, limpiar cualquier sesión activa para evitar conflictos
      if (inviteToken) {
        try {
          localStorage.removeItem("authToken");
          localStorage.removeItem("user");
          console.log(
            "[registration] cleared any active session for invitation flow",
          );
        } catch (e) {
          console.warn("[registration] could not clear session:", e);
        }
      }

      if (!inviteToken && !securityGuardId) return;
      if (inviteType === "client" && inviteToken) {
        navigate(
          `/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`,
        );

        return;
      }
      // Supervisor invites belong on the supervisor app screen, never guard flow.
      if (inviteType === "supervisor" && inviteToken) {
        navigate(
          `/supervisor/registration?token=${encodeURIComponent(inviteToken)}&inviteType=supervisor`,
        );

        return;
      }
      setIsLoading(true);
      try {
        const endpointBase = `/security-guard/public`;
        const qp = new URLSearchParams();

        if (inviteToken) qp.append("token", inviteToken);
        if (securityGuardId) qp.append("securityGuardId", securityGuardId);
        const urlWithQs = qp.toString()
          ? `${endpointBase}?${qp.toString()}`
          : endpointBase;
        const res = await ApiService.get(urlWithQs);
        const data = res?.data || res;

        if (import.meta.env.DEV)
          console.log("[registration] invite response ->", data);
        if (!data) {
          setInviteNotFound(true);

          return;
        }

        setFetched(data);
        // Invitation users should start at step 1 and complete the full form
        // Only set step if not already set by user navigation
        // Default to step 1 for new invitation flows

        // nombres / email
        const rootFirst =
          data.firstName ||
          data.guard?.firstName ||
          (data.fullName ? String(data.fullName).split(" ")[0] : undefined);
        const rootLast =
          data.lastName ||
          data.guard?.lastName ||
          (data.fullName
            ? String(data.fullName).split(" ").slice(1).join(" ")
            : undefined);
        const emailCandidate = data.email || data.guard?.email || undefined;
        const phoneCandidate =
          data.guard?.phoneNumber ||
          data.phoneNumber ||
          data.phone ||
          data.mobile ||
          undefined;

        // Log which fields we will prefill
        if (import.meta.env.DEV)
          console.log("[registration] prefill candidates ->", {
            rootFirst,
            rootLast,
            emailCandidate,
            phoneCandidate,
          });
        if (rootFirst) {
          setFirstName(rootFirst);
          setLockedFirstName(true);
        }
        if (rootLast) {
          setLastName(rootLast);
          setLockedLastName(true);
        }
        if (emailCandidate) {
          setEmail(emailCandidate);
          setLockedEmail(true);
        }
        if (phoneCandidate) {
          setPhone(phoneCandidate);
          setLockedPhone(true);
        }

        // Per request: leave all other fields empty (do not prefill)
        // Only `firstName`, `lastName` and `email` are prefilled and locked when present.
      } catch (err: any) {
        // If this token belongs to a client invitation instead of a guard invitation,
        // redirect to the client registration page.
        if (inviteToken && !securityGuardId) {
          try {
            const clientResponse = await ApiService.get(
              `/user/public?token=${encodeURIComponent(inviteToken)}`,
              { skipAuth: true },
            );
            const clientData = clientResponse?.data || clientResponse;

            if (clientData) {
              // Check roles to determine if it should go to client registration
              const roles = clientData.roles || [];

              if (!roles.includes("securityGuard")) {
                // This is a supervisor, customer, or other staff role
                navigate(
                  `/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`,
                );

                return;
              }
              // If it has securityGuard role but guard endpoint failed, something is wrong
              console.error(
                "[registration] User has securityGuard role but guard endpoint failed",
              );
            }
          } catch (_clientErr) {
            // Both guard and client endpoints failed - likely expired token
            console.error("[registration] Both endpoints failed:", {
              err,
              _clientErr,
            });

            // Check if it's an expired token error
            const isExpiredToken =
              err?.data?.message?.toLowerCase().includes("expirado") ||
              err?.data?.message?.toLowerCase().includes("expired") ||
              err?.message?.toLowerCase().includes("expirado") ||
              err?.message?.toLowerCase().includes("expired") ||
              (_clientErr as any)?.data?.message
                ?.toLowerCase()
                .includes("expirado") ||
              (_clientErr as any)?.data?.message
                ?.toLowerCase()
                .includes("expired");

            if (isExpiredToken) {
              setIsLoading(false);

              return;
            }
          }
        }

        const msgCandidates = [
          typeof err?.message === "string" ? err.message : undefined,
          err?.data?.message,
          err?.data?.error,
          err?.message && String(err.message),
        ].filter(Boolean) as string[];
        let rawMsg = msgCandidates.join(" ") || "";

        // Normalize repeated sentences: keep first occurrence of consecutive duplicates
        const parts = rawMsg.split(/([.?!])\s*/).filter(Boolean);
        const sentences: string[] = [];

        for (let i = 0; i < parts.length; i += 2) {
          const sentence = (parts[i] || "").trim();
          const punct = parts[i + 1] || ".";
          const full = (sentence + punct).trim();

          if (!full) continue;
          if (
            sentences.length === 0 ||
            sentences[sentences.length - 1] !== full
          )
            sentences.push(full);
        }
        let msg = sentences.join(" ");

        // Truncate if too long
        const MAX = 140;

        if (msg.length > MAX) msg = msg.slice(0, MAX - 3).trim() + "...";

        // If message indicates already-created user WITHOUT an active invitation,
        // redirect to login. But if they're completing an invitation (have inviteToken),
        // this is expected - don't redirect.
        const lower = msg.toLowerCase();

        if (
          (lower.includes("ya fue creado") ||
            lower.includes("ya fue creado y no puede")) &&
          !inviteToken
        ) {
          if (shownToastRef.current !== msg) {
            shownToastRef.current = msg;
            toast.error(
              msg ||
                "La cuenta ya fue creada — serás redirigido al inicio de sesión.",
            );
            // clear ref after short delay to allow future toasts
            setTimeout(() => (shownToastRef.current = null), 3000);
          }
          navigate("/login");

          return;
        }

        setInviteNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvite();
  }, [inviteToken, securityGuardId]);

  const validateStep = (s: number) => {
    const collect = (stepNum: number): Record<string, string> => {
      const nextErrors: Record<string, string> = {};

      if (stepNum === 1) {
        if (!firstName?.trim())
          nextErrors.firstName = t(
            "invite.val.name_required",
            "El nombre es obligatorio",
          );
        if (!lastName?.trim())
          nextErrors.lastName = t(
            "invite.val.lastname_required",
            "El apellido es obligatorio",
          );
        if (!email?.trim())
          nextErrors.email = t(
            "invite.val.email_required",
            "El correo electrónico es obligatorio",
          );
        else if (!validateEmail(email))
          nextErrors.email = t(
            "invite.val.email_invalid",
            "Correo electrónico inválido",
          );
      }
      if (stepNum === 2) {
        if (!governmentId?.trim()) nextErrors.governmentId = " ";
        if (!birthDate) nextErrors.birthDate = " ";
        if (!birthPlace?.trim())
          nextErrors.birthPlace = t(
            "invite.val.birthplace_required",
            "El lugar de nacimiento es obligatorio",
          );
        if (!gender)
          nextErrors.gender = t(
            "invite.val.gender_required",
            "El género es obligatorio",
          );
        if (!maritalStatus)
          nextErrors.maritalStatus = t(
            "invite.val.marital_required",
            "El estado civil es obligatorio",
          );
        if (!academicInstruction)
          nextErrors.academicInstruction = t(
            "invite.val.education_required",
            "La formación académica es obligatoria",
          );
      }
      if (stepNum === 3) {
        if (!hiringContractDate)
          nextErrors.hiringContractDate = t(
            "invite.val.hire_required",
            "La fecha de contratación es obligatoria",
          );
        if (!bloodType)
          nextErrors.bloodType = t(
            "invite.val.blood_required",
            "El grupo sanguíneo es obligatorio",
          );
        if (!guardCredentials?.trim())
          nextErrors.guardCredentials = t(
            "invite.val.credentials_required",
            "Las credenciales son obligatorias",
          );
        if (!address?.trim())
          nextErrors.address = t(
            "invite.val.address_required",
            "La dirección es obligatoria",
          );
        if (!phone?.trim())
          nextErrors.phone = t(
            "invite.val.phone_required",
            "El teléfono es obligatorio",
          );
        if (!password)
          nextErrors.password = t(
            "invite.val.password_required",
            "La contraseña es obligatoria",
          );
        else {
          const pe = passwordPolicyError(password);

          if (pe) nextErrors.password = pe;
        }
        if (!confirm)
          nextErrors.confirm = t(
            "invite.val.confirm_required",
            "Confirme la contraseña",
          );
        if (password && confirm && password !== confirm)
          nextErrors.confirm = t(
            "invite.val.mismatch",
            "Las contraseñas no coinciden",
          );
      }

      return nextErrors;
    };

    const nextErrors = collect(s);

    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const handleNext = () => {
    if (!validateStep(step)) return;
    setStep((s: number) => Math.min(totalSteps, s + 1));
  };

  const handlePrev = () => {
    setStep((s: number) => Math.max(1, s - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validate all steps and show combined errors
    const collect = (stepNum: number): Record<string, string> => {
      const nextErrors: Record<string, string> = {};

      if (stepNum === 1) {
        if (!firstName?.trim())
          nextErrors.firstName = t(
            "invite.val.name_required",
            "El nombre es obligatorio",
          );
        if (!lastName?.trim())
          nextErrors.lastName = t(
            "invite.val.lastname_required",
            "El apellido es obligatorio",
          );
        if (!email?.trim())
          nextErrors.email = t(
            "invite.val.email_required",
            "El correo electrónico es obligatorio",
          );
        else if (!validateEmail(email))
          nextErrors.email = t(
            "invite.val.email_invalid",
            "Correo electrónico inválido",
          );
      }
      if (stepNum === 2) {
        if (!governmentId?.trim())
          nextErrors.governmentId = "El documento de identidad es obligatorio";
        if (!birthDate)
          nextErrors.birthDate = "La fecha de nacimiento es obligatoria";
        if (!birthPlace?.trim())
          nextErrors.birthPlace = t(
            "invite.val.birthplace_required",
            "El lugar de nacimiento es obligatorio",
          );
        if (!gender)
          nextErrors.gender = t(
            "invite.val.gender_required",
            "El género es obligatorio",
          );
        if (!maritalStatus)
          nextErrors.maritalStatus = t(
            "invite.val.marital_required",
            "El estado civil es obligatorio",
          );
        if (!academicInstruction)
          nextErrors.academicInstruction = t(
            "invite.val.education_required",
            "La formación académica es obligatoria",
          );
      }
      if (stepNum === 3) {
        if (!hiringContractDate)
          nextErrors.hiringContractDate = t(
            "invite.val.hire_required",
            "La fecha de contratación es obligatoria",
          );
        if (!bloodType)
          nextErrors.bloodType = t(
            "invite.val.blood_required",
            "El grupo sanguíneo es obligatorio",
          );
        if (!guardCredentials?.trim())
          nextErrors.guardCredentials = t(
            "invite.val.credentials_required",
            "Las credenciales son obligatorias",
          );
        if (!address?.trim())
          nextErrors.address = t(
            "invite.val.address_required",
            "La dirección es obligatoria",
          );
        if (!phone?.trim())
          nextErrors.phone = t(
            "invite.val.phone_required",
            "El teléfono es obligatorio",
          );
        if (!password)
          nextErrors.password = t(
            "invite.val.password_required",
            "La contraseña es obligatoria",
          );
        else {
          const pe = passwordPolicyError(password);

          if (pe) nextErrors.password = pe;
        }
        if (!confirm)
          nextErrors.confirm = t(
            "invite.val.confirm_required",
            "Confirme la contraseña",
          );
        if (password && confirm && password !== confirm)
          nextErrors.confirm = t(
            "invite.val.mismatch",
            "Las contraseñas no coinciden",
          );
      }

      return nextErrors;
    };

    const errors1 = collect(1);
    const errors2 = collect(2);
    const errors3 = collect(3);
    const merged = { ...errors1, ...errors2, ...errors3 };

    setErrors(merged);
    if (Object.keys(merged).length) return;

    setIsLoading(true);
    try {
      // If we fetched an invite object, merge it with only the changed fields
      let payload: any;

      if (fetched) {
        payload = { ...fetched };
        // Map form fields onto fetched structure, overriding where appropriate
        payload.firstName = firstName || payload.firstName;
        payload.lastName = lastName || payload.lastName;
        payload.email = email || payload.email;
        payload.governmentId = governmentId || payload.governmentId;
        payload.birthDate = birthDate || payload.birthDate;
        payload.birthPlace = birthPlace || payload.birthPlace;
        payload.gender = gender || payload.gender;
        payload.maritalStatus = maritalStatus || payload.maritalStatus;
        payload.academicInstruction =
          academicInstruction || payload.academicInstruction;
        payload.hiringContractDate =
          hiringContractDate || payload.hiringContractDate;
        payload.bloodType = bloodType || payload.bloodType;
        payload.guardCredentials = guardCredentials || payload.guardCredentials;
        payload.address = address || payload.address;
        payload.phoneNumber =
          phone ||
          payload.phoneNumber ||
          payload.guard?.phoneNumber ||
          payload.phoneNumber;

        // Ensure nested guard object contains first/last/email/phone
        payload.guard = { ...(payload.guard || {}) };
        payload.guard.firstName =
          firstName || payload.guard.firstName || payload.firstName;
        payload.guard.lastName =
          lastName || payload.guard.lastName || payload.lastName;
        payload.guard.email =
          email ?? payload.guard.email ?? payload.email ?? null;
        payload.guard.phoneNumber =
          phone || payload.guard.phoneNumber || payload.phoneNumber || null;
        // Include password if user provided one so backend can set it on create
        if (password) payload.password = password;
      } else {
        payload = {
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          email: email || undefined,
          governmentId: governmentId || undefined,
          birthDate: birthDate || undefined,
          birthPlace: birthPlace || undefined,
          gender: gender || undefined,
          maritalStatus: maritalStatus || undefined,
          academicInstruction: academicInstruction || undefined,
          hiringContractDate: hiringContractDate || undefined,
          bloodType: bloodType || undefined,
          guardCredentials: guardCredentials || undefined,
          address: address || undefined,
          phoneNumber: phone || undefined,
          password: password || undefined,
        };
      }

      if (inviteToken) payload.token = inviteToken;
      if (securityGuardId) payload.securityGuardId = securityGuardId;

      // Note: payload contains the plaintext password — never log it.

      // Persist tenantId from fetched invite if missing so tenant-scoped endpoint can be used
      try {
        const existingTenant = localStorage.getItem("tenantId");

        if (
          !existingTenant &&
          fetched &&
          (fetched.tenantId || fetched.tenant)
        ) {
          const tenantToSave = fetched.tenantId || (fetched.tenant as any);

          localStorage.setItem("tenantId", String(tenantToSave));
          console.debug("[registration] persisted tenantId ->", tenantToSave);
        }
      } catch (e) {
        console.warn("[registration] could not persist tenantId", e);
      }

      // If email+password provided, create the user in the users table first
      let createdUser: any = null;
      const isInviteFlow = Boolean(
        inviteToken ||
          (fetched &&
            (fetched.invitationToken ||
              fetched.tenantUserStatus === "invited")),
      );

      if (email && password && !isInviteFlow) {
        try {
          const userPayload: any = {
            emails: [email],
            password,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            phoneNumber: phone || undefined,
          };

          // Use AuthService.signUp to ensure password and verification fields are stored
          try {
            const signUpPayload: any = {
              email,
              password,
              // Provide explicit name parts and phone so backend can persist them
              name: `${firstName || ""} ${lastName || ""}`.trim() || undefined,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              phoneNumber: phone || undefined,
              tenantId:
                fetched?.tenantId || (fetched?.tenant as any) || undefined,
            };
            const signUpResp = await AuthService.signUp(signUpPayload as any);
            // signUpResp may be token string or object containing token
            let token: string | null = null;

            if (typeof signUpResp === "string") token = signUpResp;
            else if (
              signUpResp &&
              typeof signUpResp === "object" &&
              "token" in signUpResp
            )
              token = (signUpResp as any).token;

            if (token) {
              // Temporarily set token to fetch profile and obtain user id
              try {
                localStorage.setItem("authToken", token);
                const profile = await AuthService.getProfile();

                createdUser = profile?.data || profile || null;
              } finally {
                // Remove token to avoid leaving user signed in
                try {
                  localStorage.removeItem("authToken");
                } catch (e) {}
              }
            }

            // Fallback: if we couldn't get profile but signUpResp contains user data
            if (!createdUser && signUpResp && typeof signUpResp === "object") {
              createdUser =
                (signUpResp as any).user || (signUpResp as any).data || null;
            }

            if (createdUser && createdUser.id) {
              // Link guard to user by id using the `guard` field expected by backend
              payload.guard = createdUser.id;
              // Ensure credentials are persisted on the user record: set password and mark email verified
              try {
                const uid =
                  createdUser.id ||
                  createdUser._id ||
                  (createdUser.user &&
                    (createdUser.user.id || createdUser.user._id));

                if (uid) {
                  // Update the user with password and mark email as verified to avoid login issues
                  await userService.patchUser(String(uid), {
                    password: password || undefined,
                    emailVerified: true,
                  } as any);
                }
              } catch (e) {
                console.warn(
                  "[registration] could not update user credentials",
                  e,
                );
              }
            }
          } catch (innerErr) {
            // If signup failed, fall back to userService.createUser
            const userResp = await userService.createUser(userPayload);

            createdUser = userResp?.data || userResp || null;
            if (createdUser && createdUser.id) payload.guard = createdUser.id;
          }
        } catch (uErr: any) {
          // Map user creation errors to form if possible
          try {
            const { applyValidationErrorsToForm } = await import(
              "@/lib/utils/formErrorMapper"
            );
            const result = applyValidationErrorsToForm(uErr);

            if (result && result.fieldErrors)
              setErrors((p) => ({ ...p, ...result.fieldErrors }));
            if (result && result.messages && result.messages.length)
              result.messages.forEach((m) => toast.error(m));
            else toast.error(uErr?.message || "Error al crear usuario");
          } catch (e) {
            toast.error(uErr?.message || "Error al crear usuario");
          }
          setIsLoading(false);

          return;
        }
      }

      // Ensure we never send password inside the security-guard payload when
      // we created the user separately. If it's an invitation flow, keep
      // `password` so the backend can set the password for the invited user
      // and accept the invitation in one request.
      if (!isInviteFlow) {
        if (payload && payload.password) delete payload.password;
      }

      // Use tenant-scoped endpoint: POST /api/tenant/:tenantId/security-guard
      // If this is an invitation flow, send the request without frontend auth
      // so the backend can impersonate the invited tenantUser via the invitation token.
      // For invite completions, mark email as verified on the payload and
      // remove any email verification token fields so the backend doesn't
      // try to generate or rely on extra verification emails.
      if (isInviteFlow) {
        try {
          if (payload && typeof payload === "object") {
            payload.emailVerified = true;
            if ("emailVerificationToken" in payload)
              delete payload.emailVerificationToken;
            if ("emailVerificationTokenExpiresAt" in payload)
              delete payload.emailVerificationTokenExpiresAt;

            // If the backend expects the nested `guard` object to contain
            // the password and verification flags when completing an
            // invitation, ensure we set them there as well. Some endpoints
            // ignore top-level `password` and require `guard.password`.
            if (payload.guard && typeof payload.guard === "object") {
              payload.guard.emailVerified = true;
              if ("emailVerificationToken" in payload.guard)
                delete payload.guard.emailVerificationToken;
              if ("emailVerificationTokenExpiresAt" in payload.guard)
                delete payload.guard.emailVerificationTokenExpiresAt;
              if (password) payload.guard.password = password;
            } else {
              // If `guard` is not an object (e.g. id) or missing, create a
              // minimal object so the backend receives the password and
              // verified flag in the expected place.
              payload.guard = { ...(payload.guard || {}) } as any;
              if (password) payload.guard.password = password;
              payload.guard.emailVerified = true;
            }
          }
        } catch (e) {
          console.warn(
            "[registration] could not normalize payload for invite completion",
            e,
          );
        }
        try {
          const tenantId = localStorage.getItem("tenantId");
          let createResp: any = null;

          // Debug: log a redacted payload (never the raw object with the password).
          if (import.meta.env.DEV) {
            try {
              console.debug(
                "[registration] about to send invite payload (redacted):",
                {
                  ...payload,
                  guard: {
                    ...payload.guard,
                    password: payload.guard?.password
                      ? "<REDACTED>"
                      : undefined,
                  },
                },
              );
            } catch (e) {
              console.warn("[registration] could not log invite payload", e);
            }
          }

          // For invitation flows use the public endpoint that does not require auth
          // This avoids 403 Forbidden when completing an invitation before having credentials.
          try {
            createResp = await ApiService.patch(
              `/security-guard/public`,
              payload,
              { skipAuth: true },
            );
          } catch (e: any) {
            // Do NOT mask real validation/auth errors (e.g. weak password = 400)
            // by retrying the tenant-scoped endpoint — that retry 404s and the
            // guard saw a misleading "Extraviado". Only fall back when the public
            // route itself looks unavailable (network error, or 404/405 routing).
            const st = e?.status;

            if (st && st !== 404 && st !== 405) throw e;
            const tenantIdFallback = localStorage.getItem("tenantId");

            if (tenantIdFallback) {
              createResp = await ApiService.post(
                `/tenant/${tenantIdFallback}/security-guard`,
                payload,
                { skipAuth: true },
              );
            } else {
              // As last resort use service wrapper (will throw helpful error)
              createResp = await securityGuardService.create(payload);
            }
          }

          // We must not attempt to call tenant-scoped user update endpoints
          // from the frontend in an unauthenticated invite flow because the
          // request will be rejected (403). The backend should persist the
          // provided `guard.password` / `emailVerified` during invite
          // completion. Log a helpful message for debugging.
          if (password) {
            console.debug(
              "[registration] invite flow: sent password to backend; skipping client-side user update to avoid 403",
            );
          }
        } catch (e) {
          // rethrow to be handled below
          throw e;
        }
      } else {
        await securityGuardService.create(payload);
      }

      // Registration done. A guard is NOT a web-admin user — do NOT send them to
      // /login (they'd be blocked). Show a finish screen telling them to wait for
      // the company's instructions.
      toast.success(
        t("guard.registration_success", {
          defaultValue: "¡Registro completado!",
        }),
      );
      setDone(true);
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {}
    } catch (err: any) {
      // Improved error reporting: surface server status and returned payload when available
      try {
        // If ApiService threw an ApiError with structured data, prefer that
        const { applyValidationErrorsToForm } = await import(
          "@/lib/utils/formErrorMapper"
        );
        const result = applyValidationErrorsToForm(err);

        if (result && result.fieldErrors)
          setErrors((p) => ({ ...p, ...result.fieldErrors }));
        if (result && result.messages && result.messages.length) {
          result.messages.forEach((m) => toast.error(m));
        } else {
          // If it's an ApiError with status/data, log and show backend message when available
          if (err && err.status) {
            console.error(
              "API Error status:",
              err.status,
              "data:",
              err.data || null,
              "message:",
              err.message,
            );
            const backendMsg = err.data && (err.data.message || err.data.error);

            if (backendMsg) {
              toast.error(String(backendMsg));
            } else {
              toast.error(err.message || "Error al registrar");
            }
          } else {
            const msg = err?.message || "Error al registrar";

            toast.error(msg);
          }
        }
      } catch (e) {
        const msg = err?.message || "Error al registrar";

        toast.error(msg);
      }
      // Always emit the full error object to the console to aid debugging
      console.error("Registration error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <GuardInviteLayout
      subtitle={
        done
          ? "Tu solicitud fue enviada a tu empresa de seguridad."
          : t("guard.registration_subtitle", {
              defaultValue: "Completa tus datos para activar tu cuenta.",
            })
      }
      tenantLogoUrl={fetched?.tenantLogoUrl}
      tenantName={fetched?.tenantName || fetched?.tenant?.name}
      title={
        done
          ? "¡Registro completado!"
          : t("guard.registration_title", {
              defaultValue: "Registro de vigilante",
            })
      }
    >
      {done ? (
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/12">
            <CheckCircle2 className="h-9 w-9 text-primary" />
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Gracias{firstName ? `, ${firstName}` : ""}. Tu información fue
            enviada a{" "}
            <strong className="text-foreground">
              {fetched?.tenantName || fetched?.tenant?.name || "tu empresa"}
            </strong>
            . El equipo revisará tu registro y se pondrá en contacto contigo con
            las instrucciones para empezar.
          </p>
          <div className="mt-6 space-y-3 text-left">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t(
                    "ui.registration.esperaLaConfirmacion",
                    "Espera la confirmación",
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "ui.registration.tuEmpresaActivaraTuCuenta",
                    "Tu empresa activará tu cuenta y te asignará a un puesto.",
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3.5">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t("ui.registration.descargaLaAppDeVigilante")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "ui.registration.googlePlayAppStoreInicia",
                    "Google Play · App Store. Inicia sesión cuando tu cuenta esté activa.",
                  )}
                </p>
              </div>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            {t("ui.registration.yaPuedesCerrarEstaVentana")}
          </p>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={handleSubmit}>
          {inviteNotFound && (
            <InfoNote tone="warn">
              {t("guard.invite_not_found", {
                defaultValue:
                  "Invitation not found or invalid — you can complete the form manually.",
              })}
            </InfoNote>
          )}

          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("invite.step_of", "Paso {{step}} de {{total}}", {
                  step,
                  total: totalSteps,
                })}
              </span>
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                      s < step
                        ? "bg-primary text-white"
                        : s === step
                          ? "bg-primary text-white ring-4 ring-primary/20"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s < step ? "✓" : s}
                  </div>
                ))}
              </div>
            </div>
            {/* progress bar */}
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${(step / totalSteps) * 100}%` }}
              />
            </div>
          </div>

          {step === 1 && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  {t("comun.nombre")}
                  <span aria-hidden style={{ color: "var(--brand-text)" }}>
                    *
                  </span>
                </label>
                <Input
                  className={formControl}
                  disabled={isLoading || lockedFirstName}
                  placeholder={t("comun.nombre")}
                  style={errorStyle("firstName")}
                  value={firstName}
                  onChange={(e: any) => {
                    setFirstName(e.target.value);
                    setErrors((p) => ({ ...p, firstName: undefined }));
                  }}
                />
                {errors.firstName && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {errors.firstName}
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>
                  {t("invite.guard.lastname", "Apellido")}
                  <span aria-hidden style={{ color: "var(--brand-text)" }}>
                    *
                  </span>
                </label>
                <Input
                  className={formControl}
                  disabled={isLoading || lockedLastName}
                  placeholder={t("invite.guard.lastname", "Apellido")}
                  style={errorStyle("lastName")}
                  value={lastName}
                  onChange={(e: any) => {
                    setLastName(e.target.value);
                    setErrors((p) => ({ ...p, lastName: undefined }));
                  }}
                />
                {errors.lastName && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {errors.lastName}
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>
                  {t("ui.registration.correoElectronico", "Correo electrónico")}
                  <span aria-hidden style={{ color: "var(--brand-text)" }}>
                    *
                  </span>
                </label>
                <Input
                  className={formControl}
                  disabled={isLoading || lockedEmail}
                  placeholder={t(
                    "ui.registration.correoElectronico2",
                    "Correo electrónico*",
                  )}
                  style={errorStyle("email")}
                  type="email"
                  value={email}
                  onChange={(e: any) => {
                    setEmail(e.target.value);
                    setErrors((p) => ({ ...p, email: undefined }));
                  }}
                />
                {errors.email && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {errors.email}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  {t("invite.guard.gov_id", "Documento de identidad")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <Input
                  className={formControl}
                  disabled={isLoading}
                  placeholder={t(
                    "invite.guard.gov_id",
                    "Documento de identidad",
                  )}
                  style={errorStyle("governmentId")}
                  value={governmentId}
                  onChange={(e: any) => {
                    setGovernmentId(e.target.value);
                    setErrors((p) => ({ ...p, governmentId: undefined }));
                  }}
                />
                {errors.governmentId && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {errors.governmentId}
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>
                  {t("comun.fechaDeNacimiento")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <Input
                  className={formControl}
                  disabled={isLoading}
                  style={errorStyle("birthDate")}
                  type="date"
                  value={birthDate}
                  onChange={(e: any) => {
                    setBirthDate(e.target.value);
                    setErrors((p) => ({ ...p, birthDate: undefined }));
                  }}
                />
                {errors.birthDate && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {errors.birthDate}
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>
                  {t("invite.guard.birthplace", "Lugar de nacimiento")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <Input
                  className={formControl}
                  disabled={isLoading}
                  placeholder={t(
                    "invite.guard.birthplace",
                    "Lugar de nacimiento",
                  )}
                  style={errorStyle("birthPlace")}
                  value={birthPlace}
                  onChange={(e: any) => setBirthPlace(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t("ui.registration.genero", "Género")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <select
                  className={formControl}
                  disabled={isLoading}
                  style={errorStyle("gender")}
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="">{t("invite.select", "Seleccione")}</option>
                  <option value="Masculino">
                    {t("invite.guard.male", "Masculino")}
                  </option>
                  <option value="Femenino">
                    {t("invite.guard.female", "Femenino")}
                  </option>
                  <option value="Otro">
                    {t("invite.guard.other", "Otro")}
                  </option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  {t("comun.estadoCivil")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <select
                  className={formControl}
                  disabled={isLoading}
                  style={errorStyle("maritalStatus")}
                  value={maritalStatus}
                  onChange={(e) => setMaritalStatus(e.target.value)}
                >
                  <option value="">{t("invite.select", "Seleccione")}</option>
                  <option value="Soltero">
                    {t("invite.guard.single", "Soltero")}
                  </option>
                  <option value="Casado">
                    {t("invite.guard.married", "Casado")}
                  </option>
                  <option value="Divorciado">
                    {t("invite.guard.divorced", "Divorciado")}
                  </option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  {t(
                    "ui.registration.formacionAcademica",
                    "Formación académica",
                  )}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <select
                  className={formControl}
                  disabled={isLoading}
                  style={errorStyle("academicInstruction")}
                  value={academicInstruction}
                  onChange={(e) => setAcademicInstruction(e.target.value)}
                >
                  <option value="">{t("invite.select", "Seleccione")}</option>
                  <option>Primaria</option>
                  <option>Secundaria</option>
                  <option>Universidad</option>
                </select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  {t(
                    "ui.registration.fechaDeContratacion",
                    "Fecha de contratación",
                  )}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <Input
                  className={formControl}
                  disabled={isLoading}
                  style={errorStyle("hiringContractDate")}
                  type="date"
                  value={hiringContractDate}
                  onChange={(e: any) => setHiringContractDate(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t("ui.registration.grupoSanguineo", "Grupo sanguíneo")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <select
                  className={formControl}
                  disabled={isLoading}
                  style={errorStyle("bloodType")}
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                >
                  <option value="">{t("invite.select", "Seleccione")}</option>
                  <option>O+</option>
                  <option>O-</option>
                  <option>A+</option>
                  <option>A-</option>
                  <option>B+</option>
                  <option>B-</option>
                  <option>AB+</option>
                  <option>AB-</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  {t("invite.guard.credentials", "Credenciales")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <Input
                  className={formControl}
                  disabled={isLoading}
                  placeholder={t("invite.guard.credentials", "Credenciales")}
                  style={errorStyle("guardCredentials")}
                  value={guardCredentials}
                  onChange={(e: any) => setGuardCredentials(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  {t("ui.registration.telefonoMovil", "Teléfono móvil")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <PhoneInput
                  placeholder="p.ej. +12015550123"
                  value={phone || ""}
                  onChange={(val: string) => setPhone(val)}
                />
                {errors.phone && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {errors.phone}
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>
                  {t("ui.registration.direccion", "Dirección")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <textarea
                  className={textareaControl}
                  disabled={isLoading}
                  placeholder={t("ui.registration.direccion2", "Dirección")}
                  style={errorStyle("address")}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div>
                <label className={labelClass}>
                  {t("ui.registration.contrasena", "Contraseña")}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <div className="relative">
                  <input
                    className={`${formControl} pr-10`}
                    disabled={isLoading}
                    placeholder={t(
                      "ui.registration.contrasena2",
                      "Contraseña*",
                    )}
                    style={errorStyle("password")}
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setErrors((p) => ({ ...p, password: undefined }));
                    }}
                  />
                  <button
                    className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                  >
                    {showPwd ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {errors.password}
                  </div>
                )}
              </div>

              <div>
                <label className={labelClass} htmlFor="confirm-password">
                  {t(
                    "ui.registration.confirmarContrasena",
                    "Confirmar contraseña",
                  )}
                  <span
                    aria-hidden
                    className="ml-0.5"
                    style={{ color: "var(--brand-text)" }}
                  >
                    *
                  </span>
                </label>
                <div className="relative">
                  <input
                    className={`${formControl} pr-10`}
                    disabled={isLoading}
                    id="confirm-password"
                    placeholder={t(
                      "ui.registration.confirmarContrasena2",
                      "Confirmar contraseña*",
                    )}
                    style={errorStyle("confirm")}
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => {
                      setConfirm(e.target.value);
                      setErrors((p) => ({ ...p, confirm: undefined }));
                    }}
                  />
                  <button
                    className="absolute right-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.confirm && (
                  <div
                    className="mt-1 text-sm"
                    style={{ color: "var(--bad-text)" }}
                  >
                    {errors.confirm}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-4">
            <div>
              {step > 1 && (
                <button
                  className="cg-btn-glass cg-focus rounded-full px-5 py-2.5 text-sm font-medium transition-colors motion-reduce:transition-none"
                  type="button"
                  onClick={handlePrev}
                >
                  Volver
                </button>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              {step < totalSteps && (
                <button
                  className="cg-btn-brand cg-focus rounded-full px-7 py-2.5 text-sm font-semibold transition-all motion-reduce:transition-none"
                  type="button"
                  onClick={handleNext}
                >
                  {t("kit.pagination.next")}
                </button>
              )}
              {step === totalSteps && (
                <button
                  className="cg-btn-brand cg-focus inline-flex items-center gap-2 rounded-full px-7 py-2.5 text-sm font-semibold transition-all motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                  type="submit"
                >
                  {isLoading && (
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 motion-reduce:animate-none"
                      style={{
                        borderColor:
                          "color-mix(in oklab, var(--brand-ink) 35%, transparent)",
                        borderTopColor: "var(--brand-ink)",
                      }}
                    />
                  )}
                  {isLoading ? "Registrando…" : "Registrarse"}
                </button>
              )}
            </div>
          </div>

          <div className="pt-2 text-center">
            <NavLink
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              to="/login"
            >
              {t("auth.back_to_login", {
                defaultValue: "Volver a iniciar sesión",
              })}
            </NavLink>
          </div>
        </form>
      )}
    </GuardInviteLayout>
  );
}

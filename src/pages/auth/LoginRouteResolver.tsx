import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { PublicOnlyRoute } from "@/components/ProtectedRoute";
import Login from "@/pages/auth/login";

/* Moved out of App.tsx (2026-10-25) so the public mini-app (`src/publico`)
   uses the very same /login without importing the whole CRM router. */

function normalizeInviteToken(value: string | null | undefined) {
  return value && value !== "null" && value !== "undefined" ? value : undefined;
}

export default function LoginRouteResolver() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteToken = normalizeInviteToken(
    searchParams.get("token") ||
      searchParams.get("invitationToken") ||
      searchParams.get("invite") ||
      undefined,
  );
  const inviteType = normalizeInviteToken(
    searchParams.get("inviteType") || undefined,
  );
  const securityGuardId = normalizeInviteToken(
    searchParams.get("securityGuardId") || undefined,
  );

  useEffect(() => {
    if (!inviteToken) return;

    // If token explicitly marks a client invite, go to client registration
    if (inviteType === "client") {
      navigate(
        `/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`,
        { replace: true },
      );

      return;
    }

    // Supervisor invite: their home is the SUPERVISOR app, not this CRM. Send
    // them to the supervisor registration/waiting screen (NOT guard, NOT CRM).
    if (inviteType === "supervisor") {
      navigate(
        `/supervisor/registration?token=${encodeURIComponent(inviteToken)}&inviteType=supervisor`,
        { replace: true },
      );

      return;
    }

    // Administrative / internal staff invites: they work in THIS CRM, so send
    // them to the panel onboarding (NOT the customer registration view).
    if (inviteType === "staff" || inviteType === "admin") {
      navigate(
        `/auth/accept-invitation?token=${encodeURIComponent(inviteToken)}&inviteType=staff`,
        { replace: true },
      );

      return;
    }

    // Default behavior: treat as guard invitation and open the public invitation
    // registration page directly. Avoid probing backend endpoints here because
    // that can return 400/204 preflight errors and leave the user on the login page.
    navigate(
      `/auth/invitation?token=${encodeURIComponent(inviteToken)}${securityGuardId ? `&securityGuardId=${encodeURIComponent(securityGuardId)}` : ""}&inviteType=guard`,
      { replace: true },
    );
  }, [inviteToken, inviteType, securityGuardId, navigate]);

  return (
    <PublicOnlyRoute>
      <Login />
    </PublicOnlyRoute>
  );
}

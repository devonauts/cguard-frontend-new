import React from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

export default function RequireGlobalAdmin({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return null;
  if (!isAuthenticated)
    return <Navigate replace state={{ from: location }} to="/login" />;
  if (!isAdmin) return <Navigate replace to="/dashboard" />;

  return <>{children}</>;
}

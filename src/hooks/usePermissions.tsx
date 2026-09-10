import { useAuth } from "@/contexts/AuthContext";

export function usePermissions() {
  const { hasPermission, hasAny } = useAuth();

  return { hasPermission, hasAny };
}

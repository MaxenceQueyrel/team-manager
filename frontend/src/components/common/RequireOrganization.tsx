import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/** Blocks the wrapped routes until the user has an active organization, redirecting to /organization. */
export default function RequireOrganization() {
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);

  if (!activeOrganizationId) {
    return <Navigate to="/organization" replace />;
  }

  return <Outlet />;
}

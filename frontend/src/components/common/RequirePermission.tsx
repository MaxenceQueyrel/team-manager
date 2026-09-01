import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/** Blocks visitors lacking `permission` from the wrapped routes, redirecting to the dashboard. */
export default function RequirePermission({ permission }: { permission: string }) {
  const hasPermission = useAuthStore((s) => s.permissions.has(permission));

  if (!hasPermission) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

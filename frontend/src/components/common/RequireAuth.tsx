import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

/** Blocks unauthenticated visitors from the wrapped routes, redirecting to /login. */
export default function RequireAuth() {
  const { user, isHydrated } = useAuthStore();
  const location = useLocation();

  if (!isHydrated) return null;

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}

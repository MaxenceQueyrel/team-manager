import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "@/components/common/Layout";
import RequireAuth from "@/components/common/RequireAuth";
import AvailabilityPage from "@/pages/AvailabilityPage";
import DashboardPage from "@/pages/DashboardPage";
import LoginPage from "@/pages/LoginPage";
import OptimizationPage from "@/pages/OptimizationPage";
import PeoplePage from "@/pages/PeoplePage";
import ProjectsPage from "@/pages/ProjectsPage";
import RegisterPage from "@/pages/RegisterPage";
import TeamsPage from "@/pages/TeamsPage";
import { useAuthStore } from "@/store/authStore";

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="optimization" element={<OptimizationPage />} />
          <Route path="availability" element={<AvailabilityPage />} />
        </Route>
      </Route>
    </Routes>
  );
}

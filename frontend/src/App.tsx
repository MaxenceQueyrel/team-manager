import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/common/Layout";
import RequireAuth from "@/components/common/RequireAuth";
import RequireOrganization from "@/components/common/RequireOrganization";
import RequirePermission from "@/components/common/RequirePermission";
import PeopleWorkspace from "@/components/people/PeopleWorkspace";
import DashboardPage from "@/pages/DashboardPage";
import LoginPage from "@/pages/LoginPage";
import OptimizationPage from "@/pages/OptimizationPage";
import OrganizationPage from "@/pages/OrganizationPage";
import PeopleCapacityView from "@/pages/PeopleCapacityView";
import PeoplePage from "@/pages/PeoplePage";
import PersonDetailPage from "@/pages/PersonDetailPage";
import ProfilePage from "@/pages/ProfilePage";
import ProjectsPage from "@/pages/ProjectsPage";
import ProjectWorkspacePage from "@/pages/ProjectWorkspacePage";
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
          <Route path="organization" element={<OrganizationPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route element={<RequireOrganization />}>
            <Route index element={<DashboardPage />} />
            <Route path="people" element={<PeopleWorkspace />}>
              <Route index element={<PeoplePage />} />
              <Route path="capacity" element={<PeopleCapacityView />} />
            </Route>
            <Route path="people/:id" element={<PersonDetailPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:id" element={<ProjectWorkspacePage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route element={<RequirePermission permission="optimization:run" />}>
              <Route path="optimization" element={<OptimizationPage />} />
            </Route>
            <Route path="availability" element={<Navigate to="/people/capacity" replace />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

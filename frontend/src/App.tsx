import { Route, Routes } from "react-router-dom";
import Layout from "@/components/common/Layout";
import AvailabilityPage from "@/pages/AvailabilityPage";
import DashboardPage from "@/pages/DashboardPage";
import OptimizationPage from "@/pages/OptimizationPage";
import PeoplePage from "@/pages/PeoplePage";
import ProjectsPage from "@/pages/ProjectsPage";
import TeamsPage from "@/pages/TeamsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="optimization" element={<OptimizationPage />} />
        <Route path="availability" element={<AvailabilityPage />} />
      </Route>
    </Routes>
  );
}

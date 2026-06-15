import { Routes, Route } from "react-router-dom";
import Layout from "@/components/common/Layout";
import DashboardPage from "@/pages/DashboardPage";
import PeoplePage from "@/pages/PeoplePage";
import ProjectsPage from "@/pages/ProjectsPage";
import TeamsPage from "@/pages/TeamsPage";
import OptimizationPage from "@/pages/OptimizationPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="optimization" element={<OptimizationPage />} />
      </Route>
    </Routes>
  );
}

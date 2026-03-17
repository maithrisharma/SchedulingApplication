import { BrowserRouter, Routes, Route } from "react-router-dom";

import { ScenarioProvider } from "./context/ScenarioContext";
import { GlobalFiltersProvider } from "./context/GlobalFiltersContext";
import { SelectionProvider } from "./context/SelectionContext";

/* ---------------- Main workflow pages ---------------- */
import ScenarioListPage from "./pages/ScenarioListPage";
import FileUploadPage from "./pages/FileUploadPage";
import SchedulingPage from "./pages/SchedulingPage";

/* ---------------- KPI pages ---------------- */
import KpiPage from "./pages/KpiPage";
import KpiLateOpsPage from "./pages/KpiLateOpsPage";
import KpiLogAssistantPage from "./pages/KpiLogAssistantPage";

/* ---------------- Analysis Tools ---------------- */
import AnalysisToolsPage from "./pages/AnalysisToolsPage";
import { GanttStorageProvider } from "./context/GanttStorageContext";

/* ---------------- Reports ---------------- */
import PlanTablePage from "./pages/PlanTablePage";
import LateOpsReportPage from "./pages/LateOpsReportPage";
import MissingRt10Page from "./pages/MissingRt10Page";
import UnplacedPage from "./pages/UnplacedPage";
import ShiftInjectionsPage from "./pages/ShiftInjectionsPage";
import DeliveryReportPage from "./pages/DeliveryReportPage";

/* NEW: top nav with hover dropdowns */
import TopNavBar from "./navigation/TopNavBar";

export default function App() {
  return (
    <ScenarioProvider>
        <GanttStorageProvider>
            <SelectionProvider>
                <BrowserRouter>
                    <TopNavBar />

                    <Routes>
                        <Route path="/" element={<ScenarioListPage />} />
                        <Route path="/upload" element={<FileUploadPage />} />
                        <Route path="/schedule" element={<SchedulingPage />} />

                        {/* KPIs */}
                        <Route path="/kpis/summary" element={<KpiPage />} />
                        <Route path="/kpis/late-ops" element={<KpiLateOpsPage />} />
                        <Route path="/kpis/log-assistant" element={<KpiLogAssistantPage />} />

                        {/* Analysis Tools */}
                        <Route
                            path="/analysis/*"
                            element={
                            <GlobalFiltersProvider>
                                <AnalysisToolsPage />
                            </GlobalFiltersProvider>
                            }
                        />

                        {/* Reports */}
                        <Route path="/reports/plan" element={<PlanTablePage />} />
                        <Route path="/reports/late-ops" element={<LateOpsReportPage />} />
                        <Route path="/reports/missing-rt10" element={<MissingRt10Page />} />
                        <Route path="/reports/unplaced" element={<UnplacedPage />} />
                        <Route path="/reports/shift" element={<ShiftInjectionsPage />} />
                        <Route path="/reports/delivery" element={<DeliveryReportPage />} />
                    </Routes>
                </BrowserRouter>
            </SelectionProvider>
        </GanttStorageProvider>
    </ScenarioProvider>
  );
}

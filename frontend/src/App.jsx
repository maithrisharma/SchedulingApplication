import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";

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

/* ---------------- Reports ---------------- */
import ReportsPage from "./pages/ReportsPage";
import PlanTablePage from "./pages/PlanTablePage";
import LateOpsReportPage from "./pages/LateOpsReportPage";
import MissingRt10Page from "./pages/MissingRt10Page";
import UnplacedPage from "./pages/UnplacedPage";
import ShiftInjectionsPage from "./pages/ShiftInjectionsPage";
import DeliveryReportPage from "./pages/DeliveryReportPage";

import { AppBar, Toolbar, Button, Tabs, Tab } from "@mui/material";

/* -------------------------------------------------------------
      REUSABLE TOP NAV ITEM (Reduced height + German)
------------------------------------------------------------- */
function TopNavItem({ label, to }) {
  const { pathname } = useLocation();

  let matchBase = to;
  if (to.startsWith("/kpis")) matchBase = "/kpis";
  else if (to.startsWith("/analysis")) matchBase = "/analysis";
  else if (to.startsWith("/reports")) matchBase = "/reports";

  const active =
    matchBase === "/"
      ? pathname === "/"
      : pathname === matchBase || pathname.startsWith(matchBase + "/");

  return (
    <Button
      component={Link}
      to={to}
      disableRipple
      sx={{
        textTransform: "none",
        fontSize: "0.9rem",
        fontWeight: active ? 700 : 500,
        color: active ? "#1d4ed8" : "#334155",
        borderBottom: active ? "2px solid #1d4ed8" : "2px solid transparent",
        borderRadius: 0,
        px: 1.2,
        py: 0.3,       // REDUCED
        minHeight: 36, // REDUCED
        "&:hover": {
          backgroundColor: "transparent",
          color: "#1d4ed8",
        },
      }}
    >
      {label}
    </Button>
  );
}

/* -------------------------------------------------------------
   SUB NAV COMPONENT (Reduced height)
------------------------------------------------------------- */
function SubNav({ tabs }) {
  const path = useLocation().pathname;

  const index = tabs.findIndex(
    (t) => path === t.to || path.startsWith(t.to + "/")
  );
  const activeIndex = index === -1 ? 0 : index;

  return (
    <AppBar
      position="static"
      color="inherit"
      elevation={0}
      sx={{
        borderBottom: "1px solid #e2e8f0",
        bgcolor: "#ffffff",
        minHeight: 40, // REDUCED
      }}
    >
      <Tabs
        value={activeIndex}
        variant="scrollable"
        scrollButtons="auto"
        TabIndicatorProps={{
          style: { backgroundColor: "#1d4ed8", height: 2 }, // REDUCED
        }}
        sx={{
          minHeight: 40, // REDUCED
          "& .MuiTab-root": {
            minHeight: 40, // REDUCED
            textTransform: "none",
            fontSize: "0.85rem",
            fontWeight: 600,
            px: 1.6,
            py: 0,
          },
          "& .Mui-selected": {
            color: "#1d4ed8 !important",
            fontWeight: 700,
          },
        }}
      >
        {tabs.map((t, i) => (
          <Tab key={i} component={Link} to={t.to} label={t.label} />
        ))}
      </Tabs>
    </AppBar>
  );
}

/* -------------------------------------------------------------
   SUB NAV: KPIs (GERMAN)
------------------------------------------------------------- */
function KPIsSubNav() {
  const path = useLocation().pathname;
  if (!path.startsWith("/kpis")) return null;

  return (
    <SubNav
      tabs={[
        { label: "Übersicht", to: "/kpis/summary" },
        { label: "Verspätete Vorgänge", to: "/kpis/late-ops" },
        { label: "Log-Assistent", to: "/kpis/log-assistant" },
      ]}
    />
  );
}

/* -------------------------------------------------------------
   SUB NAV: Analysis Tools (GERMAN)
------------------------------------------------------------- */
function AnalysisToolsSubNav() {
  const path = useLocation().pathname;
  if (!path.startsWith("/analysis")) return null;

  return (
    <SubNav
      tabs={[
        { label: "Plantafel", to: "/analysis/gantt" },
        { label: "Auftragsrouting", to: "/analysis/order-routing" },
        { label: "Maschinenkontext", to: "/analysis/machine-context" },
        { label: "Auslastung", to: "/analysis/utilization" },
        { label: "Leerlaufzeiten", to: "/analysis/idle-time" },
        { label: "Heatmap", to: "/analysis/heatmap" },
      ]}
    />
  );
}

/* -------------------------------------------------------------
   SUB NAV: Reports (GERMAN)
------------------------------------------------------------- */
function ReportsSubNav() {
  const path = useLocation().pathname;
  if (!path.startsWith("/reports")) return null;

  return (
    <SubNav
      tabs={[
        { label: "Plantabelle", to: "/reports/plan" },
        { label: "Verspätete Vorgänge", to: "/reports/late-ops" },
        { label: "Fehlende RT=10", to: "/reports/missing-rt10" },
        { label: "Ungeplante", to: "/reports/unplaced" },
        { label: "Schichtinjektionen", to: "/reports/shift" },
        { label: "Lieferungen", to: "/reports/delivery" },
      ]}
    />
  );
}

/* -------------------------------------------------------------
                       MAIN APP
------------------------------------------------------------- */
export default function App() {
  return (
    <ScenarioProvider>
        <SelectionProvider>
      <BrowserRouter>
        {/* ---------- TOP NAV (COMPACT + GERMAN) ---------- */}
        <AppBar
          position="static"
          color="inherit"
          elevation={1}
          sx={{
            borderBottom: "1px solid #e2e8f0",
            bgcolor: "#ffffff",
            minHeight: 48, // REDUCED
          }}
        >
          <Toolbar sx={{ gap: 1, minHeight: 48, py: 0 }}>
            <TopNavItem label="Szenarien" to="/" />
            <TopNavItem label="Upload" to="/upload" />
            <TopNavItem label="Planung" to="/schedule" />
            <TopNavItem label="KPIs" to="/kpis/summary" />
            <TopNavItem label="Analyse-Tools" to="/analysis/gantt" />
            <TopNavItem label="Berichte" to="/reports/plan" />
          </Toolbar>
        </AppBar>

        {/* ---------- SUB NAVS ---------- */}
        <KPIsSubNav />
        <AnalysisToolsSubNav />
        <ReportsSubNav />

        {/* ---------- ROUTES ---------- */}
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
    </ScenarioProvider>
  );
}

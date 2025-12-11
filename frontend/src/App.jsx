import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";

import { ScenarioProvider } from "./context/ScenarioContext";
import { GlobalFiltersProvider } from "./context/GlobalFiltersContext";

/* ---------------- Main workflow pages ---------------- */
import ScenarioListPage from "./pages/ScenarioListPage";
import FileUploadPage from "./pages/FileUploadPage";

import SchedulingPage from "./pages/SchedulingPage";

/* ---------------- KPI pages ---------------- */
import KpiPage from "./pages/KpiPage";
import KpiLateOpsPage from "./pages/KpiLateOpsPage";
import KpiLogAssistantPage from "./pages/KpiLogAssistantPage"

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
   REUSABLE TOP NAV ITEM (UPGRADED LOOK + FIXED ACTIVE LOGIC)
------------------------------------------------------------- */
function TopNavItem({ label, to }) {
  const { pathname } = useLocation();

  // Map a route target to its "section" base for active highlighting
  let matchBase = to;

  if (to.startsWith("/kpis")) matchBase = "/kpis";
  else if (to.startsWith("/analysis")) matchBase = "/analysis";
  else if (to.startsWith("/reports")) matchBase = "/reports";
  else if (to === "/") matchBase = "/"; // root is its own base

  const active =
    matchBase === "/"
      ? pathname === "/" // avoid "/" matching everything
      : pathname === matchBase || pathname.startsWith(matchBase + "/");

  return (
    <Button
      component={Link}
      to={to}
      disableRipple
      sx={{
        textTransform: "none",
        fontSize: "1rem",
        fontWeight: active ? 700 : 500,
        color: active ? "#1d4ed8" : "#334155",
        borderBottom: active ? "3px solid #1d4ed8" : "3px solid transparent",
        borderRadius: 0,
        px: 2,
        py: 1,
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
   GENERIC SUB NAV COMPONENT (UPGRADED STYLE)
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
        maxWidth: "100%",
        overflowX: "hidden",
        borderBottom: "1px solid #e2e8f0",
        bgcolor: "#ffffff",
      }}
    >
      <Tabs
        value={activeIndex}
        variant="scrollable"
        scrollButtons="auto"
        TabIndicatorProps={{ style: { backgroundColor: "#1d4ed8", height: 3 } }}
        sx={{
          "& .MuiTab-root": {
            textTransform: "none",
            fontSize: "0.95rem",
            fontWeight: 600,
            color: "#475569",
            minWidth: 0,
            px: 2,
            "&:hover": {
              color: "#1d4ed8",
              backgroundColor: "#f1f5f9",
              borderRadius: "6px",
            },
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
   SUB NAV: KPIs  (ONLY SHOW UNDER /kpis/*)
------------------------------------------------------------- */
function KPIsSubNav() {
  const path = useLocation().pathname;
  if (!path.startsWith("/kpis")) return null;

  return (
    <SubNav
      tabs={[
        { label: "Summary", to: "/kpis/summary" },
        { label: "Late Ops", to: "/kpis/late-ops" },
        { label: "Log Assistant", to: "/kpis/log-assistant" },
      ]}
    />
  );
}

/* -------------------------------------------------------------
   SUB NAV: Analysis Tools (ONLY SHOW UNDER /analysis/*)
------------------------------------------------------------- */
function AnalysisToolsSubNav() {
  const path = useLocation().pathname;
  if (!path.startsWith("/analysis")) return null;

  return (
    <SubNav
      tabs={[
        { label: "Gantt", to: "/analysis/gantt" },
        { label: "Order Routing", to: "/analysis/order-routing" },
        { label: "Machine Context", to: "/analysis/machine-context" },
        { label: "Utilization", to: "/analysis/utilization" },
        { label: "Idle Time", to: "/analysis/idle-time" },
        { label: "Heatmap", to: "/analysis/heatmap" },
      ]}
    />
  );
}

/* -------------------------------------------------------------
   SUB NAV: Reports (ONLY SHOW UNDER /reports/*)
------------------------------------------------------------- */
function ReportsSubNav() {
  const path = useLocation().pathname;
  if (!path.startsWith("/reports")) return null;

  return (
    <SubNav
      tabs={[
        { label: "Plan Table", to: "/reports/plan" },
        { label: "Late Ops", to: "/reports/late-ops" },
        { label: "Missing RT=10", to: "/reports/missing-rt10" },
        { label: "Unplaced", to: "/reports/unplaced" },
        { label: "Shift Injections", to: "/reports/shift" },
        { label: "Delivery", to: "/reports/delivery" },
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
      <BrowserRouter>
        {/* ---------------- TOP NAV ---------------- */}
        <AppBar
          position="static"
          color="inherit"
          elevation={1}
          sx={{
            maxWidth: "100%",
            overflowX: "hidden", // DO NOT REMOVE
            borderBottom: "1px solid #e2e8f0",
            bgcolor: "#ffffff",
          }}
        >
          <Toolbar sx={{ gap: 2 }}>
            <TopNavItem label="Scenarios" to="/" />
            <TopNavItem label="Upload" to="/upload" />
            <TopNavItem label="Schedule" to="/schedule" />
            <TopNavItem label="KPIs" to="/kpis/summary" />
            <TopNavItem label="Analysis Tools" to="/analysis/gantt" />
            <TopNavItem label="Reports" to="/reports/plan" />
          </Toolbar>
        </AppBar>

        {/* ---------------- SUB NAV LEVEL ---------------- */}
        <KPIsSubNav />
        <AnalysisToolsSubNav />
        <ReportsSubNav />

        {/* ---------------- ROUTES ---------------- */}
        <Routes>
          {/* MAIN FLOW */}
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
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/plan" element={<PlanTablePage />} />
          <Route path="/reports/late-ops" element={<LateOpsReportPage />} />
          <Route path="/reports/missing-rt10" element={<MissingRt10Page />} />
          <Route path="/reports/unplaced" element={<UnplacedPage />} />
          <Route path="/reports/shift" element={<ShiftInjectionsPage />} />
          <Route path="/reports/delivery" element={<DeliveryReportPage />} />
        </Routes>
      </BrowserRouter>
    </ScenarioProvider>
  );
}

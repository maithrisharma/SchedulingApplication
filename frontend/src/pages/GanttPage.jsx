// src/pages/GanttPage.jsx
import {
  Box,
  Card,
  Typography,
  Button,
  Stack,
  Alert,
  FormControlLabel,
  Switch,
  CircularProgress,
  Snackbar,
  Drawer,
  IconButton,
  Divider,
  Badge,
  Tabs,
  Tab,
} from "@mui/material";
import { useSelection } from "../context/SelectionContext";
import { useNavigate } from "react-router-dom";
import {
  FilterList,
  Menu as MenuIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import GanttChart from "../components/GanttChart";
import { useScenario } from "../context/ScenarioContext";
import ColorLegend from "../components/ColorLegend";
import { useGlobalFilters } from "../context/GlobalFiltersContext";
import {
  apiGet,
  apiSavePlanChanges,
  apiGenerateCandidate,
  apiApplyCandidate,
  apiDiscardCandidate,
  apiDiscardOverrides,
  apiOverridesStatus,
  apiGetKpiComparison,
} from "../api";
import KpiComparison from "../components/KpiComparison";
import { useEffect, useState, useMemo, useCallback } from "react";
import PageLayout from "../components/PageLayout";

const ALL_SENTINEL = "__ALL__";

export default function GanttPage({ onOpenFilters }) {
  const { scenario, setScenario } = useScenario();
  const { setSelection, setGanttZoom, ganttZoom } = useSelection();
  const navigate = useNavigate();
  const { filters, setMachineList } = useGlobalFilters();

  const [toast, setToast] = useState({ open: false, msg: "" });
  const [machineOrder, setMachineOrder] = useState([]);
  const [dirtyMap, setDirtyMap] = useState({});
  const [savedOverrideCount, setSavedOverrideCount] = useState(0);
  const [kpiComparison, setKpiComparison] = useState(null);

  const [plan, setPlan] = useState([]);
  const [draftPlan, setDraftPlan] = useState([]);
  const [top10, setTop10] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [candidatePlan, setCandidatePlan] = useState(null);

  const [showAllLabels, setShowAllLabels] = useState(false);
  const [actionPanelOpen, setActionPanelOpen] = useState(false);

  // ✅ Option A: Tabs inside drawer (0=Actions, 1=KPIs)
  const [drawerTab, setDrawerTab] = useState(0);

  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 900
  );

  useEffect(() => {
    const resizeHandler = () => setViewportHeight(window.innerHeight || 900);
    window.addEventListener("resize", resizeHandler);
    return () => window.removeEventListener("resize", resizeHandler);
  }, []);

  useEffect(() => {
    if (!scenario) return;
    setLoading(true);

    apiGet(`/visualize/${scenario}`)
      .then((res) => {
        setPlan(res.plan || []);
        setDraftPlan(res.plan || []);
        setMachineList(res.machines || []);
        setMachineOrder((res.machines || []).map(String));
        setTop10(res.top10_machines || []);

        apiOverridesStatus(scenario)
          .then((s) => setSavedOverrideCount(s.count || 0))
          .catch(() => setSavedOverrideCount(0));
      })
      .catch(() => setErr("Daten konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [scenario, setMachineList]);

  useEffect(() => {
    if (!plan?.length || !draftPlan?.length) return;

    const planById = new Map(plan.map((r) => [String(r.job_id ?? r.jobId), r]));

    const nextDirty = {};
    for (const r of draftPlan) {
      const id = String(r.job_id ?? r.jobId);
      const base = planById.get(id);
      if (!base) continue;

      const changed =
        String(r.WorkPlaceNo) !== String(base.WorkPlaceNo) ||
        new Date(r.Start).getTime() !== new Date(base.Start).getTime() ||
        new Date(r.End).getTime() !== new Date(base.End).getTime();

      if (changed) {
        nextDirty[id] = {
          jobId: id,
          orig: {
            WorkPlaceNo: base.WorkPlaceNo,
            Start: base.Start,
            End: base.End,
          },
          next: { WorkPlaceNo: r.WorkPlaceNo, Start: r.Start, End: r.End },
        };
      }
    }

    setDirtyMap(nextDirty);
  }, [plan, draftPlan]);

  const filteredPlan = useMemo(() => {
    const displayPlan = candidatePlan ?? draftPlan;
    let rows = [...displayPlan];

    if (filters.machines.length === 0) {
      if (top10.length > 0) {
        rows = rows.filter((r) => top10.includes(String(r.WorkPlaceNo)));
      }
    } else if (
      filters.machines.length === 1 &&
      filters.machines[0] === ALL_SENTINEL
    ) {
      // keep all
    } else {
      rows = rows.filter((r) => filters.machines.includes(String(r.WorkPlaceNo)));
    }

    if (filters.priority !== "all") {
      rows = rows.filter((r) => String(r.PriorityGroup) === filters.priority);
    }

    if (filters.outsourcing === "outs") {
      rows = rows.filter((r) => r.IsOutsourcing === true || r.Orderstate > 3);
    }

    if (filters.deadline === "late") {
      rows = rows.filter(
        (r) => r.LatestStartDate && new Date(r.Start) > new Date(r.LatestStartDate)
      );
    }

    if (filters.deadline === "hasDeadline") {
      rows = rows.filter((r) => r.LatestStartDate != null);
    }

    if (filters.dateStart) {
      const d0 = new Date(filters.dateStart);
      rows = rows.filter((r) => new Date(r.Start) >= d0);
    }

    if (filters.dateEnd) {
      const d1 = new Date(filters.dateEnd);
      rows = rows.filter((r) => new Date(r.End) <= d1);
    }

    return rows;
  }, [candidatePlan, draftPlan, filters, top10]);

  const machinesShown = [...new Set(filteredPlan.map((r) => r.WorkPlaceNo))];
  const ROW_HEIGHT = 30;
  const heightFromRows = machinesShown.length * ROW_HEIGHT + 160;

  const dynamicHeight = Math.max(520, Math.min(heightFromRows, viewportHeight - 180));

  const handleDownloadSvg = () => {
    const svg = document.getElementById("gantt-svg");
    if (!svg) return;

    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${scenario}_gantt.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleZoomChange = useCallback((domain) => setGanttZoom(domain), [setGanttZoom]);

  // ✅ Reset everything (draft + overrides)
  const resetAll = async () => {
    setDraftPlan(plan);

    if (savedOverrideCount > 0) {
      try {
        await apiDiscardOverrides(scenario);
        setSavedOverrideCount(0);
      } catch (e) {
        console.error("Failed to discard overrides:", e);
      }
    }

    setToast({ open: true, msg: "Zurückgesetzt." });
  };

  // ✅ Generate candidate (auto-saves changes first)
  const generateCandidate = async () => {
    const changes = Object.values(dirtyMap).map((x) => ({
      job_id: x.jobId,
      WorkPlaceNo: x.next.WorkPlaceNo,
      Start: x.next.Start,
      End: x.next.End,
    }));

    try {
      setLoading(true);

      // Auto-save if there are unsaved changes
      if (changes.length > 0) {
        await apiSavePlanChanges(scenario, changes);
        setSavedOverrideCount((prevCount) => prevCount + changes.length);
      }

      const res = await apiGenerateCandidate(scenario);
      setCandidatePlan(res.plan || []);

      // ✅ NEW: Load KPI comparison
      try {
        const kpiData = await apiGetKpiComparison(scenario);
        setKpiComparison(kpiData);
      } catch (kpiError) {
        console.warn("KPI comparison failed:", kpiError);
        setKpiComparison(null);
      }

      // ✅ Open drawer + default to KPI tab
      setDrawerTab(1);
      setActionPanelOpen(true);

      setToast({ open: true, msg: "Kandidat mit KPI-Vergleich generiert." });
    } catch (e) {
      console.error(e);
      setToast({ open: true, msg: "Fehler beim Generieren." });
    } finally {
      setLoading(false);
    }
  };

  // ✅ Apply candidate (becomes new baseline, deletes overrides)
  const applyCandidate = async () => {
    try {
      setLoading(true);

      await apiApplyCandidate(scenario);
      await apiDiscardOverrides(scenario);

      const res = await apiGet(`/visualize/${scenario}`);
      setPlan(res.plan || []);
      setDraftPlan(res.plan || []);
      setCandidatePlan(null);
      setSavedOverrideCount(0);
      setKpiComparison(null);

      setDrawerTab(0);
      setActionPanelOpen(false);
      setToast({ open: true, msg: "Kandidat übernommen." });
    } catch (e) {
      console.error(e);
      setToast({ open: true, msg: "Fehler beim Übernehmen." });
    } finally {
      setLoading(false);
    }
  };

  // ✅ Discard candidate (back to baseline, keeps overrides)
  const discardCandidate = async () => {
    try {
      setLoading(true);

      // 1. Discard candidate files
      await apiDiscardCandidate(scenario);

      // 2. Delete overrides.json
      await apiDiscardOverrides(scenario);

      // 3. Reset all state
      setCandidatePlan(null);
      setDraftPlan(plan); // ✅ Reset to baseline
      setSavedOverrideCount(0);
      setKpiComparison(null);

      setDrawerTab(0);
      setActionPanelOpen(false);
      setToast({ open: true, msg: "Zurückgesetzt zu Baseline." });
    } catch (e) {
      console.error(e);
      setToast({ open: true, msg: "Fehler beim Verwerfen." });
    } finally {
      setLoading(false);
    }
  };

  const totalChanges = Object.keys(dirtyMap).length + savedOverrideCount;
  const hasChanges = totalChanges > 0;

  return (
    <PageLayout
      title="Plantafel"
      maxWidth={1600}
      headerRight={
        <>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showAllLabels}
                onChange={(e) => setShowAllLabels(e.target.checked)}
              />
            }
            label="Alle Beschriftungen"
            sx={{
              m: 0,
              "& .MuiFormControlLabel-label": {
                fontSize: "clamp(0.72rem, 0.68rem + 0.2vw, 0.82rem)",
                color: "#334155",
                fontWeight: 600,
              },
            }}
          />

          <ColorLegend />

          <Badge
            badgeContent={totalChanges}
            color="warning"
            sx={{
              "& .MuiBadge-badge": {
                bgcolor: candidatePlan ? "#16a34a" : "#f59e0b",
              },
            }}
          >
            <IconButton
              onClick={() => setActionPanelOpen(true)}
              sx={{
                bgcolor: hasChanges || candidatePlan ? "action.selected" : "transparent",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <MenuIcon />
            </IconButton>
          </Badge>

          {onOpenFilters && (
            <Button
              variant="text"
              size="small"
              startIcon={<FilterList sx={{ fontSize: 18 }} />}
              onClick={onOpenFilters}
              sx={{
                minHeight: 30,
                px: 1,
                fontSize: "clamp(0.75rem, 0.7rem + 0.25vw, 0.9rem)",
                fontWeight: 650,
                color: "#0f3b63",
                textTransform: "none",
              }}
            >
              Filter
            </Button>
          )}
        </>
      }
    >
      <Card sx={{ borderRadius: 4, p: 3 }}>
        {err && <Alert severity="error">{err}</Alert>}

        {loading && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <CircularProgress size={70} />
          </Box>
        )}

        {/* ✅ IMPORTANT: KPI block removed from main page (prevents double scrollbars) */}

        {!loading && filteredPlan.length > 0 && (
          <GanttChart
            key={scenario + JSON.stringify(filters)}
            data={filteredPlan}
            allJobs={candidatePlan ?? draftPlan}
            machineOrder={machineOrder}
            setDraftPlan={setDraftPlan}
            onIllegalMove={(msg) => setToast({ open: true, msg })}
            height={dynamicHeight}
            showAllLabels={showAllLabels}
            onRefresh={() => setScenario(scenario)}
            onDownloadSvg={handleDownloadSvg}
            onBarClick={(job) => {
              if (!job) return;

              setSelection({
                orderNo: String(job.OrderNo),
                machine: String(job.WorkPlaceNo),
                jobId: job.job_id ?? null,
              });

              navigate("/analysis/machine-context");
            }}
            onZoomChange={handleZoomChange}
            initialZoomDomain={ganttZoom || null}
            dirtyMap={dirtyMap}
            hasCandidate={!!candidatePlan}
          />
        )}

        {!loading && scenario && filteredPlan.length === 0 && (
          <Alert severity="warning">Keine Aufträge entsprechen den Filtern.</Alert>
        )}
      </Card>

      {/* ✅ ACTION PANEL DRAWER */}
      <Drawer
        anchor="right"
        open={actionPanelOpen}
        onClose={() => setActionPanelOpen(false)}
        PaperProps={{
          sx: {
            width: 360,
            bgcolor: "#f8fafc",
            p: 3,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 2,
          }}
        >
          <Typography variant="h6" fontWeight={700}>
            Aktionsmenü
          </Typography>
          <IconButton onClick={() => setActionPanelOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </Box>

        {/* NORMAL EDITING MODE */}
        {!candidatePlan && (
          <Box>
            {hasChanges && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {Object.keys(dirtyMap).length > 0 && (
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    🟡 {Object.keys(dirtyMap).length} ungespeicherte Änderungen
                  </Typography>
                )}
                {savedOverrideCount > 0 && (
                  <Typography variant="body2">
                    💾 {savedOverrideCount} gespeicherte Overrides
                  </Typography>
                )}
              </Alert>
            )}

            {!hasChanges && (
              <Alert severity="success" sx={{ mb: 2 }}>
                ✅ Keine ausstehenden Änderungen
              </Alert>
            )}

            <Stack spacing={2}>
              <Button
                fullWidth
                variant="contained"
                size="large"
                disabled={!hasChanges}
                onClick={generateCandidate}
                sx={{
                  bgcolor: "#0f3b63",
                  fontWeight: 700,
                  py: 1.5,
                  "&:hover": { bgcolor: "#1e5a8e" },
                  "&:disabled": { bgcolor: "#94a3b8" },
                }}
              >
                Plan generieren {hasChanges && `(${totalChanges})`}
              </Button>

              <Button
                fullWidth
                variant="outlined"
                color="error"
                disabled={!hasChanges}
                onClick={resetAll}
              >
                Alles zurücksetzen
              </Button>
            </Stack>

            <Divider sx={{ my: 3 }} />

            <Typography variant="caption" color="text.secondary">
              <strong>Workflow:</strong>
              <br />
              1. Balken verschieben (Drag & Drop)
              <br />
              2. "Plan generieren" für Vorschau
              <br />
              3. Kandidat prüfen und übernehmen
            </Typography>
          </Box>
        )}

        {/* CANDIDATE MODE (READ-ONLY) */}
        {candidatePlan && (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="body2" fontWeight={600}>
                ✅ Kandidat bereit
              </Typography>
              <Typography variant="caption">
                Read-only Vorschau - keine Änderungen möglich
              </Typography>
            </Alert>

            <Tabs
              value={drawerTab}
              onChange={(_, v) => setDrawerTab(v)}
              sx={{ mb: 2 }}
              variant="fullWidth"
            >
              <Tab label="Aktionen" />
              <Tab label="KPIs" />
            </Tabs>

            {/* Actions tab */}
            {drawerTab === 0 && (
              <Box>
                <Stack spacing={2}>
                  <Button
                    fullWidth
                    variant="contained"
                    size="large"
                    color="success"
                    onClick={applyCandidate}
                    sx={{ fontWeight: 700, py: 1.5 }}
                  >
                    Plan übernehmen
                  </Button>

                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    onClick={discardCandidate}
                  >
                    Kandidat verwerfen
                  </Button>
                </Stack>

                <Divider sx={{ my: 3 }} />

                <Typography variant="caption" color="text.secondary">
                  <strong>Hinweis:</strong>
                  <br />• Übernehmen = Kandidat wird zum neuen Baseline
                  <br />• Verwerfen = Zurück zur Bearbeitung
                </Typography>
              </Box>
            )}

            {/* KPI tab (scrolls inside drawer only) */}
            {drawerTab === 1 && (
  <Box>
    {/* ✅ REMOVED: sx={{ flex: 1, overflowY: "auto", pr: 1 }} */}
    {/* Let content flow naturally - drawer handles scroll */}

    {kpiComparison?.ok ? (
      <>
        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2 }}>
          📊 KPI-Vergleich
        </Typography>
        <KpiComparison
          comparison={kpiComparison.comparison}
          score={kpiComparison.score}
          lateBuckets={kpiComparison.late_buckets}
        />
      </>
    ) : (
      <Alert severity="info">KPI-Vergleich wird geladen...</Alert>
    )}
  </Box>
)}
          </Box>
        )}
      </Drawer>

      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={() => setToast({ open: false, msg: "" })}
        message={toast.msg}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </PageLayout>
  );
}

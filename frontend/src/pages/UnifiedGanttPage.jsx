// src/pages/UnifiedGanttPage.jsx
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Box,
  Card,
  Button,
  Stack,
  Alert,
  FormControlLabel,
  Switch,
  CircularProgress,
  Snackbar,
  IconButton,
  Badge,
  Tabs,
  Tab,
  Drawer,
  Typography,
} from "@mui/material";
import { useSelection } from "../context/SelectionContext";
import {
  FilterList,
  Menu as MenuIcon,
  Close as CloseIcon,
} from "@mui/icons-material";

import GanttChart from "../components/GanttChart";
import MachineRoutingChart from "../components/MachineRoutingChart";
import ColorLegend from "../components/ColorLegend";
import KpiComparison from "../components/KpiComparison";

import { useScenario } from "../context/ScenarioContext";
import { useGlobalFilters } from "../context/GlobalFiltersContext";
import { useGanttStorage } from "../context/GanttStorageContext";
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
import PageLayout from "../components/PageLayout";

const ALL_SENTINEL = "__ALL__";

export default function UnifiedGanttPage({ onOpenFilters }) {
  const contextPanelRef = useRef(null);
  const { scenario, setScenario } = useScenario();
  const { setSelection, setGanttZoom, ganttZoom, selection } = useSelection();
  const { filters, setMachineList } = useGlobalFilters();
  const { saveDraftToStorage, loadDraftFromStorage, clearDraftFromStorage } = useGanttStorage();

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
  const [drawerTab, setDrawerTab] = useState(0);

  // ✅ OPTION B: Single panel with tabs
  const [contextTab, setContextTab] = useState(0); // 0=Kontext, 1=Routing
  const [showContextPanel, setShowContextPanel] = useState(false);

  const [viewDomain, setViewDomain] = useState(null);
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 900
  );

  useEffect(() => {
    const resizeHandler = () => setViewportHeight(window.innerHeight || 900);
    window.addEventListener("resize", resizeHandler);
    return () => window.removeEventListener("resize", resizeHandler);
  }, []);

  // Load data
  useEffect(() => {
    if (!scenario) return;
    setLoading(true);

    apiGet(`/visualize/${scenario}`)
      .then((res) => {
        const basePlan = res.plan || [];
        setPlan(basePlan);

        // Try to restore from storage
        const stored = loadDraftFromStorage(scenario);
        if (stored && stored.draftPlan && stored.draftPlan.length > 0) {
          console.log("[GANTT] Restoring:", `${Object.keys(stored.dirtyMap).length} changes`);
          setDraftPlan(stored.draftPlan);
          setDirtyMap(stored.dirtyMap);
          setSavedOverrideCount(stored.savedOverrideCount);
          // ✅ ONLY show toast if there are actual changes (not 0)
          if (Object.keys(stored.dirtyMap).length > 0) {
            setToast({
              open: true,
              msg: `${Object.keys(stored.dirtyMap).length} gespeicherte Änderungen wiederhergestellt`
            });
          }
        } else {
          setDraftPlan(basePlan);
        }

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
  // ✅ ADD THIS ENTIRE useEffect (2 weeks from earliest job)
  useEffect(() => {
    if (!plan || plan.length === 0) return;

    // Find earliest job start date
    let earliest = null;

    for (const job of plan) {
      const start = new Date(job.Start);
      if (!earliest || start < earliest) {
        earliest = start;
      }
    }

    if (earliest) {
      // Show 2 weeks from earliest job
      const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
      setViewDomain({
        start: earliest,
        end: new Date(earliest.getTime() + twoWeeksMs),
      });
    }
  }, [plan]);

  // Track dirty changes
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
  // ✅ ADD THIS ENTIRE useEffect
  useEffect(() => {
    if (!scenario || draftPlan.length === 0) return;
    saveDraftToStorage(scenario, draftPlan, dirtyMap, savedOverrideCount);
  }, [scenario, draftPlan, dirtyMap, savedOverrideCount, saveDraftToStorage]);

  // Filter plan
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

  const handleZoomChange = useCallback(
    (domain) => {
      setViewDomain(domain);
      setGanttZoom(domain);
    },
    [setGanttZoom]
  );

  const resetAll = async () => {
    setDraftPlan(plan);
    setDirtyMap({});
    if (savedOverrideCount > 0) {
      try {
        await apiDiscardOverrides(scenario);
        setSavedOverrideCount(0);
      } catch (e) {
        console.error("Failed to discard overrides:", e);
      }
    }
    clearDraftFromStorage(scenario);
    setToast({ open: true, msg: "Zurückgesetzt." });
  };
  const saveChangesOnly = async () => {
    const changes = Object.values(dirtyMap).map((x) => ({
      job_id: x.jobId,
      WorkPlaceNo: x.next.WorkPlaceNo,
      Start: x.next.Start,
      End: x.next.End,
    }));

    if (changes.length === 0) return;

    try {
      setLoading(true);
      await apiSavePlanChanges(scenario, changes);

      const newSavedCount = savedOverrideCount + changes.length;
      setSavedOverrideCount(newSavedCount);
      setDirtyMap({});

      // ✅ CRITICAL: Immediately update storage with cleared dirtyMap
      // This prevents timing issues when user navigates away quickly
      saveDraftToStorage(scenario, draftPlan, {}, newSavedCount);

      setToast({ open: true, msg: `${changes.length} Änderungen gespeichert.` });
    } catch (e) {
      console.error(e);
      setToast({ open: true, msg: "Fehler beim Speichern." });
    } finally {
      setLoading(false);
    }
  };

  const generateCandidate = async () => {
    const changes = Object.values(dirtyMap).map((x) => ({
      job_id: x.jobId,
      WorkPlaceNo: x.next.WorkPlaceNo,
      Start: x.next.Start,
      End: x.next.End,
    }));

    try {
      setLoading(true);
      if (changes.length > 0) {
        await apiSavePlanChanges(scenario, changes);
        setSavedOverrideCount((prevCount) => prevCount + changes.length);
      }

      const res = await apiGenerateCandidate(scenario);
      setCandidatePlan(res.plan || []);

      try {
        const kpiData = await apiGetKpiComparison(scenario);
        setKpiComparison(kpiData);
      } catch (kpiError) {
        console.warn("KPI comparison failed:", kpiError);
        setKpiComparison(null);
      }

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
      clearDraftFromStorage(scenario);

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

  const discardCandidate = async () => {
    try {
      setLoading(true);
      await apiDiscardCandidate(scenario);
      await apiDiscardOverrides(scenario);

      setCandidatePlan(null);
      setDraftPlan(plan);
      setSavedOverrideCount(0);
      setKpiComparison(null);
      clearDraftFromStorage(scenario);

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

  // Context data
  const relatedMachines = useMemo(() => {
    if (!selection?.orderNo) return [];
    return [
      ...new Set(
        (candidatePlan ?? draftPlan)
          .filter((r) => String(r.OrderNo) === String(selection.orderNo))
          .map((r) => String(r.WorkPlaceNo))
      ),
    ];
  }, [selection, candidatePlan, draftPlan]);

  const contextRows = useMemo(() => {
    if (relatedMachines.length === 0) return [];
    return (candidatePlan ?? draftPlan).filter((r) =>
      relatedMachines.includes(String(r.WorkPlaceNo))
    );
  }, [candidatePlan, draftPlan, relatedMachines]);

  return (
    <PageLayout
      title="Produktionsplanung"
      maxWidth={1800}
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
      {err && <Alert severity="error">{err}</Alert>}

      {loading && (
        <Box sx={{ textAlign: "center", py: 8 }}>
          <CircularProgress size={70} />
        </Box>
      )}

      {!loading && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* ✅ PLANTAFEL - ALWAYS VISIBLE */}
          <Card sx={{ borderRadius: 4 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                p: 2,
                bgcolor: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Typography
                  variant="h6"
                  fontWeight={700}
                  color="#0f172a"
                  sx={{ fontSize: "clamp(1rem, 0.95rem + 0.25vw, 1.25rem)" }}
                >
                  Plantafel
                </Typography>

                <Box
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    bgcolor: "#0f3b63",
                    color: "white",
                    borderRadius: 2,
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  {machinesShown.length} Maschinen
                </Box>
              </Stack>
            </Box>

            <Box>
              {filteredPlan.length > 0 && (
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
                    // ✅ Show context panel when job is clicked
                    setShowContextPanel(true);
                    // ✅ ADD THIS: Auto-scroll after panel opens
                    setTimeout(() => {
                        if (contextPanelRef.current) {
                            contextPanelRef.current.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                                inline: 'nearest'
                            });
                        }
                    }, 150); // Wait for panel to render
                  }}
                  onZoomChange={handleZoomChange}
                  initialZoomDomain={viewDomain}
                  dirtyMap={dirtyMap}
                  hasCandidate={!!candidatePlan}
                />
              )}

              {filteredPlan.length === 0 && (
                <Box sx={{ p: 3 }}>
                  <Alert severity="warning">
                    Keine Aufträge entsprechen den Filtern.
                  </Alert>
                </Box>
              )}
            </Box>
          </Card>

          {/* ✅ CONTEXT PANEL WITH TABS - (only shown after clicking job) */}
          {showContextPanel && selection && (
            <Card ref={contextPanelRef} sx={{ borderRadius: 4 }}>
              {/* Header with close button */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  p: 2,
                  bgcolor: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <Typography
                  variant="h6"
                  fontWeight={700}
                  color="#0f172a"
                  sx={{ fontSize: "clamp(0.95rem, 0.9rem + 0.25vw, 1.15rem)" }}
                >
                  Kontext
                </Typography>

                <IconButton
                  size="small"
                  onClick={() => setShowContextPanel(false)}
                  sx={{ color: "#64748b" }}
                >
                  <CloseIcon />
                </IconButton>
              </Box>

              {/* Tabs */}
              <Tabs
                value={contextTab}
                onChange={(_, v) => setContextTab(v)}
                sx={{ borderBottom: "1px solid #e2e8f0", bgcolor: "white" }}
                variant="fullWidth"
              >
                <Tab
                  label={`Maschinenkontext${
                    selection?.orderNo
                      ? ` (${selection.orderNo} • ${relatedMachines.length} M.)`
                      : ""
                  }`}
                />
                <Tab
                  label={`Maschinenrouting${
                    selection?.machine ? ` (${selection.machine})` : ""
                  }`}
                />
              </Tabs>

              {/* Tab Content */}
              <Box sx={{ p: 3 }}>
                {contextTab === 0 && (
                  <>
                    {selection?.orderNo ? (
                      contextRows.length > 0 ? (
                        <GanttChart
                          data={contextRows}
                          allJobs={candidatePlan ?? draftPlan}
                          height={450}
                          showAllLabels
                          highlightOrder={selection.orderNo}
                          dimNonHighlight={false}
                          initialZoomDomain={viewDomain}
                          onDownloadSvg={handleDownloadSvg}
                          dirtyMap={{}}
                          hasCandidate={false}
                          onZoomChange={handleZoomChange}
                        />
                      ) : (
                        <Alert severity="info">
                          Keine relevanten Maschinen für Auftrag {selection.orderNo}
                        </Alert>
                      )
                    ) : (
                      <Alert severity="info">Wählen Sie einen Auftrag aus</Alert>
                    )}
                  </>
                )}

                {contextTab === 1 && (
                  <>
                    {selection?.machine ? (
                      <MachineRoutingChart
                        machine={selection.machine}
                        jobs={candidatePlan ?? draftPlan}
                      />
                    ) : (
                      <Alert severity="info">Wählen Sie eine Maschine aus</Alert>
                    )}
                  </>
                )}
              </Box>
            </Card>
          )}
        </Box>
      )}

      {/* ACTION PANEL DRAWER */}
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

        {!candidatePlan && (
          <Box>
              {/* ✅ ADD: Manual save button */}
            {Object.keys(dirtyMap).length > 0 && savedOverrideCount === 0 && (
              <Button
                fullWidth
                variant="contained"
                size="medium"
                onClick={saveChangesOnly}
                disabled={loading}
                sx={{
                  bgcolor: "#10b981",
                  color: "white",
                  fontWeight: 700,
                  mb: 2,
                  "&:hover": { bgcolor: "#059669" },
                  textTransform: "none",
                }}
              >
                💾 Änderungen speichern ({Object.keys(dirtyMap).length})
              </Button>
            )}

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
          </Box>
        )}

        {candidatePlan && (
          <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="body2" fontWeight={600}>
                ✅ Neuer Plan bereit
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

            {drawerTab === 0 && (
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
            )}

            {drawerTab === 1 && (
              <Box>
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

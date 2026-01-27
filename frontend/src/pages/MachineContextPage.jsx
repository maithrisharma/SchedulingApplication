// src/pages/MachineContextPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Alert,
  CircularProgress,
  Button,
  Stack,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import { useScenario } from "../context/ScenarioContext";
import { useSelection } from "../context/SelectionContext";
import { apiGet } from "../api";

import GanttChart from "../components/GanttChart";
import PageLayout from "../components/PageLayout";
import ColorLegend from "../components/ColorLegend";  // ✅ ADD

export default function MachineContextPage() {
  const navigate = useNavigate();

  const { scenario } = useScenario();
  const { selection, ganttZoom } = useSelection();

  const selectedOrder = selection?.orderNo;
  const selectedMachine = selection?.machine;

  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // viewport height (same pattern as GanttPage)
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 900
  );

  useEffect(() => {
    const resizeHandler = () => setViewportHeight(window.innerHeight || 900);
    window.addEventListener("resize", resizeHandler);
    return () => window.removeEventListener("resize", resizeHandler);
  }, []);

  /* ----------------------------------------
     LOAD SCENARIO PLAN (ONCE)
  ---------------------------------------- */
  useEffect(() => {
    if (!scenario) return;

    setLoading(true);
    setErr("");

    apiGet(`/visualize/${scenario}`)
      .then((res) => setPlan(res.plan || []))
      .catch(() => setErr("Maschinenkontext konnte nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [scenario]);

  /* ----------------------------------------
     MACHINES USED BY SELECTED ORDER
  ---------------------------------------- */
  const relatedMachines = useMemo(() => {
    if (!selectedOrder) return [];

    return [
      ...new Set(
        plan
          .filter((r) => String(r.OrderNo) === String(selectedOrder))
          .map((r) => String(r.WorkPlaceNo))
      ),
    ];
  }, [plan, selectedOrder]);

  /* ----------------------------------------
     CONTEXT ROWS = ALL ORDERS ON THOSE MACHINES
  ---------------------------------------- */
  const contextRows = useMemo(() => {
    if (relatedMachines.length === 0) return [];
    return plan.filter((r) => relatedMachines.includes(String(r.WorkPlaceNo)));
  }, [plan, relatedMachines]);

  /* ----------------------------------------
     DYNAMIC HEIGHT
  ---------------------------------------- */
  const machinesShown = useMemo(
    () => [...new Set(contextRows.map((r) => String(r.WorkPlaceNo)))],
    [contextRows]
  );

  const ROW_HEIGHT = 30;
  const heightFromRows = machinesShown.length * ROW_HEIGHT + 160;

  const dynamicHeight = Math.max(
    420,
    Math.min(heightFromRows, viewportHeight - 220)
  );

  /* ----------------------------------------
     DOWNLOAD SVG
  ---------------------------------------- */
  const handleDownloadSvg = () => {
    const svg = document.getElementById("gantt-svg");
    if (!svg) return;

    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scenario}_maschinenkontext.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ----------------------------------------
     GUARD
  ---------------------------------------- */
  if (!selectedOrder || !selectedMachine) {
    return (
      <PageLayout title="Maschinenkontext" maxWidth={1600}>
        <Alert severity="info">
          Bitte wählen Sie zuerst einen Auftrag in der Plantafel aus.
        </Alert>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Maschinenkontext"
      maxWidth={1600}
      headerRight={
        <Stack direction="row" spacing={1} alignItems="center">
          {/* ✅ ADD COLOR LEGEND */}
          <ColorLegend />
          
          <Button
            variant="text"
            size="small"
            onClick={() => navigate("/analysis/gantt")}
            sx={{
              minHeight: 30,
              px: 1,
              fontSize: "clamp(0.75rem, 0.7rem + 0.25vw, 0.9rem)",
              fontWeight: 650,
              color: "#0f3b63",
              textTransform: "none",
              whiteSpace: "nowrap",
            }}
          >
            ← Zurück zur Plantafel
          </Button>
        </Stack>
      }
    >
      <Card sx={{ borderRadius: 4, p: 3 }}>
        {err && <Alert severity="error">{err}</Alert>}

        {loading && (
          <Box sx={{ textAlign: "center", py: 8 }}>
            <CircularProgress size={70} />
          </Box>
        )}

        {!loading && contextRows.length === 0 && (
          <Alert severity="warning">Keine relevanten Aufträge gefunden.</Alert>
        )}

        {!loading && contextRows.length > 0 && (
          <>


            <GanttChart
              data={contextRows}
              height={dynamicHeight}
              showAllLabels
              highlightOrder={selectedOrder}
              dimNonHighlight={false}
              initialZoomDomain={ganttZoom || null}
              onDownloadSvg={handleDownloadSvg}
              dirtyMap={{}}  // ✅ No editing in context view
              hasCandidate={false}
            />
          </>
        )}
      </Card>
    </PageLayout>
  );
}
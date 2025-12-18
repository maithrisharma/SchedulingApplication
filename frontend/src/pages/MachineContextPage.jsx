import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Alert,
  CircularProgress,
  Button,
} from "@mui/material";
import { useNavigate } from "react-router-dom";

import { useScenario } from "../context/ScenarioContext";
import { useSelection } from "../context/SelectionContext";
import { apiGet } from "../api";

import GanttChart from "../components/GanttChart";

export default function MachineContextPage() {
  const navigate = useNavigate();

  const { scenario } = useScenario();
  const { selection, ganttZoom } = useSelection();

  const selectedOrder = selection?.orderNo;
  const selectedMachine = selection?.machine;

  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  /* ----------------------------------------
     LOAD SCENARIO PLAN (ONCE)
  ---------------------------------------- */
  useEffect(() => {
    if (!scenario) return;

    setLoading(true);
    setErr("");

    apiGet(`/visualize/${scenario}`)
      .then((res) => setPlan(res.plan || []))
      .catch(() =>
        setErr("Maschinenkontext konnte nicht geladen werden.")
      )
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
    return plan.filter((r) =>
      relatedMachines.includes(String(r.WorkPlaceNo))
    );
  }, [plan, relatedMachines]);

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
      <Box sx={{ px: 3, pt: 4 }}>
        <Alert severity="info">
          Bitte wählen Sie zuerst einen Auftrag in der Plantafel aus.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: "#f8fafc", minHeight: "100vh", px: 3, pt: 2 }}>
      <Box sx={{ maxWidth: 1600, mx: "auto" }}>
        {/* ================= HEADER (Plantafel-style) ================= */}
        <Box sx={{ position: "relative", mb: 2, mt: 1 }}>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, textAlign: "center" }}
          >
            Maschinenkontext
          </Typography>

          {/* Back button – same placement as Filter */}
          <Button
            variant="text"
            onClick={() => navigate("/analysis/gantt")}
            sx={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: 16,
              color: "#0f3b63",
            }}
          >
            ← Zurück zur Plantafel
          </Button>

          <Typography
            variant="subtitle1"
            sx={{ textAlign: "center", color: "#64748b", mt: 1 }}
          >
            Szenario:&nbsp;
            <strong style={{ color: "#3b82f6" }}>{scenario}</strong>
          </Typography>

          <Typography
            variant="subtitle2"
            sx={{ textAlign: "center", color: "#64748b", mt: 0.5 }}
          >
            Auftrag:&nbsp;<strong>{selectedOrder}</strong>
            &nbsp;| Maschinen:&nbsp;
            <strong>{relatedMachines.join(", ")}</strong>
          </Typography>
        </Box>

        {/* ================= CARD ================= */}
        <Card sx={{ borderRadius: 4, p: 3 }}>
          {err && <Alert severity="error">{err}</Alert>}

          {loading && (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <CircularProgress size={70} />
            </Box>
          )}

          {!loading && contextRows.length === 0 && (
            <Alert severity="warning">
              Keine relevanten Aufträge gefunden.
            </Alert>
          )}

          {!loading && contextRows.length > 0 && (
            <GanttChart
              data={contextRows}
              height={600}
              showAllLabels
              highlightOrder={selectedOrder}
              initialZoomDomain={ganttZoom || null}
              onDownloadSvg={handleDownloadSvg}
            />
          )}
        </Card>
      </Box>
    </Box>
  );
}

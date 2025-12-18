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
} from "@mui/material";
import { useSelection } from "../context/SelectionContext";
import { useNavigate } from "react-router-dom"; // ✅ ADD

import { Download, Refresh, FilterList } from "@mui/icons-material";
import GanttChart from "../components/GanttChart";
import { useScenario } from "../context/ScenarioContext";
import { useGlobalFilters } from "../context/GlobalFiltersContext";
import { apiGet } from "../api";
import { useEffect, useState, useMemo, useCallback } from "react";

const ALL_SENTINEL = "__ALL__";

export default function GanttPage({ onOpenFilters }) {
  const { scenario, setScenario } = useScenario();
  const { setSelection, setGanttZoom, ganttZoom } = useSelection();
  const navigate = useNavigate(); // ✅ ADD

  const { filters, setMachineList } = useGlobalFilters();

  const [plan, setPlan] = useState([]);
  const [top10, setTop10] = useState([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [showAllLabels, setShowAllLabels] = useState(false);

  /* VIEWPORT */
  const [viewportHeight, setViewportHeight] = useState(
    typeof window !== "undefined" ? window.innerHeight : 900
  );

  useEffect(() => {
    const resizeHandler = () => setViewportHeight(window.innerHeight || 900);
    window.addEventListener("resize", resizeHandler);
    return () => window.removeEventListener("resize", resizeHandler);
  }, []);

  /* LOAD VISUAL DATA */
  useEffect(() => {
    if (!scenario) return;

    setLoading(true);

    apiGet(`/visualize/${scenario}`)
      .then((res) => {
        setPlan(res.plan || []);
        setMachineList(res.machines || []);
        setTop10(res.top10_machines || []);
        setLoading(false);
      })
      .catch(() => {
        setErr("Daten konnten nicht geladen werden.");
        setLoading(false);
      })
      .finally(() => setLoading(false));
  }, [scenario, setMachineList]);

  /* FILTER LOGIC */
  const filteredPlan = useMemo(() => {
    let rows = [...plan];

    if (filters.machines.length === 0) {
      if (top10.length > 0) {
        rows = rows.filter((r) =>
          top10.includes(String(r.WorkPlaceNo))
        );
      }
    } else if (
      filters.machines.length === 1 &&
      filters.machines[0] === ALL_SENTINEL
    ) {
      // keep all rows
    } else {
      rows = rows.filter((r) =>
        filters.machines.includes(String(r.WorkPlaceNo))
      );
    }

    if (filters.priority !== "all") {
      rows = rows.filter(
        (r) => String(r.PriorityGroup) === filters.priority
      );
    }

    if (filters.outsourcing === "outs") {
      rows = rows.filter(
        (r) => r.IsOutsourcing === true || r.Orderstate > 3
      );
    }

    if (filters.deadline === "late") {
      rows = rows.filter(
        (r) =>
          r.LatestStartDate &&
          new Date(r.Start) > new Date(r.LatestStartDate)
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
  }, [plan, filters, top10]);

  /* CHART HEIGHT */
  const machinesShown = [...new Set(filteredPlan.map((r) => r.WorkPlaceNo))];
  const ROW_HEIGHT = 30;
  const heightFromRows = machinesShown.length * ROW_HEIGHT + 160;

  const dynamicHeight = Math.max(
    520,
    Math.min(heightFromRows, viewportHeight - 180)
  );

  /* DOWNLOAD SVG */
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
      setGanttZoom(domain);
    },
    [setGanttZoom]
  );

  /* RENDER */
  return (
    <Box sx={{ bgcolor: "#f8fafc", minHeight: "100vh", px: 3, pt: 2 }}>
      <Box sx={{ maxWidth: 1600, mx: "auto" }}>
        {/* TITLE */}
        <Box sx={{ position: "relative", mb: 2, mt: 1 }}>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, textAlign: "center" }}
          >
            Plantafel
          </Typography>

          {/* FILTER + LABELS TOGGLE */}
          <Stack
            direction="row"
            spacing={1.5}
            sx={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-30%)",
              alignItems: "center",
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showAllLabels}
                  onChange={(e) =>
                    setShowAllLabels(e.target.checked)
                  }
                />
              }
              label="Alle Beschriftungen"
              sx={{
                mr: 0,
                "& .MuiFormControlLabel-label": {
                  fontSize: 13,
                },
              }}
            />

            {onOpenFilters && (
              <Button
                variant="text"
                startIcon={<FilterList />}
                onClick={onOpenFilters}
                sx={{ fontSize: 16, color: "#0f3b63" }}
              >
                Filter
              </Button>
            )}
          </Stack>

          <Typography
            variant="subtitle1"
            sx={{ textAlign: "center", color: "#64748b", mt: 1 }}
          >
            Plan für Szenario:&nbsp;
            <strong style={{ color: "#3b82f6" }}>
              {scenario || "—"}
            </strong>
          </Typography>
        </Box>

        {/* CARD */}
        <Card sx={{ borderRadius: 4, p: 3 }}>
          {err && <Alert severity="error">{err}</Alert>}

          {loading && (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <CircularProgress size={70} />
            </Box>
          )}

          {!loading && filteredPlan.length > 0 && (
            <GanttChart
              key={scenario + JSON.stringify(filters)}
              data={filteredPlan}
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

                // ✅ NAVIGATE TO MACHINE CONTEXT
                navigate("/analysis/machine-context");
              }}
              onZoomChange={handleZoomChange}
              initialZoomDomain={ganttZoom || null}
            />
          )}

          {!loading && scenario && filteredPlan.length === 0 && (
            <Alert severity="warning">
              Keine Aufträge entsprechen den Filtern.
            </Alert>
          )}
        </Card>
      </Box>
    </Box>
  );
}

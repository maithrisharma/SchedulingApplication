// ------------------------------------------------------------
// IdleTimePage.jsx — German UI Version (Only Text Translated)
// ------------------------------------------------------------
import { useEffect, useState, useMemo } from "react";
import {
  Box,
  Card,
  Typography,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  Stack,
  Button,
} from "@mui/material";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";

import { FilterList } from "@mui/icons-material";

import { useScenario } from "../context/ScenarioContext";
import { useGlobalFilters } from "../context/GlobalFiltersContext";
import { apiGet } from "../api";

const ALL_SENTINEL = "__ALL__";

const TREND_COLORS = [
  "#3b82f6",
  "#6366f1",
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
];

export default function IdleTimePage({ onOpenFilters }) {
  const { scenario, setScenario } = useScenario();
  const { filters } = useGlobalFilters();

  const [scenarioList, setScenarioList] = useState([]);
  const [idleData, setIdleData] = useState(null);
  const [utilData, setUtilData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  /* -------------------------------------------
     Szenarien laden
  ------------------------------------------- */
  useEffect(() => {
    apiGet("/scenarios/list").then((res) => {
      setScenarioList(res.scenarios || []);
    });
  }, []);

  /* -------------------------------------------
     Idle + Utilisation laden
  ------------------------------------------- */
  useEffect(() => {
    if (!scenario) return;

    setLoading(true);

    Promise.all([
      apiGet(`/visualize/${scenario}/idle`),
      apiGet(`/visualize/${scenario}/utilization`),
    ])
      .then(([idleRes, utilRes]) => {
        setIdleData(idleRes);
        setUtilData(utilRes);
        setLoading(false);
      })
      .catch(() => {
        setErr("Leerlaufdaten konnten nicht geladen werden.");
        setLoading(false);
      });
  }, [scenario]);

  /* -------------------------------------------
     Filter anwenden
  ------------------------------------------- */
  const filtered = useMemo(() => {
    if (!idleData || !idleData.idle_hours) return null;

    let machines = Object.keys(idleData.idle_hours);

    // Maschinenfilter
    if (filters.machines.length === 0) {
      machines = idleData.top10_machines;
    } else if (filters.machines[0] !== ALL_SENTINEL) {
      machines = filters.machines;
    }

    machines = machines.sort(
      (a, b) => idleData.idle_hours[b] - idleData.idle_hours[a]
    );

    // Datumsfilter
    const filterDates = (rows) => {
      if (!filters.dateStart && !filters.dateEnd) return rows;

      const start = filters.dateStart ? new Date(filters.dateStart) : null;
      const end = filters.dateEnd ? new Date(filters.dateEnd) : null;

      return rows.filter((x) => {
        const d = new Date(x.date);
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    };

    const idleTrend = {};
    machines.forEach((m) => {
      idleTrend[m] = filterDates(idleData.idle_per_day[m] || []);
    });

    return {
      machines,
      idle_hours: idleData.idle_hours,
      idle_per_day: idleTrend,
    };
  }, [idleData, filters]);

  if (loading)
    return (
      <Box sx={{ textAlign: "center", mt: 12 }}>
        <CircularProgress size={80} />
      </Box>
    );

  if (err) return <Alert severity="error">{err}</Alert>;
  if (!filtered)
    return <Alert severity="warning">Keine Leerlaufdaten gefunden.</Alert>;

  /* -------------------------------------------
     Trenddaten für Linienchart ausrichten
  ------------------------------------------- */
  const alignedTrendData = (() => {
    const allDates = Array.from(
      new Set(
        filtered.machines.flatMap((m) =>
          filtered.idle_per_day[m].map((d) => d.date)
        )
      )
    ).sort();

    return allDates.map((date) => {
      const row = { date };
      filtered.machines.forEach((m) => {
        const entry = filtered.idle_per_day[m].find((x) => x.date === date);
        row[m] = entry ? entry.hours : 0;
      });
      return row;
    });
  })();

  const bubbleData = filtered.machines.map((m) => ({
    machine: m,
    idle: filtered.idle_hours[m] || 0,
    util: utilData?.machine_util_pct?.[m] || 0,
    jobs: utilData?.job_counts?.[m] || 0,
  }));

  const utilList = bubbleData.map((d) => d.util);
  const idleList = bubbleData.map((d) => d.idle);

  return (
    <Box sx={{ bgcolor: "#f8fafc", minHeight: "100vh", px: 3, pt: 2 }}>
      <Box sx={{ maxWidth: 1600, mx: "auto" }}>
        {/* =======================================================
            TITEL + FILTER BUTTON
        ======================================================== */}
        <Box sx={{ position: "relative", mb: 2, mt: 1 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 900,
              textAlign: "center",
              color: "#0f172a",
            }}
          >
            Leerlaufzeit-Analyse
          </Typography>

          {onOpenFilters && (
            <Button
              variant="text"
              startIcon={<FilterList />}
              onClick={onOpenFilters}
              sx={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-30%)",
                fontSize: 16,
                color: "#0f3b63",
              }}
            >
              Filter
            </Button>
          )}

          <Typography
            variant="subtitle1"
            sx={{
              textAlign: "center",
              color: "#64748b",
              mt: 1,
            }}
          >
            Szenario:&nbsp;
            <strong style={{ color: "#3b82f6" }}>{scenario || "—"}</strong>
          </Typography>
        </Box>

        {/* =======================================================
            CHART 1 — Gesamtleerlaufzeit
        ======================================================== */}
        <Card sx={{ p: 4, borderRadius: 4, mb: 4 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Gesamt-Leerlaufstunden (Top Maschinen)
          </Typography>

          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={filtered.machines.map((m) => ({
                machine: m,
                hours: filtered.idle_hours[m],
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="machine" angle={-35} textAnchor="end" height={70} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="hours" fill="#3b82f6" name="Leerlaufstunden" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* =======================================================
            CHART 2 — Leerlauftrend
        ======================================================== */}
        <Card sx={{ p: 4, borderRadius: 4, mb: 4 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Leerlauftrend (täglich)
          </Typography>

          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={alignedTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              {filtered.machines.map((m, i) => (
                <Line
                  key={m}
                  type="monotone"
                  dataKey={m}
                  stroke={TREND_COLORS[i % TREND_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  name={m}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* =======================================================
            CHART 3 — Bubble Chart
        ======================================================== */}
        <Card sx={{ p: 4, borderRadius: 4 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Leerlauf vs. Auslastung vs. Auftragsmenge (Bubble Chart)
          </Typography>

          <ResponsiveContainer width="100%" height={420}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
              <XAxis
                type="number"
                dataKey="util"
                name="Auslastung %"
              />
              <YAxis
                type="number"
                dataKey="idle"
                name="Leerlaufstunden"
              />
              <ZAxis
                type="number"
                dataKey="jobs"
                name="Auftragsanzahl"
                range={[80, 700]}
              />
              <Tooltip />
              <Scatter data={bubbleData} fill="#ef4444" />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      </Box>
    </Box>
  );
}

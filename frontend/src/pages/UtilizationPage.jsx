// src/pages/UtilizationPage.jsx
import { useEffect, useState, useMemo } from "react";
import {
  Box,
  Card,
  Typography,
  Stack,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
  Alert,
  Button,
} from "@mui/material";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

import { FilterList } from "@mui/icons-material";
import { useScenario } from "../context/ScenarioContext";
import { useGlobalFilters } from "../context/GlobalFiltersContext";
import { apiGet } from "../api";

import PageLayout from "../components/PageLayout";

const ALL_SENTINEL = "__ALL__";

export default function UtilizationPage({ onOpenFilters }) {
  const { scenario } = useScenario();
  const { filters } = useGlobalFilters();

  const [scenarioList, setScenarioList] = useState([]); // keep (used elsewhere or future)
  const [utilData, setUtilData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [mode, setMode] = useState("hours"); // hours | pct

  useEffect(() => {
    apiGet("/scenarios/list").then((res) => {
      setScenarioList(res.scenarios || []);
    });
  }, []);

  useEffect(() => {
    if (!scenario) return;

    setLoading(true);
    setErr("");

    apiGet(`/visualize/${scenario}/utilization`)
      .then((res) => setUtilData(res))
      .catch(() => setErr("Auslastungsdaten konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, [scenario]);

  const filteredMachines = useMemo(() => {
    if (!utilData) return [];

    let machines = Object.keys(utilData.machine_hours);

    if (filters.machines.length === 0) {
      machines = utilData.top10_machines;
    } else if (filters.machines[0] !== ALL_SENTINEL) {
      machines = filters.machines;
    }

    if (filters.priority !== "all") {
      const wantBN = filters.priority === "0";
      const wantNBN = filters.priority === "1";

      machines = machines.filter((m) =>
        wantBN
          ? (utilData.bn_hours[m] ?? 0) > 0
          : wantNBN
          ? (utilData.nbn_hours[m] ?? 0) > 0
          : true
      );
    }

    return machines;
  }, [utilData, filters]);

  const barData = useMemo(() => {
    if (!utilData) return [];

    return filteredMachines.map((m) => ({
      machine: m,
      hours: (utilData.machine_hours[m] ?? 0) / 60,
      pct: utilData.machine_util_pct[m] ?? 0,
      bn: (utilData.bn_hours[m] ?? 0) / 60,
      nbn: (utilData.nbn_hours[m] ?? 0) / 60,
      jobs: utilData.job_counts[m] ?? 0,
    }));
  }, [utilData, filteredMachines]);

  const trendData = useMemo(() => {
    if (!utilData) return {};
    return filteredMachines.reduce((acc, m) => {
      acc[m] = utilData.daily_trend[m] || [];
      return acc;
    }, {});
  }, [utilData, filteredMachines]);

  return (
    <PageLayout
      title="Maschinenauslastung"
      maxWidth={1600}
      headerRight={
        <Stack
          direction="row"
          spacing={1.25}
          sx={{
            alignItems: "center",
            flexWrap: "wrap",
            rowGap: 0.75,
            justifyContent: "flex-end",
          }}
        >
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(e, v) => v && setMode(v)}
            size="small"
            sx={{
              "& .MuiToggleButton-root": {
                textTransform: "none",
                fontWeight: 650,
                px: 1.25,
                py: 0.65,
              },
            }}
          >
            <ToggleButton value="hours">Stunden genutzt</ToggleButton>
            <ToggleButton value="pct">% Auslastung</ToggleButton>
          </ToggleButtonGroup>

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
                whiteSpace: "nowrap",
              }}
            >
              Filter
            </Button>
          )}
        </Stack>
      }
    >
      {/* ERRORS / LOADING */}
      {err && <Alert severity="error">{err}</Alert>}

      {loading && (
        <Box sx={{ textAlign: "center", py: 10 }}>
          <CircularProgress size={70} />
        </Box>
      )}

      {/* CONTENT */}
      {!loading && utilData && (
        <>
          {/* MAIN BAR CHART */}
          <Card sx={{ p: 4, borderRadius: 4, mb: 4 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              {mode === "hours"
                ? "Gesamte genutzte Stunden (Top-Down)"
                : "Auslastung in % (Top-Down)"}
            </Typography>

            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="machine" />
                <YAxis />
                <RTooltip />
                <Legend />

                {mode === "hours" ? (
                  <Bar dataKey="hours" fill="#3b82f6" name="Stunden genutzt" />
                ) : (
                  <Bar dataKey="pct" fill="#10b981" name="% Auslastung" />
                )}

                <Bar dataKey="jobs" fill="#f59e0b" name="Auftragsanzahl" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* BN vs NBN */}
          <Card sx={{ p: 4, borderRadius: 4, mb: 4 }}>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
              BN vs. NBN Auslastung (Stunden)
            </Typography>

            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="machine" />
                <YAxis />
                <RTooltip />
                <Legend />
                <Bar dataKey="bn" fill="#ef4444" name="BN Stunden" />
                <Bar dataKey="nbn" fill="#3b82f6" name="NBN Stunden" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* DAILY TRENDS */}
          <Typography variant="h5" fontWeight={800} sx={{ mb: 3 }}>
            Tägliche Auslastungsentwicklung
          </Typography>

          {filteredMachines.map((m) => (
            <Card key={m} sx={{ p: 4, borderRadius: 4, mb: 3 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                {m}
              </Typography>

              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trendData[m]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <RTooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="hours"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="Stunden"
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          ))}
        </>
      )}

      {!loading && !utilData && (
        <Alert severity="warning">Keine Auslastungsdaten verfügbar.</Alert>
      )}
    </PageLayout>
  );
}

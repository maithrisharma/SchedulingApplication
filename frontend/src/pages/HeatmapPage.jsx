import React, { useEffect, useState, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  Stack,
  IconButton,
  Button,
} from "@mui/material";
import { ZoomIn, ZoomOut, FitScreen } from "@mui/icons-material";
import { FilterList } from "@mui/icons-material";

import { useScenario } from "../context/ScenarioContext";
import { useGlobalFilters } from "../context/GlobalFiltersContext";
import { apiGet } from "../api";

const ALL_SENTINEL = "__ALL__";

export default function HeatmapPage({ onOpenFilters }) {
  const { scenario, setScenario } = useScenario();
  const { filters } = useGlobalFilters();

  const [scenarioList, setScenarioList] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [mode, setMode] = useState("hours");
  const [range, setRange] = useState("full");
  const [zoom, setZoom] = useState(1);

  // Load scenarios
  useEffect(() => {
    apiGet("/scenarios/list").then((res) => setScenarioList(res.scenarios || []));
  }, []);

  // Load heatmap data
  useEffect(() => {
    if (!scenario) return;
    setLoading(true);

    apiGet(`/visualize/${scenario}/heatmap`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        setErr("Failed to load heatmap data.");
        setLoading(false);
      });
  }, [scenario]);

  // Apply filters
  const filtered = useMemo(() => {
    if (!data || !data.machines) return null;

    let machines = [...data.machines];

    if (filters.machines.length === 0) {
      machines = data.top10_machines ?? machines.slice(0, 15);
    } else if (filters.machines[0] !== ALL_SENTINEL) {
      machines = filters.machines;
    }

    let dates = data.dates.map((d) => new Date(d));
    if (filters.dateStart) dates = dates.filter((d) => d >= new Date(filters.dateStart));
    if (filters.dateEnd) dates = dates.filter((d) => d <= new Date(filters.dateEnd));

    if (!filters.dateStart && !filters.dateEnd) {
      if (range === "7") dates = dates.slice(-7);
      if (range === "30") dates = dates.slice(-30);
    }

    const formattedDates = dates.map((d) => d.toISOString().slice(5, 10).replace("-", "/"));
    const idxMap = Object.fromEntries(data.machines.map((m, i) => [m, i]));

    const values = machines.map((m) => {
      const row = data.values[idxMap[m]];
      return formattedDates.map((d) => {
        const idx = data.dates.findIndex((date) => date.slice(5, 10).replace("-", "/") === d);
        return idx >= 0 ? row[idx] : 0;
      });
    });

    return { machines, dates: formattedDates, values };
  }, [data, filters, range]);

  if (loading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress size={80} />
      </Box>
    );

  if (err) return <Alert severity="error">{err}</Alert>;
  if (!filtered) return <Alert severity="warning">No data available.</Alert>;

  const maxValue = Math.max(...filtered.values.flat(), 1);

  return (
    <Box
      sx={{
        bgcolor: "#f8fafc",
        minHeight: "100vh",
        px: 3,
        pt: 2,
        width: "100vw",
        maxWidth: "100%",
      }}
    >
      <Box sx={{ maxWidth: 1600, mx: "auto" }}>

        {/* =====================================================
            TITLE + FILTERS BUTTON (MATCHES ALL OTHER PAGES)
        ===================================================== */}
        <Box sx={{ position: "relative", mb: 2, mt: 1 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              textAlign: "center",
            }}
          >
            Machine Utilization Heatmap
          </Typography>

          {/* FILTER BUTTON — top right */}
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
              Filters
            </Button>
          )}

          {/* Subtitle */}
          <Typography
            variant="subtitle1"
            sx={{
              textAlign: "center",
              color: "#64748b",
              mt: 1,
            }}
          >
            Scenario: <strong style={{ color: "#3b82f6" }}>{scenario || "—"}</strong>
          </Typography>
        </Box>

        {/* =====================================================
            CARD + CONTROLS
        ===================================================== */}
        <Card sx={{ borderRadius: 4 }}>
          <CardContent sx={{ p: { xs: 2, md: 4 } }}>

            {/* HEADER CONTROLS */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems="center"
              spacing={2}
              mb={4}
            >
              <Select
                value={scenario || ""}
                onChange={(e) => setScenario(e.target.value)}
                sx={{ minWidth: 260, bgcolor: "white" }}
              >
                <MenuItem value="" disabled>
                  <em>Select scenario</em>
                </MenuItem>
                {scenarioList.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>

              <Stack direction="row" spacing={2} alignItems="center">
                <ToggleButtonGroup
                  value={mode}
                  exclusive
                  onChange={(e, v) => v && setMode(v)}
                  size="small"
                >
                  <ToggleButton value="hours">Hours</ToggleButton>
                  <ToggleButton value="pct">% Load</ToggleButton>
                </ToggleButtonGroup>

                {!filters.dateStart && !filters.dateEnd && (
                  <ToggleButtonGroup
                    value={range}
                    exclusive
                    onChange={(e, v) => v && setRange(v)}
                    size="small"
                  >
                    <ToggleButton value="full">Full</ToggleButton>
                    <ToggleButton value="7">7 Days</ToggleButton>
                    <ToggleButton value="30">30 Days</ToggleButton>
                  </ToggleButtonGroup>
                )}

                <Stack direction="row" spacing={1}>
                  <IconButton onClick={() => setZoom((z) => Math.max(0.6, z - 0.1))}>
                    <ZoomOut />
                  </IconButton>
                  <IconButton onClick={() => setZoom(1)}>
                    <FitScreen />
                  </IconButton>
                  <IconButton onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}>
                    <ZoomIn />
                  </IconButton>
                </Stack>
              </Stack>
            </Stack>

            {/* =====================================================
                HEATMAP GRID
            ===================================================== */}
            <Box
              sx={{
                position: "relative",
                width: "100%",
                overflowX: "auto",
                overflowY: "hidden",
                border: "1px solid #e2e8f0",
                borderRadius: 2,
              }}
            >
              <Box sx={{ display: "inline-block" }}>
                <Box
                  sx={{
                    transform: `scale(${zoom})`,
                    transformOrigin: "top left",
                    transition: "transform 0.25s ease",
                  }}
                >
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: `160px repeat(${filtered.dates.length}, 70px)`,
                      gap: "1px",
                      backgroundColor: "#e2e8f0",
                    }}
                  >
                    {/* Header Row */}
                    <Box
                      sx={{
                        bgcolor: "white",
                        p: 2,
                        fontWeight: 700,
                        position: "sticky",
                        left: 0,
                        zIndex: 10,
                      }}
                    >
                      Machine
                    </Box>

                    {filtered.dates.map((d) => (
                      <Box
                        key={d}
                        sx={{
                          bgcolor: "white",
                          p: 1,
                          textAlign: "center",
                          fontWeight: 600,
                        }}
                      >
                        {d}
                      </Box>
                    ))}

                    {/* Rows */}
                    {filtered.machines.map((m, i) => {
                      const row = filtered.values[i];
                      const rowMax = Math.max(...row);

                      return (
                        <React.Fragment key={m}>
                          <Box
                            sx={{
                              bgcolor: "white",
                              p: 2,
                              fontWeight: 600,
                              position: "sticky",
                              left: 0,
                              zIndex: 9,
                              borderRight: "2px solid #cbd5e1",
                            }}
                          >
                            {m}
                          </Box>

                          {row.map((v, j) => {
                            const pct = rowMax === 0 ? 0 : (v / rowMax) * 100;
                            const intensity = Math.floor(255 - pct * 2.55);
                            const bg = `rgb(255, ${intensity}, ${intensity})`;

                            return (
                              <Box
                                key={j}
                                sx={{
                                  bgcolor: bg,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: v > maxValue * 0.6 ? "white" : "#1e293b",
                                  fontWeight: 600,
                                  minHeight: 48,
                                }}
                              >
                                {v > 0
                                  ? mode === "hours"
                                    ? v.toFixed(1)
                                    : `${pct.toFixed(0)}%`
                                  : ""}
                              </Box>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* =====================================================
                LEGEND
            ===================================================== */}
            <Stack
              direction="row"
              spacing={3}
              mt={4}
              justifyContent="center"
              flexWrap="wrap"
            >
              {[0, 25, 50, 75, 100].map((p) => (
                <Box key={p} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      bgcolor: `rgb(255, ${Math.floor(
                        255 - p * 2.55
                      )}, ${Math.floor(255 - p * 2.55)})`,
                      border: "1px solid #94a3b8",
                    }}
                  />
                  <Typography variant="body2">{p}%</Typography>
                </Box>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

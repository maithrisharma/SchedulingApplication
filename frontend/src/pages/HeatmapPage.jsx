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
  Stack,
  IconButton,
  Button,
} from "@mui/material";

import { ZoomIn, ZoomOut, FitScreen, FilterList } from "@mui/icons-material";

import { useScenario } from "../context/ScenarioContext";
import { useGlobalFilters } from "../context/GlobalFiltersContext";
import { apiGet } from "../api";

import PageLayout from "../components/PageLayout";

const ALL_SENTINEL = "__ALL__";

export default function HeatmapPage({ onOpenFilters }) {
  const { scenario } = useScenario();
  const { filters } = useGlobalFilters();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [mode, setMode] = useState("hours");
  const [range, setRange] = useState("full");
  const [zoom, setZoom] = useState(1);

  // Heatmap-Daten laden
  useEffect(() => {
    if (!scenario) return;
    setLoading(true);
    setErr("");

    apiGet(`/visualize/${scenario}/heatmap`)
      .then((res) => {
        setData(res);
      })
      .catch(() => {
        setErr("Heatmap-Daten konnten nicht geladen werden.");
      })
      .finally(() => setLoading(false));
  }, [scenario]);

  // Filter anwenden
  const filtered = useMemo(() => {
    if (!data || !data.machines) return null;

    let machines = [...data.machines];

    // Maschinenfilter
    if (filters.machines.length === 0) {
      machines = data.top10_machines ?? machines.slice(0, 15);
    } else if (filters.machines[0] !== ALL_SENTINEL) {
      machines = filters.machines;
    }

    // Datumsfilter
    let dates = data.dates.map((d) => new Date(d));
    if (filters.dateStart) dates = dates.filter((d) => d >= new Date(filters.dateStart));
    if (filters.dateEnd) dates = dates.filter((d) => d <= new Date(filters.dateEnd));

    // Range nur anwenden, wenn kein Datumsfilter aktiv ist
    if (!filters.dateStart && !filters.dateEnd) {
      if (range === "7") dates = dates.slice(-7);
      if (range === "30") dates = dates.slice(-30);
    }

    const formattedDates = dates.map((d) => d.toISOString().slice(5, 10).replace("-", "/"));
    const idxMap = Object.fromEntries(data.machines.map((m, i) => [m, i]));

    const values = machines.map((m) => {
      const row = data.values[idxMap[m]];
      return formattedDates.map((d) => {
        const idx = data.dates.findIndex(
          (date) => date.slice(5, 10).replace("-", "/") === d
        );
        return idx >= 0 ? row[idx] : 0;
      });
    });

    return { machines, dates: formattedDates, values };
  }, [data, filters, range]);

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress size={80} />
      </Box>
    );
  }

  if (err) return <Alert severity="error" sx={{ m: 3 }}>{err}</Alert>;
  if (!filtered) return <Alert severity="warning" sx={{ m: 3 }}>Keine Daten verfügbar.</Alert>;

  const maxValue = Math.max(...filtered.values.flat(), 1);

  return (
    <PageLayout
      title="Maschinen-Auslastungs-Heatmap"
      maxWidth={1600}
      headerRight={
        onOpenFilters ? (
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
        ) : null
      }
    >
      <Card sx={{ borderRadius: 4 }}>
        <CardContent sx={{ p: { xs: 2, md: 4 } }}>
          {/* ✅ Controls row aligned to the RIGHT (like actions in Gantt) */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1.25,
              mb: 3,
            }}
          >
            <ToggleButtonGroup
              value={mode}
              exclusive
              onChange={(e, v) => v && setMode(v)}
              size="small"
            >
              <ToggleButton value="hours">Stunden</ToggleButton>
              <ToggleButton value="pct">% Auslastung</ToggleButton>
            </ToggleButtonGroup>

            {!filters.dateStart && !filters.dateEnd && (
              <ToggleButtonGroup
                value={range}
                exclusive
                onChange={(e, v) => v && setRange(v)}
                size="small"
              >
                <ToggleButton value="full">Gesamt</ToggleButton>
                <ToggleButton value="7">7 Tage</ToggleButton>
                <ToggleButton value="30">30 Tage</ToggleButton>
              </ToggleButtonGroup>
            )}

            <Stack direction="row" spacing={0.5}>
              <IconButton
                size="small"
                onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}
              >
                <ZoomOut fontSize="small" />
              </IconButton>

              <IconButton size="small" onClick={() => setZoom(1)}>
                <FitScreen fontSize="small" />
              </IconButton>

              <IconButton
                size="small"
                onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
              >
                <ZoomIn fontSize="small" />
              </IconButton>
            </Stack>
          </Box>

          {/* Heatmap */}
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
                  {/* Kopfzeile */}
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
                    Maschine
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

                  {/* Jede Maschinenzeile */}
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
                            whiteSpace: "nowrap",
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

          {/* Legende */}
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
                    bgcolor: `rgb(255, ${Math.floor(255 - p * 2.55)}, ${Math.floor(
                      255 - p * 2.55
                    )})`,
                    border: "1px solid #94a3b8",
                  }}
                />
                <Typography variant="body2">{p}%</Typography>
              </Box>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </PageLayout>
  );
}

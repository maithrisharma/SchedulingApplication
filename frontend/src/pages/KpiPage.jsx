// --- SAME IMPORTS, DO NOT MODIFY ---
import { useEffect, useState } from "react";
import {
  Box,
  Grid,
  Card,
  Typography,
  CircularProgress,
  Alert,
  Chip,
} from "@mui/material";
import {
  CheckCircle,
  Error,
  Schedule,
  TrendingUp,
  AccessTimeFilled,
  Warning,
} from "@mui/icons-material";
import { useScenario } from "../context/ScenarioContext";
import { apiGet } from "../api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6"];

export default function KpiPage() {
  const { scenario } = useScenario();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    async function load() {
      if (!scenario) return;
      try {
        setLoading(true);
        const res = await apiGet(`/visualize/${scenario}/kpis`);
        if (!res.ok) throw new Error(res.error || "Fehler beim Laden der KPIs");
        setData(res);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scenario]);

  if (!scenario)
    return (
      <Alert severity="info" sx={{ m: 4 }}>
        Bitte ein Szenario auswählen
      </Alert>
    );

  if (loading)
    return (
      <Box sx={{ textAlign: "center", pt: 10 }}>
        <CircularProgress size={60} />
      </Box>
    );

  if (err)
    return (
      <Alert severity="error" sx={{ m: 4 }}>
        {err}
      </Alert>
    );

  if (!data) return null;

  const cards = [
    { label: "Geplant", value: data.summary_cards.scheduled_jobs, icon: <Schedule />, color: "#3b82f6" },
    { label: "Verspätet (kritisch)", value: data.summary_cards.late_jobs_beyond_grace, icon: <Error />, color: "#ef4444", critical: true },
    { label: "Nicht eingeplant", value: data.summary_cards.unplaced_jobs, icon: <Warning />, color: "#dc2626" },
    { label: "% Bereits verspätet", value: `${data.summary_cards.pct_ops_already_late_pre}%`, icon: <AccessTimeFilled />, color: "#f97316" },
    { label: "% Rechtzeitig", value: `${data.order_kpis[0]?.value || 0}%`, icon: <TrendingUp />, color: "#10b981" },
    { label: "Gerettet (%)", value: `${data.summary_cards.saved_pct}%`, icon: <CheckCircle />, color: "#8b5cf6" },
  ];

  return (
    <Box sx={{ bgcolor: "#f8fafc", minHeight: "100vh", py: { xs: 3, md: 4 }, px: { xs: 2, md: 3 } }}>
      <Box sx={{ maxWidth: 1600, mx: "auto" }}>

        {/* PAGE HEADER */}
        <Box sx={{ textAlign: "center", mb: 5 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a" }}>
            KPI-Dashboard
          </Typography>
          <Typography variant="h6" sx={{ color: "#64748b", mt: 1 }}>
            Szenario: <strong style={{ color: "#3b82f6" }}>{scenario}</strong>
          </Typography>
        </Box>

        {/* KPI CARDS — FIXED 180px WIDTH */}
        <Grid container spacing={3} justifyContent="center" sx={{ mb: 6 }}>
          {cards.map((c, i) => (
            <Grid item xs={12} sm={6} md={4} lg={2} key={i} display="flex" justifyContent="center">
              <Card
                sx={{
                  width: 180,
                  minWidth: 180,
                  maxWidth: 180,   // <---- FIX APPLIED
                  height: 210,
                  borderRadius: 4,
                  boxShadow: "0 14px 28px rgba(0,0,0,0.06)",
                  p: 2,
                  bgcolor: "white",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Box sx={{ color: c.color, fontSize: 44, mt: 1 }}>
                  {c.icon}
                </Box>

                <Typography
                  sx={{
                    color: "#475569",
                    fontWeight: 700,
                    fontSize: 14,
                    textAlign: "center",
                    minHeight: 38,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    px: 1,
                  }}
                >
                  {c.label}
                </Typography>

                <Typography variant="h5" sx={{ fontWeight: 900, color: "#0f172a" }}>
                  {c.value}
                </Typography>

                <Box sx={{ height: 28, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {c.critical ? (
                    <Chip
                      label="KRITISCH"
                      size="small"
                      sx={{
                        bgcolor: "#fee2e2",
                        color: "#991b1b",
                        fontWeight: 700,
                        height: 24,
                        px: 1,
                      }}
                    />
                  ) : (
                    <Box sx={{ height: 24 }} />
                  )}
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* CHARTS */}
        <Grid container spacing={4} alignItems="stretch" justifyContent="center" sx={{ mb: 8 }}>
          <Grid item xs={12} md={6} sx={{ minWidth: 500 }}>
            <ChartCard title="Arbeitsvorgang-KPIs">
              <Box sx={{ height: 360 }}>
                <LargeChart data={data.ops_kpis} color="#3b82f6" height={340} />
              </Box>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={6} sx={{ minWidth: 500 }}>
            <ChartCard title="Auftrags-KPIs">
              <Box sx={{ height: 360 }}>
                <LargeChart data={data.order_kpis} color="#10b981" height={340} />
              </Box>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={8} sx={{ minWidth: 600 }}>
            <ChartCard title="Kennzahlen vor der Planung">
              <Box sx={{ height: 400 }}>
                <LargeChart data={data.pre_kpis} color="#8b5cf6" height={380} />
              </Box>
            </ChartCard>
          </Grid>

          <Grid item xs={12} md={4} sx={{ minWidth: 420 }}>
            <ChartCard title="Auslastung & Verzögerung">
              <Box sx={{ height: 400 }}>
                <BigDonut util={data.utilization} size={160} />
              </Box>
            </ChartCard>
          </Grid>
        </Grid>

        {/* SCHEDULE HORIZON */}
        <Box sx={{ mt: 8, textAlign: "center" }}>
          <Card sx={{ borderRadius: 4, p: 3, boxShadow: "0 14px 28px rgba(0,0,0,0.08)", maxWidth: 600, mx: "auto" }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>Planungshorizont</Typography>
            <Typography>Erstes Startdatum: {data.time_window.first_start_raw}</Typography>
            <Typography sx={{ mt: 1 }}>Letztes Enddatum: {data.time_window.last_end_raw}</Typography>
          </Card>
        </Box>

      </Box>
    </Box>
  );
}

/* ===================================================================== */
/* COMPONENTS */
/* ===================================================================== */

function ChartCard({ title, children }) {
  return (
    <Card sx={{ borderRadius: 4, boxShadow: "0 16px 32px rgba(0,0,0,0.05)", bgcolor: "white", height: "100%", p: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 800, mb: 2, color: "#0f172a" }}>
        {title}
      </Typography>
      {children}
    </Card>
  );
}

function LargeChart({ data, color, height }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 5, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="label" angle={-40} textAnchor="end" height={60} tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="value" fill={color} radius={8} barSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function BigDonut({ util, size }) {
  const real = util.real_minutes || 0;
  const delay = util.delay_minutes_real || 0;
  const slack = Math.max((util.industrial_minutes || 0) - real - delay, 0);
  const total = real + delay + slack || 1;

  const chartData = [
    { name: "Produktiv", value: real },
    { name: "Verzögerung", value: delay },
    { name: "Puffer", value: slack },
  ].filter((d) => d.value > 0);

  return (
    <Box sx={{ height: size * 2, position: "relative" }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={chartData}
            innerRadius={size - 45}
            outerRadius={size}
            paddingAngle={3}
            dataKey="value"
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} stroke="white" strokeWidth={3} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <Box
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
        }}
      >
        <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a" }}>
          {((real / total) * 100).toFixed(1)}%
        </Typography>
        <Typography sx={{ color: "#64748b", fontSize: 14 }}>
          Auslastung
        </Typography>
      </Box>
    </Box>
  );
}

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

import PageLayout from "../components/PageLayout";

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
    {
      label: "Geplant",
      value: data.summary_cards.scheduled_jobs,
      icon: <Schedule />,
      color: "#3b82f6",
    },
    {
      label: "Verspätet (kritisch)",
      value: data.summary_cards.late_jobs_beyond_grace,
      icon: <Error />,
      color: "#ef4444",
      critical: true,
    },
    {
      label: "Nicht eingeplant",
      value: data.summary_cards.unplaced_jobs,
      icon: <Warning />,
      color: "#dc2626",
    },
    {
      label: "% Bereits verspätet",
      value: `${data.summary_cards.pct_ops_already_late_pre}%`,
      icon: <AccessTimeFilled />,
      color: "#f97316",
    },
    {
      label: "% Rechtzeitig",
      value: `${data.order_kpis[0]?.value || 0}%`,
      icon: <TrendingUp />,
      color: "#10b981",
    },
    {
      label: "Gerettet (%)",
      value: `${data.summary_cards.saved_pct}%`,
      icon: <CheckCircle />,
      color: "#8b5cf6",
    },
  ];

  return (
    <PageLayout title="KPI-Dashboard" maxWidth={1600}>
      {/* KPI CARDS */}
      <Grid container spacing={3} justifyContent="center" sx={{ mb: { xs: 4, md: 6 } }}>
        {cards.map((c, i) => (
          <Grid
            item
            xs={12}
            sm={6}
            md={4}
            lg={2}
            key={i}
            display="flex"
            justifyContent="center"
          >
            <Card
              sx={{
                width: 180,
                minWidth: 180,
                maxWidth: 180,
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
              <Box sx={{ color: c.color, fontSize: 44, mt: 1 }}>{c.icon}</Box>

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

              <Box
                sx={{
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
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

      {/* CHARTS
          ✅ 2 per row starting at md (Inspiron will usually hit md+)
          ✅ No forced minWidth (prevents "4 in a row / squished / overflow")
          ✅ Responsive heights to avoid unreadable charts
      */}
      <Grid
  container
  spacing={{ xs: 2.5, md: 4 }}
  alignItems="stretch"
  sx={{
    mb: { xs: 5, md: 8 },
    display: "flex",
    flexDirection: "column",
  }}
>
        <Grid item xs={12} md={6}>
          <ChartCard title="Arbeitsvorgang-KPIs">
            <Box sx={{ height: { xs: 320, sm: 340, md: 360 } }}>
              <LargeChart data={data.ops_kpis} color="#3b82f6" />
            </Box>
          </ChartCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartCard title="Auftrags-KPIs">
            <Box sx={{ height: { xs: 320, sm: 340, md: 360 } }}>
              <LargeChart data={data.order_kpis} color="#10b981" />
            </Box>
          </ChartCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartCard title="Kennzahlen vor der Planung">
            <Box sx={{ height: { xs: 340, sm: 370, md: 400 } }}>
              <LargeChart data={data.pre_kpis} color="#8b5cf6" />
            </Box>
          </ChartCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <ChartCard title="Auslastung & Verzögerung">
            <Box
              sx={{
                height: { xs: 340, sm: 370, md: 400 },
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BigDonut util={data.utilization} size={160} />
            </Box>
          </ChartCard>
        </Grid>
      </Grid>

      {/* SCHEDULE HORIZON */}
      <Box sx={{ mt: { xs: 2, md: 4 }, textAlign: "center" }}>
        <Card
          sx={{
            borderRadius: 4,
            p: 3,
            boxShadow: "0 14px 28px rgba(0,0,0,0.08)",
            maxWidth: 600,
            mx: "auto",
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 2 }}>
            Planungshorizon
          </Typography>
          <Typography>Erstes Startdatum: {data.time_window.first_start_raw}</Typography>
          <Typography sx={{ mt: 1 }}>Letztes Enddatum: {data.time_window.last_end_raw}</Typography>
        </Card>
      </Box>
    </PageLayout>
  );
}

/* ===================================================================== */
/* COMPONENTS */
/* ===================================================================== */

function ChartCard({ title, children }) {
  return (
    <Card
      sx={{
        borderRadius: 4,
        boxShadow: "0 16px 32px rgba(0,0,0,0.05)",
        bgcolor: "white",
        height: "100%",
        p: { xs: 2, md: 3 }, // ✅ slight padding shrink on small screens
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 800,
          mb: 2,
          color: "#0f172a",
          // ✅ keeps headings consistent on smaller screens
          fontSize: "clamp(1.0rem, 0.95rem + 0.35vw, 1.25rem)",
        }}
      >
        {title}
      </Typography>
      {children}
    </Card>
  );
}

function LargeChart({ data, color }) {
  // ✅ Avoid unreadable axes: rotate only when many labels exist
  const manyLabels = (data?.length || 0) > 8;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        margin={{
          top: 8,
          right: 18,
          left: 6,
          bottom: manyLabels ? 70 : 40,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="label"
          interval={0}
          angle={manyLabels ? -35 : 0}
          textAnchor={manyLabels ? "end" : "middle"}
          height={manyLabels ? 70 : 40}
          tick={{ fontSize: 12 }}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip />

        {/* ✅ responsive-ish bar sizing: avoid "fat bars" in small width */}
        <Bar
          dataKey="value"
          fill={color}
          radius={8}
          maxBarSize={42}
        />
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
    <Box sx={{ height: size * 2, width: "100%", maxWidth: size * 2.2, position: "relative" }}>
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
          width: "80%",
        }}
      >
        <Typography
          sx={{
            fontWeight: 900,
            color: "#0f172a",
            fontSize: "clamp(1.4rem, 1.1rem + 1.2vw, 2.1rem)",
            lineHeight: 1.1,
          }}
        >
          {((real / total) * 100).toFixed(1)}%
        </Typography>
        <Typography sx={{ color: "#64748b", fontSize: 14 }}>Auslastung</Typography>
      </Box>
    </Box>
  );
}

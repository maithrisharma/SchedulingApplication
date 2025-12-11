// src/pages/kpis/KpiLateOpsPage.jsx

import { useEffect, useState } from "react";
import {
  Box,
  Card,
  Typography,
  CircularProgress,
  Alert,
} from "@mui/material";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useScenario } from "../context/ScenarioContext";
import { apiGet } from "../api";

export default function KpiLateOpsPage() {
  const { scenario } = useScenario();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!scenario) return;

    async function load() {
      try {
        setLoading(true);
        const res = await apiGet(`/visualize/${scenario}/kpis`);
        if (!res.ok) throw new Error(res.error || "Fehler beim Laden");

        setData(res.late_buckets || []);
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
        Bitte zuerst ein Szenario auswählen
      </Alert>
    );

  if (loading)
    return (
      <Box sx={{ textAlign: "center", pt: 10 }}>
        <CircularProgress size={80} />
      </Box>
    );

  if (err) return <Alert severity="error" sx={{ m: 4 }}>{err}</Alert>;
  if (!data) return null;

  return (
    <Box
      sx={{
        backgroundColor: "#f8fafc",
        minHeight: "100vh",
        p: { xs: 2, md: 4 },
      }}
    >
      {/* TITLE SECTION — MATCHING KPI SUMMARY PAGE */}
      <Box sx={{ textAlign: "center", mb: 4 }}>
        <Typography
          variant="h4"
          fontWeight={900}
          sx={{
            fontSize: { xs: "1.9rem", md: "2.3rem" },
            mb: 1,
          }}
        >
          Verspätete Arbeitsvorgänge
        </Typography>

        <Typography
          variant="subtitle1"
          sx={{
            color: "#64748b",
            fontSize: { xs: "1rem", md: "1.15rem" },
          }}
        >
          Szenario:{" "}
          <strong style={{ color: "#2563eb" }}>{scenario}</strong>
        </Typography>
      </Box>

      {/* CHART CARD — CONSISTENT SHADOW + RADIUS */}
      <Card
        sx={{
          maxWidth: 1400,
          mx: "auto",
          p: { xs: 3, md: 4 },
          borderRadius: 4,
          boxShadow: "0 12px 28px rgba(0,0,0,0.05)",
          bgcolor: "white",
        }}
      >
        <Typography
          variant="h5"
          fontWeight={800}
          sx={{
            mb: 3,
            color: "#1e293b",
            fontSize: { xs: "1.3rem", md: "1.6rem" },
          }}
        >
          Verteilung nach Tagen verspätet
        </Typography>

        <Box sx={{ height: { xs: 280, md: 360 } }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 20, left: 10, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

              <XAxis
                dataKey="label"
                angle={-35}
                textAnchor="end"
                height={50}
                tick={{ fontSize: 13 }}
              />

              <YAxis tick={{ fontSize: 13 }} />

              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "none",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
                }}
              />

              <Bar
                dataKey="value"
                fill="#6366f1"
                radius={6}
                barSize={42}
              />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Card>
    </Box>
  );
}

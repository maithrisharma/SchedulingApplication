// src/pages/kpis/KpiLateOpsPage.jsx
// (same logic, just made layout + typography consistent with PageLayout / ScenarioListPage)

import { useEffect, useState } from "react";
import { Box, Card, Typography, CircularProgress, Alert } from "@mui/material";

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

import PageLayout from "../components/PageLayout";

export default function KpiLateOpsPage() {
  const { scenario } = useScenario();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!scenario) return;

    async function load() {
      try {
        setErr("");
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

  if (err)
    return (
      <Alert severity="error" sx={{ m: 4 }}>
        {err}
      </Alert>
    );

  if (!data) return null;

  return (
    <PageLayout
      title="Verspätete Arbeitsvorgänge"
      subtitle="Verteilung nach Tagen verspätet"
      maxWidth={1400}
    >
      <Card
        sx={{
          borderRadius: 4,
          boxShadow: "0 12px 28px rgba(0,0,0,0.05)",
          bgcolor: "white",
          p: { xs: 2.5, md: 3.5 },
        }}
      >


        <Box sx={{ height: { xs: 300, sm: 340, md: 380 } }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 10, right: 20, left: 10, bottom: 48 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

              <XAxis
                dataKey="label"
                interval={0}
                angle={-35}
                textAnchor="end"
                height={60}
                tick={{ fontSize: 12 }}
              />

              <YAxis tick={{ fontSize: 12 }} />

              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 10px 25px rgba(2,6,23,0.12)",
                }}
              />

              <Bar
                dataKey="value"
                fill="#6366f1"
                radius={6}
                maxBarSize={42}
              />
            </BarChart>
          </ResponsiveContainer>
        </Box>
      </Card>
    </PageLayout>
  );
}

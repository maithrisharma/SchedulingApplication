// src/pages/KpiLogAssistantPage.jsx
// (same UI/colors/cards — only made layout + typography consistent with PageLayout/ScenarioListPage)

import { useEffect, useState } from "react";
import {
  Box,
  Card,
  Typography,
  CircularProgress,
  Alert,
  Stack,
  Chip,
  Divider,
} from "@mui/material";

import {
  ErrorOutline,
  WarningAmber,
  CheckCircleOutline,
  Article,
} from "@mui/icons-material";

import { useScenario } from "../context/ScenarioContext";
import { apiGet } from "../api";

import PageLayout from "../components/PageLayout";

export default function KpiLogAssistantPage() {
  const { scenario } = useScenario();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!scenario) return;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const res = await apiGet(`/visualize/${scenario}/log-assistant`);
        if (!res.ok)
          throw new Error(res.error || "Fehler beim Laden des Log-Assistenten");

        setData(res);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [scenario]);

  if (!scenario) {
    return (
      <Alert severity="info" sx={{ m: 4 }}>
        Bitte zuerst ein Szenario auswählen.
      </Alert>
    );
  }

  if (loading) {
    return (
      <Box sx={{ textAlign: "center", pt: 10 }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  if (err) {
    return (
      <Alert severity="error" sx={{ m: 4 }}>
        {err}
      </Alert>
    );
  }

  if (!data) return null;

  const { critical = [], warnings = [], passed = [] } = data;

  const nothingToReport =
    critical.length === 0 && warnings.length === 0 && passed.length === 0;

  return (
    <PageLayout
      title="Log-Assistent"

      maxWidth={1200}
    >
      {nothingToReport && (
        <Card
          sx={{
            borderRadius: 4,
            p: { xs: 2.5, md: 3 },
            boxShadow: "0 16px 32px rgba(0,0,0,0.05)",
            bgcolor: "white",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <CheckCircleOutline sx={{ fontSize: 36, color: "#16a34a" }} />
            <Box>
              <Typography
                sx={{
                  fontWeight: 850,
                  color: "#0f172a",
                  fontSize: "clamp(1.0rem, 0.95rem + 0.35vw, 1.25rem)",
                }}
              >
                Keine Auffälligkeiten gefunden
              </Typography>
              <Typography sx={{ color: "#64748b", mt: 0.5 }}>
                Der Scheduler-Lauf hat keine technischen Warnungen oder kritischen
                Probleme gemeldet.
              </Typography>
            </Box>
          </Stack>
        </Card>
      )}

      {!nothingToReport && (
        <Stack spacing={{ xs: 2.5, md: 4 }}>
          {/* CRITICAL */}
          {critical.length > 0 && (
            <Card
              sx={{
                borderRadius: 4,
                p: { xs: 2.5, md: 3 },
                bgcolor: "white",
                borderLeft: "6px solid #ef4444",
                boxShadow: "0 18px 36px rgba(248,113,113,0.18)",
              }}
            >
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <ErrorOutline sx={{ fontSize: 36, color: "#b91c1c" }} />
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 850,
                      color: "#0f172a",
                      fontSize: "clamp(1.0rem, 0.95rem + 0.35vw, 1.25rem)",
                    }}
                  >
                    Kritische Probleme
                  </Typography>
                  <Typography sx={{ color: "#64748b", mt: 0.5 }}>
                    Probleme, die die Planung oder Datenqualität direkt beeinträchtigen.
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ mb: 2 }} />

              <Stack spacing={1.5}>
                {critical.map((msg, i) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                    <Chip
                      size="small"
                      label="Kritisch"
                      sx={{
                        bgcolor: "#fee2e2",
                        color: "#b91c1c",
                        fontWeight: 800,
                        height: 22,
                        mt: "2px",
                      }}
                    />
                    <Typography sx={{ color: "#0f172a" }}>{msg}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Card>
          )}

          {/* WARNINGS */}
          {warnings.length > 0 && (
            <Card
              sx={{
                borderRadius: 4,
                p: { xs: 2.5, md: 3 },
                bgcolor: "white",
                borderLeft: "6px solid #f59e0b",
                boxShadow: "0 18px 36px rgba(251,191,36,0.18)",
              }}
            >
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <WarningAmber sx={{ fontSize: 36, color: "#b45309" }} />
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 850,
                      color: "#0f172a",
                      fontSize: "clamp(1.0rem, 0.95rem + 0.35vw, 1.25rem)",
                    }}
                  >
                    Warnungen
                  </Typography>
                  <Typography sx={{ color: "#64748b", mt: 0.5 }}>
                    Hinweise zur Datenqualität – nicht kritisch, aber relevant.
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ mb: 2 }} />

              <Stack spacing={1.5}>
                {warnings.map((msg, i) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                    <Chip
                      size="small"
                      label="Hinweis"
                      sx={{
                        bgcolor: "#fffbeb",
                        color: "#92400e",
                        fontWeight: 800,
                        height: 22,
                        mt: "2px",
                      }}
                    />
                    <Typography sx={{ color: "#0f172a" }}>{msg}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Card>
          )}

          {/* PASSED */}
          {passed.length > 0 && (
            <Card
              sx={{
                borderRadius: 4,
                p: { xs: 2.5, md: 3 },
                bgcolor: "white",
                borderLeft: "6px solid #22c55e",
                boxShadow: "0 18px 36px rgba(34,197,94,0.16)",
              }}
            >
              <Stack
                direction="row"
                spacing={2}
                alignItems="center"
                sx={{ mb: 2 }}
              >
                <CheckCircleOutline sx={{ fontSize: 36, color: "#16a34a" }} />
                <Box>
                  <Typography
                    sx={{
                      fontWeight: 850,
                      color: "#0f172a",
                      fontSize: "clamp(1.0rem, 0.95rem + 0.35vw, 1.25rem)",
                    }}
                  >
                    Bestätigte Checks
                  </Typography>
                  <Typography sx={{ color: "#64748b", mt: 0.5 }}>
                    Automatische Prüfungen, die erfolgreich bestanden wurden.
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ mb: 2 }} />

              <Stack spacing={1.5}>
                {passed.map((msg, i) => (
                  <Stack key={i} direction="row" spacing={1.5} alignItems="flex-start">
                    <Article sx={{ color: "#16a34a", mt: "2px" }} />
                    <Typography sx={{ color: "#0f172a" }}>{msg}</Typography>
                  </Stack>
                ))}
              </Stack>
            </Card>
          )}
        </Stack>
      )}
    </PageLayout>
  );
}

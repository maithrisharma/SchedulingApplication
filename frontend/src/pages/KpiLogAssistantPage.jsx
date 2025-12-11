// src/pages/KpiLogAssistantPage.jsx

import { useEffect, useState } from "react";
import {
  Box,
  Card,
  Typography,
  CircularProgress,
  Alert,
  Stack,
  Chip,
  Divider
} from "@mui/material";

import {
  ErrorOutline,
  WarningAmber,
  CheckCircleOutline,
  Article
} from "@mui/icons-material";

import { useScenario } from "../context/ScenarioContext";
import { apiGet } from "../api";

export default function KpiLogAssistantPage() {
  const { scenario } = useScenario();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // -----------------------------------------------------
  // Load Log Assistant Data
  // -----------------------------------------------------
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

  // -----------------------------------------------------
  // NO SCENARIO SELECTED
  // -----------------------------------------------------
  if (!scenario) {
    return (
      <Alert severity="info" sx={{ m: 4 }}>
        Bitte zuerst ein Szenario auswählen.
      </Alert>
    );
  }

  // -----------------------------------------------------
  // LOADING
  // -----------------------------------------------------
  if (loading) {
    return (
      <Box sx={{ textAlign: "center", pt: 10 }}>
        <CircularProgress size={60} />
      </Box>
    );
  }

  // -----------------------------------------------------
  // ERROR
  // -----------------------------------------------------
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

  // -----------------------------------------------------
  // UI START
  // -----------------------------------------------------
  return (
    <Box
      sx={{
        bgcolor: "#f8fafc",
        minHeight: "100vh",
        py: { xs: 3, md: 4 },
        px: { xs: 2, md: 3 }
      }}
    >
      <Box sx={{ maxWidth: 1200, mx: "auto" }}>
        {/* ================================================
              CENTERED KPI HEADER (Matches KPI Summary Page)
        ================================================= */}
        <Box sx={{ textAlign: "center", mb: 6 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 900,
              color: "#0f172a",
              fontSize: { xs: "1.9rem", md: "2.3rem" }
            }}
          >
            Log-Assistent
          </Typography>

          <Typography
            variant="subtitle1"
            sx={{
              mt: 1,
              color: "#64748b",
              fontSize: { xs: "1rem", md: "1.15rem" }
            }}
          >
            Szenario:&nbsp;
            <strong style={{ color: "#2563eb" }}>{scenario}</strong>
          </Typography>
        </Box>

        {/* ================================================
              NOTHING TO REPORT
        ================================================= */}
        {nothingToReport && (
          <Card
            sx={{
              borderRadius: 4,
              p: 3,
              boxShadow: "0 16px 32px rgba(0,0,0,0.05)",
              bgcolor: "white"
            }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <CheckCircleOutline sx={{ fontSize: 36, color: "#16a34a" }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  Keine Auffälligkeiten gefunden
                </Typography>
                <Typography sx={{ color: "#64748b", mt: 0.5 }}>
                  Der Scheduler-Lauf hat keine technischen Warnungen oder
                  kritischen Probleme gemeldet.
                </Typography>
              </Box>
            </Stack>
          </Card>
        )}

        {/* ================================================
              REPORT CARDS
        ================================================= */}
        {!nothingToReport && (
          <Stack spacing={4}>
            {/* -----------------------------------------------------
                      CRITICAL ERRORS
            ------------------------------------------------------ */}
            {critical.length > 0 && (
              <Card
                sx={{
                  borderRadius: 4,
                  p: 3,
                  bgcolor: "white",
                  borderLeft: "6px solid #ef4444",
                  boxShadow: "0 18px 36px rgba(248,113,113,0.18)"
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <ErrorOutline sx={{ fontSize: 36, color: "#b91c1c" }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
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
                    <Stack key={i} direction="row" spacing={1.5}>
                      <Chip
                        size="small"
                        label="Kritisch"
                        sx={{
                          bgcolor: "#fee2e2",
                          color: "#b91c1c",
                          fontWeight: 700,
                          height: 22
                        }}
                      />
                      <Typography sx={{ color: "#0f172a" }}>{msg}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Card>
            )}

            {/* -----------------------------------------------------
                      WARNINGS
            ------------------------------------------------------ */}
            {warnings.length > 0 && (
              <Card
                sx={{
                  borderRadius: 4,
                  p: 3,
                  bgcolor: "white",
                  borderLeft: "6px solid #f59e0b",
                  boxShadow: "0 18px 36px rgba(251,191,36,0.18)"
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <WarningAmber sx={{ fontSize: 36, color: "#b45309" }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
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
                    <Stack key={i} direction="row" spacing={1.5}>
                      <Chip
                        size="small"
                        label="Hinweis"
                        sx={{
                          bgcolor: "#fffbeb",
                          color: "#92400e",
                          fontWeight: 700,
                          height: 22
                        }}
                      />
                      <Typography sx={{ color: "#0f172a" }}>{msg}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Card>
            )}

            {/* -----------------------------------------------------
                      PASSED CHECKS
            ------------------------------------------------------ */}
            {passed.length > 0 && (
              <Card
                sx={{
                  borderRadius: 4,
                  p: 3,
                  bgcolor: "white",
                  borderLeft: "6px solid #22c55e",
                  boxShadow: "0 18px 36px rgba(34,197,94,0.16)"
                }}
              >
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <CheckCircleOutline sx={{ fontSize: 36, color: "#16a34a" }} />
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
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
                    <Stack key={i} direction="row" spacing={1.5}>
                      <Article sx={{ color: "#16a34a", mt: "2px" }} />
                      <Typography sx={{ color: "#0f172a" }}>{msg}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Card>
            )}
          </Stack>
        )}
      </Box>
    </Box>
  );
}

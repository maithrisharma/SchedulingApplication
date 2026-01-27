// src/pages/SchedulingPage.jsx
import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogActions,
  DialogTitle,
  DialogContent,
} from "@mui/material";

import { PlayCircle, CheckCircle } from "@mui/icons-material";
import { apiGet } from "../api";
import { useScenario } from "../context/ScenarioContext";
import PageLayout from "../components/PageLayout";
import { cardPad } from "../theme/layoutTokens";

export default function SchedulingPage() {
  const { scenario, setScenario } = useScenario();

  const [scenarios, setScenarios] = useState([]);
  const [running, setRunning] = useState(false);
  const [isRunningBackend, setIsRunningBackend] = useState(false);
  const [progress, setProgress] = useState(0);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [results, setResults] = useState(null);

  const [cancelled, setCancelled] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

  /* ========================================================
        LOAD SCENARIOS
  ======================================================== */
  useEffect(() => {
    apiGet("/scenarios/list")
      .then((res) => setScenarios(res.scenarios || []))
      .catch(() => setError("Szenarien konnten nicht geladen werden."));
  }, []);

  /* ========================================================
        AUTO RESTORE BACKEND STATUS
  ======================================================== */
  useEffect(() => {
    if (!scenario) return;

    async function checkStatus() {
      try {
        const res = await apiGet(`/schedule/status/${scenario}`);

        if (res.running) {
          setIsRunningBackend(true);
          setRunning(true);
          setCancelled(false);
          setProgress(res.progress ?? 0);
        } else {
          setIsRunningBackend(false);
          setRunning(false);

          if (res.progress === 100) {
            setInfo("Scheduler erfolgreich abgeschlossen!");
          }
        }
      } catch (err) {
        console.warn("[UI] Failed status check:", err);
      }
    }

    checkStatus();
  }, [scenario]);

  /* ========================================================
        POLLING LOOP
  ======================================================== */
  useEffect(() => {
    if (!scenario || cancelled || !isRunningBackend) return;

    const interval = setInterval(async () => {
      try {
        const res = await apiGet(`/schedule/status/${scenario}`);

        setProgress(res.progress ?? 0);
        setIsRunningBackend(res.running);
        setRunning(res.running);

        if (!res.running && res.progress === 100) {
          setInfo("Scheduler erfolgreich abgeschlossen!");
        }
      } catch (err) {
        console.warn("[UI] Poll error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [scenario, cancelled, isRunningBackend]);

  /* ========================================================
        RUN SCHEDULER (BACKGROUND MODE)
  ======================================================== */
  async function handleSchedule() {
    setError("");
    setInfo("");
    setResults(null);
    setProgress(0);
    setCancelled(false);

    if (!scenario) return setError("Bitte wählen Sie ein Szenario aus.");

    setRunning(true);
    setIsRunningBackend(true);

    try {
      const res = await fetch(`${BASE}/schedule/start/${scenario}`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Scheduler-Start.");
      }

      setInfo("Scheduler gestartet. Bitte warten…");
    } catch (err) {
      console.error("[UI] Scheduler start error:", err);
      setError(err.message);
      setRunning(false);
      setIsRunningBackend(false);
    }
  }

  /* ========================================================
        CANCEL BACKGROUND SCHEDULER
  ======================================================== */
  async function confirmCancelRun() {
    setConfirmCancel(false);

    try {
      const res = await fetch(`${BASE}/schedule/cancel/${scenario}`, {
        method: "POST",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fehler beim Abbrechen.");
      }

      setCancelled(true);
      setInfo("Scheduler wurde abgebrochen.");
      setRunning(false);
      setIsRunningBackend(false);
      setProgress(0);
    } catch (err) {
      console.error("[UI] Cancel error:", err);
      setError(err.message);
    }
  }

  /* ========================================================
            RENDER UI
  ======================================================== */
  return (
    <PageLayout
      title="Scheduler ausführen"
      subtitle="Optimalen Produktionsplan aus bereinigten Daten erzeugen"
      maxWidth={1100}
    >
      {/* MAIN CARD */}
      <Card
        sx={{
          borderRadius: 4,
          boxShadow: "0 12px 28px rgba(0,0,0,0.06)",
          mb: { xs: 3, md: 4 },
        }}
      >
        <CardContent sx={{ p: cardPad, textAlign: "center" }}>
          <Typography
            sx={{
              fontWeight: 800,
              mb: 3,
              color: "#0f172a",
              fontSize: "clamp(1.05rem, 0.95rem + 0.45vw, 1.25rem)",
            }}
          >
            Szenario zur Planung auswählen
          </Typography>

          {/* SCENARIO SELECT + BUTTONS */}
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              justifyContent: "center",
              alignItems: "center",
              gap: 2,
              mb: 2,
            }}
          >
            <FormControl size="medium" sx={{ minWidth: 260, width: { xs: "100%", sm: 360, md: 320 } }}>
              <InputLabel>Szenario</InputLabel>
              <Select
                value={scenario || ""}
                label="Szenario"
                onChange={(e) => setScenario(e.target.value)}
                sx={{ height: 48 }}
              >
                <MenuItem value="">
                  <em>Bitte auswählen…</em>
                </MenuItem>
                {scenarios.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* RUN BUTTON (✅ Upload-blue style) */}
            <Button
              variant="contained"
              size="medium"
              startIcon={!running && !isRunningBackend && <PlayCircle />}
              disabled={running || isRunningBackend || !scenario}
              onClick={handleSchedule}
              sx={{
                height: 48,
                px: 4,
                fontWeight: 700,
                borderRadius: 3,
                bgcolor: "#3b82f6",
                "&:hover": { bgcolor: "#2563eb" },
                width: { xs: "100%", sm: "auto" },
              }}
            >
              {running || isRunningBackend ? "Läuft…" : "Scheduler starten"}
            </Button>

            {/* CANCEL BUTTON */}
            {isRunningBackend && !cancelled && (
              <Button
                variant="outlined"
                color="error"
                onClick={() => setConfirmCancel(true)}
                sx={{
                  height: 48,
                  px: 3,
                  fontWeight: 700,
                  borderRadius: 3,
                  width: { xs: "100%", sm: "auto" },
                }}
              >
                Abbrechen
              </Button>
            )}
          </Box>

          {/* PROGRESS BAR */}
          {!cancelled && isRunningBackend && (
            <Box sx={{ mt: 3 }}>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ height: 10, borderRadius: 4 }}
              />
              <Typography sx={{ mt: 1, fontWeight: 700 }}>
                Fortschritt: {progress}%
              </Typography>
            </Box>
          )}

          {/* ERRORS */}
          {error && (
            <Alert severity="error" sx={{ mt: 3 }}>
              {error}
            </Alert>
          )}

          {/* SUCCESS */}
          {info && !isRunningBackend && !cancelled && (
            <Alert severity="success" icon={<CheckCircle />} sx={{ mt: 3 }}>
              {info}
            </Alert>
          )}

          {cancelled && (
            <Alert severity="warning" sx={{ mt: 3 }}>
              Scheduler wurde abgebrochen.
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* CANCEL CONFIRMATION DIALOG */}
      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)}>
        <DialogTitle sx={{ fontWeight: 800 }}>Planung abbrechen?</DialogTitle>
        <DialogContent>
          <Typography>Möchten Sie den Scheduler wirklich stoppen?</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setConfirmCancel(false)}>Nein</Button>
          <Button color="error" variant="contained" onClick={confirmCancelRun}>
            Ja, abbrechen
          </Button>
        </DialogActions>
      </Dialog>
    </PageLayout>
  );
}

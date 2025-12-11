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
  Grid,
  Dialog,
  DialogActions,
  DialogTitle,
  DialogContent,
} from "@mui/material";

import { PlayCircle, CheckCircle } from "@mui/icons-material";
import { apiGet } from "../api";
import { useScenario } from "../context/ScenarioContext";

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

  const BASE =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

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
    <Box
      sx={{
        bgcolor: "#f8fafc",
        minHeight: "calc(100vh - 64px)",
        display: "flex",
        justifyContent: "center",
        px: { xs: 2, md: 4 },
        py: { xs: 2, md: 3 },
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 1100 }}>
        <Typography variant="h4" sx={{ fontWeight: 900, textAlign: "center", mb: 1 }}>
          Scheduler ausführen
        </Typography>

        <Typography variant="subtitle1" sx={{ textAlign: "center", color: "#64748b", mb: 4 }}>
          Optimalen Produktionsplan aus bereinigten Daten erzeugen
        </Typography>

        {/* MAIN CARD */}
        <Card sx={{ borderRadius: 4, boxShadow: "0 12px 28px rgba(0,0,0,0.06)", mb: 4 }}>
          <CardContent sx={{ p: { xs: 3, md: 5 }, textAlign: "center" }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 4 }}>
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
              <FormControl size="medium" sx={{ minWidth: 260 }}>
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

              {/* RUN BUTTON */}
              <Button
                variant="contained"
                size="medium"
                startIcon={!running && !isRunningBackend && <PlayCircle />}
                disabled={running || isRunningBackend || !scenario}
                onClick={handleSchedule}
                sx={{
                  height: 48,
                  px: 4,
                  fontWeight: 600,
                  bgcolor: "#10b981",
                  "&:hover": { bgcolor: "#059669" },
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
                  sx={{ height: 48, px: 3, fontWeight: 600 }}
                >
                  Abbrechen
                </Button>
              )}
            </Box>

            {/* PROGRESS BAR */}
            {!cancelled && isRunningBackend && (
              <Box sx={{ mt: 3 }}>
                <LinearProgress variant="determinate" value={progress} sx={{ height: 10, borderRadius: 4 }} />
                <Typography sx={{ mt: 1, fontWeight: 600 }}>
                  Fortschritt: {progress}%
                </Typography>
              </Box>
            )}

            {/* ERRORS */}
            {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}

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
          <DialogTitle>Planung abbrechen?</DialogTitle>
          <DialogContent>
            <Typography>Möchten Sie den Scheduler wirklich stoppen?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmCancel(false)}>Nein</Button>
            <Button color="error" onClick={confirmCancelRun}>
              Ja, abbrechen
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}

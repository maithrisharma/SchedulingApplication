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
  Chip,
  Stack,
} from "@mui/material";

import {
  PlayCircle,
  CheckCircle,
  History as HistoryIcon,
} from "@mui/icons-material";
import TuneIcon from "@mui/icons-material/Tune";
import { apiGet } from "../api";
import { useScenario } from "../context/ScenarioContext";
import PageLayout from "../components/PageLayout";
import RunConfigDialog from "../components/RunConfigDialog";
import { cardPad } from "../theme/layoutTokens";

export default function SchedulingPage() {
  const { scenario, setScenario } = useScenario();

  const [scenarios, setScenarios] = useState([]);
  const [running, setRunning] = useState(false);
  const [isRunningBackend, setIsRunningBackend] = useState(false);
  const [progress, setProgress] = useState(0);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [hasExistingResults, setHasExistingResults] = useState(false);
  const [lastRunInfo, setLastRunInfo] = useState(null);

  const [cancelled, setCancelled] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showRunConfig, setShowRunConfig] = useState(false);

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
        CHECK FOR EXISTING RESULTS
  ======================================================== */
  useEffect(() => {
    if (!scenario) {
      setHasExistingResults(false);
      setLastRunInfo(null);
      return;
    }

    async function checkExistingResults() {
      try {
        const res = await apiGet(`/scenarios/${scenario}/run-meta`);
        if (res.ok && res.meta) {
          setHasExistingResults(true);
          setLastRunInfo({
            timestamp: res.meta.run_ts,
            mode: res.meta.mode,
            iterations: res.meta.sa_iterations || 45,
          });
        } else {
          setHasExistingResults(false);
          setLastRunInfo(null);
        }
      } catch (err) {
        setHasExistingResults(false);
        setLastRunInfo(null);
      }
    }

    checkExistingResults();
  }, [scenario]);

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
          // Refresh existing results info
          const metaRes = await apiGet(`/scenarios/${scenario}/run-meta`);
          if (metaRes.ok && metaRes.meta) {
            setHasExistingResults(true);
            setLastRunInfo({
              timestamp: metaRes.meta.run_ts,
              mode: metaRes.meta.mode,
              iterations: metaRes.meta.sa_iterations || 45,
            });
          }
        }
      } catch (err) {
        console.warn("[UI] Poll error:", err);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [scenario, cancelled, isRunningBackend]);

  /* ========================================================
        RUN SCHEDULER WITH CONFIG
  ======================================================== */
  async function handleScheduleWithConfig(config) {
    setError("");
    setInfo("");
    setProgress(0);
    setCancelled(false);

    if (!scenario) return setError("Bitte wählen Sie ein Szenario aus.");

    setRunning(true);
    setIsRunningBackend(true);

    try {
      const res = await fetch(`${BASE}/schedule/start/${scenario}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
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
        QUICK RUN (with defaults)
  ======================================================== */
  async function handleQuickRun() {
    handleScheduleWithConfig({
      weights: null, // use backend defaults
      sa_config: null,
    });
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
      {/* EXISTING RESULTS ALERT */}
      {hasExistingResults && !running && !isRunningBackend && (
        <Alert
          severity="success"
          icon={<HistoryIcon />}
          sx={{
            borderRadius: 3,
            mb: 3,
            boxShadow: "0 4px 12px rgba(34, 197, 94, 0.12)",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Ergebnisse verfügbar
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Letzter Lauf: {lastRunInfo?.timestamp ? new Date(lastRunInfo.timestamp).toLocaleString("de-DE") : "N/A"}
                {lastRunInfo?.iterations && ` · ${lastRunInfo.iterations} Iterationen`}
              </Typography>
            </Box>
            <Chip
              label={lastRunInfo?.mode === "what_if" ? "What-If" : "Real-Time"}
              size="small"
              sx={{
                bgcolor: lastRunInfo?.mode === "what_if" ? "#dbeafe" : "#dcfce7",
                color: lastRunInfo?.mode === "what_if" ? "#1e40af" : "#166534",
                fontWeight: 700,
              }}
            />
          </Stack>
        </Alert>
      )}

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

            {/* QUICK RUN BUTTON */}
            <Button
              variant="contained"
              size="medium"
              startIcon={!running && !isRunningBackend && <PlayCircle />}
              disabled={running || isRunningBackend || !scenario}
              onClick={handleQuickRun}
              sx={{
                height: 48,
                px: 4,
                fontWeight: 700,
                borderRadius: 3,
                bgcolor: "#2563eb",
                "&:hover": { bgcolor: "#1d4ed8" },
                width: { xs: "100%", sm: "auto" },
              }}
            >
              {running || isRunningBackend ? "Läuft…" : "Schnellstart"}
            </Button>

            {/* ADVANCED CONFIG BUTTON */}
            {!running && !isRunningBackend && (
              <Button
                variant="outlined"
                size="medium"
                startIcon={<TuneIcon />}
                disabled={!scenario}
                onClick={() => setShowRunConfig(true)}
                sx={{
                  height: 48,
                  px: 3,
                  fontWeight: 700,
                  borderRadius: 3,
                  borderColor: "#cbd5e1",
                  color: "#475569",
                  "&:hover": {
                    borderColor: "#2563eb",
                    bgcolor: "#f1f5f9",
                  },
                  width: { xs: "100%", sm: "auto" },
                }}
              >
                Konfigurieren
              </Button>
            )}

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

      {/* RUN CONFIG DIALOG */}
      <RunConfigDialog
        open={showRunConfig}
        onClose={() => setShowRunConfig(false)}
        onRun={handleScheduleWithConfig}
      />

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
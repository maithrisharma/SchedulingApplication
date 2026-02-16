// src/pages/FileUploadPage.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  LinearProgress,
  Stack,
  Chip,
} from "@mui/material";
import { CloudUpload, CheckCircle } from "@mui/icons-material";
import { useScenario } from "../context/ScenarioContext";
import PageLayout from "../components/PageLayout";
import { cardPad } from "../theme/layoutTokens";

export default function FileUploadPage() {
  const { scenario } = useScenario();

  const [jobsFile, setJobsFile] = useState(null);
  const [shiftsFile, setShiftsFile] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // ✅ status
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState("");

  const API_BASE = useMemo(
    () => import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
    []
  );

  // ✅ load status when scenario changes
  useEffect(() => {
    if (!scenario) {
      setStatus(null);
      setStatusError("");
      return;
    }

    setStatusError("");

    fetch(`${API_BASE}/uploads/${scenario}/status`)
      .then(async (r) => {
        // If backend returns HTML, this will help debug quickly
        const text = await r.text();
        try {
          const json = JSON.parse(text);
          if (!r.ok || !json.ok) {
            throw new Error(json.error || "Status konnte nicht geladen werden.");
          }
          setStatus(json);
        } catch (e) {
          // Not JSON => likely wrong URL / proxy
          throw new Error(
            `Status-Endpoint liefert kein JSON. Prüfe API_BASE_URL / Proxy. Antwort beginnt mit: ${text.slice(
              0,
              30
            )}`
          );
        }
      })
      .catch((err) => setStatusError(err.message));
  }, [scenario, API_BASE]);

  async function startCleaning() {
    try {
      setCleaning(true);
      const res = await fetch(`${API_BASE}/clean/${scenario}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Reinigung fehlgeschlagen.");
      setInfo("Dateien erfolgreich hochgeladen und bereinigt!");
    } catch (err) {
      setError("Fehler beim Bereinigen: " + err.message);
    } finally {
      setCleaning(false);
    }
  }

  async function handleUpload(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!scenario) return setError("Kein Szenario ausgewählt.");
    if (!jobsFile || !shiftsFile) return setError("Bitte wählen Sie beide Dateien aus.");

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("jobs", jobsFile);
      formData.append("shifts", shiftsFile);

      const res = await fetch(`${API_BASE}/uploads/${scenario}`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Upload fehlgeschlagen.");

      setInfo("Dateien hochgeladen! Szenario wird bereinigt…");

      setJobsFile(null);
      setShiftsFile(null);

      await startCleaning();

      // refresh status after upload+clean
      fetch(`${API_BASE}/uploads/${scenario}/status`)
        .then((r) => r.json())
        .then((d) => d.ok && setStatus(d))
        .catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const jobsExists = !!status?.jobs?.exists;
  const shiftsExists = !!status?.shifts?.exists;

  return (
    <PageLayout
      title="Excel-Dateien hochladen"
      subtitle={
        <>
          Laden Sie <strong>jobs.xlsx</strong> und <strong>shifts.xlsx</strong> hoch.
        </>
      }
      maxWidth={900}
    >
      <Card
        sx={{
          borderRadius: 4,
          boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
          bgcolor: "white",
        }}
      >
        <CardContent sx={{ p: cardPad }}>


          {/* ✅ Minimal “already uploaded” status */}
          {scenario && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: "#334155", mb: 1 }}>
                Aktueller Status ({scenario})
              </Typography>

              {statusError ? (
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                  {statusError}
                </Alert>
              ) : (
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    icon={jobsExists ? <CheckCircle /> : undefined}
                    label={jobsExists ? "jobs.xlsx vorhanden" : "jobs.xlsx fehlt"}
                    color={jobsExists ? "success" : "default"}
                    variant={jobsExists ? "filled" : "outlined"}
                    sx={{ fontWeight: 700 }}
                  />
                  <Chip
                    icon={shiftsExists ? <CheckCircle /> : undefined}
                    label={shiftsExists ? "shifts.xlsx vorhanden" : "shifts.xlsx fehlt"}
                    color={shiftsExists ? "success" : "default"}
                    variant={shiftsExists ? "filled" : "outlined"}
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
              )}
            </Box>
          )}

          <form onSubmit={handleUpload}>
            <Box sx={{ mb: 3 }}>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ py: 2.5, borderStyle: "dashed", borderRadius: 3 }}
              >
                <CloudUpload sx={{ mr: 2 }} />
                {jobsFile ? jobsFile.name : "jobs.xlsx hochladen"}
                <input
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={(e) => setJobsFile(e.target.files?.[0] || null)}
                />
              </Button>
            </Box>

            <Box sx={{ mb: 4 }}>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ py: 2.5, borderStyle: "dashed", borderRadius: 3 }}
              >
                <CloudUpload sx={{ mr: 2 }} />
                {shiftsFile ? shiftsFile.name : "shifts.xlsx hochladen"}
                <input
                  type="file"
                  accept=".xlsx"
                  hidden
                  onChange={(e) => setShiftsFile(e.target.files?.[0] || null)}
                />
              </Button>
            </Box>

            <Box sx={{ textAlign: "center" }}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={uploading || cleaning || !scenario}
                sx={{
                  bgcolor: "#3b82f6",
                  px: 6,
                  py: 1.4,
                  fontSize: "1rem",
                  borderRadius: 3,
                  "&:hover": { bgcolor: "#2563eb" },
                }}
              >
                {uploading ? "Lade hoch…" : cleaning ? "Bereinige…" : "Dateien hochladen"}
              </Button>
            </Box>

            {(uploading || cleaning) && (
              <LinearProgress sx={{ mt: 3, borderRadius: 2 }} />
            )}
          </form>

          {error && (
            <Alert severity="error" sx={{ mt: 3 }}>
              {error}
            </Alert>
          )}
          {info && (
            <Alert severity="success" sx={{ mt: 3 }}>
              {info}
            </Alert>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}

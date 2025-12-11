// src/pages/FileUploadPage.jsx
import { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  LinearProgress,
} from "@mui/material";
import { CloudUpload, CheckCircle } from "@mui/icons-material";
import { useScenario } from "../context/ScenarioContext";

export default function FileUploadPage() {
  const { scenario } = useScenario();
  const [jobsFile, setJobsFile] = useState(null);
  const [shiftsFile, setShiftsFile] = useState(null);

  const [uploading, setUploading] = useState(false);
  const [cleaning, setCleaning] = useState(false); // ✅ FIXED

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  /* -----------------------------
        Start Cleaning
  ------------------------------ */
  async function startCleaning() {
    try {
      setCleaning(true);
      const base =
        import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

      const res = await fetch(`${base}/clean/${scenario}`, {
        method: "POST",
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Reinigung fehlgeschlagen.");
      }

      setInfo("Dateien erfolgreich hochgeladen und bereinigt!");
    } catch (err) {
      setError("Fehler beim Bereinigen: " + err.message);
    } finally {
      setCleaning(false);
    }
  }

  /* -----------------------------
        Handle Upload
  ------------------------------ */
  async function handleUpload(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!scenario) return setError("Kein Szenario ausgewählt.");
    if (!jobsFile || !shiftsFile)
      return setError("Bitte wählen Sie beide Dateien aus.");

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("jobs", jobsFile);
      formData.append("shifts", shiftsFile);

      const res = await fetch(
        `${
          import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api"
        }/uploads/${scenario}`,
        { method: "POST", body: formData }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload fehlgeschlagen.");

      setInfo("Dateien hochgeladen! Szenario wird bereinigt…");

      setJobsFile(null);
      setShiftsFile(null);

      await startCleaning();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  /* -----------------------------
              RENDER
  ------------------------------ */
  return (
    <Box
      sx={{
        bgcolor: "#f8fafc",
        minHeight: "calc(100vh - 70px)",
        display: "flex",
        justifyContent: "center",
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 3, md: 4 },
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 900 }}>
        {/* TITLE */}
        <Typography
          variant="h4"
          sx={{ fontWeight: 800, textAlign: "center", mb: 1, color: "#0f172a" }}
        >
          Excel-Dateien hochladen
        </Typography>

        <Typography
          variant="subtitle1"
          sx={{ textAlign: "center", color: "#64748b", mb: 4 }}
        >
          Laden Sie <strong>jobs.xlsx</strong> und <strong>shifts.xlsx</strong> hoch.
        </Typography>

        {/* SELECTED SCENARIO */}
        <Card
          sx={{
            borderRadius: 4,
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
            mb: 4,
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Ausgewähltes Szenario
            </Typography>

            <Box
              sx={{
                p: 3,
                borderRadius: 3,
                bgcolor: scenario ? "#ecfdf5" : "#fee2e2",
                border: "1px solid",
                borderColor: scenario ? "#86efac" : "#fca5a5",
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {scenario ? (
                  <>
                    <CheckCircle
                      sx={{ color: "#16a34a", verticalAlign: "middle", mr: 1 }}
                    />
                    {scenario}
                  </>
                ) : (
                  "Kein Szenario ausgewählt"
                )}
              </Typography>
            </Box>
          </CardContent>
        </Card>

        {/* UPLOAD FILES */}
        <Card
          sx={{
            borderRadius: 4,
            boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
            bgcolor: "white",
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 } }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>
              Dateien hochladen
            </Typography>

            <form onSubmit={handleUpload}>
              {/* JOBS FILE */}
              <Box sx={{ mb: 3 }}>
                <Button
                  variant="outlined"
                  component="label"
                  fullWidth
                  sx={{
                    py: 2.5,
                    borderStyle: "dashed",
                    borderRadius: 3,
                  }}
                >
                  <CloudUpload sx={{ mr: 2 }} />
                  {jobsFile ? jobsFile.name : "jobs.xlsx hochladen"}
                  <input
                    type="file"
                    accept=".xlsx"
                    hidden
                    onChange={(e) => setJobsFile(e.target.files[0])}
                  />
                </Button>
              </Box>

              {/* SHIFTS FILE */}
              <Box sx={{ mb: 4 }}>
                <Button
                  variant="outlined"
                  component="label"
                  fullWidth
                  sx={{
                    py: 2.5,
                    borderStyle: "dashed",
                    borderRadius: 3,
                  }}
                >
                  <CloudUpload sx={{ mr: 2 }} />
                  {shiftsFile ? shiftsFile.name : "shifts.xlsx hochladen"}
                  <input
                    type="file"
                    accept=".xlsx"
                    hidden
                    onChange={(e) => setShiftsFile(e.target.files[0])}
                  />
                </Button>
              </Box>

              {/* SUBMIT BUTTON */}
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
                  {uploading
                    ? "Lade hoch…"
                    : cleaning
                    ? "Bereinige…"
                    : "Dateien hochladen"}
                </Button>
              </Box>

              {(uploading || cleaning) && (
                <LinearProgress sx={{ mt: 3, borderRadius: 2 }} />
              )}
            </form>

            {error && <Alert severity="error" sx={{ mt: 3 }}>{error}</Alert>}
            {info && <Alert severity="success" sx={{ mt: 3 }}>{info}</Alert>}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

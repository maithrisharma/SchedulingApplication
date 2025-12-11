// src/pages/CleaningPage.jsx
import { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Alert,
  CircularProgress,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";   // ← Fixed import
import { useScenario } from "../context/ScenarioContext";

export default function CleaningPage() {
  const { scenario } = useScenario();
  const [cleaning, setCleaning] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [results, setResults] = useState(null);

  async function handleClean() {
    setError(""); setInfo(""); setResults(null);
    if (!scenario) return setError("No scenario selected");

    try {
      setCleaning(true);
      const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
      const res = await fetch(`${base}/clean/${scenario}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed");
      setInfo("Data cleaned successfully!");
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCleaning(false);
    }
  }

  return (
    <Box sx={{ bgcolor: "#f8fafc", minHeight: "100vh", py: 6, px: 3 }}>
      <Box sx={{ maxWidth: 1000, mx: "auto" }}>
        <Typography variant="h3" sx={{ fontWeight: 900, textAlign: "center", mb: 2, color: "#0f172a" }}>
          Clean Scenario Data
        </Typography>
        <Typography variant="h6" sx={{ textAlign: "center", color: "#64748b", mb: 8 }}>
          Transform raw Excel files into schedulable format
        </Typography>

        <Card sx={{ borderRadius: 5, boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }}>
          <CardContent sx={{ p: 6 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 5 }}>Selected Scenario</Typography>

            <Box sx={{
              p: 5,
              borderRadius: 4,
              bgcolor: scenario ? "#f0fdf4" : "#fef2f2",
              border: "2px dashed",
              borderColor: scenario ? "#86efac" : "#fca5a5",
              textAlign: "center"
            }}>
              {scenario ? (
                <Typography variant="h5" sx={{ fontWeight: 700, color: "#166534" }}>
                  <CheckCircleIcon sx={{ fontSize: 40, verticalAlign: "middle", mr: 2 }} />
                  {scenario}
                </Typography>
              ) : (
                <Typography variant="h5" sx={{ fontWeight: 700, color: "#dc2626" }}>
                  No scenario selected
                </Typography>
              )}
            </Box>

            <Box sx={{ textAlign: "center", mt: 6 }}>
              <Button
                variant="contained"
                size="large"
                onClick={handleClean}
                disabled={!scenario || cleaning}
                sx={{
                  bgcolor: "#3b82f6",
                  px: 8,
                  py: 3,
                  fontSize: "1.3rem",
                  borderRadius: 5,
                  boxShadow: "0 15px 35px rgba(59,130,246,0.4)",
                  "&:hover": { bgcolor: "#2563eb" }
                }}
              >
                {cleaning ? (
                  <>Cleaning… <CircularProgress size={28} sx={{ ml: 2 }} /></>
                ) : (
                  "Start Cleaning"
                )}
              </Button>
            </Box>

            {error && <Alert severity="error" sx={{ mt: 5 }}>{error}</Alert>}
            {info && <Alert severity="success" sx={{ mt: 5 }}>{info}</Alert>}
          </CardContent>
        </Card>

        {results && (
          <Card sx={{ mt: 6, borderRadius: 5, boxShadow: "0 20px 40px rgba(0,0,0,0.08)" }}>
            <CardContent sx={{ p: 6 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 4 }}>Cleaning Complete</Typography>
              <Grid container spacing={4}>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>Jobs Processed</Typography>
                  <Box sx={{ pl: 3 }}>
                    {Object.entries(results.jobs_clean || {}).map(([k, v]) => (
                      <Typography key={k}><strong>{k}:</strong> {v}</Typography>
                    ))}
                  </Box>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>Shifts Processed</Typography>
                  <Box sx={{ pl: 3 }}>
                    {Object.entries(results.shifts_clean || {}).map(([k, v]) => (
                      <Typography key={k}><strong>{k}:</strong> {v}</Typography>
                    ))}
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}
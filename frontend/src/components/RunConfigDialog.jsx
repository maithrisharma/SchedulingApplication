// ========================================
// STEP 3: Create src/components/RunConfigDialog.jsx
// ========================================

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Stack,
  Chip,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Slider,
  Alert,
  Tooltip,
  InputAdornment,
} from "@mui/material";
import TuneIcon from "@mui/icons-material/Tune";
import CloseIcon from "@mui/icons-material/Close";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RestoreIcon from "@mui/icons-material/Restore";

const DEFAULT_WEIGHTS = {
  w_has_ddl: 1000.0,
  w_priority: 150.0,
  w_orderstate: 10.0,
  w_cont: 8.0,
  w_ddl_minutes: 1.0,
  w_lateness: 12.0,
  w_duration_late: 0.25,
  w_spt_near: 0.06,
  w_earliest: 0.5,
  w_duration: 0.02,
  w_orderpos: 0.005,
};

const DEFAULT_SA_CONFIG = {
  enabled: true,
  iterations: 45,
  initial_temp: 1.0,
  cooling: 0.95,
  step_scale: 0.25,
  seed: 42,
};

const WEIGHT_DESCRIPTIONS = {
  w_has_ddl: "Gewicht für Jobs ohne Deadline (höher = bevorzugt)",
  w_priority: "Gewicht für Priority Group (höher = PG0 bevorzugt)",
  w_orderstate: "Gewicht für Order State (höher = OS5 bevorzugt)",
  w_cont: "Gewicht für Maschinenkontinuität",
  w_ddl_minutes: "Gewicht für Minuten bis Deadline",
  w_lateness: "Gewicht für Verspätung",
  w_duration_late: "Gewicht für Dauer bei verspäteten Jobs",
  w_spt_near: "Gewicht für SPT bei nahen Deadlines",
  w_earliest: "Gewicht für frühesten Starttermin",
  w_duration: "Gewicht für Jobdauer",
  w_orderpos: "Gewicht für Position im Auftrag",
};

export default function RunConfigDialog({ open, onClose, onRun }) {
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const [saConfig, setSaConfig] = useState(DEFAULT_SA_CONFIG);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (open) {
      // Reset to defaults when opening
      setWeights(DEFAULT_WEIGHTS);
      setSaConfig(DEFAULT_SA_CONFIG);
      setShowAdvanced(false);
    }
  }, [open]);

  const handleWeightChange = (key, value) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setWeights({ ...weights, [key]: numValue });
    }
  };

  const handleSaConfigChange = (key, value) => {
    setSaConfig({ ...saConfig, [key]: value });
  };

  const resetToDefaults = () => {
    setWeights(DEFAULT_WEIGHTS);
    setSaConfig(DEFAULT_SA_CONFIG);
  };

  const handleRun = () => {
    onRun({
      weights,
      sa_config: saConfig,
    });
    onClose();
  };

  const formatWeightKey = (key) => {
    return key.replace("w_", "").replace(/_/g, " ");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: "hidden",
          maxWidth: 720,
        },
      }}
    >
      <DialogTitle
        sx={{
          bgcolor: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          py: 1.5,
          pr: 5,
          position: "relative",
        }}
      >
        <TuneIcon sx={{ color: "#2563eb" }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
            Scheduler-Konfiguration
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Gewichte und Iterationen anpassen
          </Typography>
        </Box>

        <IconButton
          aria-label="close"
          onClick={onClose}
          size="small"
          sx={{
            position: "absolute",
            right: 12,
            top: 12,
            color: "#64748b",
            "&:hover": { bgcolor: "#e2e8f0" },
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5, pb: 1.5 }}>
        <Stack spacing={2.5}>
          {/* Info Alert */}
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Höhere Iterationen können bessere Ergebnisse liefern
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Standardwerte sind für die meisten Fälle optimiert. Ändern Sie diese nur, wenn Sie
              mit der Scheduling-Logik vertraut sind.
            </Typography>
          </Alert>

          {/* Simulated Annealing Config */}
          <Box>
            <Typography sx={{ fontWeight: 700, color: "#1e293b", fontSize: "0.95rem", mb: 1.5 }}>
              Simulated Annealing
            </Typography>

            <Stack spacing={2}>
              {/* Iterations Slider */}
              <Box>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: "#475569" }}>
                    Iterationen
                  </Typography>
                  <Chip
                    label={saConfig.iterations}
                    size="small"
                    sx={{
                      bgcolor: "#dbeafe",
                      color: "#1e40af",
                      fontWeight: 700,
                      minWidth: 50,
                    }}
                  />
                </Stack>

                <Slider
                  value={saConfig.iterations}
                  onChange={(e, v) => handleSaConfigChange("iterations", v)}
                  min={10}
                  max={100}
                  step={5}
                  valueLabelDisplay="auto"
                  marks={[
                    { value: 10, label: "10" },
                    { value: 45, label: "45 (Standard)" },
                    { value: 100, label: "100" },
                  ]}
                  sx={{
                    height: 6,
                    "& .MuiSlider-thumb": {
                      width: 18,
                      height: 18,
                      bgcolor: "#2563eb",
                    },
                    "& .MuiSlider-track": { bgcolor: "#2563eb", border: "none" },
                    "& .MuiSlider-rail": { bgcolor: "#e2e8f0", opacity: 1 },
                    "& .MuiSlider-markLabel": { fontSize: "0.7rem", color: "#64748b" },
                  }}
                />

                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  Mehr Iterationen = bessere Ergebnisse, aber längere Laufzeit
                </Typography>
              </Box>

              {/* Initial Temperature */}
              <TextField
                label="Anfangstemperatur"
                type="number"
                value={saConfig.initial_temp}
                onChange={(e) => handleSaConfigChange("initial_temp", parseFloat(e.target.value))}
                size="small"
                inputProps={{ step: 0.1, min: 0.1, max: 10 }}
                sx={{ maxWidth: 200 }}
              />

              {/* Cooling Rate */}
              <TextField
                label="Abkühlungsrate"
                type="number"
                value={saConfig.cooling}
                onChange={(e) => handleSaConfigChange("cooling", parseFloat(e.target.value))}
                size="small"
                inputProps={{ step: 0.01, min: 0.8, max: 0.99 }}
                sx={{ maxWidth: 200 }}
              />
            </Stack>
          </Box>

          {/* Advanced Weights - Accordion */}
          <Accordion
            expanded={showAdvanced}
            onChange={() => setShowAdvanced(!showAdvanced)}
            sx={{
              borderRadius: 2,
              "&:before": { display: "none" },
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{
                bgcolor: "#f8fafc",
                borderRadius: 2,
                "&.Mui-expanded": {
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                },
              }}
            >
              <Typography sx={{ fontWeight: 700, color: "#1e293b" }}>
                Erweitert: Gewichtungs-Parameter
              </Typography>
            </AccordionSummary>

            <AccordionDetails sx={{ pt: 2 }}>
              <Stack spacing={1.5}>
                {Object.entries(weights).map(([key, value]) => (
                  <Box key={key}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: "#475569", flex: 1 }}>
                        {formatWeightKey(key)}
                      </Typography>
                      <Tooltip title={WEIGHT_DESCRIPTIONS[key]} arrow placement="left">
                        <InfoOutlinedIcon sx={{ fontSize: 16, color: "#94a3b8" }} />
                      </Tooltip>
                    </Stack>

                    <TextField
                      type="number"
                      value={value}
                      onChange={(e) => handleWeightChange(key, e.target.value)}
                      size="small"
                      fullWidth
                      inputProps={{ step: key.includes("orderpos") || key.includes("duration") ? 0.001 : 0.1 }}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <Chip
                              label={DEFAULT_WEIGHTS[key]}
                              size="small"
                              sx={{
                                fontSize: "0.7rem",
                                height: 20,
                                bgcolor: value === DEFAULT_WEIGHTS[key] ? "#dbeafe" : "#fef3c7",
                                color: value === DEFAULT_WEIGHTS[key] ? "#1e40af" : "#92400e",
                              }}
                            />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.75, bgcolor: "#f8fafc", gap: 1 }}>
        <Button
          onClick={resetToDefaults}
          startIcon={<RestoreIcon />}
          sx={{
            borderRadius: 2,
            fontWeight: 700,
            color: "#64748b",
            textTransform: "none",
            py: 1,
            mr: "auto",
          }}
        >
          Zurücksetzen
        </Button>

        <Button
          onClick={onClose}
          sx={{
            borderRadius: 2,
            fontWeight: 700,
            color: "#64748b",
            textTransform: "none",
            py: 1,
          }}
        >
          Abbrechen
        </Button>

        <Button
          variant="contained"
          onClick={handleRun}
          sx={{
            bgcolor: "#2563eb",
            borderRadius: 2,
            fontWeight: 800,
            px: 3,
            py: 1,
            textTransform: "none",
            "&:hover": { bgcolor: "#1d4ed8" },
          }}
        >
          Scheduler starten
        </Button>
      </DialogActions>
    </Dialog>
  );
}

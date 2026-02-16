// src/components/ScenarioSettingsDialog.jsx
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Slider,
  Typography,
  Box,
  FormControlLabel,
  Checkbox,
  Alert,
  Stack,
  Chip,
  IconButton,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CloseIcon from "@mui/icons-material/Close";

export default function ScenarioSettingsDialog({ scenario, open, onClose, onSave }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !scenario) return;

    setLoading(true);
    setError("");
    setConfig(null);

    fetch(`/api/scenarios/${scenario}/config`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setConfig(data.config);
        else setError(data.error);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [scenario, open]);

  const handleSave = async () => {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/scenarios/${scenario}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data = await response.json();

      if (data.ok) {
        onSave && onSave(data.config);
        onClose();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!config && !loading && !error) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: "hidden",
          maxWidth: 520,
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
        <SettingsIcon sx={{ color: "#2563eb" }} />
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>
            Szenario-Konfiguration
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {scenario}
          </Typography>
        </Box>

        {/* CLOSE BUTTON */}
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

      <DialogContent sx={{ pt: 2, pb: 1.5 }}>
        {/* Add a tiny breathing room below header */}
        <Box sx={{ height: 6 }} />

        {loading && <Typography color="text.secondary">Lade Konfiguration...</Typography>}

        {error && (
          <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {config && (
          <Stack spacing={2.25}>
            {/* Mode Display (Read-Only) */}
            <Alert
              severity="info"
              sx={{ borderRadius: 2, py: 1 }}
              icon={config.mode === "what_if" ? <AccountTreeIcon /> : <AccessTimeIcon />}
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Modus: {config.mode === "what_if" ? "What-If Szenario" : "Real-Time Szenario"}
              </Typography>
              {config.mode === "what_if" && config.now && (
                <Typography variant="caption" component="div" sx={{ mt: 0.25, color: "#64748b" }}>
                  NOW: {new Date(config.now).toLocaleString("de-DE")}
                </Typography>
              )}
            </Alert>

            {/* Freeze Horizon */}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
                <Typography sx={{ fontWeight: 700, color: "#1e293b", fontSize: "0.9rem" }}>
                  Freeze Horizon
                </Typography>
                <Chip
                  label={`${config.freeze_horizon_hours || 0} Stunden`}
                  size="small"
                  sx={{
                    bgcolor: "#dbeafe",
                    color: "#1e40af",
                    fontWeight: 700,
                    minWidth: 70,
                  }}
                />
              </Stack>

              <Slider
                value={config.freeze_horizon_hours || 0}
                onChange={(e, v) => setConfig({ ...config, freeze_horizon_hours: v })}
                min={0}
                max={168}
                step={1}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v}h`}
                marks={[
                  { value: 0, label: "0" },
                  { value: 24, label: "1d" },
                  { value: 72, label: "3d" },
                  { value: 168, label: "7d" },
                ]}
                sx={{
                  height: 6,
                  "& .MuiSlider-thumb": {
                    width: 18,
                    height: 18,
                    bgcolor: "#2563eb",
                    "&:hover, &.Mui-focusVisible": {
                      boxShadow: "0 0 0 8px rgba(37, 99, 235, 0.16)",
                    },
                  },
                  "& .MuiSlider-track": { bgcolor: "#2563eb", border: "none" },
                  "& .MuiSlider-rail": { bgcolor: "#e2e8f0", opacity: 1 },
                  "& .MuiSlider-mark": { bgcolor: "#94a3b8", height: 8, width: 2 },
                  "& .MuiSlider-markLabel": { fontSize: "0.75rem", color: "#64748b" },
                }}
              />

              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                Vorgänge innerhalb dieser Zeitspanne werden fixiert
              </Typography>
            </Box>

            {/* Freeze PG2 */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={config.freeze_pg2 || false}
                  onChange={(e) => setConfig({ ...config, freeze_pg2: e.target.checked })}
                  sx={{
                    color: "#2563eb",
                    "&.Mui-checked": { color: "#2563eb" },
                    py: 0,
                  }}
                />
              }
              label={
                <Typography variant="body2" sx={{ color: "#1e293b" }}>
                  Auch Priority Group 2 einfrieren
                </Typography>
              }
              sx={{ m: 0 }}
            />

            {/* Notes */}
            <TextField
              fullWidth
              label="Notizen"
              multiline
              rows={2}
              value={config.notes || ""}
              onChange={(e) => setConfig({ ...config, notes: e.target.value })}
              placeholder="Optionale Notizen..."
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  "& fieldset": { borderColor: "#cbd5e1" },
                },
              }}
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.75, bgcolor: "#f8fafc", gap: 1 }}>
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
          onClick={handleSave}
          disabled={saving || !config}
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
          {saving ? "Speichere..." : "Speichern"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

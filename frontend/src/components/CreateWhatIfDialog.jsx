// src/components/CreateWhatIfDialog.jsx
import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
  Alert,
  FormHelperText,
  Chip,
  Stack,
  IconButton,
} from "@mui/material";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CloseIcon from "@mui/icons-material/Close";

export default function CreateWhatIfDialog({ open, onClose, onCreate }) {
  const [scenarios, setScenarios] = useState([]);
  const [sourceScenario, setSourceScenario] = useState("");
  const [sourceMeta, setSourceMeta] = useState(null);
  const [name, setName] = useState("");
  const [customNow, setCustomNow] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const fmtDE = (val) => {
    if (!val) return "—";
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("de-DE");
  };

  // Load scenarios when dialog opens
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError("");
    setSourceScenario("");
    setSourceMeta(null);
    setName("");
    setCustomNow("");

    fetch("/api/scenarios/list-detailed")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          // Only show Real-Time scenarios that have been run
          const realTimeScenarios = (data.scenarios || []).filter(
            (s) => s.has_run && s.mode === "real_time"
          );
          setScenarios(realTimeScenarios);
        } else {
          setError(data.error || "Fehler beim Laden der Szenarien");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open]);

  // Load source scenario metadata when selected
  useEffect(() => {
    if (!sourceScenario) {
      setSourceMeta(null);
      return;
    }

    // reset old error/meta
    setError("");
    setSourceMeta(null);

    fetch(`/api/scenarios/${sourceScenario}/run-meta`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setSourceMeta(data.meta);
        else setError(data.error || "run_meta.json konnte nicht geladen werden");
      })
      .catch((err) => setError(err.message));
  }, [sourceScenario]);

  // auto-suggest scenario name
  const suggestedName = useMemo(() => {
    if (!sourceScenario) return "";
    return `${sourceScenario}_whatif`;
  }, [sourceScenario]);

  const handleCreate = async () => {
    setCreating(true);
    setError("");

    try {
      const response = await fetch("/api/scenarios/create-what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_scenario: sourceScenario,
          name: name || undefined,
          now: customNow || undefined,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        onCreate && onCreate(data.scenario);
        onClose();
      } else {
        setError(data.error || "Erstellen fehlgeschlagen");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const canShowCopiedBox = !!(sourceMeta && (sourceMeta.now || sourceMeta.now_used));
  const effectiveNow = sourceMeta?.now || sourceMeta?.now_used;

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
          maxWidth: 560,
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
        <AccountTreeIcon sx={{ color: "#2563eb", fontSize: 28 }} />
        <Box>
          <Typography
            variant="h6"
            sx={{ fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}
          >
            What-If Szenario Erstellen
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Erstellt Kopie eines Real-Time Szenarios
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
        {/* ✅ spacing between header and first control */}
        <Box sx={{ height: 8 }} />

        {loading && <Typography color="text.secondary">Lade Szenarien...</Typography>}

        {error && (
          <Alert severity="error" sx={{ mb: 1.5, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        {!loading && scenarios.length === 0 && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Keine Real-Time Szenarien verfügbar. Erstellen und führen Sie zuerst ein Real-Time Szenario aus.
          </Alert>
        )}

        {!loading && scenarios.length > 0 && (
          <Stack spacing={2.25}>
            {/* Source Scenario */}
            <FormControl fullWidth sx={{ mt: 0.25 }}>
              <InputLabel sx={{ bgcolor: "white", px: 0.5 }}>
                Quell-Szenario wählen
              </InputLabel>

              <Select
                value={sourceScenario}
                onChange={(e) => setSourceScenario(e.target.value)}
                displayEmpty
                sx={{
                  borderRadius: 2,
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "#cbd5e1" },
                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#2563eb" },
                }}
              >
                <MenuItem value="" disabled>
                  <em style={{ color: "#94a3b8" }}>Bitte wählen...</em>
                </MenuItem>

                {scenarios.map((s) => (
                  <MenuItem key={s.name} value={s.name}>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ width: "100%" }}
                    >
                      <Typography sx={{ flex: 1, fontWeight: 500 }}>{s.name}</Typography>
                      <Chip
                        label="Real-Time"
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: "0.7rem",
                          bgcolor: "#dbeafe",
                          color: "#1e40af",
                          fontWeight: 600,
                        }}
                      />
                    </Stack>
                  </MenuItem>
                ))}
              </Select>

              <FormHelperText sx={{ color: "#64748b", fontSize: "0.75rem" }}>
                NOW und Dateien werden automatisch kopiert
              </FormHelperText>
            </FormControl>

            {/* ✅ Source Info (NOW only) */}
            {canShowCopiedBox && (
              <Alert severity="success" icon={<ContentCopyIcon />} sx={{ borderRadius: 2, py: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.25 }}>
                  Wird kopiert:
                </Typography>
                <Typography variant="caption" component="div" sx={{ color: "#64748b" }}>
                  NOW: {fmtDE(effectiveNow)}
                </Typography>
              </Alert>
            )}

            {/* Name */}
            <TextField
              fullWidth
              label="Szenario-Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={sourceScenario ? suggestedName : "Wird automatisch generiert"}
              helperText="Automatisch: [Quell-Szenario]_whatif_[Datum]"
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                  "& fieldset": { borderColor: "#cbd5e1" },
                  "&:hover fieldset": { borderColor: "#2563eb" },
                },
                "& .MuiFormHelperText-root": {
                  fontSize: "0.75rem",
                  color: "#64748b",
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
          onClick={handleCreate}
          disabled={creating || !sourceScenario}
          sx={{
            bgcolor: "#2563eb",
            borderRadius: 2,
            fontWeight: 800,
            px: 3,
            py: 1,
            textTransform: "none",
            "&:hover": { bgcolor: "#1d4ed8" },
            "&.Mui-disabled": { bgcolor: "#cbd5e1", color: "#94a3b8" },
          }}
        >
          {creating ? "Erstelle..." : "What-If Erstellen"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// src/pages/ScenarioListPage.jsx
import { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Alert,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";

import { AddCircle, CheckCircle, Delete as DeleteIcon } from "@mui/icons-material";

import { apiGet, apiPostJson } from "../api";
import { useScenario } from "../context/ScenarioContext";

export default function ScenarioListPage() {
  const { scenario, setScenario } = useScenario();

  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // DELETE dialog state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /* =============================
        LOAD SCENARIOS
  ============================== */
  useEffect(() => {
    apiGet("/scenarios/list")
      .then((res) => setScenarios(res.scenarios || []))
      .catch(() => setError("Fehler beim Laden der Szenarien"))
      .finally(() => setLoading(false));
  }, []);

  /* =============================
        CREATE SCENARIO
  ============================== */
  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setCreating(true);
      setError("");
      setInfo("");

      const data = await apiPostJson("/scenarios/create", {
        name: newName.trim(),
      });

      if (!data.ok) throw new Error(data.error);

      setInfo(`Szenario "${data.scenario}" wurde erstellt!`);
      setScenarios((prev) => [...prev, data.scenario]);
      setScenario(data.scenario);
      setNewName("");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  /* =============================
        DELETE SCENARIO
  ============================== */
  async function confirmDelete() {
    if (!deleteTarget) return;

    try {
      setDeleting(true);
      setError("");
      const res = await apiPostJson("/scenarios/delete", {
        name: deleteTarget,
      });

      if (!res.ok) throw new Error(res.error || "Löschen des Szenarios fehlgeschlagen");

      setScenarios((prev) => prev.filter((s) => s !== deleteTarget));

      if (scenario === deleteTarget) setScenario("");

      setDeleteTarget(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  /* =============================
             RENDER
  ============================== */
  return (
    <>
      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Szenario "{deleteTarget}" löschen?
        </DialogTitle>

        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Diese Aktion <strong>kann nicht rückgängig gemacht werden</strong>.
          </Typography>
          <Typography>
            Alle Daten, die für dieses Szenario hochgeladen oder erzeugt wurden,
            werden dauerhaft gelöscht.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setDeleteTarget(null)}>Abbrechen</Button>

          <Button
            color="error"
            variant="contained"
            onClick={confirmDelete}
            disabled={deleting}
          >
            {deleting ? "Lösche…" : "Löschen"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* MAIN PAGE */}
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
        <Box sx={{ width: "100%", maxWidth: 1100 }}>
          {/* TITLE */}
          <Typography
            variant="h4"
            sx={{
              fontWeight: 900,
              textAlign: "center",
              mb: 1,
              color: "#0f172a",
            }}
          >
            Scheduler-Szenarien
          </Typography>

          <Typography
            variant="h6"
            sx={{
              textAlign: "center",
              color: "#64748b",
              mb: 6,
            }}
          >
            Produktionsszenarien erstellen, aktivieren und verwalten
          </Typography>

          {/* CREATE CARD */}
          <Card
            sx={{
              borderRadius: 4,
              boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
              mb: 6,
            }}
          >
            <CardContent sx={{ p: { xs: 3, md: 5 } }}>
              <Typography
                variant="h5"
                sx={{ fontWeight: 700, mb: 3, color: "#1e293b" }}
              >
                Neues Szenario erstellen
              </Typography>

              <Box
                component="form"
                onSubmit={handleCreate}
                sx={{
                  display: "flex",
                  flexDirection: { xs: "column", sm: "row" },
                  gap: 3,
                }}
              >
                <TextField
                  label="Szenarioname"
                  placeholder="z. B. prod_dez2025_v2"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  fullWidth
                  disabled={creating}
                  variant="outlined"
                  sx={{
                    "& .MuiOutlinedInput-root": { borderRadius: 3 },
                  }}
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  startIcon={<AddCircle />}
                  disabled={creating || !newName.trim()}
                  sx={{
                    bgcolor: "#3b82f6",
                    px: 5,
                    py: 2,
                    fontSize: "1rem",
                    borderRadius: 3,
                    "&:hover": { bgcolor: "#2563eb" },
                  }}
                >
                  {creating ? "Erstelle…" : "Erstellen"}
                </Button>
              </Box>

              {error && (
                <Alert severity="error" sx={{ mt: 3, borderRadius: 2 }}>
                  {error}
                </Alert>
              )}
              {info && (
                <Alert severity="success" sx={{ mt: 3, borderRadius: 2 }}>
                  {info}
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* SCENARIO LIST */}
          <Typography
            variant="h5"
            sx={{ fontWeight: 700, mb: 3, color: "#1e293b" }}
          >
            Vorhandene Szenarien ({scenarios.length})
          </Typography>

          {loading && (
            <Card sx={{ p: 10, textAlign: "center" }}>
              <Typography color="text.secondary">Szenarien werden geladen…</Typography>
            </Card>
          )}

          <Grid container spacing={3}>
            {scenarios.map((s) => (
              <Grid item xs={12} sm={6} md={4} key={s}>
                <Card
                  onClick={() => setScenario(s)}
                  sx={{
                    cursor: "pointer",
                    borderRadius: 4,
                    position: "relative",
                    overflow: "visible",
                    border:
                      s === scenario
                        ? "2px solid #3b82f6"
                        : "2px solid transparent",
                    bgcolor: s === scenario ? "#eff6ff" : "white",
                    boxShadow:
                      s === scenario
                        ? "0 12px 32px rgba(59,130,246,0.25)"
                        : "0 8px 20px rgba(0,0,0,0.08)",
                    transition: "all 0.25s ease",
                    "&:hover": {
                      transform: "translateY(-6px)",
                      boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
                    },
                  }}
                >
                  {/* DELETE BUTTON */}
                  <IconButton
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(s);
                    }}
                    sx={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      opacity: 0,
                      transition: "0.2s",
                      bgcolor: "white",
                      "&:hover": { bgcolor: "#fee2e2" },
                      ".MuiCard-root:hover &": { opacity: 1 },
                    }}
                  >
                    <DeleteIcon color="error" />
                  </IconButton>

                  <CardContent sx={{ textAlign: "center", py: 4 }}>
                    <Typography
                      variant="h6"
                      sx={{ fontWeight: 800, mb: 2, color: "#1e293b" }}
                    >
                      {s}
                    </Typography>

                    {s === scenario ? (
                      <Chip
                        label="AKTIVES SZENARIO"
                        color="primary"
                        icon={<CheckCircle />}
                        sx={{ fontWeight: 700 }}
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Zum Aktivieren klicken
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {!loading && scenarios.length === 0 && (
            <Card sx={{ p: 8, textAlign: "center", mt: 5 }}>
              <Typography variant="h6" color="text.secondary">
                Noch keine Szenarien vorhanden. Erstellen Sie oben Ihr erstes Szenario!
              </Typography>
            </Card>
          )}
        </Box>
      </Box>
    </>
  );
}

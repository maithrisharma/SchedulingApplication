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
import {
  AddCircle,
  CheckCircle,
  Delete as DeleteIcon,
} from "@mui/icons-material";

import { apiPostJson } from "../api";
import { useScenario } from "../context/ScenarioContext";
import PageLayout from "../components/PageLayout";
import { cardPad } from "../theme/layoutTokens";

export default function ScenarioListPage() {
  const { scenario, setScenario, scenarios, setScenarios, refreshScenarios } =
    useScenario();

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
    setLoading(true);
    refreshScenarios()
      .catch(() => setError("Fehler beim Laden der Szenarien"))
      .finally(() => setLoading(false));
  }, [refreshScenarios]);

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

      // ✅ update global list instantly
      setScenarios((prev) => {
        const next = prev.includes(data.scenario) ? prev : [...prev, data.scenario];
        return next;
      });

      // set active scenario
      setScenario(data.scenario);
      setNewName("");

      // optional: re-sync ordering
      refreshScenarios().catch(() => {});
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

      if (!res.ok)
        throw new Error(res.error || "Löschen des Szenarios fehlgeschlagen");

      // ✅ update global list instantly
      setScenarios((prev) => prev.filter((s) => s !== deleteTarget));

      if (scenario === deleteTarget) setScenario("");

      setDeleteTarget(null);

      // optional: re-sync
      refreshScenarios().catch(() => {});
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* DELETE CONFIRMATION DIALOG */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle sx={{ fontWeight: 800 }}>
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

      <PageLayout
        title="Scheduler-Szenarien"
        subtitle="Produktionsszenarien erstellen, aktivieren und verwalten"
        maxWidth={1100}
      >
        {/* CREATE CARD */}
        <Card
          sx={{
            borderRadius: 4,
            boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
            mb: { xs: 3, md: 4 },
          }}
        >
          <CardContent sx={{ p: cardPad }}>
            <Typography
              sx={{
                fontWeight: 800,
                mb: 2,
                color: "#1e293b",
                // smaller on small screens, bigger on big screens
                fontSize: "clamp(1.05rem, 0.95rem + 0.45vw, 1.35rem)",
              }}
            >
              Neues Szenario erstellen
            </Typography>

            <Box
              component="form"
              onSubmit={handleCreate}
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                gap: 2,
                alignItems: { sm: "center" },
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
                startIcon={<AddCircle />}
                disabled={creating || !newName.trim()}
                sx={{
                  bgcolor: "#2563eb",
                  px: 3,
                  height: 44,
                  borderRadius: 3,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                  "&:hover": { bgcolor: "#1d4ed8" },
                }}
              >
                {creating ? "Erstelle…" : "Erstellen"}
              </Button>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
                {error}
              </Alert>
            )}
            {info && (
              <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>
                {info}
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* LIST HEADER */}
        <Typography
          sx={{
            fontWeight: 850,
            color: "#0f172a",
            mb: 2,
            fontSize: "clamp(1.05rem, 0.98rem + 0.4vw, 1.4rem)",
          }}
        >
          Vorhandene Szenarien ({scenarios.length})
        </Typography>

        {loading && (
          <Card sx={{ p: 6, textAlign: "center", borderRadius: 3 }}>
            <Typography color="text.secondary">Szenarien werden geladen…</Typography>
          </Card>
        )}

        <Grid container spacing={2.5}>
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
                    s === scenario ? "2px solid #2563eb" : "2px solid transparent",
                  bgcolor: s === scenario ? "#eff6ff" : "white",
                  boxShadow:
                    s === scenario
                      ? "0 12px 32px rgba(37,99,235,0.20)"
                      : "0 8px 18px rgba(0,0,0,0.08)",
                  transition: "all 0.18s ease",
                  "&:hover": {
                    transform: "translateY(-4px)",
                    boxShadow: "0 16px 28px rgba(0,0,0,0.12)",
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
                    transition: "0.15s",
                    bgcolor: "white",
                    "&:hover": { bgcolor: "#fee2e2" },
                    ".MuiCard-root:hover &": { opacity: 1 },
                  }}
                >
                  <DeleteIcon color="error" />
                </IconButton>

                <CardContent sx={{ textAlign: "center", py: 3.25 }}>
                  <Typography
                    sx={{
                      fontWeight: 850,
                      mb: 1.5,
                      color: "#0f172a",
                      fontSize: "clamp(1.0rem, 0.95rem + 0.25vw, 1.25rem)",
                    }}
                  >
                    {s}
                  </Typography>

                  {s === scenario ? (
                    <Chip
                      label="AKTIVES SZENARIO"
                      color="primary"
                      icon={<CheckCircle />}
                      sx={{ fontWeight: 800 }}
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
          <Card sx={{ p: 6, textAlign: "center", mt: 3, borderRadius: 3 }}>
            <Typography sx={{ color: "#64748b", fontWeight: 700 }}>
              Noch keine Szenarien vorhanden. Erstellen Sie oben Ihr erstes Szenario!
            </Typography>
          </Card>
        )}
      </PageLayout>
    </>
  );
}

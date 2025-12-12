import { useEffect, useState } from "react";
import {
  Box,
  Card,
  Typography,
  Stack,
  Alert,
  CircularProgress,
  Select,
  MenuItem,
  TextField,
  Autocomplete,
} from "@mui/material";

import { useScenario } from "../context/ScenarioContext";
import { apiGet } from "../api";
import OrderRoutingChart from "../components/OrderRoutingChart";

export default function OrderRoutingPage() {
  const { scenario, setScenario, selectedOrder, setSelectedOrder } =
    useScenario();

  const [scenarioList, setScenarioList] = useState([]);
  const [orders, setOrders] = useState([]);

  const [operations, setOperations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  /* LOAD SCENARIOS */
  useEffect(() => {
    apiGet("/scenarios/list")
      .then((res) => setScenarioList(res.scenarios || []))
      .catch(() => setScenarioList([]));
  }, []);

  /* LOAD ORDER LIST */
  useEffect(() => {
    if (!scenario) return;
    setLoading(true);
    setErr("");

    apiGet(`/visualize/${scenario}`)
      .then((res) => {
        if (res.plan) {
          const list = [...new Set(res.plan.map((p) => String(p.OrderNo)))];
          setOrders(list);
        } else {
          setOrders([]);
        }
      })
      .catch(() => {
        setOrders([]);
        setErr("Auftragsliste konnte nicht geladen werden.");
      })
      .finally(() => setLoading(false));
  }, [scenario]);

  /* LOAD OPERATIONS FOR SELECTED ORDER */
  useEffect(() => {
    if (!scenario || !selectedOrder) {
      setOperations([]);
      return;
    }

    setLoading(true);
    setErr("");

    apiGet(`/visualize/${scenario}/order/${selectedOrder}`)
      .then((res) => {
        setOperations(res.operations || []);
      })
      .catch(() => {
        setOperations([]);
        setErr("Auftragsrouting konnte nicht geladen werden.");
      })
      .finally(() => setLoading(false));
  }, [scenario, selectedOrder]);

  return (
    <Box sx={{ bgcolor: "#f8fafc", minHeight: "100vh", px: 3, pt: 3 }}>
      <Box sx={{ maxWidth: 1600, mx: "auto" }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: 800, textAlign: "center", mb: 1 }}
        >
          Auftragsrouting
        </Typography>

        <Typography
          variant="subtitle1"
          sx={{ textAlign: "center", color: "#64748b", mb: 3 }}
        >
          Szenario:{" "}
          <strong style={{ color: "#3b82f6" }}>{scenario || "—"}</strong>
        </Typography>

        <Card sx={{ borderRadius: 4, p: 3 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems="center"
            justifyContent="space-between"
            spacing={2}
            sx={{ mb: 3 }}
          >
            <Select
              value={scenarioList.includes(scenario) ? scenario : ""}
              onChange={(e) => setScenario(e.target.value)}
              displayEmpty
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="">
                <em>Szenario auswählen</em>
              </MenuItem>

              {scenarioList.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>

            <Autocomplete
              options={orders}
              value={selectedOrder || null}
              onChange={(e, v) => setSelectedOrder(v || "")}
              sx={{ width: 300 }}
              renderInput={(params) => (
                <TextField {...params} label="Auftrag auswählen" />
              )}
            />
          </Stack>

          {err && <Alert severity="error">{err}</Alert>}

          {loading && (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <CircularProgress size={70} />
            </Box>
          )}

          {!loading && selectedOrder && operations.length === 0 && !err && (
            <Alert severity="warning">
              Keine Vorgänge für diesen Auftrag gefunden.
            </Alert>
          )}

          {!loading && operations.length > 0 && (
            <OrderRoutingChart operations={operations} />
          )}
        </Card>
      </Box>
    </Box>
  );
}

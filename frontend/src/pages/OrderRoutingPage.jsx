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
  const { scenario, setScenario } = useScenario();

  const [scenarioList, setScenarioList] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState("");

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

    apiGet(`/visualize/${scenario}`)
      .then((res) => {
        if (res.plan) {
          const list = [...new Set(res.plan.map((p) => String(p.OrderNo)))];
          setOrders(list);
        } else setOrders([]);
        setLoading(false);
      })
      .catch(() => {
        setOrders([]);
        setLoading(false);
      });
  }, [scenario]);

  /* LOAD OPERATIONS */
  useEffect(() => {
    if (!scenario || !selectedOrder) return;
    setLoading(true);

    apiGet(`/visualize/${scenario}/order/${selectedOrder}`)
      .then((res) => {
        setOperations(res.operations || []);
        setLoading(false);
      })
      .catch(() => {
        setOperations([]);
        setLoading(false);
      });
  }, [scenario, selectedOrder]);

  return (
    <Box sx={{ bgcolor: "#f8fafc", minHeight: "100vh", px: 3, pt: 3 }}>
      <Box sx={{ maxWidth: 1600, mx: "auto" }}>
        <Typography variant="h4" sx={{ fontWeight: 800, textAlign: "center", mb: 1 }}>
          Order Routing
        </Typography>

        <Typography variant="subtitle1" sx={{ textAlign: "center", color: "#64748b", mb: 3 }}>
          Scenario: <strong style={{ color: "#3b82f6" }}>{scenario}</strong>
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
                <em>Select Scenario</em>
              </MenuItem>

              {scenarioList.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </Select>

            <Autocomplete
              options={orders}
              value={selectedOrder}
              onChange={(e, v) => setSelectedOrder(v)}
              sx={{ width: 300 }}
              renderInput={(params) => <TextField {...params} label="Select Order" />}
            />
          </Stack>

          {err && <Alert severity="error">{err}</Alert>}

          {loading && (
            <Box sx={{ textAlign: "center", py: 8 }}>
              <CircularProgress size={70} />
            </Box>
          )}

          {!loading && selectedOrder && operations.length === 0 && (
            <Alert severity="warning">No operations found for this order.</Alert>
          )}

          {!loading && operations.length > 0 && (
            <OrderRoutingChart operations={operations} />
          )}
        </Card>
      </Box>
    </Box>
  );
}

// src/pages/AnalysisToolsPage.jsx
import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";

import {
  Box,
  Typography,
  Drawer,
  Divider,
  Stack,
  Button,
  MenuItem,
  Select,
  TextField,
  Checkbox,
  ListItemText,
} from "@mui/material";

import { Close } from "@mui/icons-material";
import { useGlobalFilters } from "../context/GlobalFiltersContext";

import OrderRoutingPage from "./OrderRoutingPage";
import MachineContextPage from "./MachineContextPage";
import UtilizationPage from "./UtilizationPage";
import IdleTimePage from "./IdleTimePage";
import HeatmapPage from "./HeatmapPage";
import UnifiedGanttPage from "./UnifiedGanttPage";

const ALL_SENTINEL = "__ALL__";

export default function AnalysisToolsPage() {
  const { filters, applyFilters, machineList } = useGlobalFilters();

  const [openFilters, setOpenFilters] = useState(true);
  const [local, setLocal] = useState(filters);

  useEffect(() => setLocal(filters), [filters]);

  const handleApply = () => {
    applyFilters(local);
    setOpenFilters(false);
  };

  const clearAllFilters = () => {
    const reset = {
      machines: [],
      priority: "all",
      outsourcing: "all",
      deadline: "all",
      dateStart: null,
      dateEnd: null,
    };
    applyFilters(reset);
    setLocal(reset);
  };

  const handleMachineChange = (e) => {
    let value = e.target.value;
    const hadAllBefore = local.machines.includes(ALL_SENTINEL);
    const hasAllNow = value.includes(ALL_SENTINEL);

    if (hasAllNow && !hadAllBefore) value = [ALL_SENTINEL];
    else if (hasAllNow && hadAllBefore && value.length > 1)
      value = value.filter((v) => v !== ALL_SENTINEL);
    else if (!value.includes(ALL_SENTINEL) && value.length === machineList.length)
      value = [ALL_SENTINEL];

    setLocal({ ...local, machines: value });
  };

  const renderMachineValue = (selected) => {
    if (selected.length === 0) return "Alle Maschinen (Top 10 als Standard)";
    if (selected[0] === ALL_SENTINEL) return "Alle Maschinen";
    return selected.join(", ");
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        width: "100%",
        maxWidth: "100%",
        overflowX: "hidden",
        bgcolor: "#f8fafc",
      }}
    >
      {/* ----------------------------------
          LINKER FILTERBEREICH (DRAWER)
      ----------------------------------- */}
      <Drawer
        variant="temporary"
        anchor="left"
        open={openFilters}
        onClose={() => setOpenFilters(false)}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: 330,
            bgcolor: "white",
            p: 2, // ✅ smaller padding
            borderRight: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            gap: 1, // ✅ consistent smaller spacing
          },
        }}
      >
        {/* Header */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6" fontWeight={800}>
            Globale Filter
          </Typography>
          <Button onClick={() => setOpenFilters(false)} sx={{ minWidth: 36, px: 1 }}>
            <Close />
          </Button>
        </Box>

        <Divider />

        {/* ✅ Scroll area (only controls scroll, buttons stay visible) */}
        <Box sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
          {/* MASCHINENWAHL */}
          <Typography fontWeight={600} mb={0.5}>
            Maschine
          </Typography>

          <Select
            fullWidth
            size="small" // ✅ smaller
            multiple
            displayEmpty
            value={local.machines}
            onChange={handleMachineChange}
            renderValue={renderMachineValue}
            sx={{ minHeight: 40 }} // ✅ smaller height
          >
            <MenuItem value={ALL_SENTINEL}>
              <Checkbox size="small" checked={local.machines.includes(ALL_SENTINEL)} />
              <ListItemText primary="Alle Maschinen" />
            </MenuItem>

            {machineList.map((m) => (
              <MenuItem key={m} value={m}>
                <Checkbox size="small" checked={local.machines.includes(m)} />
                <ListItemText primary={m} />
              </MenuItem>
            ))}
          </Select>

          <Box mt={1.5} />

          {/* PRIORITÄT */}
          <Typography fontWeight={600} mb={0.5}>
            Prioritätsgruppe
          </Typography>
          <Select
            fullWidth
            size="small" // ✅ smaller
            value={local.priority}
            onChange={(e) => setLocal({ ...local, priority: e.target.value })}
            sx={{ minHeight: 40 }}
          >
            <MenuItem value="all">Alle Prioritäten</MenuItem>
            <MenuItem value="0">BottleNeck Maschinen</MenuItem>
            <MenuItem value="1">NonBottleNeck Maschinen</MenuItem>
            <MenuItem value="2">Unbegrenzt</MenuItem>
          </Select>

          <Box mt={1.5} />

          {/* OUTSOURCING */}
          <Typography fontWeight={600} mb={0.5}>
            Outsourcing
          </Typography>
          <Select
            fullWidth
            size="small" // ✅ smaller
            value={local.outsourcing}
            onChange={(e) => setLocal({ ...local, outsourcing: e.target.value })}
            sx={{ minHeight: 40 }}
          >
            <MenuItem value="all">Alle Aufträge</MenuItem>
            <MenuItem value="outs">Nur Outsourcing</MenuItem>
          </Select>

          <Box mt={1.5} />

          {/* DEADLINE */}
          <Typography fontWeight={600} mb={0.5}>
            Deadline-Filter
          </Typography>
          <Select
            fullWidth
            size="small" // ✅ smaller
            value={local.deadline}
            onChange={(e) => setLocal({ ...local, deadline: e.target.value })}
            sx={{ minHeight: 40 }}
          >
            <MenuItem value="all">Alle Aufträge</MenuItem>
            <MenuItem value="late">Nur verspätete</MenuItem>
            <MenuItem value="hasDeadline">Mit Deadline</MenuItem>
          </Select>

          <Box mt={1.5} />

          {/* DATUMSBEREICH */}
          <Typography fontWeight={600} mb={0.5}>
            Datumsbereich
          </Typography>

          <Stack direction="row" spacing={1.5}>
            <TextField
              size="small" // ✅ smaller
              type="date"
              label="Von"
              InputLabelProps={{ shrink: true }}
              value={local.dateStart || ""}
              onChange={(e) => setLocal({ ...local, dateStart: e.target.value })}
              fullWidth
            />

            <TextField
              size="small" // ✅ smaller
              type="date"
              label="Bis"
              InputLabelProps={{ shrink: true }}
              value={local.dateEnd || ""}
              onChange={(e) => setLocal({ ...local, dateEnd: e.target.value })}
              fullWidth
            />
          </Stack>

          {/* small bottom padding so last field doesn't stick to sticky footer */}
          <Box mt={1.5} />
        </Box>

        {/* ✅ Sticky footer actions */}
        <Box sx={{ pt: 1, borderTop: "1px solid #e2e8f0", bgcolor: "white" }}>
          <Button
            variant="contained"
            fullWidth
            size="small"
            sx={{ borderRadius: 2, py: 1 }}
            onClick={handleApply}
          >
            Filter anwenden
          </Button>

          <Button
            variant="outlined"
            fullWidth
            size="small"
            sx={{ mt: 1, borderRadius: 2, py: 1 }}
            onClick={clearAllFilters}
          >
            Filter zurücksetzen
          </Button>
        </Box>
      </Drawer>

      {/* ----------------------------------
              HAUPTBEREICH
      ----------------------------------- */}
      <Box
        sx={{
          flexGrow: 1,
          width: "100%",
          maxWidth: "100%",
          overflowX: "hidden",
          px: 0,
          pt: 0,
          pb: 0,
        }}
      >
        <Routes>
          <Route
            path="gantt"
            element={<UnifiedGanttPage onOpenFilters={() => setOpenFilters(true)} />}
          />
          <Route
            path="order-routing"
            element={<OrderRoutingPage onOpenFilters={() => setOpenFilters(true)} />}
          />
          <Route
            path="machine-context"
            element={<MachineContextPage onOpenFilters={() => setOpenFilters(true)} />}
          />
          <Route
            path="utilization"
            element={<UtilizationPage onOpenFilters={() => setOpenFilters(true)} />}
          />
          <Route
            path="idle-time"
            element={<IdleTimePage onOpenFilters={() => setOpenFilters(true)} />}
          />
          <Route
            path="heatmap"
            element={<HeatmapPage onOpenFilters={() => setOpenFilters(true)} />}
          />
        </Routes>
      </Box>
    </Box>
  );
}

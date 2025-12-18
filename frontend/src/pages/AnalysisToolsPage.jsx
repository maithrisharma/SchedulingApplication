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

import GanttPage from "./GanttPage";
import OrderRoutingPage from "./OrderRoutingPage";
import MachineContextPage from "./MachineContextPage";
import UtilizationPage from "./UtilizationPage";
import IdleTimePage from "./IdleTimePage";
import HeatmapPage from "./HeatmapPage";

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
            p: 3,
            borderRight: "1px solid #e2e8f0",
          },
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
          <Typography variant="h6" fontWeight={800}>
            Globale Filter
          </Typography>
          <Button onClick={() => setOpenFilters(false)}>
            <Close />
          </Button>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* MASCHINENWAHL */}
        <Typography fontWeight={600} mb={1}>
          Maschine
        </Typography>

        <Select
          fullWidth
          multiple
          displayEmpty
          value={local.machines}
          onChange={handleMachineChange}
          renderValue={renderMachineValue}
          sx={{ minHeight: 48 }}
        >
          <MenuItem value={ALL_SENTINEL}>
            <Checkbox checked={local.machines.includes(ALL_SENTINEL)} />
            <ListItemText primary="Alle Maschinen" />
          </MenuItem>

          {machineList.map((m) => (
            <MenuItem key={m} value={m}>
              <Checkbox checked={local.machines.includes(m)} />
              <ListItemText primary={m} />
            </MenuItem>
          ))}
        </Select>

        <Box mt={3} />

        {/* PRIORITÄT */}
        <Typography fontWeight={600} mb={1}>
          Prioritätsgruppe
        </Typography>
        <Select
          fullWidth
          value={local.priority}
          onChange={(e) => setLocal({ ...local, priority: e.target.value })}
        >
          <MenuItem value="all">Alle Prioritäten</MenuItem>
          <MenuItem value="0">BottleNeck Maschinen</MenuItem>
          <MenuItem value="1">NonBottleNeck Maschinen</MenuItem>
          <MenuItem value="2">Unbegrenzt</MenuItem>
        </Select>

        <Box mt={3} />

        {/* OUTSOURCING */}
        <Typography fontWeight={600} mb={1}>
          Outsourcing
        </Typography>
        <Select
          fullWidth
          value={local.outsourcing}
          onChange={(e) => setLocal({ ...local, outsourcing: e.target.value })}
        >
          <MenuItem value="all">Alle Aufträge</MenuItem>
          <MenuItem value="outs">Nur Outsourcing</MenuItem>
        </Select>

        <Box mt={3} />

        {/* DEADLINE */}
        <Typography fontWeight={600} mb={1}>
          Deadline-Filter
        </Typography>
        <Select
          fullWidth
          value={local.deadline}
          onChange={(e) => setLocal({ ...local, deadline: e.target.value })}
        >
          <MenuItem value="all">Alle Aufträge</MenuItem>
          <MenuItem value="late">Nur verspätete</MenuItem>
          <MenuItem value="hasDeadline">Mit Deadline</MenuItem>
        </Select>

        <Box mt={3} />

        {/* DATUMSBEFEHL */}
        <Typography fontWeight={600} mb={1}>
          Datumsbereich
        </Typography>

        <Stack direction="row" spacing={2}>
          <TextField
            type="date"
            label="Von"
            InputLabelProps={{ shrink: true }}
            value={local.dateStart || ""}
            onChange={(e) => setLocal({ ...local, dateStart: e.target.value })}
            fullWidth
          />

          <TextField
            type="date"
            label="Bis"
            InputLabelProps={{ shrink: true }}
            value={local.dateEnd || ""}
            onChange={(e) => setLocal({ ...local, dateEnd: e.target.value })}
            fullWidth
          />
        </Stack>

        <Button
          variant="contained"
          fullWidth
          sx={{ mt: 4, borderRadius: 2, py: 1.2 }}
          onClick={handleApply}
        >
          Filter anwenden
        </Button>

        <Button
          variant="outlined"
          fullWidth
          sx={{ mt: 2, borderRadius: 2, py: 1.2 }}
          onClick={clearAllFilters}
        >
          Filter zurücksetzen
        </Button>
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
          px: 4,
          pt: 1,
          pb: 4,
        }}
      >
        <Routes>
          <Route
            path="gantt"
            element={<GanttPage onOpenFilters={() => setOpenFilters(true)} />}
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

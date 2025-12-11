// src/pages/PlanTablePage.jsx

import { useEffect, useState, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  Button,
  Stack,
  CircularProgress,
  Popover,
  IconButton,
  Checkbox,
  FormControlLabel,
  RadioGroup,
  Radio,
  FormControl,
  Divider,
  TextField,
  Select,
  MenuItem,
} from "@mui/material";
import {
  Download,
  FilterList,
  ClearAll,
  ExpandMore,
  ChevronRight,
} from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { apiGet, apiFetchFile } from "../api";
import { useScenario } from "../context/ScenarioContext";

// -------------------- CONSTANTS --------------------

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const dateFields = ["Start", "End", "LatestStartDate", "OutsourcingDelivery"];

const boolFields = [
  "StartsBeforeLSD",
  "WithinGraceDays",
  "IsUnlimitedMachine",
  "IsOutsourcing",
];

// All remaining columns use value checklist filters
const valueFilterFields = [
  "job_id",
  "OrderNo",
  "OrderPos",
  "Orderstate",
  "ItemNo",
  "SortPos",
  "WorkPlaceNo",
  "Duration",
  "PriorityGroup",
  "BufferIndustrial",
  "BufferReal",
  "ReasonSelected",
  "DurationReal",
  "RecordType",
  "IdleBeforeReal",
  "IdleBefore",
];

const initialBoolFilters = {
  StartsBeforeLSD: "all",
  WithinGraceDays: "all",
  IsUnlimitedMachine: "all",
  IsOutsourcing: "all",
};

// Key used for blanks in value filters
const BLANK_KEY = "__BLANK__";

// Grid theme – white background, bold black headers
const gridTheme = createTheme({
  palette: { mode: "light" },
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: {
          backgroundColor: "white",
        },
        columnHeaders: {
          backgroundColor: "#e2e8f0",
        },
        columnHeaderTitle: {
          fontWeight: 700,
          color: "black",
        },
        cell: {
          color: "black",
        },
      },
    },
  },
});

// -------------------- SMALL REUSABLE PARTS --------------------

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function boolToText(v) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "";
}

function HeaderWithFilter({ label, active, onClick }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        gap: 0.5,
      }}
    >
      <Typography
        variant="body2"
        sx={{ fontWeight: 700 }}
        noWrap
        title={label}
      >
        {label}
      </Typography>
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation(); // don't trigger sort
          onClick?.(e);
        }}
        sx={{
          p: 0.25,
          color: active ? "primary.main" : "text.disabled",
          flexShrink: 0,
        }}
      >
        <FilterList fontSize="small" />
      </IconButton>
    </Box>
  );
}

// -------------------- MAIN COMPONENT --------------------

export default function PlanTablePage() {
  const { scenario, setScenario } = useScenario();

  const [activeTab, setActiveTab] = useState(0); // 0 = machine, 1 = order
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // For scenario dropdown
  const [scenarioOptions, setScenarioOptions] = useState([]);

  // Boolean filters: StartsBeforeLSD, WithinGraceDays, IsUnlimitedMachine, IsOutsourcing
  const [boolFilters, setBoolFilters] = useState(initialBoolFilters);

  // Date filters: per field object { selected: string[] (keys "y-m-d"), includeNull: boolean }
  const [dateFilters, setDateFilters] = useState(() => {
    const obj = {};
    dateFields.forEach((f) => {
      obj[f] = { selected: [], includeNull: false };
    });
    return obj;
  });

  // Value filters: per field { active: boolean, selected: string[] (keys) }
  const [valueFilters, setValueFilters] = useState(() => {
    const obj = {};
    valueFilterFields.forEach((f) => {
      obj[f] = { active: false, selected: [] };
    });
    return obj;
  });

  // Popover state
  const [dateFilterAnchor, setDateFilterAnchor] = useState(null);
  const [activeDateField, setActiveDateField] = useState(null);

  const [boolFilterAnchor, setBoolFilterAnchor] = useState(null);
  const [activeBoolField, setActiveBoolField] = useState(null);

  const [valueFilterAnchor, setValueFilterAnchor] = useState(null);
  const [activeValueField, setActiveValueField] = useState(null);
  const [valueFilterSearch, setValueFilterSearch] = useState("");

  // Collapsible state for date tree (Excel style)
  // Keys:
  //   yearKey  = `${field}-${year}`
  //   monthKey = `${field}-${year}-${month}`
  const [expandedYears, setExpandedYears] = useState({});
  const [expandedMonths, setExpandedMonths] = useState({});

  // ---------- LOAD SCENARIO OPTIONS (for selector) ----------

  useEffect(() => {
    apiGet("/scenarios/list").then((res) => {
      setScenarioOptions(res.scenarios || []);
    });
  }, []);

  // ---------- LOAD DATA ----------

  useEffect(() => {
    if (!scenario) return;

    setLoading(true);
    apiGet(`/visual/${scenario}/plan-table`)
      .then((res) => {
        if (!res?.ok) {
          setRows([]);
          return;
        }
        const table = activeTab === 0 ? res.machine_view : res.order_view;
        setRows(
          table.map((row, i) => ({
            id: row.job_id || i,
            ...row,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [scenario, activeTab]);

  // ---------- DATE TREE (YEAR / MONTH / DAY + HAS NULL) ----------

  const dateTrees = useMemo(() => {
    const trees = {};
    dateFields.forEach((f) => {
      trees[f] = { years: {}, hasNull: false };
    });

    rows.forEach((row) => {
      dateFields.forEach((field) => {
        const raw = row[field];
        if (!raw) {
          if (raw === null || raw === undefined) {
            trees[field].hasNull = true;
          }
          return;
        }
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return;
        const y = d.getFullYear();
        const m = d.getMonth(); // 0-11
        const day = d.getDate(); // 1-31

        if (!trees[field].years[y]) trees[field].years[y] = {};
        if (!trees[field].years[y][m]) trees[field].years[y][m] = new Set();
        trees[field].years[y][m].add(day);
      });
    });

    return trees;
  }, [rows]);

  // ---------- VALUE OPTIONS (DISTINCT VALUES PER COLUMN) ----------

  const valueOptions = useMemo(() => {
    const map = {};
    valueFilterFields.forEach((f) => {
      map[f] = { options: new Set(), hasBlank: false };
    });

    rows.forEach((row) => {
      valueFilterFields.forEach((field) => {
        const v = row[field];
        if (v === null || v === undefined || v === "") {
          map[field].hasBlank = true;
        } else {
          map[field].options.add(String(v));
        }
      });
    });

    // Convert sets to sorted arrays for rendering
    const result = {};
    Object.entries(map).forEach(([field, { options, hasBlank }]) => {
      const arr = Array.from(options).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );
      result[field] = { options: arr, hasBlank };
    });

    return result;
  }, [rows]);

  // ---------- FILTERING LOGIC ----------

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Boolean filters
      for (const [field, mode] of Object.entries(boolFilters)) {
        if (mode === "all") continue;
        const v = row[field];
        if (mode === "yes" && !v) return false;
        if (mode === "no" && v) return false;
      }

      // Date filters
      for (const field of dateFields) {
        const { selected, includeNull } = dateFilters[field] || {};
        const hasSelection = (selected && selected.length > 0) || includeNull;
        if (!hasSelection) continue; // no active filter for this date column

        const raw = row[field];

        if (!raw) {
          // null / undefined / empty
          return includeNull ? true : false;
        }

        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return false;

        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!selected.includes(key)) return false;
      }

      // Value filters
      for (const [field, fState] of Object.entries(valueFilters)) {
        if (!fState.active) continue;
        const v = row[field];
        const key =
          v === null || v === undefined || v === "" ? BLANK_KEY : String(v);
        if (!fState.selected.includes(key)) return false;
      }

      return true;
    });
  }, [rows, boolFilters, dateFilters, valueFilters]);

  // ---------- FILTER HANDLERS ----------

  const handleOpenDateFilter = (field) => (event) => {
    setActiveDateField(field);
    setDateFilterAnchor(event.currentTarget);
    // close others
    setBoolFilterAnchor(null);
    setActiveBoolField(null);
    setValueFilterAnchor(null);
    setActiveValueField(null);
  };

  const handleCloseDateFilter = () => {
    setActiveDateField(null);
    setDateFilterAnchor(null);
  };

  const handleOpenBoolFilter = (field) => (event) => {
    setActiveBoolField(field);
    setBoolFilterAnchor(event.currentTarget);
    // close others
    setDateFilterAnchor(null);
    setActiveDateField(null);
    setValueFilterAnchor(null);
    setActiveValueField(null);
  };

  const handleCloseBoolFilter = () => {
    setActiveBoolField(null);
    setBoolFilterAnchor(null);
  };

  const handleOpenValueFilter = (field) => (event) => {
    setActiveValueField(field);
    setValueFilterAnchor(event.currentTarget);
    setValueFilterSearch("");
    // close others
    setDateFilterAnchor(null);
    setActiveDateField(null);
    setBoolFilterAnchor(null);
    setActiveBoolField(null);
  };

  const handleCloseValueFilter = () => {
    setActiveValueField(null);
    setValueFilterAnchor(null);
  };

  const handleClearAllFilters = () => {
    setBoolFilters(initialBoolFilters);
    setDateFilters(() => {
      const obj = {};
      dateFields.forEach((f) => {
        obj[f] = { selected: [], includeNull: false };
      });
      return obj;
    });
    setValueFilters(() => {
      const obj = {};
      valueFilterFields.forEach((f) => {
        obj[f] = { active: false, selected: [] };
      });
      return obj;
    });
  };

  // ---------- COLUMN DEFINITIONS ----------

  const columns = [
    {
      field: "job_id",
      headerName: "job_id",
      width: 140,
      renderHeader: () => (
        <HeaderWithFilter
          label="job_id"
          active={valueFilters.job_id?.active}
          onClick={handleOpenValueFilter("job_id")}
        />
      ),
    },
    {
      field: "OrderNo",
      headerName: "OrderNo",
      width: 120,
      renderHeader: () => (
        <HeaderWithFilter
          label="OrderNo"
          active={valueFilters.OrderNo?.active}
          onClick={handleOpenValueFilter("OrderNo")}
        />
      ),
    },
    {
      field: "OrderPos",
      headerName: "OrderPos",
      width: 100,
      renderHeader: () => (
        <HeaderWithFilter
          label="OrderPos"
          active={valueFilters.OrderPos?.active}
          onClick={handleOpenValueFilter("OrderPos")}
        />
      ),
    },
    {
      field: "Orderstate",
      headerName: "Orderstate",
      width: 120,
      renderHeader: () => (
        <HeaderWithFilter
          label="Orderstate"
          active={valueFilters.Orderstate?.active}
          onClick={handleOpenValueFilter("Orderstate")}
        />
      ),
    },
    {
      field: "ItemNo",
      headerName: "ItemNo",
      width: 110,
      renderHeader: () => (
        <HeaderWithFilter
          label="ItemNo"
          active={valueFilters.ItemNo?.active}
          onClick={handleOpenValueFilter("ItemNo")}
        />
      ),
    },
    {
      field: "SortPos",
      headerName: "SortPos",
      width: 110,
      renderHeader: () => (
        <HeaderWithFilter
          label="SortPos"
          active={valueFilters.SortPos?.active}
          onClick={handleOpenValueFilter("SortPos")}
        />
      ),
    },
    {
      field: "WorkPlaceNo",
      headerName: "WorkPlaceNo",
      width: 140,
      renderHeader: () => (
        <HeaderWithFilter
          label="WorkPlaceNo"
          active={valueFilters.WorkPlaceNo?.active}
          onClick={handleOpenValueFilter("WorkPlaceNo")}
        />
      ),
    },

    // Date columns (renderCell so values are always visible)
    {
      field: "Start",
      headerName: "Start",
      width: 190,
      renderCell: (params) => fmtDate(params.row.Start),
      renderHeader: () => (
        <HeaderWithFilter
          label="Start"
          active={
            dateFilters.Start?.selected.length > 0 ||
            dateFilters.Start?.includeNull
          }
          onClick={handleOpenDateFilter("Start")}
        />
      ),
    },
    {
      field: "End",
      headerName: "End",
      width: 190,
      renderCell: (params) => fmtDate(params.row.End),
      renderHeader: () => (
        <HeaderWithFilter
          label="End"
          active={
            dateFilters.End?.selected.length > 0 ||
            dateFilters.End?.includeNull
          }
          onClick={handleOpenDateFilter("End")}
        />
      ),
    },

    {
      field: "Duration",
      headerName: "Duration",
      width: 120,
      renderHeader: () => (
        <HeaderWithFilter
          label="Duration"
          active={valueFilters.Duration?.active}
          onClick={handleOpenValueFilter("Duration")}
        />
      ),
    },

    {
      field: "LatestStartDate",
      headerName: "LatestStartDate",
      width: 210,
      renderCell: (params) => fmtDate(params.row.LatestStartDate),
      renderHeader: () => (
        <HeaderWithFilter
          label="LatestStartDate"
          active={
            dateFilters.LatestStartDate?.selected.length > 0 ||
            dateFilters.LatestStartDate?.includeNull
          }
          onClick={handleOpenDateFilter("LatestStartDate")}
        />
      ),
    },

    // Boolean flags (Yes / No)
    {
      field: "StartsBeforeLSD",
      headerName: "StartsBeforeLSD",
      width: 160,
      renderCell: (params) => boolToText(params.row.StartsBeforeLSD),
      renderHeader: () => (
        <HeaderWithFilter
          label="StartsBeforeLSD"
          active={boolFilters.StartsBeforeLSD !== "all"}
          onClick={handleOpenBoolFilter("StartsBeforeLSD")}
        />
      ),
    },
    {
      field: "WithinGraceDays",
      headerName: "WithinGraceDays",
      width: 170,
      renderCell: (params) => boolToText(params.row.WithinGraceDays),
      renderHeader: () => (
        <HeaderWithFilter
          label="WithinGraceDays"
          active={boolFilters.WithinGraceDays !== "all"}
          onClick={handleOpenBoolFilter("WithinGraceDays")}
        />
      ),
    },

    {
      field: "PriorityGroup",
      headerName: "PriorityGroup",
      width: 150,
      renderHeader: () => (
        <HeaderWithFilter
          label="PriorityGroup"
          active={valueFilters.PriorityGroup?.active}
          onClick={handleOpenValueFilter("PriorityGroup")}
        />
      ),
    },

    {
      field: "IsUnlimitedMachine",
      headerName: "IsUnlimitedMachine",
      width: 190,
      renderCell: (params) => boolToText(params.row.IsUnlimitedMachine),
      renderHeader: () => (
        <HeaderWithFilter
          label="IsUnlimitedMachine"
          active={boolFilters.IsUnlimitedMachine !== "all"}
          onClick={handleOpenBoolFilter("IsUnlimitedMachine")}
        />
      ),
    },
    {
      field: "IsOutsourcing",
      headerName: "IsOutsourcing",
      width: 160,
      renderCell: (params) => boolToText(params.row.IsOutsourcing),
      renderHeader: () => (
        <HeaderWithFilter
          label="IsOutsourcing"
          active={boolFilters.IsOutsourcing !== "all"}
          onClick={handleOpenBoolFilter("IsOutsourcing")}
        />
      ),
    },

    {
      field: "OutsourcingDelivery",
      headerName: "OutsourcingDelivery",
      width: 220,
      renderCell: (params) => fmtDate(params.row.OutsourcingDelivery),
      renderHeader: () => (
        <HeaderWithFilter
          label="OutsourcingDelivery"
          active={
            dateFilters.OutsourcingDelivery?.selected.length > 0 ||
            dateFilters.OutsourcingDelivery?.includeNull
          }
          onClick={handleOpenDateFilter("OutsourcingDelivery")}
        />
      ),
    },

    {
      field: "BufferIndustrial",
      headerName: "BufferIndustrial",
      width: 160,
      renderHeader: () => (
        <HeaderWithFilter
          label="BufferIndustrial"
          active={valueFilters.BufferIndustrial?.active}
          onClick={handleOpenValueFilter("BufferIndustrial")}
        />
      ),
    },
    {
      field: "BufferReal",
      headerName: "BufferReal",
      width: 140,
      renderHeader: () => (
        <HeaderWithFilter
          label="BufferReal"
          active={valueFilters.BufferReal?.active}
          onClick={handleOpenValueFilter("BufferReal")}
        />
      ),
    },

    {
      field: "ReasonSelected",
      headerName: "ReasonSelected",
      flex: 1,
      minWidth: 300,
      renderHeader: () => (
        <HeaderWithFilter
          label="ReasonSelected"
          active={valueFilters.ReasonSelected?.active}
          onClick={handleOpenValueFilter("ReasonSelected")}
        />
      ),
    },

    {
      field: "DurationReal",
      headerName: "DurationReal",
      width: 150,
      renderHeader: () => (
        <HeaderWithFilter
          label="DurationReal"
          active={valueFilters.DurationReal?.active}
          onClick={handleOpenValueFilter("DurationReal")}
        />
      ),
    },
    {
      field: "RecordType",
      headerName: "RecordType",
      width: 120,
      renderHeader: () => (
        <HeaderWithFilter
          label="RecordType"
          active={valueFilters.RecordType?.active}
          onClick={handleOpenValueFilter("RecordType")}
        />
      ),
    },

    {
      field: "IdleBeforeReal",
      headerName: "IdleBeforeReal",
      width: 160,
      renderHeader: () => (
        <HeaderWithFilter
          label="IdleBeforeReal"
          active={valueFilters.IdleBeforeReal?.active}
          onClick={handleOpenValueFilter("IdleBeforeReal")}
        />
      ),
    },
    {
      field: "IdleBefore",
      headerName: "IdleBefore",
      width: 140,
      renderHeader: () => (
        <HeaderWithFilter
          label="IdleBefore"
          active={valueFilters.IdleBefore?.active}
          onClick={handleOpenValueFilter("IdleBefore")}
        />
      ),
    },
  ];

  // ---------- LOADING STATE ----------

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        }}
      >
        <CircularProgress size={80} />
      </Box>
    );
  }

  // ---------- RENDER ----------

  const activeDateTree = activeDateField ? dateTrees[activeDateField] : null;
  const activeDateFilterState = activeDateField
    ? dateFilters[activeDateField]
    : null;

  const activeValueOptions = activeValueField
    ? valueOptions[activeValueField] || { options: [], hasBlank: false }
    : { options: [], hasBlank: false };

  const activeValueFilterState = activeValueField
    ? valueFilters[activeValueField]
    : null;

  return (
    <ThemeProvider theme={gridTheme}>
      <Box sx={{ p: 4, bgcolor: "#f1f5f9", minHeight: "100vh" }}>
        <Typography variant="h4" align="center" fontWeight="bold" gutterBottom>
          Plan Table View
        </Typography>

        <Typography align="center" color="text.secondary" mb={4}>
          Scenario:{" "}
          <strong style={{ color: "#2563eb" }}>{scenario || "-"}</strong>
        </Typography>

        <Card sx={{ borderRadius: 3, boxShadow: 8 }}>
          <CardContent sx={{ p: 4 }}>
            {/* Top bar: Scenario selector | Tabs | Buttons */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              mb={3}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <Select
                    value={scenario || ""}
                    displayEmpty
                    onChange={(e) => setScenario(e.target.value)}
                    renderValue={(selected) => selected || "Select scenario"}
                  >
                    {scenarioOptions.length === 0 && (
                      <MenuItem value="">
                        <em>No scenarios</em>
                      </MenuItem>
                    )}
                    {scenarioOptions.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Tabs
                  value={activeTab}
                  onChange={(_, v) => setActiveTab(v)}
                  sx={{ minHeight: 44 }}
                >
                  <Tab label="Machine View" sx={{ minHeight: 44 }} />
                  <Tab label="Order View" sx={{ minHeight: 44 }} />
                </Tabs>
              </Stack>

              <Stack direction="row" spacing={2}>
                  <Button
                  variant="outlined"
                  startIcon={<ClearAll />}
                  onClick={handleClearAllFilters}
                >
                  Clear Filters
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Download />}
                  onClick={() =>
                    apiFetchFile(
                      `/visual/${scenario}/plan-excel`,
                      `${scenario}_plan.xlsx`
                    )
                  }
                  disabled={!scenario}
                >
                  Download Excel
                </Button>

              </Stack>
            </Stack>

            <Box sx={{ height: 820 }}>
              <DataGrid
                rows={filteredRows}
                columns={columns}
                pageSizeOptions={[50, 100, 250]}
                disableRowSelectionOnClick
                disableColumnMenu
                filterMode="client" // we handle filtering ourselves
              />
            </Box>
          </CardContent>
        </Card>

        {/* ---------- BOOLEAN FILTER POPOVER ---------- */}
        <Popover
          open={Boolean(boolFilterAnchor)}
          anchorEl={boolFilterAnchor}
          onClose={handleCloseBoolFilter}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          {activeBoolField && (
            <Box sx={{ p: 2, minWidth: 180 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                {activeBoolField}
              </Typography>
              <FormControl component="fieldset" size="small">
                <RadioGroup
                  value={boolFilters[activeBoolField] || "all"}
                  onChange={(e) => {
                    const value = e.target.value;
                    setBoolFilters((prev) => ({
                      ...prev,
                      [activeBoolField]: value,
                    }));
                  }}
                >
                  <FormControlLabel
                    value="all"
                    control={<Radio size="small" />}
                    label="All"
                  />
                  <FormControlLabel
                    value="yes"
                    control={<Radio size="small" />}
                    label="Yes"
                  />
                  <FormControlLabel
                    value="no"
                    control={<Radio size="small" />}
                    label="No"
                  />
                </RadioGroup>
              </FormControl>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleCloseBoolFilter}
                >
                  Apply
                </Button>
              </Box>
            </Box>
          )}
        </Popover>

        {/* ---------- DATE FILTER POPOVER (Excel-style collapsible tree) ---------- */}
        <Popover
          open={Boolean(dateFilterAnchor)}
          anchorEl={dateFilterAnchor}
          onClose={handleCloseDateFilter}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          {activeDateField && activeDateTree && activeDateFilterState && (
            <Box
              sx={{ p: 2, minWidth: 280, maxHeight: 460, overflowY: "auto" }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                {activeDateField}
              </Typography>

              <Stack direction="row" spacing={1} mb={1}>
                <Button
                  size="small"
                  onClick={() => {
                    const { years, hasNull } = activeDateTree;
                    const selected = [];
                    Object.entries(years).forEach(([yearStr, monthsObj]) => {
                      const y = Number(yearStr);
                      Object.entries(monthsObj).forEach(
                        ([monthStr, daySet]) => {
                          const m = Number(monthStr);
                          Array.from(daySet).forEach((day) => {
                            selected.push(`${y}-${m}-${day}`);
                          });
                        }
                      );
                    });

                    setDateFilters((prev) => ({
                      ...prev,
                      [activeDateField]: {
                        selected,
                        includeNull: hasNull,
                      },
                    }));
                  }}
                >
                  Select All
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setDateFilters((prev) => ({
                      ...prev,
                      [activeDateField]: { selected: [], includeNull: false },
                    }));
                  }}
                >
                  Clear
                </Button>
              </Stack>

              <Divider sx={{ mb: 1 }} />

              {/* No Date row if nulls exist */}
              {activeDateTree.hasNull && (
                <Box sx={{ mb: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={activeDateFilterState.includeNull}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setDateFilters((prev) => ({
                            ...prev,
                            [activeDateField]: {
                              ...prev[activeDateField],
                              includeNull: checked,
                            },
                          }));
                        }}
                      />
                    }
                    label="(No Date)"
                  />
                  <Divider sx={{ mt: 1 }} />
                </Box>
              )}

              {Object.keys(activeDateTree.years).length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No dates available.
                </Typography>
              ) : (
                Object.entries(activeDateTree.years)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([yearStr, monthsObj]) => {
                    const year = Number(yearStr);

                    // All keys for this year
                    const yearKeys = [];
                    Object.entries(monthsObj).forEach(
                      ([monthStr, daySet]) => {
                        const m = Number(monthStr);
                        Array.from(daySet).forEach((day) => {
                          yearKeys.push(`${year}-${m}-${day}`);
                        });
                      }
                    );

                    const selectedSet = new Set(activeDateFilterState.selected);
                    const yearSelectedCount = yearKeys.filter((k) =>
                      selectedSet.has(k)
                    ).length;
                    const yearAllSelected =
                      yearSelectedCount === yearKeys.length &&
                      yearKeys.length > 0;
                    const yearSomeSelected =
                      yearSelectedCount > 0 && !yearAllSelected;

                    const yearKey = `${activeDateField}-${year}`;
                    const isYearExpanded =
                      expandedYears[yearKey] === undefined
                        ? false
                        : expandedYears[yearKey];

                    return (
                      <Box key={year} sx={{ mb: 1.5 }}>
                        {/* Year row */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={() => {
                              setExpandedYears((prev) => ({
                                ...prev,
                                [yearKey]: !isYearExpanded,
                              }));
                            }}
                            sx={{ mr: 0.5 }}
                          >
                            {isYearExpanded ? (
                              <ExpandMore fontSize="small" />
                            ) : (
                              <ChevronRight fontSize="small" />
                            )}
                          </IconButton>

                          <Checkbox
                            size="small"
                            checked={yearAllSelected}
                            indeterminate={yearSomeSelected}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setDateFilters((prev) => {
                                const current = new Set(
                                  prev[activeDateField].selected
                                );
                                if (checked) {
                                  yearKeys.forEach((k) => current.add(k));
                                } else {
                                  yearKeys.forEach((k) => current.delete(k));
                                }
                                return {
                                  ...prev,
                                  [activeDateField]: {
                                    ...prev[activeDateField],
                                    selected: Array.from(current),
                                  },
                                };
                              });
                            }}
                          />
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600 }}
                          >
                            {year}
                          </Typography>
                        </Box>

                        {/* Months / days */}
                        {isYearExpanded && (
                          <Box sx={{ pl: 4 }}>
                            {Object.entries(monthsObj)
                              .sort(([a], [b]) => Number(a) - Number(b))
                              .map(([monthStr, daySet]) => {
                                const m = Number(monthStr);
                                const days = Array.from(daySet).sort(
                                  (a, b) => a - b
                                );

                                const monthKeys = days.map(
                                  (day) => `${year}-${m}-${day}`
                                );
                                const monthSelectedCount =
                                  monthKeys.filter((k) =>
                                    selectedSet.has(k)
                                  ).length;
                                const monthAllSelected =
                                  monthSelectedCount === monthKeys.length &&
                                  monthKeys.length > 0;
                                const monthSomeSelected =
                                  monthSelectedCount > 0 && !monthAllSelected;

                                const monthKey = `${activeDateField}-${year}-${m}`;
                                const isMonthExpanded =
                                  expandedMonths[monthKey] === undefined
                                    ? false
                                    : expandedMonths[monthKey];

                                return (
                                  <Box key={`${year}-${m}`} sx={{ mb: 0.5 }}>
                                    {/* Month row */}
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 0.5,
                                      }}
                                    >
                                      <IconButton
                                        size="small"
                                        onClick={() => {
                                          setExpandedMonths((prev) => ({
                                            ...prev,
                                            [monthKey]: !isMonthExpanded,
                                          }));
                                        }}
                                        sx={{ mr: 0.5 }}
                                      >
                                        {isMonthExpanded ? (
                                          <ExpandMore fontSize="small" />
                                        ) : (
                                          <ChevronRight fontSize="small" />
                                        )}
                                      </IconButton>

                                      <Checkbox
                                        size="small"
                                        checked={monthAllSelected}
                                        indeterminate={monthSomeSelected}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          setDateFilters((prev) => {
                                            const current = new Set(
                                              prev[activeDateField].selected
                                            );
                                            if (checked) {
                                              monthKeys.forEach((k) =>
                                                current.add(k)
                                              );
                                            } else {
                                              monthKeys.forEach((k) =>
                                                current.delete(k)
                                              );
                                            }
                                            return {
                                              ...prev,
                                              [activeDateField]: {
                                                ...prev[activeDateField],
                                                selected: Array.from(current),
                                              },
                                            };
                                          });
                                        }}
                                      />
                                      <Typography variant="body2">
                                        {monthNames[m]}
                                      </Typography>
                                    </Box>

                                    {/* Days */}
                                    {isMonthExpanded && (
                                      <Box
                                        sx={{
                                          pl: 4,
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 0.5,
                                        }}
                                      >
                                        {days.map((day) => {
                                          const key = `${year}-${m}-${day}`;
                                          const checked =
                                            activeDateFilterState.selected.includes(
                                              key
                                            );
                                          return (
                                            <FormControlLabel
                                              key={key}
                                              control={
                                                <Checkbox
                                                  size="small"
                                                  checked={checked}
                                                  onChange={(e) => {
                                                    const isChecked =
                                                      e.target.checked;
                                                    setDateFilters((prev) => {
                                                      const current = new Set(
                                                        prev[activeDateField]
                                                          .selected
                                                      );
                                                      if (isChecked) {
                                                        current.add(key);
                                                      } else {
                                                        current.delete(key);
                                                      }
                                                      return {
                                                        ...prev,
                                                        [activeDateField]: {
                                                          ...prev[
                                                            activeDateField
                                                          ],
                                                          selected:
                                                            Array.from(
                                                              current
                                                            ),
                                                        },
                                                      };
                                                    });
                                                  }}
                                                />
                                              }
                                              label={String(day).padStart(
                                                2,
                                                "0"
                                              )}
                                              sx={{ mr: 1 }}
                                            />
                                          );
                                        })}
                                      </Box>
                                    )}
                                  </Box>
                                );
                              })}
                          </Box>
                        )}
                      </Box>
                    );
                  })
              )}

              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleCloseDateFilter}
                >
                  Apply
                </Button>
              </Box>
            </Box>
          )}
        </Popover>

        {/* ---------- VALUE FILTER POPOVER (TEXT / NUMBER) ---------- */}
        <Popover
          open={Boolean(valueFilterAnchor)}
          anchorEl={valueFilterAnchor}
          onClose={handleCloseValueFilter}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          {activeValueField && activeValueFilterState && (
            <Box
              sx={{ p: 2, minWidth: 260, maxHeight: 460, overflowY: "auto" }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                {activeValueField}
              </Typography>

              <TextField
                size="small"
                fullWidth
                placeholder="Search"
                value={valueFilterSearch}
                onChange={(e) => setValueFilterSearch(e.target.value)}
                sx={{ mb: 1 }}
              />

              <Stack direction="row" spacing={1} mb={1}>
                <Button
                  size="small"
                  onClick={() => {
                    const { options, hasBlank } = activeValueOptions;
                    const selected = [
                      ...options.map((v) => v),
                      ...(hasBlank ? [BLANK_KEY] : []),
                    ];
                    setValueFilters((prev) => ({
                      ...prev,
                      [activeValueField]: { active: true, selected },
                    }));
                  }}
                >
                  Select All
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    setValueFilters((prev) => ({
                      ...prev,
                      [activeValueField]: { active: false, selected: [] },
                    }));
                  }}
                >
                  Clear
                </Button>
              </Stack>

              <Divider sx={{ mb: 1 }} />

              {(() => {
                const { options, hasBlank } = activeValueOptions;
                const searchLower = valueFilterSearch.toLowerCase();
                const items = [
                  ...(hasBlank ? [BLANK_KEY] : []),
                  ...options.map((v) => v),
                ].filter((key) => {
                  const label =
                    key === BLANK_KEY ? "(Blanks)" : String(key ?? "");
                  return label.toLowerCase().includes(searchLower);
                });

                if (items.length === 0) {
                  return (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mb: 1 }}
                    >
                      No values.
                    </Typography>
                  );
                }

                const selectedSet = new Set(activeValueFilterState.selected);

                return (
                  <Box>
                    {items.map((key) => {
                      const label =
                        key === BLANK_KEY ? "(Blanks)" : String(key ?? "");
                      const checked = selectedSet.has(key);
                      return (
                        <FormControlLabel
                          key={key}
                          control={
                            <Checkbox
                              size="small"
                              checked={checked}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                setValueFilters((prev) => {
                                  const current = new Set(
                                    prev[activeValueField].selected
                                  );
                                  if (isChecked) {
                                    current.add(key);
                                  } else {
                                    current.delete(key);
                                  }
                                  return {
                                    ...prev,
                                    [activeValueField]: {
                                      active: true,
                                      selected: Array.from(current),
                                    },
                                  };
                                });
                              }}
                            />
                          }
                          label={label}
                          sx={{ display: "block", mr: 0 }}
                        />
                      );
                    })}
                  </Box>
                );
              })()}

              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleCloseValueFilter}
                >
                  Apply
                </Button>
              </Box>
            </Box>
          )}
        </Popover>
      </Box>
    </ThemeProvider>
  );
}

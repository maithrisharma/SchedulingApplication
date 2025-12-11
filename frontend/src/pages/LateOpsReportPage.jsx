// src/pages/LateOpsReportPage.jsx

import { useEffect, useState, useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
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

// Dates present in late.csv
const dateFields = ["Start", "End", "LatestStartDate", "Allowed"];

// For late.csv we have no dedicated boolean columns – keep this for shape
const boolFields = [];

const valueFilterFields = [
  "job_id",
  "OrderNo",
  "OrderPos",
  "Orderstate",
  "WorkPlaceNo",
  "DaysLate",
  "RecordType",
];

const initialBoolFilters = {};

const BLANK_KEY = "__BLANK__";

// Grid theme
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

// -------------------- SMALL HELPERS --------------------

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
          e.stopPropagation();
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

export default function LateOpsReportPage() {
  const { scenario, setScenario } = useScenario();

  const [scenarioList, setScenarioList] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [boolFilters, setBoolFilters] = useState(initialBoolFilters);

  const [dateFilters, setDateFilters] = useState(() => {
    const obj = {};
    dateFields.forEach((f) => {
      obj[f] = { selected: [], includeNull: false };
    });
    return obj;
  });

  const [valueFilters, setValueFilters] = useState(() => {
    const obj = {};
    valueFilterFields.forEach((f) => {
      obj[f] = { active: false, selected: [] };
    });
    return obj;
  });

  const [dateFilterAnchor, setDateFilterAnchor] = useState(null);
  const [activeDateField, setActiveDateField] = useState(null);

  const [valueFilterAnchor, setValueFilterAnchor] = useState(null);
  const [activeValueField, setActiveValueField] = useState(null);
  const [valueFilterSearch, setValueFilterSearch] = useState("");

  // Collapsed/expanded state for the "Excel tree" date popper
  const [yearOpenMap, setYearOpenMap] = useState({});
  const [monthOpenMap, setMonthOpenMap] = useState({});

  // -------- Scenario list --------

  useEffect(() => {
    apiGet("/scenarios/list").then((res) => {
      setScenarioList(res.scenarios || []);
    });
  }, []);

  // -------- Load late-table --------

  useEffect(() => {
    if (!scenario) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    apiGet(`/visual/${scenario}/late-table`)
      .then((res) => {
        if (!res?.ok) {
          setRows([]);
          return;
        }
        const table = res.rows || [];
        setRows(
          table.map((row, i) => ({
            id: row.job_id || i,
            ...row,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [scenario]);

  // -------- Date trees --------
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
        const m = d.getMonth();
        const day = d.getDate();

        if (!trees[field].years[y]) trees[field].years[y] = {};
        if (!trees[field].years[y][m]) trees[field].years[y][m] = new Set();
        trees[field].years[y][m].add(day);
      });
    });

    return trees;
  }, [rows]);

  // -------- Value options --------
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

    const result = {};
    Object.entries(map).forEach(([field, { options, hasBlank }]) => {
      const arr = Array.from(options).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );
      result[field] = { options: arr, hasBlank };
    });

    return result;
  }, [rows]);

  // -------- Filtering --------
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Boolean filters (none right now, but keep for future)
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
        if (!hasSelection) continue;

        const raw = row[field];

        if (!raw) {
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

  // -------- Handlers --------

  const handleOpenDateFilter = (field) => (event) => {
    setActiveDateField(field);
    setDateFilterAnchor(event.currentTarget);
    setValueFilterAnchor(null);
    setActiveValueField(null);

    // collapse everything on open (like fresh Excel tree)
    setYearOpenMap({});
    setMonthOpenMap({});
  };

  const handleCloseDateFilter = () => {
    setActiveDateField(null);
    setDateFilterAnchor(null);
  };

  const handleOpenValueFilter = (field) => (event) => {
    setActiveValueField(field);
    setValueFilterAnchor(event.currentTarget);
    setValueFilterSearch("");
    setDateFilterAnchor(null);
    setActiveDateField(null);
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

  // -------- Columns (Responsive: minWidth + flex) --------
  const columns = [
    {
      field: "job_id",
      headerName: "job_id",
      minWidth: 140,
      flex: 1,
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
      minWidth: 120,
      flex: 1,
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
      minWidth: 110,
      flex: 1,
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
      minWidth: 130,
      flex: 1,
      renderHeader: () => (
        <HeaderWithFilter
          label="Orderstate"
          active={valueFilters.Orderstate?.active}
          onClick={handleOpenValueFilter("Orderstate")}
        />
      ),
    },
    {
      field: "WorkPlaceNo",
      headerName: "WorkPlaceNo",
      minWidth: 150,
      flex: 1,
      renderHeader: () => (
        <HeaderWithFilter
          label="WorkPlaceNo"
          active={valueFilters.WorkPlaceNo?.active}
          onClick={handleOpenValueFilter("WorkPlaceNo")}
        />
      ),
    },
    {
      field: "Start",
      headerName: "Start",
      minWidth: 200,
      flex: 1,
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
      minWidth: 200,
      flex: 1,
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
      field: "LatestStartDate",
      headerName: "LatestStartDate",
      minWidth: 220,
      flex: 1,
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
    {
      field: "Allowed",
      headerName: "Allowed",
      minWidth: 220,
      flex: 1,
      renderCell: (params) => fmtDate(params.row.Allowed),
      renderHeader: () => (
        <HeaderWithFilter
          label="Allowed"
          active={
            dateFilters.Allowed?.selected.length > 0 ||
            dateFilters.Allowed?.includeNull
          }
          onClick={handleOpenDateFilter("Allowed")}
        />
      ),
    },
    {
      field: "DaysLate",
      headerName: "DaysLate",
      minWidth: 130,
      flex: 1,
      renderHeader: () => (
        <HeaderWithFilter
          label="DaysLate"
          active={valueFilters.DaysLate?.active}
          onClick={handleOpenValueFilter("DaysLate")}
        />
      ),
    },
    {
      field: "RecordType",
      headerName: "RecordType",
      minWidth: 130,
      flex: 1,
      renderHeader: () => (
        <HeaderWithFilter
          label="RecordType"
          active={valueFilters.RecordType?.active}
          onClick={handleOpenValueFilter("RecordType")}
        />
      ),
    },
  ];

  // -------- Render --------

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
          Late Operations
        </Typography>

        <Typography align="center" color="text.secondary" mb={4}>
          Scenario:{" "}
          <strong style={{ color: "#2563eb" }}>{scenario || "-"}</strong>
        </Typography>

        <Card sx={{ borderRadius: 3, boxShadow: 8 }}>
          <CardContent sx={{ p: 4 }}>
            {/* Top bar: Scenario selector | Buttons (like PlanTable) */}
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
                    renderValue={(selected) =>
                      selected || "Select scenario"
                    }
                  >
                    {scenarioList.length === 0 && (
                      <MenuItem value="">
                        <em>No scenarios</em>
                      </MenuItem>
                    )}
                    {scenarioList.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
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
                  disabled={!scenario}
                  onClick={() =>
                    apiFetchFile(
                      `/visual/${scenario}/late-excel`,
                      `${scenario}_late_ops.xlsx`
                    )
                  }
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
                filterMode="client"
              />
            </Box>
          </CardContent>
        </Card>

        {/* DATE FILTER POPOVER – Excel-style tree, collapsed by default */}
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
                    setYearOpenMap({});
                    setMonthOpenMap({});
                  }}
                >
                  Clear
                </Button>
              </Stack>

              <Divider sx={{ mb: 1 }} />

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
                    const yearKey = String(year);

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

                    const isYearOpen = !!yearOpenMap[yearKey];

                    return (
                      <Box key={year} sx={{ mb: 1.5 }}>
                        {/* Year row with arrow + checkbox */}
                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setYearOpenMap((prev) => ({
                                ...prev,
                                [yearKey]: !prev[yearKey],
                              }));
                            }}
                            sx={{ mr: 0.5 }}
                          >
                            {isYearOpen ? (
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

                        {/* Months / days – only when year expanded */}
                        {isYearOpen && (
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
                                const monthSelectedCount = monthKeys.filter(
                                  (k) => selectedSet.has(k)
                                ).length;
                                const monthAllSelected =
                                  monthSelectedCount === monthKeys.length &&
                                  monthKeys.length > 0;
                                const monthSomeSelected =
                                  monthSelectedCount > 0 && !monthAllSelected;

                                const monthKey = `${year}-${m}`;
                                const isMonthOpen = !!monthOpenMap[monthKey];

                                return (
                                  <Box key={monthKey} sx={{ mb: 0.5 }}>
                                    {/* Month row with arrow + checkbox */}
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                      }}
                                    >
                                      <IconButton
                                        size="small"
                                        onClick={() => {
                                          setMonthOpenMap((prev) => ({
                                            ...prev,
                                            [monthKey]: !prev[monthKey],
                                          }));
                                        }}
                                        sx={{ mr: 0.5 }}
                                      >
                                        {isMonthOpen ? (
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

                                    {/* Days – vertical list, only when month expanded */}
                                    {isMonthOpen && (
                                      <Box
                                        sx={{
                                          pl: 4,
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: 0,
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
                                                      const current =
                                                        new Set(
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
                                              sx={{
                                                m: 0,
                                                "& .MuiFormControlLabel-label":
                                                  {
                                                    fontSize: 12,
                                                  },
                                              }}
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

        {/* VALUE FILTER POPOVER */}
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

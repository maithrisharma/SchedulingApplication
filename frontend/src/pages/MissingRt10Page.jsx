// src/pages/MissingRt10Page.jsx

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
  Divider,
  TextField,
  Select,
  MenuItem,
  FormControl,
} from "@mui/material";
import { Download, FilterList, ClearAll } from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { apiGet, apiFetchFile } from "../api";
import { useScenario } from "../context/ScenarioContext";

// -------------------- CONSTANTS --------------------

// Only 2 columns in the CSV
const valueFilterFields = ["OrderNo", "RecordType"];

const initialValueFilters = valueFilterFields.reduce((acc, f) => {
  acc[f] = { active: false, selected: [] };
  return acc;
}, {});

// Key used for blanks in value filters
const BLANK_KEY = "__BLANK__";

// Grid theme – same as PlanTable / LateOps
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

export default function MissingRt10Page() {
  const { scenario, setScenario } = useScenario();

  const [scenarioList, setScenarioList] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [valueFilters, setValueFilters] = useState(initialValueFilters);

  const [valueFilterAnchor, setValueFilterAnchor] = useState(null);
  const [activeValueField, setActiveValueField] = useState(null);
  const [valueFilterSearch, setValueFilterSearch] = useState("");

  // -------- Scenario list --------
  useEffect(() => {
    apiGet("/scenarios/list").then((res) => {
      setScenarioList(res.scenarios || []);
    });
  }, []);

  // -------- Load table for selected scenario --------
  useEffect(() => {
    if (!scenario) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    apiGet(`/visual/${scenario}/missing-rt10`)
      .then((res) => {
        if (!res?.ok) {
          setRows([]);
          return;
        }
        const table = res.rows || [];
        setRows(
          table.map((row, i) => ({
            id: `${i}-${row.OrderNo}`,
            ...row,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [scenario]);

  // -------- Value options (distinct per column) --------
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
  }, [rows, valueFilters]);

  // -------- Handlers --------
  const handleOpenValueFilter = (field) => (event) => {
    setActiveValueField(field);
    setValueFilterAnchor(event.currentTarget);
    setValueFilterSearch("");
  };

  const handleCloseValueFilter = () => {
    setActiveValueField(null);
    setValueFilterAnchor(null);
  };

  const handleClearAllFilters = () => {
    setValueFilters(initialValueFilters);
  };

  // -------- Columns --------
  const columns = [
    {
      field: "OrderNo",
      headerName: "OrderNo",
      flex: 1,
      minWidth: 200,
      renderHeader: () => (
        <HeaderWithFilter
          label="OrderNo"
          active={valueFilters.OrderNo?.active}
          onClick={handleOpenValueFilter("OrderNo")}
        />
      ),
    },
    {
      field: "RecordType",
      headerName: "RecordType",
      flex: 1,
      minWidth: 160,
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
          Orders Missing RecordType = 10
        </Typography>
        <Typography align="center" color="text.secondary" mb={4}>
          Scenario:{" "}
          <strong style={{ color: "#2563eb" }}>{scenario || "-"}</strong>
        </Typography>

        <Card sx={{ borderRadius: 3, boxShadow: 8 }}>
          <CardContent sx={{ p: 4 }}>
            {/* Top bar: Scenario selector + title | Buttons */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              spacing={2}
              mb={3}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={2}
                alignItems={{ xs: "flex-start", md: "center" }}
              >
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
                      `/visual/${scenario}/missing-rt10-excel`,
                      `${scenario}_missing_rt10.xlsx`
                    )
                  }
                >
                  Download Excel
                </Button>
              </Stack>
            </Stack>

            <Box sx={{ height: 700 }}>
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

        {/* VALUE FILTER POPOVER (vertical list) */}
        <Popover
          open={Boolean(valueFilterAnchor)}
          anchorEl={valueFilterAnchor}
          onClose={handleCloseValueFilter}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          {activeValueField && activeValueFilterState && (
            <Box sx={{ p: 2, minWidth: 260 }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                {activeValueField}
              </Typography>

              <TextField
                size="small"
                fullWidth
                placeholder="Search"
                value={valueFilterSearch}
                onChange={(e) => setValueFilterSearch(e.target.value)}
                sx={{ mb: 1.5 }}
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

              {/* Vertical scroll list */}
              <Box
                sx={{
                  maxHeight: 400,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  pr: 1,
                }}
              >
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

                  return items.map((key) => {
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
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          mr: 0,
                          py: 0.25,
                          borderBottom: "1px solid #eee",
                        }}
                      />
                    );
                  });
                })()}
              </Box>

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

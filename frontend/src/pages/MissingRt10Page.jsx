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

const valueFilterFields = ["OrderNo", "RecordType"];

const initialValueFilters = valueFilterFields.reduce((acc, f) => {
  acc[f] = { active: false, selected: [] };
  return acc;
}, {});

const BLANK_KEY = "__BLANK__";

// Grid theme – consistent with other pages
const gridTheme = createTheme({
  palette: { mode: "light" },
  components: {
    MuiDataGrid: {
      styleOverrides: {
        root: { backgroundColor: "white" },
        columnHeaders: { backgroundColor: "#e2e8f0" },
        columnHeaderTitle: { fontWeight: 700, color: "black" },
        cell: { color: "black" },
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
      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap title={label}>
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

  // -------- Load table --------
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
        setRows(
          (res.rows || []).map((row, i) => ({
            id: `${i}-${row.OrderNo}`,
            ...row,
          }))
        );
      })
      .finally(() => setLoading(false));
  }, [scenario]);

  // -------- Distinct value options --------
  const valueOptions = useMemo(() => {
    const map = {};
    valueFilterFields.forEach((f) => {
      map[f] = { options: new Set(), hasBlank: false };
    });

    rows.forEach((row) => {
      valueFilterFields.forEach((field) => {
        const v = row[field];
        if (v === null || v === undefined || v === "") map[field].hasBlank = true;
        else map[field].options.add(String(v));
      });
    });

    const result = {};
    Object.entries(map).forEach(([field, { options, hasBlank }]) => {
      result[field] = {
        options: Array.from(options).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true })
        ),
        hasBlank,
      };
    });

    return result;
  }, [rows]);

  // -------- Filtering --------
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      for (const [field, fState] of Object.entries(valueFilters)) {
        if (!fState.active) continue;
        const v = row[field];
        const key = v === null || v === undefined || v === "" ? BLANK_KEY : String(v);
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

  // -------- Loading screen --------
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
    ? valueOptions[activeValueField]
    : { options: [], hasBlank: false };

  const activeValueFilterState = activeValueField
    ? valueFilters[activeValueField]
    : null;

  return (
    <ThemeProvider theme={gridTheme}>
      <Box sx={{ p: 4, bgcolor: "#f1f5f9", minHeight: "100vh" }}>
        <Typography variant="h4" align="center" fontWeight="bold" gutterBottom>
          Fehlende Auftragskopfsätze (RecordType = 10)
        </Typography>

        <Typography align="center" color="text.secondary" mb={4}>
          Szenario:{" "}
          <strong style={{ color: "#2563eb" }}>{scenario || "-"}</strong>
        </Typography>

        <Card sx={{ borderRadius: 3, boxShadow: 8 }}>
          <CardContent sx={{ p: 4 }}>
            {/* Top bar */}
            <Stack
              direction={{ xs: "column", md: "row" }}
              justifyContent="space-between"
              alignItems={{ xs: "flex-start", md: "center" }}
              spacing={2}
              mb={3}
            >
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <Select
                  value={scenario || ""}
                  displayEmpty
                  onChange={(e) => setScenario(e.target.value)}
                  renderValue={(selected) =>
                    selected || "Szenario auswählen"
                  }
                >
                  {scenarioList.length === 0 && (
                    <MenuItem value="">
                      <em>Keine Szenarien</em>
                    </MenuItem>
                  )}
                  {scenarioList.map((s) => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  startIcon={<ClearAll />}
                  onClick={handleClearAllFilters}
                >
                  Filter löschen
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
                  Excel herunterladen
                </Button>
              </Stack>
            </Stack>

            {/* TABLE */}
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

        {/* VALUE FILTER POPOVER */}
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
                placeholder="Suchen…"
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
                      ...options,
                      ...(hasBlank ? [BLANK_KEY] : []),
                    ];
                    setValueFilters((prev) => ({
                      ...prev,
                      [activeValueField]: { active: true, selected },
                    }));
                  }}
                >
                  Alle auswählen
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
                  Leeren
                </Button>
              </Stack>

              <Divider sx={{ mb: 1 }} />

              <Box
                sx={{
                  maxHeight: 400,
                  overflowY: "auto",
                  pr: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {(() => {
                  const { options, hasBlank } = activeValueOptions;
                  const searchLower = valueFilterSearch.toLowerCase();

                  const items = [
                    ...(hasBlank ? [BLANK_KEY] : []),
                    ...options,
                  ].filter((key) => {
                    const label =
                      key === BLANK_KEY ? "(Leer)" : String(key ?? "");
                    return label.toLowerCase().includes(searchLower);
                  });

                  if (items.length === 0) {
                    return (
                      <Typography variant="body2" color="text.secondary">
                        Keine Werte.
                      </Typography>
                    );
                  }

                  const selectedSet = new Set(activeValueFilterState.selected);

                  return items.map((key) => {
                    const label =
                      key === BLANK_KEY ? "(Leer)" : String(key ?? "");
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
                                if (isChecked) current.add(key);
                                else current.delete(key);

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
                          py: 0.25,
                          borderBottom: "1px solid #eee",
                        }}
                      />
                    );
                  });
                })()}
              </Box>

              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
                <Button size="small" variant="contained" onClick={handleCloseValueFilter}>
                  Anwenden
                </Button>
              </Box>
            </Box>
          )}
        </Popover>
      </Box>
    </ThemeProvider>
  );
}

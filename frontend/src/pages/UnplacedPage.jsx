// src/pages/UnplacedPage.jsx
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

// =============================================
// CONSTANTS
// =============================================

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

const dateField = "LatestStartDate"; // only date field for Unplaced
const BLANK_KEY = "__BLANK__";

// =============================================
// GRID THEME
// =============================================
const gridTheme = createTheme({
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

// =============================================
// HELPERS
// =============================================
function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", {
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
        justifyContent: "space-between",
        width: "100%",
        alignItems: "center",
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
          onClick(e);
        }}
        sx={{ p: 0.25, color: active ? "primary.main" : "text.disabled" }}
      >
        <FilterList fontSize="small" />
      </IconButton>
    </Box>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================
export default function UnplacedPage() {
  const { scenario, setScenario } = useScenario();

  const [scenarioList, setScenarioList] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [valueFilters, setValueFilters] = useState({});
  const [dateFilter, setDateFilter] = useState({
    selected: [],
    includeNull: false,
  });

  // popovers
  const [valueFilterAnchor, setValueFilterAnchor] = useState(null);
  const [activeValueField, setActiveValueField] = useState(null);
  const [valueFilterSearch, setValueFilterSearch] = useState("");

  const [dateFilterAnchor, setDateFilterAnchor] = useState(null);

  // collapsible state for date tree
  const [expandedYears, setExpandedYears] = useState({});
  const [expandedMonths, setExpandedMonths] = useState({});

  // =============================================
  // LOAD SCENARIOS
  // =============================================
  useEffect(() => {
    apiGet("/scenarios/list").then((res) => {
      setScenarioList(res.scenarios || []);
    });
  }, []);

  // =============================================
  // LOAD DATA
  // =============================================
  useEffect(() => {
    if (!scenario) {
      setRows([]);
      return;
    }

    setLoading(true);

    apiGet(`/visual/${scenario}/unplaced`)
      .then((res) => {
        if (!res?.ok) {
          setRows([]);
          return;
        }

        const table = res.rows || [];
        setRows(table.map((row, i) => ({ id: row.job_id ?? i, ...row })));

        // initialize value filters based on columns
        const f = {};
        if (table.length > 0) {
          Object.keys(table[0]).forEach((col) => {
            f[col] = { active: false, selected: [] };
          });
        }
        setValueFilters(f);

        // reset date tree expansion when scenario changes
        setExpandedYears({});
        setExpandedMonths({});
        setDateFilter({ selected: [], includeNull: false });
      })
      .finally(() => setLoading(false));
  }, [scenario]);

  // =============================================
  // BUILD DATE TREE (year → month → day)
  // =============================================
  const dateTree = useMemo(() => {
    const tree = { years: {}, hasNull: false };

    rows.forEach((row) => {
      const raw = row[dateField];
      if (!raw) {
        tree.hasNull = true;
        return;
      }
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return;

      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();

      if (!tree.years[y]) tree.years[y] = {};
      if (!tree.years[y][m]) tree.years[y][m] = new Set();
      tree.years[y][m].add(day);
    });

    return tree;
  }, [rows]);

  // =============================================
  // VALUE OPTIONS
  // =============================================
  const valueOptions = useMemo(() => {
    const map = {};

    rows.forEach((row) => {
      Object.keys(row).forEach((field) => {
        if (!map[field]) map[field] = { options: new Set(), hasBlank: false };
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
      result[field] = {
        options: Array.from(options).sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
        ),
        hasBlank,
      };
    });

    return result;
  }, [rows]);

  // =============================================
  // FILTERING
  // =============================================
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // value filters
      for (const [field, f] of Object.entries(valueFilters)) {
        if (!f?.active) continue;
        const v = row[field];
        const key =
          v === null || v === undefined || v === "" ? BLANK_KEY : String(v);
        if (!f.selected.includes(key)) return false;
      }

      // date filter
      if (dateFilter.selected.length > 0 || dateFilter.includeNull) {
        const raw = row[dateField];

        if (!raw) {
          if (!dateFilter.includeNull) return false;
        } else {
          const d = new Date(raw);
          if (Number.isNaN(d.getTime())) return false;
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          if (!dateFilter.selected.includes(key)) return false;
        }
      }

      return true;
    });
  }, [rows, valueFilters, dateFilter]);

  // =============================================
  // GRID COLUMNS (minWidth + flex)
  // =============================================
  const columns = [
    "job_id",
    "OrderNo",
    "OrderPos",
    "WorkPlaceNo",
    "LatestStartDate",
    "Orderstate",
    "reason",
  ].map((field) => {
    if (field === "LatestStartDate") {
      return {
        field,
        headerName: field,
        minWidth: 220,
        flex: 1.2,
        renderCell: (p) => fmtDate(p.row[field]),
        renderHeader: () => (
          <HeaderWithFilter
            label={field}
            active={
              dateFilter.selected.length > 0 || dateFilter.includeNull === true
            }
            onClick={(e) => setDateFilterAnchor(e.currentTarget)}
          />
        ),
      };
    }

    return {
      field,
      headerName: field,
      minWidth: 160,
      flex: 1,
      renderHeader: () => (
        <HeaderWithFilter
          label={field}
          active={valueFilters[field]?.active}
          onClick={(e) => {
            setActiveValueField(field);
            setValueFilterAnchor(e.currentTarget);
            setValueFilterSearch("");
          }}
        />
      ),
    };
  });

  // =============================================
  // LOADING STATE
  // =============================================
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

  // =============================================
  // RENDER
  // =============================================
  return (
    <ThemeProvider theme={gridTheme}>
      <Box sx={{ p: 4, bgcolor: "#f1f5f9", minHeight: "100vh" }}>
        <Typography variant="h4" align="center" fontWeight="bold" gutterBottom>
          Unplaced Jobs
        </Typography>

        <Typography align="center" color="text.secondary" mb={4}>
          Scenario:{" "}
          <strong style={{ color: "#2563eb" }}>{scenario || "-"}</strong>
        </Typography>

        <Card sx={{ borderRadius: 3, boxShadow: 8 }}>
          <CardContent sx={{ p: 4 }}>
            {/* Top bar: Scenario selector | Buttons (same style as Late Ops) */}
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
                  onClick={() => {
                    const cleared = {};
                    Object.keys(valueFilters).forEach((f) => {
                      cleared[f] = { active: false, selected: [] };
                    });
                    setValueFilters(cleared);
                    setDateFilter({ selected: [], includeNull: false });
                    setExpandedYears({});
                    setExpandedMonths({});
                  }}
                >
                  Clear Filters
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Download />}
                  disabled={!scenario}
                  onClick={() =>
                    apiFetchFile(
                      `/visual/${scenario}/unplaced-excel`,
                      `${scenario}_unplaced.xlsx`
                    )
                  }
                >
                  Download Excel
                </Button>


              </Stack>
            </Stack>

            {/* DataGrid */}
            <Box sx={{ height: 820 }}>
              <DataGrid
                rows={filteredRows}
                columns={columns}
                disableRowSelectionOnClick
                disableColumnMenu
                pageSizeOptions={[50, 100, 250]}
              />
            </Box>
          </CardContent>
        </Card>

        {/* ======================================================
             VALUE FILTER POPOVER
        ======================================================= */}
        <Popover
          open={Boolean(valueFilterAnchor)}
          anchorEl={valueFilterAnchor}
          onClose={() => {
            setValueFilterAnchor(null);
            setActiveValueField(null);
          }}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          {activeValueField && (
            <Box sx={{ p: 2, minWidth: 260, maxHeight: 460, overflowY: "auto" }}>
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
                    const opts = valueOptions[activeValueField] || {
                      options: [],
                      hasBlank: false,
                    };
                    const selected = [
                      ...(opts.hasBlank ? [BLANK_KEY] : []),
                      ...opts.options,
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
                const opts = valueOptions[activeValueField] || {
                  options: [],
                  hasBlank: false,
                };

                const items = [
                  ...(opts.hasBlank ? [BLANK_KEY] : []),
                  ...opts.options,
                ].filter((o) =>
                  (o === BLANK_KEY ? "(Blanks)" : o)
                    .toLowerCase()
                    .includes(valueFilterSearch.toLowerCase())
                );

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

                const selectedSet = new Set(
                  valueFilters[activeValueField]?.selected || []
                );

                return items.map((key) => (
                  <FormControlLabel
                    key={key}
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedSet.has(key)}
                        onChange={(e) => {
                          const selected = new Set(
                            valueFilters[activeValueField]?.selected || []
                          );

                          if (e.target.checked) selected.add(key);
                          else selected.delete(key);

                          setValueFilters((prev) => ({
                            ...prev,
                            [activeValueField]: {
                              active: true,
                              selected: Array.from(selected),
                            },
                          }));
                        }}
                      />
                    }
                    label={key === BLANK_KEY ? "(Blanks)" : key}
                    sx={{ display: "block", mr: 0 }}
                  />
                ));
              })()}

              <Box sx={{ textAlign: "right", mt: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => {
                    setValueFilterAnchor(null);
                    setActiveValueField(null);
                  }}
                >
                  Apply
                </Button>
              </Box>
            </Box>
          )}
        </Popover>

        {/* ======================================================
             DATE FILTER POPOVER (vertical, collapsible)
        ======================================================= */}
        <Popover
          open={Boolean(dateFilterAnchor)}
          anchorEl={dateFilterAnchor}
          onClose={() => setDateFilterAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <Box sx={{ p: 2, minWidth: 280, maxHeight: 460, overflowY: "auto" }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
              {dateField}
            </Typography>

            {/* Select All / Clear */}
            <Stack direction="row" spacing={1} mb={1}>
              <Button
                size="small"
                onClick={() => {
                  const selected = [];
                  Object.entries(dateTree.years).forEach(
                    ([yearStr, months]) => {
                      const y = Number(yearStr);
                      Object.entries(months).forEach(([mStr, daySet]) => {
                        const m = Number(mStr);
                        Array.from(daySet).forEach((day) => {
                          selected.push(`${y}-${m}-${day}`);
                        });
                      });
                    }
                  );
                  setDateFilter({
                    selected,
                    includeNull: dateTree.hasNull,
                  });
                }}
              >
                Select All
              </Button>

              <Button
                size="small"
                onClick={() =>
                  setDateFilter({ selected: [], includeNull: false })
                }
              >
                Clear
              </Button>
            </Stack>

            <Divider sx={{ mb: 1 }} />

            {/* Include Null */}
            {dateTree.hasNull && (
              <Box sx={{ mb: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={dateFilter.includeNull}
                      onChange={(e) =>
                        setDateFilter((prev) => ({
                          ...prev,
                          includeNull: e.target.checked,
                        }))
                      }
                    />
                  }
                  label="(No Date)"
                />
                <Divider sx={{ mt: 1 }} />
              </Box>
            )}

            {/* Year → Month → Day Tree (collapsible, days vertical) */}
            {Object.keys(dateTree.years).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No dates available.
              </Typography>
            ) : (
              Object.entries(dateTree.years)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([yearStr, monthsObj]) => {
                  const year = Number(yearStr);

                  const yearKeys = [];
                  Object.entries(monthsObj).forEach(([mStr, daySet]) => {
                    const m = Number(mStr);
                    Array.from(daySet).forEach((day) => {
                      yearKeys.push(`${year}-${m}-${day}`);
                    });
                  });

                  const selectedSet = new Set(dateFilter.selected);
                  const yearSelectedCount = yearKeys.filter((k) =>
                    selectedSet.has(k)
                  ).length;
                  const yearAll =
                    yearSelectedCount === yearKeys.length &&
                    yearKeys.length > 0;
                  const yearSome =
                    yearSelectedCount > 0 && !yearAll;

                  const expandedYear = !!expandedYears[year];

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
                          onClick={() =>
                            setExpandedYears((prev) => ({
                              ...prev,
                              [year]: !prev[year],
                            }))
                          }
                        >
                          {expandedYear ? (
                            <ExpandMore fontSize="small" />
                          ) : (
                            <ChevronRight fontSize="small" />
                          )}
                        </IconButton>
                        <Checkbox
                          size="small"
                          checked={yearAll}
                          indeterminate={yearSome}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setDateFilter((prev) => {
                              const next = new Set(prev.selected);
                              if (checked) {
                                yearKeys.forEach((k) => next.add(k));
                              } else {
                                yearKeys.forEach((k) => next.delete(k));
                              }
                              return { ...prev, selected: Array.from(next) };
                            });
                          }}
                        />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {year}
                        </Typography>
                      </Box>

                      {/* Months */}
                      {expandedYear && (
                        <Box sx={{ pl: 6 }}>
                          {Object.entries(monthsObj)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([mStr, daySet]) => {
                              const m = Number(mStr);
                              const days = Array.from(daySet).sort(
                                (a, b) => a - b
                              );

                              const monthKeys = days.map(
                                (day) => `${year}-${m}-${day}`
                              );
                              const monthSelectedCount = monthKeys.filter((k) =>
                                selectedSet.has(k)
                              ).length;
                              const monthAll =
                                monthSelectedCount === monthKeys.length &&
                                monthKeys.length > 0;
                              const monthSome =
                                monthSelectedCount > 0 && !monthAll;

                              const monthKey = `${year}-${m}`;
                              const expandedMonth =
                                !!expandedMonths[monthKey];

                              return (
                                <Box key={monthKey} sx={{ mb: 1 }}>
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
                                      onClick={() =>
                                        setExpandedMonths((prev) => ({
                                          ...prev,
                                          [monthKey]: !prev[monthKey],
                                        }))
                                      }
                                    >
                                      {expandedMonth ? (
                                        <ExpandMore fontSize="small" />
                                      ) : (
                                        <ChevronRight fontSize="small" />
                                      )}
                                    </IconButton>
                                    <Checkbox
                                      size="small"
                                      checked={monthAll}
                                      indeterminate={monthSome}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setDateFilter((prev) => {
                                          const next = new Set(prev.selected);
                                          if (checked) {
                                            monthKeys.forEach((k) =>
                                              next.add(k)
                                            );
                                          } else {
                                            monthKeys.forEach((k) =>
                                              next.delete(k)
                                            );
                                          }
                                          return {
                                            ...prev,
                                            selected: Array.from(next),
                                          };
                                        });
                                      }}
                                    />
                                    <Typography variant="body2">
                                      {monthNames[m]}
                                    </Typography>
                                  </Box>

                                  {/* Days (vertical) */}
                                  {expandedMonth && (
                                    <Box
                                      sx={{
                                        pl: 6,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 0.25,
                                      }}
                                    >
                                      {days.map((day) => {
                                        const key = `${year}-${m}-${day}`;
                                        const checked = selectedSet.has(key);
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
                                                  setDateFilter((prev) => {
                                                    const next = new Set(
                                                      prev.selected
                                                    );
                                                    if (isChecked) {
                                                      next.add(key);
                                                    } else {
                                                      next.delete(key);
                                                    }
                                                    return {
                                                      ...prev,
                                                      selected:
                                                        Array.from(next),
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

            <Box sx={{ textAlign: "right", mt: 1 }}>
              <Button
                size="small"
                variant="contained"
                onClick={() => setDateFilterAnchor(null)}
              >
                Apply
              </Button>
            </Box>
          </Box>
        </Popover>
      </Box>
    </ThemeProvider>
  );
}

// src/pages/DeliveryReportPage.jsx — GERMAN UI VERSION

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
} from "@mui/material";
import { Download, FilterList, ClearAll, ExpandMore, ChevronRight } from "@mui/icons-material";
import { DataGrid } from "@mui/x-data-grid";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { apiGet, apiFetchFile } from "../api";
import { useScenario } from "../context/ScenarioContext";

const monthNames = [
  "Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"
];

const dateFields = ["SupposedDeliveryDate", "DeliveryAfterScheduling"];
const valueFilterFields = ["OrderNo", "DaysLate"];
const BLANK_KEY = "__BLANK__";

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

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("de-DE", {
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
    <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center", gap: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap title={label}>
        {label}
      </Typography>
      <IconButton
        size="small"
        onClick={(e) => { e.stopPropagation(); onClick(e); }}
        sx={{ p: 0.25, color: active ? "primary.main" : "text.disabled" }}
      >
        <FilterList fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default function DeliveryReportPage() {
  const { scenario, setScenario } = useScenario();
  const [scenarioList, setScenarioList] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [valueFilters, setValueFilters] = useState(() => {
    const obj = {};
    valueFilterFields.forEach((f) => obj[f] = { active: false, selected: [] });
    return obj;
  });

  const [dateFilters, setDateFilters] = useState(() => {
    const obj = {};
    dateFields.forEach((f) => obj[f] = { selected: [], includeNull: false });
    return obj;
  });

  const [valueFilterAnchor, setValueFilterAnchor] = useState(null);
  const [activeValueField, setActiveValueField] = useState(null);
  const [valueFilterSearch, setValueFilterSearch] = useState("");

  const [dateFilterAnchor, setDateFilterAnchor] = useState(null);
  const [activeDateField, setActiveDateField] = useState(null);

  const [expandedYears, setExpandedYears] = useState({});
  const [expandedMonths, setExpandedMonths] = useState({});

  useEffect(() => {
    apiGet("/scenarios/list").then((res) => setScenarioList(res.scenarios || []));
  }, []);

  useEffect(() => {
    if (!scenario) {
      setRows([]);
      return;
    }

    setLoading(true);
    apiGet(`/visual/${scenario}/delivery-table`)
      .then((res) => {
        if (!res?.ok) return setRows([]);

        const table = res.rows || [];
        setRows(table.map((row, i) => ({ id: i, ...row })));

        setExpandedYears({});
        setExpandedMonths({});

        setDateFilters(() => {
          const obj = {};
          dateFields.forEach((f) => obj[f] = { selected: [], includeNull: false });
          return obj;
        });

        setValueFilters(() => {
          const obj = {};
          valueFilterFields.forEach((f) => obj[f] = { active: false, selected: [] });
          return obj;
        });
      })
      .finally(() => setLoading(false));
  }, [scenario]);

  const dateTrees = useMemo(() => {
    const trees = {};
    dateFields.forEach((f) => trees[f] = { years: {}, hasNull: false });
    rows.forEach((row) => {
      dateFields.forEach((field) => {
        const raw = row[field];
        if (!raw) {
          trees[field].hasNull = true;
          return;
        }
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return;
        const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
        if (!trees[field].years[y]) trees[field].years[y] = {};
        if (!trees[field].years[y][m]) trees[field].years[y][m] = new Set();
        trees[field].years[y][m].add(day);
      });
    });
    return trees;
  }, [rows]);

  const valueOptions = useMemo(() => {
    const map = {};
    valueFilterFields.forEach((f) => map[f] = { options: new Set(), hasBlank: false });
    rows.forEach((row) => {
      valueFilterFields.forEach((field) => {
        const v = row[field];
        if (!v) map[field].hasBlank = true;
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

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      for (const [field, fState] of Object.entries(valueFilters)) {
        if (!fState.active) continue;
        const v = row[field];
        const key = !v ? BLANK_KEY : String(v);
        if (!fState.selected.includes(key)) return false;
      }

      for (const field of dateFields) {
        const { selected, includeNull } = dateFilters[field];
        const active = selected.length > 0 || includeNull;
        if (!active) continue;

        const raw = row[field];
        if (!raw) return includeNull;

        const d = new Date(raw);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!selected.includes(key)) return false;
      }

      return true;
    });
  }, [rows, valueFilters, dateFilters]);

  const columns = [
    {
      field: "OrderNo",
      headerName: "OrderNo",
      minWidth: 160,
      flex: 1,
      renderHeader: () => (
        <HeaderWithFilter
          label="OrderNo"
          active={valueFilters.OrderNo?.active}
          onClick={(e) => {
            setActiveValueField("OrderNo");
            setValueFilterAnchor(e.currentTarget);
            setValueFilterSearch("");
          }}
        />
      ),
    },
    {
      field: "SupposedDeliveryDate",
      headerName: "SupposedDeliveryDate",
      minWidth: 220,
      flex: 1,
      renderCell: (p) => fmtDate(p.row.SupposedDeliveryDate),
      renderHeader: () => (
        <HeaderWithFilter
          label="SupposedDeliveryDate"
          active={
            dateFilters.SupposedDeliveryDate.selected.length > 0 ||
            dateFilters.SupposedDeliveryDate.includeNull
          }
          onClick={(e) => {
            setActiveDateField("SupposedDeliveryDate");
            setDateFilterAnchor(e.currentTarget);
          }}
        />
      ),
    },
    {
      field: "DeliveryAfterScheduling",
      headerName: "DeliveryAfterScheduling",
      minWidth: 240,
      flex: 1,
      renderCell: (p) => fmtDate(p.row.DeliveryAfterScheduling),
      renderHeader: () => (
        <HeaderWithFilter
          label="DeliveryAfterScheduling"
          active={
            dateFilters.DeliveryAfterScheduling.selected.length > 0 ||
            dateFilters.DeliveryAfterScheduling.includeNull
          }
          onClick={(e) => {
            setActiveDateField("DeliveryAfterScheduling");
            setDateFilterAnchor(e.currentTarget);
          }}
        />
      ),
    },
    {
      field: "DaysLate",
      headerName: "DaysLate",
      minWidth: 140,
      flex: 1,
      renderHeader: () => (
        <HeaderWithFilter
          label="DaysLate"
          active={valueFilters.DaysLate?.active}
          onClick={(e) => {
            setActiveValueField("DaysLate");
            setValueFilterAnchor(e.currentTarget);
            setValueFilterSearch("");
          }}
        />
      ),
    },
  ];

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress size={80} />
      </Box>
    );
  }

  return (
    <ThemeProvider theme={gridTheme}>
      <Box sx={{ p: 4, bgcolor: "#f1f5f9", minHeight: "100vh" }}>

        <Typography variant="h4" align="center" fontWeight="bold" gutterBottom>
          Lieferreport
        </Typography>

        <Typography align="center" color="text.secondary" mb={4}>
          Szenario:{" "}
          <strong style={{ color: "#2563eb" }}>{scenario || "-"}</strong>
        </Typography>

        <Card sx={{ borderRadius: 3, boxShadow: 8 }}>
          <CardContent sx={{ p: 4 }}>
            {/* TOP BAR */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
              <Select
                value={scenario || ""}
                onChange={(e) => setScenario(e.target.value)}
                displayEmpty
                sx={{
                  minWidth: 300,
                  bgcolor: "white",
                  borderRadius: 2,
                  ".MuiOutlinedInput-input": { py: 1.5 },
                }}
              >
                <MenuItem value="" disabled>
                  <em>Szenario auswählen</em>
                </MenuItem>

                {scenarioList.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>

              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  startIcon={<ClearAll />}
                  onClick={() => {
                    setValueFilters(() => {
                      const obj = {};
                      valueFilterFields.forEach((f) => obj[f] = { active: false, selected: [] });
                      return obj;
                    });

                    setDateFilters(() => {
                      const obj = {};
                      dateFields.forEach((f) => obj[f] = { selected: [], includeNull: false });
                      return obj;
                    });

                    setExpandedYears({});
                    setExpandedMonths({});
                  }}
                >
                  Filter löschen
                </Button>

                <Button
                  variant="contained"
                  startIcon={<Download />}
                  disabled={!scenario}
                  onClick={() =>
                    apiFetchFile(
                      `/visual/${scenario}/delivery-excel`,
                      `${scenario}_delivery.xlsx`
                    )
                  }
                >
                  Excel herunterladen
                </Button>
              </Stack>
            </Stack>

            {/* TABLE */}
            <Box sx={{ height: 820 }}>
              <DataGrid
                rows={filteredRows}
                columns={columns}
                disableColumnMenu
                disableRowSelectionOnClick
                pageSizeOptions={[50, 100, 250]}
              />
            </Box>
          </CardContent>
        </Card>

        {/* VALUE FILTER POPOVER */}
        <Popover
          open={Boolean(valueFilterAnchor)}
          anchorEl={valueFilterAnchor}
          onClose={() => setValueFilterAnchor(null)}
        >
          {activeValueField && (
            <Box sx={{ p: 2, width: 260, maxHeight: 460, overflowY: "auto" }}>

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
                {activeValueField}
              </Typography>

              <TextField
                size="small"
                fullWidth
                placeholder="Suchen…"
                value={valueFilterSearch}
                onChange={(e) => setValueFilterSearch(e.target.value)}
                sx={{ mb: 1 }}
              />

              <Stack direction="row" spacing={1} mb={1}>
                <Button
                  size="small"
                  onClick={() => {
                    const { options, hasBlank } = valueOptions[activeValueField];
                    const selected = [...options, ...(hasBlank ? [BLANK_KEY] : [])];
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
                  onClick={() =>
                    setValueFilters((prev) => ({
                      ...prev,
                      [activeValueField]: { active: false, selected: [] },
                    }))
                  }
                >
                  Leeren
                </Button>
              </Stack>

              <Divider sx={{ mb: 1 }} />

              {(() => {
                const { options, hasBlank } = valueOptions[activeValueField];
                const searchLower = valueFilterSearch.toLowerCase();

                const items = [
                  ...(hasBlank ? [BLANK_KEY] : []),
                  ...options,
                ].filter((key) =>
                  (key === BLANK_KEY ? "(Leer)" : key)
                    .toLowerCase()
                    .includes(searchLower)
                );

                const selectedSet = new Set(valueFilters[activeValueField].selected);

                return items.map((key) => (
                  <FormControlLabel
                    key={key}
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedSet.has(key)}
                        onChange={(e) => {
                          const selected = new Set(valueFilters[activeValueField].selected);
                          e.target.checked ? selected.add(key) : selected.delete(key);
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
                    label={key === BLANK_KEY ? "(Leer)" : key}
                    sx={{ display: "block", mr: 0 }}
                  />
                ));
              })()}

              <Box sx={{ textAlign: "right", mt: 1 }}>
                <Button variant="contained" size="small" onClick={() => setValueFilterAnchor(null)}>
                  Anwenden
                </Button>
              </Box>
            </Box>
          )}
        </Popover>

        {/* DATE FILTER POPOVER */}
        <Popover
          open={Boolean(dateFilterAnchor)}
          anchorEl={dateFilterAnchor}
          onClose={() => setDateFilterAnchor(null)}
        >
          <Box sx={{ p: 2, minWidth: 280, maxHeight: 460, overflowY: "auto" }}>

            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
              {activeDateField}
            </Typography>

            <Stack direction="row" spacing={1} mb={1}>
              <Button
                size="small"
                onClick={() => {
                  const tree = dateTrees[activeDateField];
                  const selected = [];

                  Object.entries(tree.years).forEach(([yearStr, monthsObj]) => {
                    const y = Number(yearStr);
                    Object.entries(monthsObj).forEach(([mStr, daySet]) => {
                      const m = Number(mStr);
                      Array.from(daySet).forEach((day) => {
                        selected.push(`${y}-${m}-${day}`);
                      });
                    });
                  });

                  setDateFilters((prev) => ({
                    ...prev,
                    [activeDateField]: {
                      selected,
                      includeNull: tree.hasNull,
                    },
                  }));
                }}
              >
                Alle auswählen
              </Button>

              <Button
                size="small"
                onClick={() =>
                  setDateFilters((prev) => ({
                    ...prev,
                    [activeDateField]: { selected: [], includeNull: false },
                  }))
                }
              >
                Leeren
              </Button>
            </Stack>

            <Divider sx={{ mb: 1 }} />

            {/* Include Null */}
            {dateTrees[activeDateField]?.hasNull && (
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={dateFilters[activeDateField]?.includeNull}
                    onChange={(e) =>
                      setDateFilters((prev) => ({
                        ...prev,
                        [activeDateField]: {
                          ...prev[activeDateField],
                          includeNull: e.target.checked,
                        },
                      }))
                    }
                  />
                }
                label="(Kein Datum)"
              />
            )}

            {/* DATE TREE */}
            {Object.keys(dateTrees[activeDateField]?.years || {}).length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Keine Datumswerte vorhanden.
              </Typography>
            ) : (
              Object.entries(dateTrees[activeDateField].years)
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

                  const selectedSet = new Set(dateFilters[activeDateField]?.selected || []);

                  const yearAll = yearKeys.every((k) => selectedSet.has(k));
                  const yearSome = yearKeys.some((k) => selectedSet.has(k)) && !yearAll;

                  const expanded = expandedYears[year];

                  return (
                    <Box key={year} sx={{ mb: 1.5 }}>

                      {/* YEAR */}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() =>
                            setExpandedYears((prev) => ({
                              ...prev,
                              [year]: !prev[year],
                            }))
                          }
                        >
                          {expanded ? (
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
                            setDateFilters((prev) => {
                              const next = new Set(prev[activeDateField].selected);
                              if (checked) yearKeys.forEach((k) => next.add(k));
                              else yearKeys.forEach((k) => next.delete(k));
                              return {
                                ...prev,
                                [activeDateField]: {
                                  ...prev[activeDateField],
                                  selected: Array.from(next),
                                },
                              };
                            });
                          }}
                        />

                        <Typography sx={{ fontWeight: 600 }}>{year}</Typography>
                      </Box>

                      {/* MONTHS */}
                      {expanded && (
                        <Box sx={{ pl: 6 }}>
                          {Object.entries(monthsObj)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([mStr, daySet]) => {
                              const m = Number(mStr);
                              const days = Array.from(daySet).sort((a, b) => a - b);

                              const monthKeys = days.map((d) => `${year}-${m}-${d}`);

                              const monthAll = monthKeys.every((k) => selectedSet.has(k));
                              const monthSome =
                                monthKeys.some((k) => selectedSet.has(k)) && !monthAll;

                              const monthKey = `${year}-${m}`;
                              const expandedMonth = expandedMonths[monthKey];

                              return (
                                <Box key={monthKey} sx={{ mb: 1 }}>

                                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
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
                                        setDateFilters((prev) => {
                                          const next = new Set(prev[activeDateField].selected);
                                          if (checked) monthKeys.forEach((k) => next.add(k));
                                          else monthKeys.forEach((k) => next.delete(k));
                                          return {
                                            ...prev,
                                            [activeDateField]: {
                                              ...prev[activeDateField],
                                              selected: Array.from(next),
                                            },
                                          };
                                        });
                                      }}
                                    />

                                    <Typography>{monthNames[m]}</Typography>
                                  </Box>

                                  {/* DAYS */}
                                  {expandedMonth && (
                                    <Box sx={{ pl: 6, display: "flex", flexDirection: "column", gap: 0.25 }}>
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
                                                  const isChecked = e.target.checked;

                                                  setDateFilters((prev) => {
                                                    const next = new Set(prev[activeDateField].selected);
                                                    if (isChecked) next.add(key);
                                                    else next.delete(key);
                                                    return {
                                                      ...prev,
                                                      [activeDateField]: {
                                                        ...prev[activeDateField],
                                                        selected: Array.from(next),
                                                      },
                                                    };
                                                  });
                                                }}
                                              />
                                            }
                                            label={String(day).padStart(2, "0")}
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
              <Button size="small" variant="contained" onClick={() => setDateFilterAnchor(null)}>
                Anwenden
              </Button>
            </Box>
          </Box>
        </Popover>
      </Box>
    </ThemeProvider>
  );
}

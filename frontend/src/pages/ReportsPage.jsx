// src/pages/ReportsPage.jsx

import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Stack,
} from "@mui/material";
import {
  Download,
  ListAlt,
  Warning,
  AssignmentLate,
  Report,
  Timeline,
  BugReport,
} from "@mui/icons-material";
import { useScenario } from "../context/ScenarioContext";
import { apiFetchFile } from "../api";

export default function ReportsPage() {
  const { scenario } = useScenario();

  const disabled = !scenario;

  function dl(path, filename) {
    if (!scenario) return;
    apiFetchFile(path.replace(":scenario", scenario), filename.replace(":scenario", scenario));
  }

  return (
    <Box sx={{ bgcolor: "#f8fafc", minHeight: "100vh", py: 6, px: 4 }}>
      <Box sx={{ maxWidth: 1400, mx: "auto" }}>
        {/* HEADER */}
        <Box sx={{ textAlign: "center", mb: 6 }}>
          <Typography
            variant="h3"
            sx={{ fontWeight: 900, color: "#0f172a", mb: 1 }}
          >
            Reports & Exports
          </Typography>
          <Typography variant="h6" sx={{ color: "#64748b" }}>
            Scenario:{" "}
            <strong style={{ color: "#3b82f6" }}>
              {scenario || "No scenario selected"}
            </strong>
          </Typography>
          {disabled && (
            <Typography sx={{ mt: 1, color: "#b91c1c" }}>
              Select a scenario first to enable downloads.
            </Typography>
          )}
        </Box>

        <Grid container spacing={4}>
          {/* SCHEDULING / LATE OPS BLOCK */}
          <Grid item xs={12} md={6}>
            <Card
              sx={{
                borderRadius: 4,
                boxShadow: "0 18px 36px rgba(0,0,0,0.06)",
                height: "100%",
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Stack spacing={2}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <AssignmentLate sx={{ color: "#ef4444" }} />
                    <Typography variant="h5" fontWeight={800}>
                      Scheduling / Late Operations
                    </Typography>
                  </Stack>
                  <Typography sx={{ color: "text.secondary", mb: 1 }}>
                    Detailed tables exported for Excel-based analysis.
                  </Typography>

                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<Warning />}
                    disabled={disabled}
                    onClick={() =>
                      dl(
                        "/reports/:scenario/late-ops",
                        ":scenario_late_ops.xlsx"
                      )
                    }
                  >
                    Late Operations (Excel)
                  </Button>

                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Timeline />}
                    disabled={disabled}
                    onClick={() =>
                      dl(
                        "/reports/:scenario/orders-delivery",
                        ":scenario_orders_delivery.xlsx"
                      )
                    }
                  >
                    Orders Delivery Report
                  </Button>

                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Report />}
                    disabled={disabled}
                    onClick={() =>
                      dl(
                        "/reports/:scenario/orders-missing-rt10",
                        ":scenario_missing_rt10.xlsx"
                      )
                    }
                  >
                    Orders Missing RT = 10
                  </Button>

                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<ListAlt />}
                    disabled={disabled}
                    onClick={() =>
                      dl(
                        "/reports/:scenario/unplaced-orders",
                        ":scenario_unplaced_orders.xlsx"
                      )
                    }
                  >
                    Unplaced Orders
                  </Button>

                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Download />}
                    disabled={disabled}
                    onClick={() =>
                      dl(
                        "/reports/:scenario/shift-injections",
                        ":scenario_shift_injections.xlsx"
                      )
                    }
                  >
                    Shift Injections
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* KPI / SUMMARY BLOCK */}
          <Grid item xs={12} md={6}>
            <Card
              sx={{
                borderRadius: 4,
                boxShadow: "0 18px 36px rgba(0,0,0,0.06)",
                height: "100%",
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Stack spacing={2}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Report sx={{ color: "#3b82f6" }} />
                    <Typography variant="h5" fontWeight={800}>
                      KPI & Summary Reports
                    </Typography>
                  </Stack>
                  <Typography sx={{ color: "text.secondary", mb: 1 }}>
                    High-level summaries suitable for management reporting.
                  </Typography>

                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<Download />}
                    disabled={disabled}
                    onClick={() =>
                      dl(
                        "/reports/:scenario/kpi-summary-excel",
                        ":scenario_kpi_summary.xlsx"
                      )
                    }
                  >
                    KPI Summary (Excel)
                  </Button>

                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Download />}
                    disabled={disabled}
                    onClick={() =>
                      dl(
                        "/reports/:scenario/kpi-summary-pdf",
                        ":scenario_kpi_summary.pdf"
                      )
                    }
                  >
                    KPI Summary (PDF)
                  </Button>

                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<Timeline />}
                    disabled={disabled}
                    onClick={() =>
                      dl(
                        "/reports/:scenario/plan-export",
                        ":scenario_plan_export.xlsx"
                      )
                    }
                  >
                    Full Plan Export (Excel)
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* TECHNICAL / LOGS BLOCK */}
          <Grid item xs={12}>
            <Card
              sx={{
                borderRadius: 4,
                boxShadow: "0 18px 36px rgba(0,0,0,0.06)",
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Stack spacing={2}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <BugReport sx={{ color: "#f97316" }} />
                    <Typography variant="h5" fontWeight={800}>
                      Technical / Diagnostics
                    </Typography>
                  </Stack>
                  <Typography sx={{ color: "text.secondary" }}>
                    For deep debugging and audit trails.
                  </Typography>

                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    sx={{ mt: 1 }}
                  >
                    <Button
                      variant="outlined"
                      startIcon={<BugReport />}
                      disabled={disabled}
                      onClick={() =>
                        dl(
                          "/reports/:scenario/scheduler-log",
                          ":scenario_scheduler_log.txt"
                        )
                      }
                    >
                      Scheduler Log Export
                    </Button>

                    <Button
                      variant="outlined"
                      startIcon={<Download />}
                      disabled={disabled}
                      onClick={() =>
                        dl(
                          "/reports/:scenario/config-snapshot",
                          ":scenario_config_snapshot.json"
                        )
                      }
                    >
                      Config Snapshot (JSON)
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}

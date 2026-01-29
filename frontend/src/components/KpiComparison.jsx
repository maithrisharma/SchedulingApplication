// src/components/KpiComparison.jsx
import { Box, Typography, Stack, Chip, Divider, Alert } from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RemoveIcon from "@mui/icons-material/Remove";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";

/**
 * DRAWER-OPTIMIZED KPI COMPARISON
 *
 * Designed for 360px drawer width:
 * - No nested scrollbars
 * - Compact vertical layout
 * - Responsive typography
 * - Clear visual hierarchy
 */
export default function KpiComparison({ comparison, score, lateBuckets }) {
  if (!comparison) return null;

  // ========================================
  // RECOMMENDATION ENGINE (unchanged)
  // ========================================
  const getRecommendation = () => {
    const improvements = [];
    const degradations = [];
    let hasAnyChange = false;

    Object.entries(comparison).forEach(([key, vals]) => {
      const { delta, improved } = vals;
      if (Math.abs(delta) >= 0.001) {
        hasAnyChange = true;
        if (improved === true) improvements.push({ key, delta, ...vals });
        else if (improved === false) degradations.push({ key, delta, ...vals });
      }
    });

    if (degradations.length > 0) {
      const sorted = [...degradations].sort((a, b) => {
        const priority = {
          'late_jobs': 1000,
          'beyond_7d': 900,
          'unplaced': 800,
          'on_time': 700,
          'within_2d': 600,
        };
        return (priority[b.key] || 0) - (priority[a.key] || 0);
      });

      const worst = sorted[0];
      let message = "";

      if (worst.key === 'late_jobs') {
        const increase = Math.abs(Math.round(worst.delta));
        message = increase === 1
          ? "⚠️ 1 Job wurde verspätet! "
          : `⚠️ ${increase} mehr verspätete Jobs! `;
      } else if (worst.key === 'beyond_7d') {
        message = `⚠️ Mehr Jobs >7 Tage verspätet! `;
      } else if (worst.key === 'on_time') {
        message = `⚠️ Pünktlichkeit verschlechtert! `;
      } else if (worst.key === 'unplaced') {
        const increase = Math.abs(Math.round(worst.delta));
        message = `⚠️ ${increase} mehr ungeplante Jobs! `;
      }

      message += degradations.length > 1
        ? `${degradations.length} Metriken verschlechtert.`
        : "Verschlechterung erkannt.";

      return {
        severity: "error",
        icon: <ErrorIcon />,
        title: "Schlechter als Baseline",
        message,
        degradations,
        improvements: []
      };
    }

    if (!hasAnyChange) {
      return {
        severity: "info",
        icon: <RemoveIcon />,
        title: "Keine Änderungen",
        message: "Plan ist identisch mit Baseline.",
        degradations: [],
        improvements: []
      };
    }

    if (improvements.length > 0) {
      const sorted = [...improvements].sort((a, b) => {
        const priority = {
          'late_jobs': 1000,
          'on_time': 900,
          'beyond_7d': 800,
          'unplaced': 700,
        };
        return (priority[b.key] || 0) - (priority[a.key] || 0);
      });

      const best = sorted[0];
      const scoreDelta = score?.delta || 0;
      let message = "";

      if (best.key === 'late_jobs') {
        const decrease = Math.abs(Math.round(best.delta));
        message = decrease === 1
          ? "✅ 1 Job weniger verspätet! "
          : `✅ ${decrease} weniger verspätete Jobs! `;
      } else if (best.key === 'on_time') {
        message = `✅ Pünktlichkeit verbessert! `;
      } else if (best.key === 'beyond_7d') {
        message = `✅ Weniger Jobs >7 Tage verspätet! `;
      }

      message += scoreDelta > 5 ? "Deutliche Verbesserung." : `${improvements.length} Metrik${improvements.length > 1 ? 'en' : ''} verbessert.`;

      return {
        severity: "success",
        icon: <CheckCircleIcon />,
        title: scoreDelta > 5 ? "Stark verbessert" : "Verbessert",
        message,
        degradations: [],
        improvements
      };
    }

    return {
      severity: "warning",
      icon: <RemoveIcon />,
      title: "Status unklar",
      message: "Bitte Metriken prüfen.",
      degradations: [],
      improvements: []
    };
  };

  const recommendation = getRecommendation();

  const metricLabels = {
    'on_time': 'Pünktlichkeit',
    'late_jobs': 'Verspätete Jobs',
    'within_2d': 'Innerhalb 2 Tage',
    'beyond_7d': 'Über 7 Tage spät',
    'unplaced': 'Ungeplante Jobs',
  };

  const getTrendIcon = (improved) => {
    if (improved === null) return <RemoveIcon fontSize="small" sx={{ color: "#94a3b8" }} />;
    return improved ? (
      <TrendingUpIcon fontSize="small" sx={{ color: "#16a34a" }} />
    ) : (
      <TrendingDownIcon fontSize="small" sx={{ color: "#dc2626" }} />
    );
  };

  const formatValue = (val, unit) => {
    if (val == null || isNaN(val)) return "–";
    return unit === "%" ? `${val.toFixed(1)}${unit}` : Math.round(val);
  };

  const formatDelta = (delta, unit) => {
    if (delta == null || isNaN(delta)) return "–";
    const sign = delta > 0 ? "+" : "";
    return unit === "%"
      ? `${sign}${delta.toFixed(1)}${unit}`
      : `${sign}${Math.round(delta)}`;
  };

  // ========================================
  // COMPACT EXECUTIVE SUMMARY
  // ========================================
  const renderCompactSummary = () => (
    <Alert
      severity={recommendation.severity}
      icon={recommendation.icon}
      sx={{
        mb: 2,
        borderRadius: 2,
        border: `2px solid`,
        borderColor:
          recommendation.severity === "success" ? "#16a34a" :
          recommendation.severity === "error" ? "#dc2626" : "#0284c7",
        p: 1.5
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
        {recommendation.title}
      </Typography>
      <Typography variant="caption" display="block" sx={{ mb: 1 }}>
        {recommendation.message}
      </Typography>

      {/* Compact score display */}
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" color="text.secondary">
          Score:
        </Typography>
        <Typography variant="body2" fontWeight={700}>
          {score?.candidate?.toFixed(1) || "–"}
        </Typography>
        <Chip
          icon={getTrendIcon(score?.improved)}
          label={formatDelta(score?.delta, "")}
          size="small"
          sx={{
            height: 20,
            fontSize: "0.7rem",
            bgcolor: score?.improved ? "#dcfce7" : (score?.improved === false ? "#fee2e2" : "#f3f4f6"),
            color: score?.improved ? "#166534" : (score?.improved === false ? "#991b1b" : "#64748b"),
          }}
        />
      </Stack>

      {/* Degraded metrics - compact */}
      {recommendation.degradations && recommendation.degradations.length > 0 && (
        <Box sx={{ mt: 1.5, p: 1, bgcolor: '#fee2e2', borderRadius: 1 }}>
          <Typography variant="caption" fontWeight={700} color="#991b1b" display="block" sx={{ mb: 0.5 }}>
            🚨 Verschlechtert:
          </Typography>
          {recommendation.degradations.slice(0, 3).map((deg) => (
            <Typography key={deg.key} variant="caption" display="block" color="#991b1b">
              • {metricLabels[deg.key]}: {formatDelta(deg.delta, deg.key.includes('pct') || deg.key === 'on_time' || deg.key === 'within_2d' || deg.key === 'beyond_7d' ? '%' : '')}
            </Typography>
          ))}
        </Box>
      )}
    </Alert>
  );

  // ========================================
  // COMPACT METRIC ROWS
  // ========================================
  const metrics = [
    { key: "on_time", label: "Pünktlichkeit", unit: "%" },
    { key: "late_jobs", label: "Verspätete Jobs", unit: "" },
    { key: "within_2d", label: "Innerhalb 2d", unit: "%" },
    { key: "beyond_7d", label: ">7 Tage spät", unit: "%" },
    { key: "unplaced", label: "Ungeplant", unit: "" },
  ];

  const renderCompactMetrics = () => (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 1 }}>
        METRIKEN
      </Typography>
      <Stack spacing={1}>
        {metrics.map((metric) => {
          const data = comparison[metric.key];
          if (!data) return null;

          const { baseline, candidate, delta, improved } = data;
          const hasChange = Math.abs(delta) >= 0.001;

          return (
            <Box
              key={metric.key}
              sx={{
                bgcolor: hasChange
                  ? (improved ? "#dcfce7" : (improved === false ? "#fee2e2" : "#f8fafc"))
                  : "#f8fafc",
                p: 1,
                borderRadius: 1,
                border: hasChange
                  ? (improved ? '1px solid #86efac' : (improved === false ? '1px solid #fca5a5' : 'none'))
                  : 'none'
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" fontWeight={600}>
                  {metric.label}
                </Typography>
                {getTrendIcon(improved)}
              </Stack>

              <Stack direction="row" alignItems="baseline" spacing={1}>
                <Typography variant="body2" fontWeight={700}>
                  {formatValue(candidate, metric.unit)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  (was: {formatValue(baseline, metric.unit)})
                </Typography>
                <Typography
                  variant="caption"
                  fontWeight={700}
                  sx={{
                    ml: 'auto',
                    color: improved ? "#16a34a" : (improved === false ? "#dc2626" : "#64748b")
                  }}
                >
                  {formatDelta(delta, metric.unit)}
                </Typography>
              </Stack>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );

  // ========================================
  // COMPACT LATE JOBS HISTOGRAM
  // ========================================
  const renderCompactHistogram = () => {
    if (!lateBuckets) return null;

    const { baseline, candidate, delta } = lateBuckets;
    const buckets = Object.keys(baseline || {});

    // Only show buckets with data
    const activeBuckets = buckets.filter(b => baseline[b] > 0 || candidate[b] > 0);
    if (activeBuckets.length === 0) return null;

    return (
      <Box>
        <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 1 }}>
          VERSPÄTUNGS-VERTEILUNG
        </Typography>

        <Stack spacing={1}>
          {activeBuckets.map((bucket) => {
            const b = baseline[bucket] || 0;
            const c = candidate[bucket] || 0;
            const d = delta[bucket] || 0;
            const maxVal = Math.max(b, c, 10);

            return (
              <Box key={bucket}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                  <Typography variant="caption" sx={{ minWidth: 35, fontWeight: 600, fontSize: "0.7rem" }}>
                    {bucket}
                  </Typography>

                  <Box flex={1}>
                    {/* Simple stacked bars */}
                    <Stack spacing={0.25}>
                      {/* Baseline */}
                      <Box sx={{ position: "relative", height: 12 }}>
                        <Box
                          sx={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            height: "100%",
                            width: `${(b / maxVal) * 100}%`,
                            bgcolor: "#cbd5e1",
                            borderRadius: 0.5,
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            position: "absolute",
                            left: 4,
                            fontSize: "0.65rem",
                            lineHeight: "12px",
                            color: "#475569"
                          }}
                        >
                          {b > 0 ? b : ""}
                        </Typography>
                      </Box>

                      {/* Candidate */}
                      <Box sx={{ position: "relative", height: 12 }}>
                        <Box
                          sx={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            height: "100%",
                            width: `${(c / maxVal) * 100}%`,
                            bgcolor: d < 0 ? "#86efac" : (d > 0 ? "#fca5a5" : "#cbd5e1"),
                            borderRadius: 0.5,
                          }}
                        />
                        <Typography
                          variant="caption"
                          sx={{
                            position: "absolute",
                            left: 4,
                            fontSize: "0.65rem",
                            lineHeight: "12px",
                            color: d !== 0 ? "#111827" : "#475569",
                            fontWeight: d !== 0 ? 600 : 400
                          }}
                        >
                          {c > 0 ? c : ""}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>

                  <Typography
                    variant="caption"
                    sx={{
                      minWidth: 30,
                      textAlign: "right",
                      color: d < 0 ? "#16a34a" : (d > 0 ? "#dc2626" : "#64748b"),
                      fontWeight: 700,
                      fontSize: "0.7rem"
                    }}
                  >
                    {d !== 0 ? (d > 0 ? `+${d}` : d) : "–"}
                  </Typography>
                </Stack>
              </Box>
            );
          })}
        </Stack>

        {/* Compact legend */}
        <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ mt: 1.5, pt: 1.5, borderTop: "1px solid #e2e8f0" }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ width: 8, height: 8, bgcolor: "#cbd5e1", borderRadius: 0.5 }} />
            <Typography variant="caption" sx={{ fontSize: "0.65rem" }}>Baseline</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ width: 8, height: 8, bgcolor: "#86efac", borderRadius: 0.5 }} />
            <Typography variant="caption" sx={{ fontSize: "0.65rem" }}>Besser</Typography>
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Box sx={{ width: 8, height: 8, bgcolor: "#fca5a5", borderRadius: 0.5 }} />
            <Typography variant="caption" sx={{ fontSize: "0.65rem" }}>Schlechter</Typography>
          </Stack>
        </Stack>
      </Box>
    );
  };

  // ========================================
  // MAIN RENDER (no wrapper Box!)
  // ========================================
  return (
    <>
      {renderCompactSummary()}
      {renderCompactMetrics()}
      {renderCompactHistogram()}
    </>
  );
}

// src/components/MachineRoutingChart_Lens.jsx
// Enterprise upgrade: WINDOWED staircase (lens) + jump + prev/next
// Keeps your exact vertical waterfall look but avoids 170-row scroll wall.

import React, { useMemo, useRef, useState } from "react";
import { Box, Stack, IconButton, TextField, Typography, Chip } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";

const getBarColor = (job) => {
  const pg = job.PriorityGroup;
  const os = job.Orderstate;
  const isOutsourcing = job.IsOutsourcing;
  if (os === 5) return "#ef4444";
  if (isOutsourcing) return "#f59e0b";
  if (pg === 0) return "#1e40af";
  if (pg === 1) return "#14b8a6";
  return "#94a3b8";
};

const toMs = (d) => new Date(d).getTime();
const formatDate = (t) =>
  new Date(t).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });

export default function MachineRoutingChart_Lens({
  machine,
  jobs,
  initialWindow = 30,     // how many rows shown at once
  maxWindow = 60,
  minWindow = 12,
}) {
  const scrollRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [tooltip, setTooltip] = useState(null);

  // NEW: lens controls
  const [focusIdx, setFocusIdx] = useState(0);        // 0-based global index
  const [windowN, setWindowN] = useState(initialWindow);

  if (!machine || !jobs || jobs.length === 0) return null;

  const machineJobs = useMemo(() => {
    return jobs
      .filter((j) => String(j.WorkPlaceNo) === String(machine))
      .slice()
      .sort((a, b) => new Date(a.Start) - new Date(b.Start));
  }, [jobs, machine]);

  if (machineJobs.length === 0) return null;

  const N = machineJobs.length;

  // clamp focus + window
  const win = Math.max(minWindow, Math.min(windowN, maxWindow));
  const focus = Math.max(0, Math.min(focusIdx, N - 1));

  // compute slice [start..end]
  const half = Math.floor(win / 2);
  let start = focus - half;
  let end = focus + half;
  if (start < 0) {
    end += -start;
    start = 0;
  }
  if (end > N - 1) {
    const over = end - (N - 1);
    start = Math.max(0, start - over);
    end = N - 1;
  }

  const slice = machineJobs.slice(start, end + 1);

  // --- layout (same as you had, but only for slice) ---
  const paddingLeft = 220;  // a bit more for labels
  const paddingTop = 70;
  const rowHeight = 44;     // slightly tighter = more enterprise dense

  // map y positions
  const yMap = {};
  slice.forEach((job, i) => {
    yMap[job.job_id || (start + i)] = paddingTop + i * rowHeight;
  });

  // timeline range is computed from full machine (for consistent x-axis)
  const minStart = Math.min(...machineJobs.map((j) => toMs(j.Start)));
  const maxEnd = Math.max(...machineJobs.map((j) => toMs(j.End)));
  const totalMs = Math.max(maxEnd - minStart, 1);

  const BASE_WIDTH = 1500;
  const pxPerMs = (BASE_WIDTH / totalMs) * zoom;

  // ticks
  const ticks = [];
  const TICK_COUNT = 10;
  for (let i = 0; i <= TICK_COUNT; i++) {
    const pct = i / TICK_COUNT;
    const t = minStart + pct * totalMs;
    const x = paddingLeft + pct * BASE_WIDTH * zoom;
    ticks.push({ t, x });
  }

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom((z) => Math.max(0.2, Math.min(z * factor, 10)));
  };

  const svgHeight = paddingTop + slice.length * rowHeight + 90;

  const setFocusSafe = (idx) => setFocusIdx(Math.max(0, Math.min(idx, N - 1)));

  // helper: jump by window
  const prevPage = () => setFocusSafe(focus - win);
  const nextPage = () => setFocusSafe(focus + win);

  return (
    <Box
      ref={scrollRef}
      sx={{
        mt: 2,
        position: "relative",
        borderRadius: 2,
        border: "1px solid #e2e8f0",
        bgcolor: "white",
        p: 2,
      }}
    >
      {/* TOP BAR: enterprise controls */}
      <Stack direction="row" spacing={1.2} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography sx={{ fontWeight: 900, color: "#0f172a" }}>
            Maschinenrouting: {machine}
          </Typography>
          <Chip
            size="small"
            label={`${N} Vorgänge`}
            sx={{ bgcolor: "#0f3b63", color: "white", fontWeight: 800 }}
          />
          <Chip
            size="small"
            label={`Anzeige: #${start + 1}–#${end + 1}`}
            sx={{ bgcolor: "#e2e8f0", color: "#0f172a", fontWeight: 800 }}
          />
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton size="small" onClick={prevPage} sx={{ bgcolor: "#f1f5f9" }}>
            <NavigateBeforeIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={nextPage} sx={{ bgcolor: "#f1f5f9" }}>
            <NavigateNextIcon fontSize="small" />
          </IconButton>

          <TextField
            size="small"
            label="Sprung zu #"
            value={String(focus + 1)}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              setFocusSafe(v - 1);
            }}
            sx={{ width: 120 }}
            inputProps={{ inputMode: "numeric" }}
          />

          <TextField
            size="small"
            label="Fenster"
            value={String(win)}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              setWindowN(Math.max(minWindow, Math.min(v, maxWindow)));
            }}
            sx={{ width: 110 }}
            inputProps={{ inputMode: "numeric" }}
          />

          <IconButton size="small" onClick={() => setZoom((z) => Math.min(z * 1.3, 10))} sx={{ bgcolor: "#f1f5f9" }}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => setZoom((z) => Math.max(z / 1.3, 0.2))} sx={{ bgcolor: "#f1f5f9" }}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => setZoom(1)} sx={{ bgcolor: "#f1f5f9" }}>
            <RestartAltIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      <Box sx={{ overflowX: "auto" }} onWheel={handleWheel}>
        <svg width={paddingLeft + BASE_WIDTH * zoom + 50} height={svgHeight} style={{ display: "block" }}>
          {/* X-axis ticks */}
          {ticks.map((tick, i) => (
            <g key={i}>
              <line
                x1={tick.x}
                y1={paddingTop - 10}
                x2={tick.x}
                y2={svgHeight - 60}
                stroke="#e2e8f0"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <text x={tick.x} y={svgHeight - 40} textAnchor="middle" fontSize={11} fill="#64748b">
                {formatDate(tick.t)}
              </text>
            </g>
          ))}

          {/* Y-axis labels (only slice) */}
          {slice.map((job, i) => {
            const y = yMap[job.job_id || (start + i)];
            const globalNo = start + i + 1;
            const isFocus = (start + i) === focus;

            return (
              <text
                key={globalNo}
                x={16}
                y={y + 15}
                fontSize={13}
                fontWeight={isFocus ? 900 : 600}
                fill={isFocus ? "#0f3b63" : "#0f172a"}
                style={{ cursor: "pointer" }}
                onClick={() => setFocusSafe(start + i)}
              >
                {globalNo}. {job.OrderNo}
              </text>
            );
          })}

          {/* Bars + connectors */}
          {slice.map((job, localIdx) => {
            const globalIdx = start + localIdx;

            const s = toMs(job.Start);
            const e = toMs(job.End);

            const x1 = paddingLeft + (s - minStart) * pxPerMs;
            const x2 = paddingLeft + (e - minStart) * pxPerMs;
            const width = Math.max(x2 - x1, 3);
            const y = yMap[job.job_id || globalIdx];

            const color = getBarColor(job);
            const isFocus = globalIdx === focus;

            return (
              <g key={job.job_id || globalIdx}>
                <rect
                  x={x1}
                  y={y}
                  width={width}
                  height={22}
                  fill={color}
                  rx={4}
                  style={{
                    cursor: "pointer",
                    filter: isFocus ? "drop-shadow(0px 3px 8px rgba(34,197,94,0.35))" : "none",
                    stroke: isFocus ? "#22c55e" : "none",
                    strokeWidth: isFocus ? 2 : 0,
                  }}
                  onMouseEnter={() => {
                    const topPos = y - 30;
                    setTooltip({
                      left: x1 + width / 2,
                      top: topPos < 50 ? y + 30 : topPos,
                      job,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => setFocusSafe(globalIdx)}
                />

                {width > 40 && (
                  <text x={x1 + 5} y={y + 15} fill="white" fontSize={12} fontWeight={700}>
                    {job.OrderNo}
                  </text>
                )}

                {/* connector only if next exists inside slice */}
                {localIdx < slice.length - 1 &&
                  (() => {
                    const next = slice[localIdx + 1];
                    const nx = paddingLeft + (toMs(next.Start) - minStart) * pxPerMs;
                    const ny = yMap[next.job_id || (globalIdx + 1)];

                    const y1 = y + 11;
                    const y2 = ny + 11;

                    const dx = nx - x2;
                    const horiz = Math.min(dx / 2, 150);
                    const mid = x2 + horiz;

                    // gap severity highlight (enterprise: show large idle)
                    const gapMs = Math.max(0, toMs(next.Start) - toMs(job.End));
                    const stroke = gapMs > 12 * 3600000 ? "#f59e0b" : "#334155";

                    return (
                      <path
                        d={`M ${x2} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${nx} ${y2}`}
                        stroke={stroke}
                        strokeWidth={2}
                        fill="none"
                      />
                    );
                  })()}
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {tooltip && (
          <Box
            sx={{
              position: "absolute",
              left: tooltip.left,
              top: tooltip.top,
              transform: "translateX(-50%)",
              bgcolor: "rgba(15, 23, 42, 0.95)",
              color: "white",
              px: 2,
              py: 1,
              borderRadius: 2,
              fontSize: "0.85rem",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 1000,
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>{tooltip.job.OrderNo}</div>
            <div>Start: {formatDate(toMs(tooltip.job.Start))}</div>
            <div>Ende: {formatDate(toMs(tooltip.job.End))}</div>
            <div>
              Dauer: {Math.round((toMs(tooltip.job.End) - toMs(tooltip.job.Start)) / 60000)}m
            </div>
          </Box>
        )}
      </Box>
    </Box>
  );
}

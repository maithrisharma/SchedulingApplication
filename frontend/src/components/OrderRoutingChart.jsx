import React, { useRef, useState } from "react";
import { Box, Stack, IconButton } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

/* PRIORITY COLORS */
const COLORS = {
  0: "#ef4444",
  1: "#10b981",
  2: "#6366f1",
  default: "#94a3b8",
};

const toMs = (d) => new Date(d).getTime();
const formatDate = (t) =>
  new Date(t).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });

export default function OrderRoutingChart({ operations }) {
  const scrollRef = useRef(null);
  const [zoom, setZoom] = useState(1);

  /* Tooltip State */
  const [tooltip, setTooltip] = useState(null);

  if (!operations || operations.length === 0) return null;

  /* SORTING — Correct routing sequence */
  const sorted = [...operations].sort((a, b) => {
    if (b.OrderPos !== a.OrderPos) return b.OrderPos - a.OrderPos; // highest first
    return new Date(a.Start) - new Date(b.Start);
  });

  /* MACHINE LAYOUT */
  const machines = [...new Set(sorted.map((op) => op.WorkPlaceNo))];
  const paddingLeft = 140;
  const paddingTop = 60;
  const rowHeight = 50;

  const yMap = {};
  machines.forEach((m, i) => (yMap[m] = paddingTop + i * rowHeight));

  /* TIMELINE RANGE */
  const minStart = Math.min(...sorted.map((op) => toMs(op.Start)));
  const maxEnd = Math.max(...sorted.map((op) => toMs(op.End)));
  const totalMs = Math.max(maxEnd - minStart, 1);

  const BASE_WIDTH = 1500;
  const pxPerMs = (BASE_WIDTH / totalMs) * zoom;

  /* X-AXIS TICKS */
  const ticks = [];
  const TICK_COUNT = 12;
  for (let i = 0; i <= TICK_COUNT; i++) {
    const pct = i / TICK_COUNT;
    const t = minStart + pct * totalMs;
    const x = paddingLeft + pct * BASE_WIDTH * zoom;
    ticks.push({ t, x });
  }

  /* ZOOM WITH MOUSE WHEEL */
  const handleWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom((z) => Math.max(0.2, Math.min(z * factor, 10)));
  };

  return (
    <Box
      ref={scrollRef}
      sx={{ overflowX: "auto", mt: 3, position: "relative" }}
      onWheel={handleWheel}
    >
      {/* ---------------- ZOOM BUTTONS ---------------- */}
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <IconButton size="small" onClick={() => setZoom((z) => Math.min(z * 1.2, 10))}>
          <ZoomInIcon fontSize="small" />
        </IconButton>

        <IconButton size="small" onClick={() => setZoom((z) => Math.max(z / 1.2, 0.2))}>
          <ZoomOutIcon fontSize="small" />
        </IconButton>

        <IconButton size="small" onClick={() => setZoom(1)}>
          <RestartAltIcon fontSize="small" />
        </IconButton>
      </Stack>

      {/* ------------------- SVG ---------------------- */}
      <svg
        width={paddingLeft + BASE_WIDTH * zoom + 200}
        height={machines.length * rowHeight + 200}
        style={{ background: "white" }}
      >
        {/* X-AXIS TICKS */}
        {ticks.map((tick, i) => (
          <g key={i}>
            <line
              x1={tick.x}
              y1={paddingTop - 5}
              x2={tick.x}
              y2={machines.length * rowHeight + paddingTop}
              stroke="#e2e8f0"
            />
            <text
              x={tick.x}
              y={paddingTop - 20}
              textAnchor="middle"
              fill="#475569"
              fontSize={12}
            >
              {formatDate(tick.t)}
            </text>
          </g>
        ))}

        {/* MACHINE LABELS */}
        {machines.map((m, i) => (
          <text
            key={m}
            x={20}
            y={paddingTop + i * rowHeight + 15}
            fontSize={14}
            fontWeight={600}
            fill="#0f172a"
          >
            {m}
          </text>
        ))}

        {/* ------------------- BARS + CONNECTORS ------------------- */}
        {sorted.map((op, idx) => {
          const s = toMs(op.Start);
          const e = toMs(op.End);

          const x1 = paddingLeft + (s - minStart) * pxPerMs;
          const x2 = paddingLeft + (e - minStart) * pxPerMs;
          const width = Math.max(x2 - x1, 3);
          const y = yMap[op.WorkPlaceNo];
          const color = COLORS[op.PriorityGroup] || COLORS.default;

          return (
            <g key={idx}>
              {/* BAR */}
              <rect
                x={x1}
                y={y}
                width={width}
                height={22}
                fill={color}
                rx={4}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => {
                  const topPos = y - 30;
                  setTooltip({
                    left: x1 + width / 2,
                    top: topPos < 50 ? y + 30 : topPos, // 👍 auto reposition!
                    op,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />

              {/* LABEL (only when big enough) */}
              {width > 40 && (
                <text x={x1 + 5} y={y + 15} fill="white" fontSize={12}>
                  {op.OrderNo}
                </text>
              )}

              {/* CONNECTOR */}
              {idx < sorted.length - 1 &&
                (() => {
                  const next = sorted[idx + 1];
                  const nx = paddingLeft + (toMs(next.Start) - minStart) * pxPerMs;

                  const y1 = y + 11;
                  const y2 = yMap[next.WorkPlaceNo] + 11;

                  const dx = nx - x2;
                  const horiz = Math.min(dx / 2, 150);
                  const mid = x2 + horiz;

                  return (
                    <path
                      d={`M ${x2} ${y1} L ${mid} ${y1} L ${mid} ${y2} L ${nx} ${y2}`}
                      stroke="#334155"
                      strokeWidth={2}
                      fill="none"
                    />
                  );
                })()}
            </g>
          );
        })}
      </svg>

      {/* ------------------- TOOLTIP ------------------- */}
      {tooltip && (
        <Box
          sx={{
            position: "absolute",
            left: tooltip.left,
            top: tooltip.top,
            transform: "translate(-50%, -100%)",
            bgcolor: "white",
            p: 1.2,
            borderRadius: 1,
            boxShadow: "0 4px 10px rgba(0,0,0,0.25)",
            fontSize: 13,
            pointerEvents: "none",
            zIndex: 1000,
            maxWidth: 260,
          }}
        >
          <strong>{tooltip.op.OrderNo}</strong>
          <div>Machine: {tooltip.op.WorkPlaceNo}</div>
          <div>Start: {new Date(tooltip.op.Start).toLocaleString()}</div>
          <div>End: {new Date(tooltip.op.End).toLocaleString()}</div>
          {tooltip.op.ReasonSelected && (
            <div style={{ marginTop: 4 }}>
              <em>Reason:</em> {tooltip.op.ReasonSelected}
            </div>
          )}
        </Box>
      )}
    </Box>
  );
}

// src/components/MachineTimeline.jsx
import { Box } from "@mui/material";

const toMs = (d) => new Date(d).getTime();

// ✅ SAME color logic as GanttChart
const getBarColor = (job, isSelected = false) => {
  const pg = job.PriorityGroup ?? 1;
  const os = job.Orderstate ?? 0;
  const isOutsourcing = job.IsOutsourcing;
  const isLate = job.StartsBeforeLSD === false;
  
  // Selected order gets bright lime green
  if (isSelected) {
    return {
      fill: 'rgba(34, 197, 94, 0.95)',   // Emerald-500
      stroke: '#16a34a',                  // Emerald-600
      strokeWidth: 2.5
    };
  }
  
  let fill, stroke;
  
  // 1. OS5 (Urgent) - Red
  if (os === 5) {
    fill = 'rgba(220, 38, 38, 0.9)';
    stroke = '#991b1b';
  }
  // 2. Outsourcing - Orange
  else if (isOutsourcing) {
    fill = 'rgba(249, 115, 22, 0.85)';
    stroke = '#c2410c';
  }
  // 3. Bottleneck (PG0) - Navy
  else if (pg === 0) {
    if (isLate) {
      fill = 'rgba(30, 58, 138, 1.0)';
      stroke = '#1e3a8a';
    } else {
      fill = 'rgba(30, 58, 138, 0.7)';
      stroke = '#1e40af';
    }
  }
  // 4. Non-Bottleneck (PG1) - Teal
  else if (pg === 1) {
    if (isLate) {
      fill = 'rgba(20, 184, 166, 1.0)';
      stroke = '#0f766e';
    } else {
      fill = 'rgba(20, 184, 166, 0.7)';
      stroke = '#14b8a6';
    }
  }
  // 5. Unlimited (PG2) - Gray
  else {
    fill = 'rgba(148, 163, 184, 0.5)';
    stroke = '#94a3b8';
  }
  
  return { fill, stroke, strokeWidth: 1.5 };
};

export default function MachineTimeline({ rows, selectedOrder }) {
  if (!rows || rows.length === 0) return null;

  const sorted = [...rows].sort(
    (a, b) => new Date(a.Start) - new Date(b.Start)
  );

  const minStart = Math.min(...sorted.map((r) => toMs(r.Start)));
  const maxEnd = Math.max(...sorted.map((r) => toMs(r.End)));
  const totalMs = Math.max(maxEnd - minStart, 1);

  const WIDTH = 1400;
  const pxPerMs = WIDTH / totalMs;

  return (
    <Box sx={{ overflowX: "auto" }}>
      <svg width={WIDTH + 200} height={120}>
        {sorted.map((r, i) => {
          const x = 100 + (toMs(r.Start) - minStart) * pxPerMs;
          const w = Math.max((toMs(r.End) - toMs(r.Start)) * pxPerMs, 4);

          const isSelected = String(r.OrderNo) === String(selectedOrder);
          const colors = getBarColor(r, isSelected);

          return (
            <g key={i}>
              <rect
                x={x}
                y={40}
                width={w}
                height={30}
                rx={6}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={colors.strokeWidth}
              />

              {w > 50 && (
                <text
                  x={x + 6}
                  y={60}
                  fill="white"
                  fontSize={12}
                  fontWeight={600}
                >
                  {r.OrderNo}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
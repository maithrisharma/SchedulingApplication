import { Box } from "@mui/material";

const toMs = (d) => new Date(d).getTime();

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
          const x =
            100 + (toMs(r.Start) - minStart) * pxPerMs;
          const w =
            Math.max(
              (toMs(r.End) - toMs(r.Start)) * pxPerMs,
              4
            );

          const isSelected =
            String(r.OrderNo) === String(selectedOrder);

          return (
            <g key={i}>
              <rect
                x={x}
                y={40}
                width={w}
                height={30}
                rx={6}
                fill={isSelected ? "#ef4444" : "#2563eb"}
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

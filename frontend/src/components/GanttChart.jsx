// src/components/GanttChart.jsx
import { useMemo, useEffect, useRef, useState } from "react";
import { Group } from "@visx/group";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { scaleBand, scaleTime } from "@visx/scale";
import { GridRows, GridColumns } from "@visx/grid";
import { useTooltip, Tooltip } from "@visx/tooltip";
import styles from "./GanttChart.module.css";

import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/Download";

import PartImage from "../assets/image.png";

export default function GanttChart({ data, height, onRefresh, onDownloadSvg }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(1000);

  const [isPanning, setIsPanning] = useState(false);
  const lastPanXRef = useRef(null);

  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  } = useTooltip();

  /* Resize Observer */
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  /* Parse data */
  const parsed = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        Start: new Date(d.Start),
        End: new Date(d.End),
        Machine: String(d.WorkPlaceNo),
      })),
    [data]
  );

  const machines = useMemo(
    () => [...new Set(parsed.map((d) => d.Machine))],
    [parsed]
  );

  /* Time bounds */
  const timeBounds = useMemo(() => {
    if (!parsed.length) return null;
    return {
      min: new Date(Math.min(...parsed.map((d) => d.Start.getTime()))),
      max: new Date(Math.max(...parsed.map((d) => d.End.getTime()))),
    };
  }, [parsed]);

  const globalStart = timeBounds?.min;
  const globalEnd = timeBounds?.max;

  const MIN_SPAN_MS = 60 * 60 * 1000;

  const [viewDomain, setViewDomain] = useState(() => ({
    start: globalStart || new Date(),
    end: globalEnd || new Date(Date.now() + 8 * MIN_SPAN_MS),
  }));

  /* Reset when new data arrives */
  useEffect(() => {
    if (globalStart && globalEnd) {
      setViewDomain({ start: globalStart, end: globalEnd });
    }
  }, [globalStart, globalEnd]);

  /* Scales */
  const margin = { top: 40, right: 20, bottom: 40, left: 140 };
  const innerWidth = Math.max(20, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = useMemo(
    () =>
      scaleTime({
        domain: [viewDomain.start, viewDomain.end],
        range: [margin.left, width - margin.right],
      }),
    [viewDomain, width]
  );

  const yScale = useMemo(
    () =>
      scaleBand({
        domain: machines,
        range: [margin.top, height - margin.bottom],
        padding: 0.15,
      }),
    [machines, height]
  );

  /* Visible Y ticks (avoid overlap) */
  const visibleYTicks = useMemo(() => {
    const MIN_GAP = 24;
    let lastY = -Infinity;

    return machines.filter((machine) => {
      const yTop = yScale(machine);
      if (!Number.isFinite(yTop)) return false;

      if (yTop - lastY >= MIN_GAP) {
        lastY = yTop;
        return true;
      }
      return false;
    });
  }, [machines, yScale]);

  /* X-axis tick format */
  const viewSpanMs = viewDomain.end - viewDomain.start;
  const viewSpanDays = viewSpanMs / (1000 * 60 * 60 * 24);

  const formatTick = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (viewSpanDays > 60)
      return date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    if (viewSpanDays > 7)
      return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    if (viewSpanDays > 0.5)
      return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
      });
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const approxTicks = Math.max(4, Math.floor(innerWidth / 90));
  const numTicks = Math.min(approxTicks, 24);

  /* Zoom */
  const zoomBy = (factor) => {
    if (!globalStart || !globalEnd) return;

    setViewDomain((prev) => {
      const span = prev.end - prev.start;
      let newSpan = span / factor;
      newSpan = Math.max(MIN_SPAN_MS, Math.min(newSpan, globalEnd - globalStart));

      const mid = (prev.start.getTime() + prev.end.getTime()) / 2;
      let start = mid - newSpan / 2;
      let end = mid + newSpan / 2;

      if (start < globalStart.getTime()) {
        start = globalStart.getTime();
        end = start + newSpan;
      }
      if (end > globalEnd.getTime()) {
        end = globalEnd.getTime();
        start = end - newSpan;
      }

      return { start: new Date(start), end: new Date(end) };
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomBy(factor);
  };

  /* Panning */
  const startPan = (e) => {
    setIsPanning(true);
    lastPanXRef.current = e.clientX;
    hideTooltip();
  };

  const movePan = (e) => {
    if (!isPanning) return;

    const dx = e.clientX - lastPanXRef.current;
    lastPanXRef.current = e.clientX;

    const msPerPx = (viewDomain.end - viewDomain.start) / innerWidth;
    const shiftMs = -dx * msPerPx;

    setViewDomain((prev) => ({
      start: new Date(prev.start.getTime() + shiftMs),
      end: new Date(prev.end.getTime() + shiftMs),
    }));
  };

  const endPan = () => {
    setIsPanning(false);
    lastPanXRef.current = null;
  };

  const resetZoom = () => {
    setViewDomain({ start: globalStart, end: globalEnd });
  };

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", overflow: "hidden" }}
      onWheel={handleWheel}
    >
      <div style={{ width: "100%", height, position: "relative" }}>
        <svg id="gantt-svg" width={width} height={height}>
          {/* Pan layer */}
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            style={{ cursor: isPanning ? "grabbing" : "grab" }}
            onMouseDown={startPan}
            onMouseMove={movePan}
            onMouseUp={endPan}
            onMouseLeave={endPan}
          />

          <defs>
            <filter id="bar-blur">
              <feGaussianBlur stdDeviation="1.8" />
            </filter>

            <clipPath id="gantt-clip">
              <rect
                x={margin.left}
                y={margin.top}
                width={innerWidth}
                height={innerHeight}
              />
            </clipPath>
          </defs>

          <Group clipPath="url(#gantt-clip)">
            <GridRows
              scale={yScale}
              width={innerWidth}
              left={margin.left}
              stroke="#e0e0e0"
            />
            <GridColumns
              scale={xScale}
              height={innerHeight}
              top={margin.top}
              stroke="#e0e0e0"
            />

            {parsed.map((job, i) => {
              const x1 = xScale(job.Start);
              const x2 = xScale(job.End);
              const y = yScale(job.Machine);
              if (!Number.isFinite(y)) return null;

              const barWidth = Math.max(3, x2 - x1);
              const barHeight = yScale.bandwidth();
              const clipId = `clip-${i}`;

              return (
                <g key={i}>
                  <clipPath id={clipId}>
                    <rect x={x1} y={y} width={barWidth} height={barHeight} rx={6} />
                  </clipPath>

                  <image
                    href={PartImage}
                    x={x1}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#${clipId})`}
                    filter="url(#bar-blur)"
                  />

                  <rect
                    x={x1}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={6}
                    fill="rgba(255,255,255,0.28)"
                    stroke="#0f3b63"
                    strokeWidth={1.1}
                    onMouseEnter={() =>
                      showTooltip({
                        tooltipData: job,
                        tooltipLeft: x1 + barWidth / 2,
                        tooltipTop: y - 10,
                      })
                    }
                    onMouseLeave={hideTooltip}
                  />
                </g>
              );
            })}
          </Group>

          <AxisLeft
            left={margin.left}
            scale={yScale}
            tickValues={visibleYTicks}
            tickLabelProps={() => ({
              fontSize: 13,
              textAnchor: "end",
              dy: "0.33em",
              fontWeight: 500,
            })}
          />

          <AxisBottom
            top={height - margin.bottom}
            scale={xScale}
            numTicks={numTicks}
            tickFormat={formatTick}
          />
        </svg>

        {/* TOOLBAR */}
        <div className={styles.zoomControls}>
          <button onClick={resetZoom}>Reset</button>
          <button onClick={() => zoomBy(1.2)}>+</button>
          <button onClick={() => zoomBy(1 / 1.2)}>-</button>

          {/* ICON-ONLY BUTTONS */}
          <button onClick={onRefresh} title="Refresh">
            <RefreshIcon fontSize="small" />
          </button>

          <button onClick={onDownloadSvg} title="Download">
            <DownloadIcon fontSize="small" />
          </button>
        </div>

        {/* Tooltip */}
        {tooltipData && (
          <Tooltip left={tooltipLeft} top={tooltipTop}>
            <strong>{tooltipData.job_id}</strong>
            <div><strong>Order:</strong> {tooltipData.OrderNo} / {tooltipData.OpNo}</div>
            <div><strong>Machine:</strong> {tooltipData.Machine}</div>
            <div><strong>Start:</strong> {tooltipData.Start.toLocaleString()}</div>
            <div><strong>End:</strong> {tooltipData.End.toLocaleString()}</div>

            {tooltipData.LatestStartDate && (
              <div>
                <strong>Latest Start:</strong>{" "}
                {new Date(tooltipData.LatestStartDate).toLocaleString()}
              </div>
            )}

            <div>
              <strong>Duration:</strong>{" "}
              {Math.round((tooltipData.End - tooltipData.Start) / 60000)} min
            </div>

            {tooltipData.Buffer && (
              <div><strong>Buffer:</strong> {tooltipData.Buffer} min</div>
            )}

            <div><strong>Priority group:</strong> {tooltipData.PriorityGroup}</div>

            {tooltipData.Reason && (
              <div style={{ maxWidth: 240 }}>
                <strong>Reason:</strong> {tooltipData.Reason}
              </div>
            )}

            {tooltipData.IsOutsourcing && (
              <div><strong>Outsourced:</strong> Yes</div>
            )}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

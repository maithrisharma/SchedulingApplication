// src/components/GanttChart.jsx
import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { Group } from "@visx/group";
import { AxisLeft, AxisBottom } from "@visx/axis";
import { scaleBand, scaleTime } from "@visx/scale";
import { GridRows, GridColumns } from "@visx/grid";
import {
  useTooltip,
  TooltipWithBounds,
  useTooltipInPortal,
} from "@visx/tooltip";

import styles from "./GanttChart.module.css";
import { useId } from "react";
import { Box, Button, Stack } from "@mui/material";

import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/Download";

import PartImage from "../assets/image.png";

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SPAN_MS = 60 * 60 * 1000;
function getWeekendDates(startDate, endDate) {
  const weekends = [];

  // Create dates in local timezone to avoid shifts
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    if (day === 0 || day === 6) {  // Sunday=0, Saturday=6
      weekends.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return weekends;
}

// ✅ CLEAR COLOR SCHEME - No conflicts!
const getBarColor = (job, isChanged = false) => {
  const pg = job.PriorityGroup;
  const os = job.Orderstate;
  const isOutsourcing = job.IsOutsourcing;
  const isLate = job.StartsBeforeLSD === false;

  let fill, stroke;

  // 1. OS5 (Urgent) - Always RED
  if (os === 5) {
    fill = 'rgba(220, 38, 38, 0.9)';      // Red-600
    stroke = '#991b1b';                    // Red-800
  }
  // 2. Outsourcing - Always ORANGE
  else if (isOutsourcing) {
    fill = 'rgba(249, 115, 22, 0.85)';    // Orange-600
    stroke = '#c2410c';                    // Orange-700
  }
  // 3. Bottleneck (PG0) - NAVY (light when on-time, dark when late)
  else if (pg === 0) {
    if (isLate) {
      fill = 'rgba(30, 58, 138, 1.0)';     // Navy-800 FULL opacity (darker)
      stroke = '#1e3a8a';                   // Navy-900
    } else {
      fill = 'rgba(30, 58, 138, 0.7)';     // Navy-800 LIGHTER (on-time)
      stroke = '#1e40af';                   // Navy-800
    }
  }
  // 4. Non-Bottleneck (PG1) - TEAL (light when on-time, dark when late)
  else if (pg === 1) {
    if (isLate) {
      fill = 'rgba(20, 184, 166, 1.0)';    // Teal-500 FULL opacity (darker)
      stroke = '#0f766e';                   // Teal-700
    } else {
      fill = 'rgba(20, 184, 166, 0.7)';    // Teal-500 LIGHTER (on-time)
      stroke = '#14b8a6';                   // Teal-500
    }
  }
  // 5. Unlimited (PG2) - Always LIGHT GRAY
  else {
    fill = 'rgba(148, 163, 184, 0.5)';     // Slate-400
    stroke = '#94a3b8';                     // Slate-400
  }

  // ✅ Changed bars get GOLD DASHED border (only visual indicator for changes)
  if (isChanged) {
    stroke = '#f59e0b';                     // Amber-500
    return { fill, stroke, strokeWidth: 2.5, strokeDasharray: '4,4' };
  }

  return { fill, stroke, strokeWidth: 1.5, strokeDasharray: 'none' };
};

export default function GanttChart({
  data,
  allJobs = [],
  machineOrder = [],
  setDraftPlan,
  onIllegalMove,
  height,
  onRefresh,
  onDownloadSvg,
  showAllLabels = false,
  onBarClick,
  onZoomChange,
  initialZoomDomain,
  highlightOrder = null,
  dimNonHighlight = true, // ✅ new
  dirtyMap = {},
  hasCandidate = false,
}) {
  const uid = useId();
  const containerRef = useRef(null);
  const [width, setWidth] = useState(1000);

  // ghost machine (visual preview only)
  const [ghostMachineById, setGhostMachineById] = useState({});
  const setGhostMachine = useCallback((jobId, machine) => {
    setGhostMachineById((prev) => ({
      ...prev,
      [String(jobId)]: String(machine),
    }));
  }, []);
  const clearGhostMachine = useCallback((jobId) => {
    setGhostMachineById((prev) => {
      const next = { ...prev };
      delete next[String(jobId)];
      return next;
    });
  }, []);

  // tooltip
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    showTooltip,
    hideTooltip,
  } = useTooltip();

  const { containerRef: tooltipPortalRef, TooltipInPortal } = useTooltipInPortal({
    scroll: true,
  });

  // panning
  const [isPanning, setIsPanning] = useState(false);
  const lastPanXRef = useRef(null);
  const lastZoomRef = useRef(null);

  // drag
  const dragRef = useRef(null);
  const [isDraggingBar, setIsDraggingBar] = useState(false);
  const dragMovedRef = useRef(false);
  const downPtRef = useRef({ x: 0, y: 0 });
  const CLICK_SUPPRESS_PX = 6;

  const SNAP_MIN = 15;
  const SNAP_MS = SNAP_MIN * 60 * 1000;
  const snapMs = (t) => Math.round(t / SNAP_MS) * SNAP_MS;

  const getId = (x) => String(x?.job_id ?? x?.jobId ?? "");

  // ✅ Helper to format as naive ISO (no 'Z' suffix)
  const formatNaive = (ms) => {
    const date = new Date(ms);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
  };
const jobById = useMemo(() => {
  const m = new Map();
  for (const r of (allJobs ?? [])) {
    const id = String(r?.job_id ?? r?.jobId ?? "").trim();
    if (id) m.set(id, r);
  }
  return m;
}, [allJobs]);

const [invalidById, setInvalidById] = useState({});
const setInvalid = useCallback((jobId, isInvalid) => {
  const k = String(jobId);
  setInvalidById(prev => {
    if (!!prev[k] === !!isInvalid) return prev;
    const next = { ...prev };
    if (isInvalid) next[k] = true;
    else delete next[k];
    return next;
  });
}, []);

  /* -----------------------------
     Resize Observer
  ----------------------------- */
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  /* -----------------------------
     Global mouseup safety
  ----------------------------- */
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setIsPanning(false);
      lastPanXRef.current = null;

      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        setIsDraggingBar(false);
        clearGhostMachine(d.jobId);
        setInvalid(d.jobId, false);
        dragMovedRef.current = false;
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    window.addEventListener("mouseleave", handleGlobalMouseUp);

    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
      window.removeEventListener("mouseleave", handleGlobalMouseUp);
    };
  }, [clearGhostMachine, setInvalid]);

  /* -----------------------------
     Parse data
  ----------------------------- */
  const parsed = useMemo(
    () =>
      (data ?? []).map((d) => ({
        ...d,
        Start: new Date(d.Start),
        End: new Date(d.End),
        Machine: String(d.WorkPlaceNo),
      })),
    [data]
  );

  const machines = useMemo(() => {
    const present = new Set(parsed.map((d) => d.Machine));

    if (machineOrder && machineOrder.length > 0) {
      const orderedPresent = machineOrder
        .map(String)
        .filter((m) => present.has(String(m)));
      return orderedPresent.length > 0 ? orderedPresent : [...present];
    }

    return [...new Set(parsed.map((d) => d.Machine))];
  }, [machineOrder, parsed]);

  /* -----------------------------
     Time bounds
  ----------------------------- */
  const timeBounds = useMemo(() => {
    if (!parsed.length) return null;
    return {
      min: new Date(Math.min(...parsed.map((d) => d.Start.getTime()))),
      max: new Date(Math.max(...parsed.map((d) => d.End.getTime()))),
    };
  }, [parsed]);

  const globalStart = timeBounds?.min;
  const globalEnd = timeBounds?.max;

  const [viewDomain, setViewDomain] = useState(() => ({
    start: globalStart || new Date(),
    end: globalEnd || new Date(Date.now() + 8 * MIN_SPAN_MS),
  }));

  const initialZoomAppliedRef = useRef(false);
  useEffect(() => {
    if (!globalStart || !globalEnd) return;
    if (initialZoomAppliedRef.current) return;

    if (initialZoomDomain?.start && initialZoomDomain?.end) {
      setViewDomain({
        start: new Date(initialZoomDomain.start),
        end: new Date(initialZoomDomain.end),
      });
    } else {
      const twoWeeksMs = 14 * DAY_MS;
      const initialEndTime = Math.min(
        globalEnd.getTime(),
        globalStart.getTime() + twoWeeksMs
      );
      setViewDomain({
        start: globalStart,
        end: new Date(initialEndTime),
      });
    }

    initialZoomAppliedRef.current = true;
  }, [globalStart, globalEnd, initialZoomDomain]);

  /* -----------------------------
     Persist zoom to parent
  ----------------------------- */
  useEffect(() => {
    if (!onZoomChange) return;

    const prev = lastZoomRef.current;
    const curr = viewDomain;

    if (
      !prev ||
      prev.start.getTime() !== curr.start.getTime() ||
      prev.end.getTime() !== curr.end.getTime()
    ) {
      lastZoomRef.current = curr;
      onZoomChange(curr);
    }
  }, [viewDomain, onZoomChange]);

  const resetToTwoWeeks = () => {
    if (!globalStart || !globalEnd) return;
    const twoWeeksMs = 14 * DAY_MS;
    const initialEndTime = Math.min(
      globalEnd.getTime(),
      globalStart.getTime() + twoWeeksMs
    );
    setViewDomain({
      start: globalStart,
      end: new Date(initialEndTime),
    });
  };

  const showFullTimeline = () => {
    if (!globalStart || !globalEnd) return;
    setViewDomain({ start: globalStart, end: globalEnd });
  };

  /* -----------------------------
     Scales
  ----------------------------- */
  const margin = { top: 40, right: 20, bottom: 40, left: 90 };
  const innerWidth = Math.max(20, width - margin.left - margin.right);
  const innerHeight = height - margin.top - margin.bottom;

  const xScale = useMemo(
    () =>
      scaleTime({
        domain: [viewDomain.start, viewDomain.end],
        range: [margin.left, width - margin.right],
      }),
    [viewDomain, width, margin]
  );

  const yScale = useMemo(
    () =>
      scaleBand({
        domain: machines,
        range: [margin.top, height - margin.bottom],
        padding: 0.15,
      }),
    [machines, height, margin]
  );

  const machineAtY = (clientY) => {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    const ySvg = clientY - rect.top;
    const yClamped = Math.max(margin.top, Math.min(height - margin.bottom, ySvg));

    const bw = yScale.bandwidth();
    for (const m of machines) {
      const y0 = yScale(m);
      if (y0 == null) continue;
      if (yClamped >= y0 && yClamped <= y0 + bw) return m;
    }
    return null;
  };

  /* -----------------------------
     Drag handling (ghost vertical)
  ----------------------------- */
  useEffect(() => {
    const onPointerMove = (e) => {
      const d = dragRef.current;
      if (!d) return;

      const sx = downPtRef.current.x;
      const sy = downPtRef.current.y;
      if (Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > CLICK_SUPPRESS_PX) {
        dragMovedRef.current = true;
      }

      const msPerPx = (viewDomain.end - viewDomain.start) / innerWidth;
      const dx = e.clientX - d.clientX0;
      const shiftMs = dx * msPerPx;

      const hoveredMachine = machineAtY(e.clientY);
      const newMachine = hoveredMachine ?? d.origMachine;
      d.lastMachine = newMachine;

      // ghost preview only
      setGhostMachine(d.jobId, newMachine);

      const dur = d.baseEndMs - d.baseStartMs;
      const newStartMs = snapMs(d.baseStartMs + shiftMs);
      const newEndMs = newStartMs + dur;
      const predIds = d.predIds || [];
let invalidPreds = [];

if (predIds.length > 0) {
  for (const pid of predIds) {
    const pred = jobById.get(String(pid));
    if (!pred?.End) continue; // if missing, don't block

    const predEndMs = new Date(pred.End).getTime();
    if (Number.isFinite(predEndMs) && predEndMs > newStartMs) {
      invalidPreds.push({ pid: String(pid), predEndMs });
    }
  }
}

// store on dragRef
d.lastStartMs = newStartMs;
d.lastEndMs = newEndMs;
d.invalidPreds = invalidPreds;

// red preview border if invalid
setInvalid(d.jobId, invalidPreds.length > 0);


      // only time moves in draftPlan
      setDraftPlan?.((prev) =>
        prev.map((r) => {
          if (getId(r) !== String(d.jobId)) return r;
          return {
            ...r,
            Start: formatNaive(newStartMs),
            End: formatNaive(newEndMs),
          };
        })
      );
    };

    const onPointerUp = () => {
      const d = dragRef.current;
      if (!d) return;

      dragRef.current = null;
      setIsDraggingBar(false);
            // ✅ PREDECESSOR VALIDATION: block drop if any predecessor ends after new start
      if (d.invalidPreds && d.invalidPreds.length > 0) {
        const first = d.invalidPreds[0];
        onIllegalMove?.(
          `Nicht möglich: Vorgänger ${first.pid} endet nach dem Start.`
        );

        // revert to original time
        setDraftPlan?.((prev) =>
          prev.map((r) => {
            if (getId(r) !== String(d.jobId)) return r;
            return {
              ...r,
              Start: formatNaive(d.origStartMs),
              End: formatNaive(d.origEndMs),
            };
          })
        );

        setInvalid(d.jobId, false);
        clearGhostMachine(d.jobId);

        setTimeout(() => {
          dragMovedRef.current = false;
        }, 0);

        return; // ✅ IMPORTANT: stop here, do not continue with machine check
      }


      const changedMachine = d.lastMachine && d.lastMachine !== d.origMachine;

      if (changedMachine) {
        onIllegalMove?.("Arbeitsplatzwechsel ist nicht erlaubt.");

        // revert to original time + original machine
        setDraftPlan?.((prev) =>
          prev.map((r) => {
            if (getId(r) !== String(d.jobId)) return r;
            return {
              ...r,
              Start: formatNaive(d.origStartMs),
              End: formatNaive(d.origEndMs),
              WorkPlaceNo: d.origMachine,
            };
          })
        );
        setInvalid(d.jobId, false);   // ✅ clear red border after valid drop

      }
      setInvalid(d.jobId, false);
      clearGhostMachine(d.jobId);

      setTimeout(() => {
        dragMovedRef.current = false;
      }, 0);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [
    innerWidth,
    machines,
    setDraftPlan,
    viewDomain,
    yScale,
    clearGhostMachine,
    setGhostMachine,
    onIllegalMove,
    formatNaive,
    jobById,     // ✅ add
    setInvalid,  // ✅ add
  ]);

  /* -----------------------------
     Tick labels density
  ----------------------------- */
  const showAllYAxisLabels = showAllLabels || machines.length <= 20;

  const visibleYTicks = useMemo(() => {
    if (showAllYAxisLabels) return machines;

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
  }, [machines, yScale, showAllYAxisLabels]);

  /* -----------------------------
     X axis formatting
  ----------------------------- */
  const viewSpanMs = viewDomain.end - viewDomain.start;
  const viewSpanDays = viewSpanMs / DAY_MS;

  const formatTick = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (viewSpanDays > 60) {
      return date.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
    }
    if (viewSpanDays > 7) {
      return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
    }
    if (viewSpanDays > 1) {
      return date.toLocaleString("de-DE", { day: "2-digit", month: "short", hour: "2-digit" });
    }
    return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  };

  const approxTicks = Math.max(4, Math.floor(innerWidth / 90));
  const numTicks = Math.min(approxTicks, 24);
  const weekendDates = useMemo(() => {
    if (!viewDomain?.start || !viewDomain?.end) return [];
    return getWeekendDates(viewDomain.start, viewDomain.end);
  }, [viewDomain]);
  /* -----------------------------
     Zoom
  ----------------------------- */
  const zoomBy = (factor) => {
    if (!globalStart || !globalEnd) return;

    setViewDomain((prev) => {
      const fullSpanMs = globalEnd - globalStart;
      let spanMs = prev.end - prev.start;

      let newSpanMs = spanMs / factor;
      newSpanMs = Math.max(MIN_SPAN_MS, Math.min(newSpanMs, fullSpanMs));

      // ✅ CHANGED: Anchor at start (not center)
      let start = prev.start.getTime();  // Keep start fixed
      let end = start + newSpanMs;       // Expand/contract from start

      const gStart = globalStart.getTime();
      const gEnd = globalEnd.getTime();

      if (start < gStart) {
        start = gStart;
        end = start + newSpanMs;
      }
      if (end > gEnd) {
        end = gEnd;
        start = end - newSpanMs;
      }

      return { start: new Date(start), end: new Date(end) };
    });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    zoomBy(factor);
  };

  /* -----------------------------
     Pan (drag background)
  ----------------------------- */
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

    setViewDomain((prev) => {
      let start = prev.start.getTime() + shiftMs;
      let end = prev.end.getTime() + shiftMs;

      if (globalStart && globalEnd) {
        const gStart = globalStart.getTime();
        const gEnd = globalEnd.getTime();
        const span = end - start;

        if (start < gStart) {
          start = gStart;
          end = gStart + span;
        }
        if (end > gEnd) {
          end = gEnd;
          start = gEnd - span;
        }
      }

      return { start: new Date(start), end: new Date(end) };
    });
  };

  const endPan = () => {
    setIsPanning(false);
    lastPanXRef.current = null;
  };

  // pan buttons
  const panBy = (dir, fraction = 0.25) => {
    setViewDomain((prev) => {
      const span = prev.end.getTime() - prev.start.getTime();
      const delta = span * fraction * dir;

      let start = prev.start.getTime() + delta;
      let end = prev.end.getTime() + delta;

      if (globalStart && globalEnd) {
        const gStart = globalStart.getTime();
        const gEnd = globalEnd.getTime();

        if (start < gStart) {
          start = gStart;
          end = gStart + span;
        }
        if (end > gEnd) {
          end = gEnd;
          start = gEnd - span;
        }
      }

      return { start: new Date(start), end: new Date(end) };
    });
  };

  /* -----------------------------
     Labels / pictogram
  ----------------------------- */
  const showPictogram = viewSpanDays <= 21;
  const ORDER_LABEL_MIN_WIDTH = 40;

  // merge refs for tooltip portal + your logic
  const setRootRef = useCallback(
    (node) => {
      containerRef.current = node;
      tooltipPortalRef(node);
    },
    [tooltipPortalRef]
  );

  return (
    <div
      ref={setRootRef}
      className={styles.ganttRoot}
      style={{ width: "100%", overflow: "hidden" }}
      onWheel={handleWheel}
    >
      <div style={{ width: "100%", height, position: "relative" }}>
        <svg id="gantt-svg" data-uid={uid} width={width} height={height}>
          {/* Pan layer */}
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            style={{
              cursor: isPanning ? "grabbing" : "grab",
              pointerEvents: "fill",
            }}
            onMouseDown={startPan}
            onMouseMove={movePan}
            onMouseUp={endPan}
            onMouseLeave={endPan}
          />

          <defs>
            <clipPath id={`${uid}-clip`}>
              <rect
                x={margin.left}
                y={margin.top}
                width={innerWidth}
                height={innerHeight}
              />
            </clipPath>
          </defs>

          <Group clipPath={`url(#${uid}-clip)`}>
            <GridRows scale={yScale} width={innerWidth} left={margin.left} stroke="#e0e0e0" />
            <GridColumns scale={xScale} height={innerHeight} top={margin.top} stroke="#e0e0e0" />
            {/* ✅ ADD: Weekend visualization */}
            {weekendDates.map((date, idx) => {
              const x = xScale(date);
              const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
              const dayWidth = xScale(nextDay) - x;

              // Skip if too small to render
              if (dayWidth < 0.5) return null;

              const label = date.getDay() === 6 ? 'Sa' : 'So';

              return (
                <g key={`weekend-${idx}`}>
                  {/* Light gray background */}
                  <rect
                    x={x}
                    y={margin.top}
                    width={dayWidth}
                    height={innerHeight}
                    fill="rgba(148, 163, 184, 0.15)"
                    pointerEvents="none"
                  />

                  {/* Dashed border */}
                  <line
                    x1={x}
                    y1={margin.top}
                    x2={x}
                    y2={margin.top + innerHeight}
                    stroke="#94a3b8"
                    strokeWidth={1}
                    strokeDasharray="4,4"
                    pointerEvents="none"
                  />

                  {/* Label when zoomed in */}
                  {viewSpanDays < 21 && dayWidth > 30 && (
                    <text
                      x={x + dayWidth / 2}
                      y={margin.top - 10}
                      textAnchor="middle"
                      fill="#64748b"
                      fontSize={10}
                      fontWeight={600}
                      pointerEvents="none"
                    >
                      {label}
                    </text>
                  )}
                </g>
              );
            })}
            {/* END OF ADDITION */}
            {parsed.map((job, i) => {
              const x1 = xScale(job.Start);
              const x2 = xScale(job.End);

              const jobIdStr = String(job.job_id ?? job.jobId);
              const isInvalid = !!invalidById[jobIdStr];

              const renderMachine = ghostMachineById[jobIdStr] ?? job.Machine;
              const y = yScale(renderMachine);

              if (!Number.isFinite(y)) return null;

              const barWidth = Math.max(3, x2 - x1);
              const barHeight = yScale.bandwidth();

              // ✅ Check if this job has been changed
              const isChanged = !!dirtyMap[jobIdStr];

              // ✅ Get enterprise colors
const colors = getBarColor(job, isChanged);

// ✅ Override for highlighted order (better color!)
let baseFill = colors.fill;
let borderColor = colors.stroke;
let strokeWidth = colors.strokeWidth;
let strokeDasharray = colors.strokeDasharray;
if (isInvalid) {
  borderColor = "#dc2626";     // red
  strokeWidth = 3;
  strokeDasharray = "none";
}


if (highlightOrder) {
  const isSelected = String(job.OrderNo) === String(highlightOrder);

  if (isSelected) {
    baseFill = "rgba(34, 197, 94, 0.95)";
    borderColor = "#16a34a";
    strokeWidth = 3;
  } else if (dimNonHighlight) {
    baseFill = colors.fill.replace(/[\d.]+\)$/, "0.3)");
    borderColor = colors.stroke;
    strokeWidth = 1;
  }
}


              const barOpacity = hasCandidate ? 0.7 : 1;

              const iconWidth = Math.min(24, barWidth - 4);
              const showPictogram = viewSpanDays <= 21 && barWidth > 90 && iconWidth > 0;
              const showOrderLabel = job.OrderNo && barWidth > (showPictogram ? 90 : 40);
              const iconClipId = `${uid}-icon-clip-${i}`;
              const circleClipId = `${uid}-circle-${jobIdStr}-${i}`;

              return (
                <g key={`${uid}-${jobIdStr}-${i}`}>
                  <rect
                    x={x1}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={6}
                    fill={baseFill}
                    stroke={borderColor}
                    strokeWidth={strokeWidth}
                    strokeDasharray={strokeDasharray}
                    opacity={barOpacity}
                    onPointerDown={(e) => {
                      // ✅ Block dragging if candidate is active
                      if (hasCandidate) {
                        e.preventDefault();
                        e.stopPropagation();
                        onIllegalMove?.("Kandidat ist aktiv (Read-only). Bitte erst übernehmen oder verwerfen.");
                        return;
                      }

                      e.stopPropagation();
                      e.preventDefault();

                      dragMovedRef.current = false;
                      downPtRef.current = { x: e.clientX, y: e.clientY };

                      // stop panning
                      setIsPanning(false);
                      lastPanXRef.current = null;

                      setIsDraggingBar(true);
                      e.currentTarget.setPointerCapture?.(e.pointerId);

                      dragRef.current = {
                        jobId: jobIdStr,
                        origStartMs: job.Start.getTime(),
                        origEndMs: job.End.getTime(),
                        origMachine: job.Machine,
                        baseStartMs: job.Start.getTime(),
                        baseEndMs: job.End.getTime(),
                        lastMachine: job.Machine,
                        clientX0: e.clientX,
                        clientY0: e.clientY,
                        predIds: Array.isArray(job.PredIds) ? job.PredIds.map(String) : [],
                        invalidPreds: [],
                        lastStartMs: job.Start.getTime(),
                        lastEndMs: job.End.getTime(),

                      };
                    }}
                    onPointerEnter={(e) => {
                      const svg = e.currentTarget.ownerSVGElement;
                      const rect = svg.getBoundingClientRect();
                      showTooltip({
                        tooltipData: job,
                        tooltipLeft: e.clientX - rect.left,
                        tooltipTop: e.clientY - rect.top,
                      });
                    }}
                    onPointerLeave={hideTooltip}
                    onClick={(e) => {
                      if (dragMovedRef.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                      }
                      onBarClick && onBarClick(job);
                    }}
                    style={{ cursor: hasCandidate ? "not-allowed" : (isDraggingBar ? "grabbing" : "grab") }}
                  />

                  {/* ✅ IMAGE BADGE (RIGHT SIDE) - ONLY if showPictogram is true */}
    {showPictogram && (
      <g>
        {/* White circular background */}
        <circle
          cx={x1 + barWidth - 20}
          cy={y + barHeight / 2}
          r={13}
          fill="white"
          opacity={0.95}
          stroke={borderColor}
          strokeWidth={1.5}
        />

        {/* Circular image clip */}
        <defs>
          <clipPath id={circleClipId}>
            <circle
              cx={x1 + barWidth - 20}
              cy={y + barHeight / 2}
              r={11}
            />
          </clipPath>
        </defs>

        {/* Image */}
        <image
          href={PartImage}
          x={x1 + barWidth - 31}
          y={y + barHeight / 2 - 11}
          width={22}
          height={22}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#${circleClipId})`}
          opacity={0.92}
          pointerEvents="none"
        />
      </g>
    )}

    {/* ✅ ORDER NUMBER TEXT - SINGLE RENDERING ONLY! */}
    {showOrderLabel && (
      <text
        x={showPictogram ? x1 + 8 : x1 + barWidth / 2}
        y={y + barHeight / 2 + 4}
        textAnchor={showPictogram ? "start" : "middle"}
        fill="#ffffff"
        fontSize={barWidth < 80 ? 9 : 11}
        fontWeight={600}
        pointerEvents="none"
      >
        {String(job.OrderNo)}
      </text>
    )}
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
  scale={xScale}
  top={innerHeight + margin.top}
  tickFormat={(d) => {
    const date = new Date(d);

    // Always include date for end-of-range ticks
    if (viewSpanDays < 1) {
      // Zoomed in: "04 Feb, 14:00"
      return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'short'
      }) + ', ' + date.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    else if (viewSpanDays < 7) {
      // Week: "Mo 04 Feb"
      return date.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
      });
    }
    else {
      // Month+: "04 Feb"
      return date.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: 'short'
      });
    }
  }}
  numTicks={Math.max(5, Math.min(numTicks, 12))} // Limit to 5-12 ticks
  stroke="#888"
  tickStroke="#888"
  tickLabelProps={() => ({
    fill: '#666',
    fontSize: 10,
    textAnchor: 'middle',
    dy: 4,
  })}
/>
        </svg>

        {/* ✅ MINIMAL TOOLBAR - No box border */}
<div className={styles.zoomControls}>
  <Stack
    direction="row"
    spacing={0.5}  // ✅ Tighter spacing
    alignItems="center"
    sx={{
      // ✅ Remove background and shadow for cleaner look
      p: 0.5,
    }}
  >
    <Button
      size="small"
      variant="outlined"
      onClick={() => panBy(-1)}
      sx={{ minWidth: 32, px: 0.5 }}  // ✅ Minimal style
    >
      ←
    </Button>
    <Button
      size="small"
      variant="outlined"
      onClick={() => panBy(1)}
      sx={{ minWidth: 32, px: 0.5 }}
    >
      →
    </Button>

    <Box sx={{ width: 4 }} />  {/* Small separator */}

    <Button
      size="small"
      variant="outlined"
      onClick={resetToTwoWeeks}
      sx={{ minWidth: 50, px: 1, textTransform: "none", fontSize: '0.75rem' }}
    >
      Start
    </Button>
    <Button
      size="small"
      variant="outlined"
      onClick={() => zoomBy(1.2)}
      sx={{ minWidth: 32, px: 0.5 }}
    >
      +
    </Button>
    <Button
      size="small"
      variant="outlined"
      onClick={() => zoomBy(1 / 1.2)}
      sx={{ minWidth: 32, px: 0.5 }}
    >
      −
    </Button>
    <Button
      size="small"
      variant="outlined"
      onClick={showFullTimeline}
      sx={{ minWidth: 40, px: 1, textTransform: "none", fontSize: '0.75rem' }}
    >
      Full
    </Button>

    <Box sx={{ width: 4 }} />


    <Button
      size="small"
      variant="outlined"
      onClick={onDownloadSvg}
      sx={{ minWidth: 32, px: 0.5 }}
    >
      <DownloadIcon fontSize="small" />
    </Button>
  </Stack>
</div>

        {/* Tooltip */}
        {tooltipData && (
          <TooltipInPortal left={tooltipLeft} top={tooltipTop}>
            <TooltipWithBounds
              style={{
                maxWidth: 280,
                maxHeight: 220,
                overflow: "auto",
                background: "white",
                color: "#111827",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 10,
                boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                fontSize: 12,
                lineHeight: 1.35,
              }}
            >
              {(() => {
                const tipId = String(tooltipData.job_id ?? tooltipData.jobId);
                const tipMachine = ghostMachineById[tipId] ?? tooltipData.Machine;

                return (
                  <>
                    <div><strong>Job-ID:</strong> {tooltipData.job_id}</div>
                    <div><strong>Auftrag:</strong> {tooltipData.OrderNo} / {tooltipData.OpNo}</div>
                    <div><strong>Arbeitsplatz:</strong> {tipMachine}</div>
                    <div><strong>Start:</strong> {tooltipData.Start.toLocaleString("de-DE")}</div>
                    <div><strong>Ende:</strong> {tooltipData.End.toLocaleString("de-DE")}</div>

                    {tooltipData.LatestStartDate && (
                      <div>
                        <strong>Spätester Start:</strong>{" "}
                        {new Date(tooltipData.LatestStartDate).toLocaleString("de-DE")}
                      </div>
                    )}

                    <div>
                      <strong>Dauer:</strong>{" "}
                      {tooltipData.Duration != null
                        ? `${tooltipData.Duration} Min`
                        : `${Math.round((tooltipData.End - tooltipData.Start) / 60000)} Min`}
                    </div>

                    {tooltipData.Buffer && (
                      <div><strong>Puffer:</strong> {tooltipData.Buffer} Min</div>
                    )}

                    <div><strong>Prioritätsgruppe:</strong> {tooltipData.PriorityGroup}</div>

                    {tooltipData.Reason && (
                      <div style={{ maxWidth: 260 }}>
                        <strong>Grund:</strong> {tooltipData.Reason}
                      </div>
                    )}

                    {tooltipData.IsOutsourcing && (
                      <div><strong>Fremdvergabe:</strong> Ja</div>
                    )}
                  </>
                );
              })()}
            </TooltipWithBounds>
          </TooltipInPortal>
        )}
      </div>
    </div>
  );
}
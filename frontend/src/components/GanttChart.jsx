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

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SPAN_MS = 60 * 60 * 1000; // 1 Stunde (minimale Zoom-Spanne)

export default function GanttChart({
  data,
  height,
  onRefresh,
  onDownloadSvg,
  showAllLabels = false,
  onBarClick,
}) {
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
     Parse data
  ----------------------------- */
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

  // Beim Laden: auf erste 2 Wochen zoomen (oder bis globalEnd)
  useEffect(() => {
    if (globalStart && globalEnd) {
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
  }, [globalStart, globalEnd]);

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

  /* -----------------------------
     Y-Axis labels (Show all vs condensed)
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
     X-axis tick format (de-DE)
  ----------------------------- */
  const viewSpanMs = viewDomain.end - viewDomain.start;
  const viewSpanDays = viewSpanMs / DAY_MS;

  const formatTick = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (viewSpanDays > 180) {
      // Jahre / Halbjahre
      return date.toLocaleDateString("de-DE", {
        month: "short",
        year: "2-digit",
      });
    }
    if (viewSpanDays > 60) {
      // Quartale / Monate
      return date.toLocaleDateString("de-DE", {
        month: "short",
        year: "2-digit",
      });
    }
    if (viewSpanDays > 7) {
      // Tage mit Monat
      return date.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "short",
      });
    }
    if (viewSpanDays > 1) {
      // Tag + Stunde
      return date.toLocaleString("de-DE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
      });
    }
    // Stunden / Minuten
    return date.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const approxTicks = Math.max(4, Math.floor(innerWidth / 90));
  const numTicks = Math.min(approxTicks, 24);

  /* -----------------------------
     Zoom (Option A – kontinuierlich)
  ----------------------------- */
  const zoomBy = (factor) => {
    if (!globalStart || !globalEnd) return;

    setViewDomain((prev) => {
      const fullSpanMs = globalEnd - globalStart;
      let spanMs = prev.end - prev.start;

      let newSpanMs = spanMs / factor;
      newSpanMs = Math.max(MIN_SPAN_MS, Math.min(newSpanMs, fullSpanMs));

      const mid = (prev.start.getTime() + prev.end.getTime()) / 2;
      let start = mid - newSpanMs / 2;
      let end = mid + newSpanMs / 2;

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
     Panning
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

  /* -----------------------------
     Pictogram + Order-Label Logik
  ----------------------------- */

  // Bildchen nur in "Wochen-Ansicht"
  const showPictogram = viewSpanDays <= 21;
  // OrderNo IMMER, wenn der Balken breit genug ist:
  const ORDER_LABEL_MIN_WIDTH = 40;

  /* -----------------------------
     Render
  ----------------------------- */
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

              const latestStart = job.LatestStartDate
                ? new Date(job.LatestStartDate)
                : null;

              const isLateStart =
                job.StartsBeforeLSD === false ||
                (latestStart && job.Start > latestStart);

              const baseFill = isLateStart
                ? "rgba(248,113,113,0.9)" // rot
                : "rgba(15,59,99,0.9)"; // blau

              const borderColor = isLateStart ? "#b91c1c" : "#0f3b63";

              const iconWidth = Math.min(24, barWidth - 4);
              const pictogramVisible =
                showPictogram && barWidth > 50 && iconWidth > 0;

              const showOrderLabel =
                job.OrderNo && barWidth > ORDER_LABEL_MIN_WIDTH;

              const iconClipId = `icon-clip-${i}`;

              return (
                <g key={i}>
                  {/* ClipPath für das Bild links */}
                  {pictogramVisible && (
                    <clipPath id={iconClipId}>
                      <rect
                        x={x1}
                        y={y}
                        width={iconWidth}
                        height={barHeight}
                        rx={6}
                      />
                    </clipPath>
                  )}

                  {/* Grundbalken */}
                  <rect
                    x={x1}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={6}
                    fill={baseFill}
                    stroke={borderColor}
                    strokeWidth={1.1}
                    onMouseEnter={() =>
                      showTooltip({
                        tooltipData: job,
                        tooltipLeft: x1 + barWidth / 2,
                        tooltipTop: y - 10,
                      })
                    }
                    onMouseLeave={hideTooltip}
                    onClick={() => onBarClick && onBarClick(job)}
                    style={{ cursor: "pointer" }}
                  />

                  {/* Bild links + Ordernummer (nur bei Wochen-Zoom) */}
                  {pictogramVisible && (
                    <>
                      <image
                        href={PartImage}
                        x={x1}
                        y={y}
                        width={iconWidth}
                        height={barHeight}
                        preserveAspectRatio="xMidYMid slice"
                        clipPath={`url(#${iconClipId})`}
                      />
                      {showOrderLabel && (
                        <text
                          x={x1 + iconWidth + 4}
                          y={y + barHeight / 2 + 4}
                          fill="#ffffff"
                          fontSize={11}
                          fontWeight={600}
                        >
                          {String(job.OrderNo)}
                        </text>
                      )}
                    </>
                  )}

                  {/* Wenn kein Bild gezeigt wird: OrderNo direkt im Balken links */}
                  {!pictogramVisible && showOrderLabel && (
                    <text
                      x={x1 + 4}
                      y={y + barHeight / 2 + 4}
                      fill="#ffffff"
                      fontSize={11}
                      fontWeight={600}
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
            top={height - margin.bottom}
            scale={xScale}
            numTicks={numTicks}
            tickFormat={formatTick}
          />
        </svg>

        {/* TOOLBAR */}
        <div className={styles.zoomControls}>
          {/* Start: zurück auf 2 Wochen */}
          <button onClick={resetToTwoWeeks} title="Zurück auf 2 Wochen">
            Start
          </button>

          {/* Kontinuierlich hinein- und hinauszoomen */}
          <button onClick={() => zoomBy(1.2)} title="Hineinzoomen">
            +
          </button>
          <button onClick={() => zoomBy(1 / 1.2)} title="Herauszoomen">
            -
          </button>

          {/* Volle Plantafel anzeigen */}
          <button onClick={showFullTimeline} title="Gesamte Plantafel">
            Full
          </button>

          <button onClick={onRefresh} title="Aktualisieren">
            <RefreshIcon fontSize="small" />
          </button>

          <button onClick={onDownloadSvg} title="SVG herunterladen">
            <DownloadIcon fontSize="small" />
          </button>
        </div>

        {/* Tooltip (Deutsch) */}
        {tooltipData && (
          <Tooltip left={tooltipLeft} top={tooltipTop}>
            <div>
              <strong>Job-ID:</strong> {tooltipData.job_id}
            </div>
            <div>
              <strong>Auftrag:</strong> {tooltipData.OrderNo} /{" "}
              {tooltipData.OpNo}
            </div>
            <div>
              <strong>Arbeitsplatz:</strong> {tooltipData.Machine}
            </div>
            <div>
              <strong>Start:</strong>{" "}
              {tooltipData.Start.toLocaleString("de-DE")}
            </div>
            <div>
              <strong>Ende:</strong>{" "}
              {tooltipData.End.toLocaleString("de-DE")}
            </div>

            {tooltipData.LatestStartDate && (
              <div>
                <strong>Spätester Start:</strong>{" "}
                {new Date(
                  tooltipData.LatestStartDate
                ).toLocaleString("de-DE")}
              </div>
            )}

            <div>
              <strong>Dauer:</strong>{" "}
              {Math.round((tooltipData.End - tooltipData.Start) / 60000)} Min
            </div>

            {tooltipData.Buffer && (
              <div>
                <strong>Puffer:</strong> {tooltipData.Buffer} Min
              </div>
            )}

            <div>
              <strong>Prioritätsgruppe:</strong>{" "}
              {tooltipData.PriorityGroup}
            </div>

            {tooltipData.Reason && (
              <div style={{ maxWidth: 240 }}>
                <strong>Grund:</strong> {tooltipData.Reason}
              </div>
            )}

            {tooltipData.IsOutsourcing && (
              <div>
                <strong>Fremdvergabe:</strong> Ja
              </div>
            )}
          </Tooltip>
        )}
      </div>
    </div>
  );
}

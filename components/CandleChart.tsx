"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart, ColorType, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries,
} from "lightweight-charts";
import { OHLCPoint, Timeframe } from "@/lib/useTokenPrice";

const CHART_BG = "#0d0f14";
const H = 350;

const LIVE_WINDOW_MS: Partial<Record<Timeframe, number>> = {
  "1s":  300_000,   // last 300 seconds (~200 points at 1s cadence)
  "5s":  300_000,   // last 5 minutes
  "30s": 900_000,   // last 15 minutes
};

// Axis layout constants
const Y_AXIS_W = 60; // px reserved on right for price labels
const X_AXIS_H = 20; // px reserved at bottom for time labels
const LINE_COLOR = "#00ff88";

function formatPrice(p: number): string {
  if (p >= 10_000) return "$" + Math.round(p).toLocaleString();
  if (p >= 1_000)  return "$" + p.toFixed(1);
  if (p >= 1)      return "$" + p.toFixed(2);
  return "$" + p.toFixed(6);
}

function formatMcap(v: number): string {
  if (v <= 0)            return "$0";
  if (v < 1_000)         return `$${v.toFixed(0)}`;
  if (v < 1_000_000)     return `$${(v / 1_000).toFixed(1)}K`;
  if (v < 1_000_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  return `$${(v / 1_000_000_000).toFixed(2)}B`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Canvas snake-line for LIVE mode ──────────────────────────────────────────

function LiveLineCanvas({ data, priceToBeat, width, height, showMcap }: {
  data:        OHLCPoint[];
  priceToBeat: number | null;
  width:       number;
  height:      number;
  showMcap?:   boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  // Mutable refs — read every frame without restarting the RAF loop
  const dataRef = useRef(data);
  const ptbRef  = useRef(priceToBeat);
  dataRef.current = data;
  ptbRef.current  = priceToBeat;

  // Velocity-based smoothing: inertia toward targetPrice
  const targetPriceRef  = useRef(0);
  const displayPriceRef = useRef(0);
  const velocityRef     = useRef(0);
  const initializedRef  = useRef(false);

  // Sync target from latest data on every render
  if (data.length > 0) {
    const latest = data[data.length - 1].price;
    targetPriceRef.current = latest;
    if (!initializedRef.current) {
      displayPriceRef.current = latest;
      initializedRef.current  = true;
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Chart drawing area (inset from full canvas)
    const chartW = width  - Y_AXIS_W;
    const chartH = height - X_AXIS_H;

    const draw = () => {
      const pts          = dataRef.current;
      const ptb          = ptbRef.current;
      const displayPrice = displayPriceRef.current;
      ctx.clearRect(0, 0, width, height);

      // Time-based x: right edge = now, left edge = now - 60s
      // Every frame nowMs advances → all points scroll left continuously
      const nowMs      = Date.now();
      const windowMs   = 60_000;
      const startMs    = nowMs - windowMs;
      const toX        = (ts: number) => ((ts - startMs) / windowMs) * chartW;

      // Visible points within the 60s window (keep a small left buffer for smooth entry)
      const visiblePts = pts.filter(p => p.time >= startMs - 2_000);

      // Need at least 1 known price to draw anything
      const liveTailPrice = displayPrice > 0
        ? displayPrice
        : (pts.length > 0 ? pts[pts.length - 1].price : 0);
      if (liveTailPrice === 0) return;

      // Price range over visible data + live tail
      const allPrices = visiblePts.length > 0
        ? [...visiblePts.map(d => d.price), liveTailPrice]
        : [liveTailPrice, liveTailPrice];
      const minP  = Math.min(...allPrices) * 0.9999;
      const maxP  = Math.max(...allPrices) * 1.0001;
      const range = maxP - minP || liveTailPrice * 0.0001 || 1;

      // Coordinate helpers — chart drawing area (inset from axes)
      const PAD_T = 10, PAD_B = 5;
      const toY = (p: number) =>
        PAD_T + (chartH - PAD_T - PAD_B) * (1 - (p - minP) / range);

      // Build draw path: historical points + live tail pinned at right edge
      const drawPts = [
        ...visiblePts.map(p => ({ x: toX(p.time), y: toY(p.price) })),
        { x: chartW, y: toY(liveTailPrice) },
      ];

      // ── Y-axis grid + price labels ─────────────────────────────────────────
      ctx.font = "10px monospace";
      const nY = 5;
      for (let i = 0; i <= nY; i++) {
        const p = minP + (maxP - minP) * (i / nY);
        const y = toY(p);
        if (y < 0 || y > chartH) continue;
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth   = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartW, y);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.textAlign = "left";
        ctx.fillText(showMcap ? formatMcap(p) : formatPrice(p), chartW + 4, y + 3);
      }

      // ── X-axis grid + time labels ──────────────────────────────────────────
      const nX = 5;
      for (let i = 0; i <= nX; i++) {
        const ts = startMs + (i / nX) * windowMs;
        const x  = (i / nX) * chartW;
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.lineWidth   = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, chartH);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.textAlign = i === 0 ? "left" : i === nX ? "right" : "center";
        ctx.fillText(formatTime(ts), x, chartH + 14);
      }

      // ── priceToBeat line + green zone ──────────────────────────────────────
      if (ptb != null) {
        const y = toY(ptb);
        ctx.fillStyle = "rgba(0,255,136,0.04)";
        ctx.fillRect(0, 0, chartW, Math.max(0, y));
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartW, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Bezier price line with glow ────────────────────────────────────────
      if (drawPts.length >= 2) {
        ctx.strokeStyle = LINE_COLOR;
        ctx.lineWidth   = 2;
        ctx.lineJoin    = "round";
        ctx.lineCap     = "round";
        ctx.shadowColor = LINE_COLOR;
        ctx.shadowBlur  = 8;
        ctx.beginPath();
        drawPts.forEach((pt, i) => {
          if (i === 0) {
            ctx.moveTo(pt.x, pt.y);
          } else {
            const prev = drawPts[i - 1];
            const cpX  = (prev.x + pt.x) / 2;
            ctx.bezierCurveTo(cpX, prev.y, cpX, pt.y, pt.x, pt.y);
          }
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // ── Glowing dot at live tail (right edge) ─────────────────────────────
      const dotY = toY(liveTailPrice);
      ctx.fillStyle   = LINE_COLOR;
      ctx.shadowColor = LINE_COLOR;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.arc(chartW, dotY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // ── Current price pill label (in Y-axis area) ─────────────────────────
      const pillText = showMcap ? formatMcap(liveTailPrice) : formatPrice(liveTailPrice);
      ctx.font       = "bold 13px monospace";
      const pillW    = ctx.measureText(pillText).width + 10;
      const pillH    = 18;
      const pillX    = chartW + 2;
      const pillY    = Math.max(pillH / 2, Math.min(chartH - pillH / 2, dotY)) - pillH / 2;
      const r        = 4;
      ctx.fillStyle  = LINE_COLOR;
      ctx.beginPath();
      ctx.moveTo(pillX + r, pillY);
      ctx.lineTo(pillX + pillW - r, pillY);
      ctx.quadraticCurveTo(pillX + pillW, pillY,          pillX + pillW, pillY + r);
      ctx.lineTo(pillX + pillW, pillY + pillH - r);
      ctx.quadraticCurveTo(pillX + pillW, pillY + pillH,  pillX + pillW - r, pillY + pillH);
      ctx.lineTo(pillX + r,    pillY + pillH);
      ctx.quadraticCurveTo(pillX,         pillY + pillH,  pillX, pillY + pillH - r);
      ctx.lineTo(pillX, pillY + r);
      ctx.quadraticCurveTo(pillX,         pillY,          pillX + r, pillY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.textAlign = "left";
      ctx.fillText(pillText, pillX + 5, pillY + pillH - 4);
    };

    const animate = () => {
      // Velocity-based inertia: accelerates toward target, then decelerates naturally
      const diff = targetPriceRef.current - displayPriceRef.current;
      velocityRef.current    = velocityRef.current * 0.8 + diff * 0.2;
      displayPriceRef.current += velocityRef.current;
      draw();
      animRef.current = requestAnimationFrame(animate);
    };
    velocityRef.current = 0; // reset on canvas restart
    animate();
    return () => cancelAnimationFrame(animRef.current);
  // Restart only on dimension changes; all data is read via refs each frame
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: "block" }}
    />
  );
}

// ── Main CandleChart component ────────────────────────────────────────────────

interface Props {
  data:        OHLCPoint[];
  chartType:   "line" | "candles" | "live";
  isKline:     boolean;
  priceToBeat: number | null;
  timeframe:   Timeframe;
  status:      "connecting" | "live" | "error";
  label:       string;
  showMcap?:   boolean;
}

export default function CandleChart({ data, chartType, isKline, priceToBeat, timeframe, status, label, showMcap }: Props) {
  const containerRef    = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef        = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef         = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleRef       = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volRef          = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef    = useRef<any>(null);
  const prevPriceToBeat = useRef<number | null | undefined>(undefined);
  const isKlineRef      = useRef<boolean | null>(null);
  const mountedRef      = useRef(false);

  // Pan / auto-scroll state (for Line/Candles modes)
  const userPannedRef   = useRef(false);
  const programmaticRef = useRef(false);
  const fittedRef       = useRef(false);
  const [showLiveBtn, setShowLiveBtn] = useState(false);

  // "Building chart history..." — shown for first 30s when custom token has no stored history
  const mountedWithoutKline = useRef(!isKline);
  const [buildingPast30s, setBuildingPast30s] = useState(false);
  useEffect(() => {
    if (!mountedWithoutKline.current) return;
    const id = setTimeout(() => setBuildingPast30s(true), 30_000);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracked width fed to LiveLineCanvas
  const [containerWidth, setContainerWidth] = useState(600);

  const prog = (fn: () => void) => {
    programmaticRef.current = true;
    try { fn(); } catch { /**/ }
    programmaticRef.current = false;
  };

  // ── Effect 1: create lightweight-charts chart + all series ──────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    mountedRef.current = true;
    setContainerWidth(containerRef.current.clientWidth || 600);

    try {
      const chart = createChart(containerRef.current, {
        width:  containerRef.current.clientWidth || 600,
        height: H,
        layout: {
          background: { type: ColorType.Solid, color: CHART_BG },
          textColor: "rgba(255,255,255,0.3)",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
          vertLine: { color: "rgba(255,255,255,0.12)", labelBackgroundColor: "#1a1e2a" },
          horzLine: { color: "rgba(255,255,255,0.12)", labelBackgroundColor: "#1a1e2a" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
          scaleMargins: { top: 0.1, bottom: 0.25 },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          timeVisible: true,
          secondsVisible: true,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale:  { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      });
      chartRef.current = chart;

      volRef.current = chart.addSeries(HistogramSeries, {
        color:        "rgba(255,255,255,0.07)",
        priceFormat:  { type: "volume" },
        priceScaleId: "vol",
      });
      try { chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } }); } catch { /**/ }

      lineRef.current = chart.addSeries(LineSeries, {
        color:                  "#22c55e",
        lineWidth:              2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius:  4,
        priceLineVisible:       false,
        priceScaleId:           "right",
        lastValueVisible:       true,
      });

      candleRef.current = chart.addSeries(CandlestickSeries, {
        upColor:         "#22c55e",
        downColor:       "#ef4444",
        borderUpColor:   "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor:     "rgba(34,197,94,0.65)",
        wickDownColor:   "rgba(239,68,68,0.65)",
        priceScaleId:    "right",
      });

      const onRangeChange = () => {
        if (programmaticRef.current || !mountedRef.current) return;
        userPannedRef.current = true;
        setShowLiveBtn(true);
      };
      chart.timeScale().subscribeVisibleTimeRangeChange(onRangeChange);

      const ro = new ResizeObserver(() => {
        if (!mountedRef.current || !containerRef.current || !chartRef.current) return;
        const w = containerRef.current.clientWidth;
        prog(() => chartRef.current.applyOptions({ width: w }));
        setContainerWidth(w);
      });
      ro.observe(containerRef.current);

      return () => {
        mountedRef.current = false;
        ro.disconnect();
        try { chart.timeScale().unsubscribeVisibleTimeRangeChange(onRangeChange); } catch { /**/ }
        lineRef.current      = null;
        candleRef.current    = null;
        volRef.current       = null;
        chartRef.current     = null;
        priceLineRef.current = null;
        try { chart.remove(); } catch { /**/ }
      };
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect: apply price formatter for mcap vs price display ─────────────────
  useEffect(() => {
    if (!lineRef.current || !candleRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fmt: any = showMcap
      ? { type: "custom", formatter: formatMcap, minMove: 1 }
      : { type: "price", precision: 6, minMove: 0.000001 };
    try { lineRef.current.applyOptions({ priceFormat: fmt }); } catch { /**/ }
    try { candleRef.current.applyOptions({ priceFormat: fmt }); } catch { /**/ }
  }, [showMcap]);

  // ── Effect 2: push data to lightweight-charts (Line / Candles only) ─────────
  useEffect(() => {
    if (chartType === "live") return; // canvas handles LIVE mode
    if (!mountedRef.current || !lineRef.current || !candleRef.current || !volRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toSec = (ms: number) => Math.floor(ms / 1000) as any;

    try {
      // Price line — no viewport effect, always safe to run
      if (prevPriceToBeat.current !== priceToBeat) {
        prevPriceToBeat.current = priceToBeat;
        if (priceLineRef.current) {
          prog(() => lineRef.current.removePriceLine(priceLineRef.current));
          priceLineRef.current = null;
        }
        if (priceToBeat != null) {
          try {
            priceLineRef.current = lineRef.current.createPriceLine({
              price:            priceToBeat,
              color:            "rgba(255,255,255,0.2)",
              lineStyle:        LineStyle.Dashed,
              lineWidth:        1,
              axisLabelVisible: true,
              title:            "Target",
            });
          } catch { /**/ }
        }
      }

      // isKline display option — no viewport effect, run only when it changes
      if (isKlineRef.current !== isKline) {
        isKlineRef.current = isKline;
        prog(() => chartRef.current?.applyOptions({ timeScale: { secondsVisible: !isKline } }));
      }

      if (!data.length) return;

      const first     = data[0].price;
      const lastPrice = data[data.length - 1].price;
      const lineColor = priceToBeat != null
        ? (lastPrice >= priceToBeat ? "#22c55e" : "#ef4444")
        : (lastPrice >= first       ? "#22c55e" : "#ef4444");

      const last    = data[data.length - 1];
      const lastSec = toSec(last.time);

      // ── INCREMENTAL PATH: already fitted — update last point only, NEVER touch viewport ──
      if (fittedRef.current) {
        prog(() => lineRef.current.applyOptions({ color: lineColor }));

        if (chartType === "candles" && isKline && last.open != null) {
          prog(() => candleRef.current.update({
            time: lastSec, open: last.open!, high: last.high!, low: last.low!, close: last.price,
          }));
          if (last.volume != null) {
            prog(() => volRef.current.update({
              time:  lastSec, value: last.volume!,
              color: last.price >= (last.open ?? last.price) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
            }));
          }
        } else if (chartType !== "candles") {
          prog(() => lineRef.current.update({ time: lastSec, value: last.price }));
          if (isKline && last.volume != null) {
            prog(() => volRef.current.update({
              time:  lastSec, value: last.volume!,
              color: last.price >= (last.open ?? last.price) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
            }));
          }
        }
        return; // explicit: nothing below runs, viewport is never touched again
      }

      // ── FIRST LOAD: populate full dataset and fitContent exactly once ─────────
      fittedRef.current = true;

      if (chartType === "candles" && isKline) {
        prog(() => lineRef.current.setData([]));
        const candleData = data
          .filter(p => p.open != null && p.high != null && p.low != null)
          .map(p => ({ time: toSec(p.time), open: p.open!, high: p.high!, low: p.low!, close: p.price }));
        if (candleData.length) prog(() => candleRef.current.setData(candleData));
        const volData = data
          .filter(p => p.volume != null)
          .map(p => ({
            time:  toSec(p.time), value: p.volume!,
            color: p.price >= (p.open ?? p.price) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
          }));
        if (volData.length) prog(() => volRef.current.setData(volData));
      } else {
        prog(() => candleRef.current.setData([]));
        prog(() => lineRef.current.applyOptions({ color: lineColor }));
        const lineData = data.map(p => ({ time: toSec(p.time), value: p.price }));
        prog(() => lineRef.current.setData(lineData));
        if (isKline) {
          const volData = data
            .filter(p => p.volume != null)
            .map(p => ({
              time:  toSec(p.time), value: p.volume!,
              color: p.price >= (p.open ?? p.price) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
            }));
          if (volData.length) prog(() => volRef.current.setData(volData));
        } else {
          prog(() => volRef.current.setData([]));
        }
      }

      prog(() => chartRef.current.timeScale().fitContent());
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chartType, isKline, priceToBeat]);

  // ── Effect 3: reset scroll state on timeframe, chartType, or isKline change ──
  useEffect(() => {
    userPannedRef.current = false;
    fittedRef.current     = false;
    setShowLiveBtn(false);
  }, [timeframe, chartType, isKline]);

  const handleGoLive = () => {
    userPannedRef.current = false;
    setShowLiveBtn(false);
    prog(() => chartRef.current?.timeScale().scrollToRealTime());
  };

  // Windowed data slice for the canvas (LIVE mode only)
  const windowMs  = LIVE_WINDOW_MS[timeframe] ?? 150_000;
  const cutoff    = Date.now() - windowMs;
  const liveData  = chartType === "live"
    ? data.filter(p => p.time >= cutoff)
    : [];

  const loading = data.length < 2 && status !== "live";
  // Show building message for custom tokens (no isKline on mount) until 30s passes or history arrives
  const showBuilding = mountedWithoutKline.current && !buildingPast30s && !isKline
    && status === "live" && chartType !== "live";

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ height: H, background: CHART_BG }}>

      {/* lightweight-charts container — always mounted so chart persists across mode switches */}
      <div
        ref={containerRef}
        style={{
          width:      "100%",
          height:     "100%",
          visibility: chartType === "live" ? "hidden" : "visible",
        }}
      />

      {/* Canvas snake-line — rendered only in LIVE mode, absolutely overlaid */}
      {chartType === "live" && containerWidth > 0 && (
        <div style={{ position: "absolute", inset: 0 }}>
          <LiveLineCanvas
            data={liveData}
            priceToBeat={priceToBeat}
            width={containerWidth}
            height={H}
            showMcap={showMcap}
          />
        </div>
      )}

      {/* Back-to-live button (Line / Candles modes only) */}
      {showLiveBtn && !loading && chartType !== "live" && (
        <button
          onClick={handleGoLive}
          className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono font-semibold transition-opacity hover:opacity-80"
          style={{
            background: "rgba(34,197,94,0.15)",
            border:     "1px solid rgba(34,197,94,0.4)",
            color:      "#22c55e",
          }}
        >
          ▶ Live
        </button>
      )}

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <svg className="animate-spin w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
            {status === "connecting" ? `Connecting to ${label}…` : "Waiting for price data…"}
          </span>
        </div>
      )}

      {showBuilding && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-[11px] font-mono px-3 py-1 rounded-full"
                style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.06)" }}>
            Building chart history…
          </span>
        </div>
      )}
    </div>
  );
}

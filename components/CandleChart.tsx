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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── Canvas snake-line for LIVE mode ──────────────────────────────────────────

function LiveLineCanvas({ data, priceToBeat, timeframe, width, height }: {
  data:        OHLCPoint[];
  priceToBeat: number | null;
  timeframe:   Timeframe;
  width:       number;
  height:      number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);

  // Mutable refs read every frame — no effect restarts on data changes
  const dataRef = useRef(data);
  const ptbRef  = useRef(priceToBeat);
  dataRef.current = data;
  ptbRef.current  = priceToBeat;

  // Lerp state: displayPrice eases toward targetPrice each frame
  const targetPriceRef  = useRef(0);
  const displayPriceRef = useRef(0);
  const initializedRef  = useRef(false);

  // Sync target with latest data point on every render
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

    const draw = () => {
      const pts = dataRef.current;
      const ptb = ptbRef.current;
      ctx.clearRect(0, 0, width, height);
      if (pts.length < 2) return;

      // Build price array: historical points + lerped live price at tail
      const rawPrices    = pts.map(d => d.price);
      const displayPrice = displayPriceRef.current;
      const allPrices    = [...rawPrices.slice(0, -1), displayPrice];

      // For sparse 5s data: add 4 linear intermediate points between each pair
      // so the bezier curve has more anchors and looks denser
      let drawPrices = allPrices;
      if (timeframe === "5s" && allPrices.length > 1) {
        const dense: number[] = [];
        for (let i = 0; i < allPrices.length - 1; i++) {
          dense.push(allPrices[i]);
          for (let j = 1; j <= 4; j++) dense.push(lerp(allPrices[i], allPrices[i + 1], j / 5));
        }
        dense.push(allPrices[allPrices.length - 1]);
        drawPrices = dense;
      }

      const minP  = Math.min(...drawPrices) * 0.9999;
      const maxP  = Math.max(...drawPrices) * 1.0001;
      const range = maxP - minP || 1;

      const toY = (p: number) => height - ((p - minP) / range) * height * 0.85 - height * 0.05;
      const toX = (i: number) => (i / (drawPrices.length - 1)) * width;

      const lineColor = ptb != null
        ? (displayPrice >= ptb ? "#22c55e" : "#ef4444")
        : "#22c55e";

      // Above/below color zones
      if (ptb != null) {
        const y = toY(ptb);
        ctx.fillStyle = "rgba(34,197,94,0.04)";
        ctx.fillRect(0, 0, width, y);
        ctx.fillStyle = "rgba(239,68,68,0.04)";
        ctx.fillRect(0, y, width, height - y);
      }

      // Dashed target price reference line
      if (ptb != null) {
        const y = toY(ptb);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Bezier curve price line with glow
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.shadowColor = lineColor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      drawPrices.forEach((price, i) => {
        const x = toX(i);
        const y = toY(price);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevX = toX(i - 1);
          const prevY = toY(drawPrices[i - 1]);
          const cpX   = (prevX + x) / 2;
          ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
        }
      });
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Glowing dot at lerped live position
      const lastX = toX(drawPrices.length - 1);
      const lastY = toY(displayPrice);
      ctx.fillStyle = lineColor;
      ctx.shadowColor = lineColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Floating price label
      ctx.fillStyle = lineColor;
      ctx.font = "11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(displayPrice.toFixed(2), width - 4, lastY - 6);
    };

    const animate = () => {
      // Ease display price toward the latest WebSocket target each frame
      displayPriceRef.current = lerp(displayPriceRef.current, targetPriceRef.current, 0.15);
      draw();
      animRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animRef.current);
  // Restart only on dimension changes; data/price are read via refs at 60fps
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
}

export default function CandleChart({ data, chartType, isKline, priceToBeat, timeframe, status, label }: Props) {
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
  const mountedRef      = useRef(false);

  // Pan / auto-scroll state (for Line/Candles modes)
  const userPannedRef   = useRef(false);
  const programmaticRef = useRef(false);
  const fittedRef       = useRef(false);
  const [showLiveBtn, setShowLiveBtn] = useState(false);

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

  // ── Effect 2: push data to lightweight-charts (Line / Candles only) ─────────
  useEffect(() => {
    if (chartType === "live") return; // canvas handles LIVE mode
    if (!mountedRef.current || !lineRef.current || !candleRef.current || !volRef.current) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toSec = (ms: number) => Math.floor(ms / 1000) as any;

    try {
      // Price line — recreate only when priceToBeat changes
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

      prog(() => chartRef.current?.applyOptions({ timeScale: { secondsVisible: !isKline } }));

      if (!data.length) return;

      const first     = data[0].price;
      const lastPrice = data[data.length - 1].price;
      const lineColor = priceToBeat != null
        ? (lastPrice >= priceToBeat ? "#22c55e" : "#ef4444")
        : (lastPrice >= first       ? "#22c55e" : "#ef4444");

      if (chartType === "candles" && isKline) {
        prog(() => lineRef.current.setData([]));

        const candleData = data
          .filter(p => p.open != null && p.high != null && p.low != null)
          .map(p => ({ time: toSec(p.time), open: p.open!, high: p.high!, low: p.low!, close: p.price }));
        if (candleData.length) prog(() => candleRef.current.setData(candleData));

        const volData = data
          .filter(p => p.volume != null)
          .map(p => ({
            time:  toSec(p.time),
            value: p.volume!,
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
              time:  toSec(p.time),
              value: p.volume!,
              color: p.price >= (p.open ?? p.price) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)",
            }));
          if (volData.length) prog(() => volRef.current.setData(volData));
        } else {
          prog(() => volRef.current.setData([]));
        }
      }

      if (!fittedRef.current) {
        fittedRef.current = true;
        prog(() => chartRef.current.timeScale().fitContent());
      } else if (!userPannedRef.current) {
        prog(() => chartRef.current.timeScale().scrollToRealTime());
      }
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chartType, isKline, priceToBeat]);

  // ── Effect 3: reset scroll state on timeframe or chartType change ────────────
  useEffect(() => {
    userPannedRef.current = false;
    fittedRef.current     = false;
    setShowLiveBtn(false);
  }, [timeframe, chartType]);

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
            timeframe={timeframe}
            width={containerWidth}
            height={H}
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
    </div>
  );
}

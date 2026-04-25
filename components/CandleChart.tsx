"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart, ColorType, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries,
} from "lightweight-charts";
import { OHLCPoint, Timeframe } from "@/lib/useTokenPrice";

const CHART_BG = "#0d0f14";
const H = 350;

interface Props {
  data:        OHLCPoint[];
  chartType:   "line" | "candles";
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

  // Pan / auto-scroll state
  const userPannedRef   = useRef(false);
  const programmaticRef = useRef(false); // true while we call chart APIs ourselves
  const fittedRef       = useRef(false); // true after first fitContent per timeframe
  const [showLiveBtn, setShowLiveBtn] = useState(false);

  // Wrap every chart API call so the subscription ignores it
  const prog = (fn: () => void) => {
    programmaticRef.current = true;
    try { fn(); } catch { /**/ }
    programmaticRef.current = false;
  };

  // ── Effect 1: create chart + all series ─────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    mountedRef.current = true;

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

      // Detect user pan — ignored when we're making programmatic changes
      const onRangeChange = () => {
        if (programmaticRef.current || !mountedRef.current) return;
        userPannedRef.current = true;
        setShowLiveBtn(true);
      };
      chart.timeScale().subscribeVisibleTimeRangeChange(onRangeChange);

      const ro = new ResizeObserver(() => {
        if (!mountedRef.current || !containerRef.current || !chartRef.current) return;
        prog(() => chartRef.current.applyOptions({ width: containerRef.current!.clientWidth }));
      });
      ro.observe(containerRef.current);

      return () => {
        mountedRef.current = false;
        ro.disconnect();
        try { chart.timeScale().unsubscribeVisibleTimeRangeChange(onRangeChange); } catch { /**/ }
        lineRef.current   = null;
        candleRef.current = null;
        volRef.current    = null;
        chartRef.current  = null;
        priceLineRef.current = null;
        try { chart.remove(); } catch { /**/ }
      };
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 2: push data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mountedRef.current || !lineRef.current || !candleRef.current || !volRef.current) return;

    const showCandles = chartType === "candles";

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

      const first = data[0].price;
      const last  = data[data.length - 1].price;
      const color = priceToBeat != null
        ? (last >= priceToBeat ? "#22c55e" : "#ef4444")
        : (last >= first       ? "#22c55e" : "#ef4444");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toSec = (ms: number) => Math.floor(ms / 1000) as any;

      if (showCandles && isKline) {
        prog(() => lineRef.current.setData([]));

        const candleData = data
          .filter(p => p.open != null && p.high != null && p.low != null)
          .map(p => ({ time: toSec(p.time), open: p.open!, high: p.high!, low: p.low!, close: p.price }));
        if (candleData.length) prog(() => candleRef.current.setData(candleData));

        const volData = data
          .filter(p => p.volume != null)
          .map(p => ({ time: toSec(p.time), value: p.volume!, color: p.price >= (p.open ?? p.price) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)" }));
        if (volData.length) prog(() => volRef.current.setData(volData));
      } else {
        prog(() => candleRef.current.setData([]));
        prog(() => lineRef.current.applyOptions({ color }));
        const lineData = data.map(p => ({ time: toSec(p.time), value: p.price }));
        prog(() => lineRef.current.setData(lineData));

        if (isKline) {
          const volData = data
            .filter(p => p.volume != null)
            .map(p => ({ time: toSec(p.time), value: p.volume!, color: p.price >= (p.open ?? p.price) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)" }));
          if (volData.length) prog(() => volRef.current.setData(volData));
        } else {
          prog(() => volRef.current.setData([]));
        }
      }

      // ── Scroll control ────────────────────────────────────────────────────────
      if (!chartRef.current) return;

      if (!fittedRef.current) {
        // First data load for this timeframe: fit all history into view
        fittedRef.current = true;
        prog(() => chartRef.current.timeScale().fitContent());
      } else if (!userPannedRef.current) {
        // User is at live edge — keep tracking the newest candle
        prog(() => chartRef.current.timeScale().scrollToRealTime());
      }
      // If userPannedRef is true: do nothing — user is browsing history
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chartType, isKline, priceToBeat]);

  // ── Effect 3: reset pan state on timeframe change ────────────────────────────
  useEffect(() => {
    userPannedRef.current = false;
    fittedRef.current     = false;
    setShowLiveBtn(false);
  }, [timeframe]);

  // "▶ Live" button — jump back to newest data
  const handleGoLive = () => {
    userPannedRef.current = false;
    setShowLiveBtn(false);
    prog(() => chartRef.current?.timeScale().scrollToRealTime());
  };

  const loading = data.length < 2 && status !== "live";

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ height: H, background: CHART_BG }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Back-to-live button */}
      {showLiveBtn && !loading && (
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

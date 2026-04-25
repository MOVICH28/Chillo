"use client";

import { useEffect, useRef } from "react";
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

export default function CandleChart({ data, chartType, isKline, priceToBeat, status, label }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRef   = useRef<any>(null);   // LineSeries — always present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleRef = useRef<any>(null);   // CandlestickSeries — always present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volRef    = useRef<any>(null);   // HistogramSeries — always present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef       = useRef<any>(null);
  const prevPriceToBeat    = useRef<number | null | undefined>(undefined);
  const mountedRef         = useRef(false);

  // ── Effect 1: create chart + all series once ────────────────────────────────
  // All three series are created upfront. Data effect switches between them by
  // calling setData([]) on the inactive one — no remove/re-add, no flicker.
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

      // Volume histogram on its own price scale
      volRef.current = chart.addSeries(HistogramSeries, {
        color:        "rgba(255,255,255,0.07)",
        priceFormat:  { type: "volume" },
        priceScaleId: "vol",
      });
      try { chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } }); } catch { /**/ }

      // Line series (active in line mode)
      lineRef.current = chart.addSeries(LineSeries, {
        color:                  "#22c55e",
        lineWidth:              2,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius:  4,
        priceLineVisible:       false,
        priceScaleId:           "right",
        lastValueVisible:       true,
      });

      // Candlestick series (active in candles mode)
      candleRef.current = chart.addSeries(CandlestickSeries, {
        upColor:         "#22c55e",
        downColor:       "#ef4444",
        borderUpColor:   "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor:     "rgba(34,197,94,0.65)",
        wickDownColor:   "rgba(239,68,68,0.65)",
        priceScaleId:    "right",
      });

      const ro = new ResizeObserver(() => {
        if (!mountedRef.current || !containerRef.current || !chartRef.current) return;
        try { chartRef.current.applyOptions({ width: containerRef.current.clientWidth }); } catch { /**/ }
      });
      ro.observe(containerRef.current);

      return () => {
        mountedRef.current = false;
        ro.disconnect();
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

  // ── Effect 2: push data + sync visibility + manage price line ───────────────
  // Runs whenever data, chartType, isKline, or priceToBeat changes.
  // Never removes/re-adds series — just calls setData() on the active one.
  useEffect(() => {
    if (!mountedRef.current || !lineRef.current || !candleRef.current || !volRef.current) return;

    const effectiveType = isKline ? chartType : "line";
    const showCandles   = effectiveType === "candles";

    try {
      // ── Price line: recreate only when priceToBeat changes ─────────────────
      if (prevPriceToBeat.current !== priceToBeat) {
        prevPriceToBeat.current = priceToBeat;
        // Always attach to lineRef so it stays visible regardless of chart mode
        if (priceLineRef.current) {
          try { lineRef.current.removePriceLine(priceLineRef.current); } catch { /**/ }
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

      // ── secondsVisible ──────────────────────────────────────────────────────
      try { chartRef.current?.applyOptions({ timeScale: { secondsVisible: !isKline } }); } catch { /**/ }

      if (!data.length) return;

      const first = data[0].price;
      const last  = data[data.length - 1].price;
      const color = priceToBeat != null
        ? (last >= priceToBeat ? "#22c55e" : "#ef4444")
        : (last >= first       ? "#22c55e" : "#ef4444");

      // ── Candles mode ────────────────────────────────────────────────────────
      if (showCandles && isKline) {
        // Clear line series so its price scale doesn't interfere
        try { lineRef.current.setData([]); } catch { /**/ }

        const candleData = data
          .filter(p => p.open != null && p.high != null && p.low != null)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map(p => ({ time: Math.floor(p.time / 1000) as any, open: p.open!, high: p.high!, low: p.low!, close: p.price }));
        if (candleData.length) try { candleRef.current.setData(candleData); } catch { /**/ }

        const volData = data
          .filter(p => p.volume != null)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map(p => ({ time: Math.floor(p.time / 1000) as any, value: p.volume!, color: (p.price >= (p.open ?? p.price)) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)" }));
        if (volData.length) try { volRef.current.setData(volData); } catch { /**/ }

        if (chartRef.current) try { chartRef.current.timeScale().fitContent(); } catch { /**/ }
      }

      // ── Line mode ───────────────────────────────────────────────────────────
      else {
        // Clear candle series so its price scale doesn't interfere
        try { candleRef.current.setData([]); } catch { /**/ }

        try { lineRef.current.applyOptions({ color }); } catch { /**/ }
        const lineData = data.map(p => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          time:  Math.floor(p.time / 1000) as any,
          value: p.price,
        }));
        try { lineRef.current.setData(lineData); } catch { /**/ }

        // Volume only meaningful for kline data
        if (isKline) {
          const volData = data
            .filter(p => p.volume != null)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map(p => ({ time: Math.floor(p.time / 1000) as any, value: p.volume!, color: (p.price >= (p.open ?? p.price)) ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)" }));
          if (volData.length) try { volRef.current.setData(volData); } catch { /**/ }
          if (chartRef.current) try { chartRef.current.timeScale().fitContent(); } catch { /**/ }
        } else {
          try { volRef.current.setData([]); } catch { /**/ }
        }
      }
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, chartType, isKline, priceToBeat]);

  const loading = data.length < 2 && status !== "live";

  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ height: H, background: CHART_BG }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

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

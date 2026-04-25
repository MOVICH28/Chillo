"use client";

import { useEffect, useRef } from "react";
import {
  createChart, ColorType, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries,
} from "lightweight-charts";
import { OHLCPoint, Timeframe } from "@/lib/useTokenPrice";

const CHART_BG = "#0d0f14";

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
  const containerRef  = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef      = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef     = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volSeriesRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priceLineRef  = useRef<any>(null);

  const effectiveType = isKline ? chartType : "line";

  // ── Mount chart once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: 350,
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
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale:  { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
      volSeriesRef.current = null;
      priceLineRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recreate series when type or isKline changes ────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (seriesRef.current)    { try { chart.removeSeries(seriesRef.current);   } catch { /* */ } seriesRef.current   = null; }
    if (volSeriesRef.current) { try { chart.removeSeries(volSeriesRef.current); } catch { /* */ } volSeriesRef.current = null; }
    priceLineRef.current = null;

    // Volume histogram (kline only)
    if (isKline) {
      volSeriesRef.current = chart.addSeries(HistogramSeries, {
        color:      "rgba(255,255,255,0.07)",
        priceFormat:  { type: "volume" },
        priceScaleId: "vol",
      });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    }

    if (effectiveType === "candles") {
      seriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor:        "#22c55e",
        downColor:      "#ef4444",
        borderUpColor:  "#22c55e",
        borderDownColor:"#ef4444",
        wickUpColor:    "rgba(34,197,94,0.65)",
        wickDownColor:  "rgba(239,68,68,0.65)",
        priceScaleId:   "right",
      });
    } else {
      seriesRef.current = chart.addSeries(LineSeries, {
        color:                  "#22c55e",
        lineWidth:              1.5,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius:  4,
        priceLineVisible:       false,
        priceScaleId:           "right",
        lastValueVisible:       true,
      });
    }

    // Price-to-beat dashed line
    if (priceToBeat != null && seriesRef.current) {
      priceLineRef.current = seriesRef.current.createPriceLine({
        price:             priceToBeat,
        color:             "rgba(255,255,255,0.2)",
        lineStyle:         LineStyle.Dashed,
        lineWidth:         1,
        axisLabelVisible:  true,
        title:             "Target",
        axisLabelColor:    "rgba(255,255,255,0.2)",
        axisLabelTextColor:"rgba(255,255,255,0.5)",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveType, isKline, priceToBeat]);

  // ── Push data to series ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    const first = data[0].price;
    const last  = data[data.length - 1].price;
    const color = priceToBeat != null
      ? (last >= priceToBeat ? "#22c55e" : "#ef4444")
      : (last >= first       ? "#22c55e" : "#ef4444");

    if (effectiveType === "candles" && isKline) {
      const candleData = data
        .filter(p => p.open != null && p.high != null && p.low != null)
        .map(p => ({
          time:  Math.floor(p.time / 1000) as number & { _brand: "UTCTimestamp" },
          open:  p.open!,
          high:  p.high!,
          low:   p.low!,
          close: p.price,
        }));
      if (candleData.length) seriesRef.current.setData(candleData);

      if (volSeriesRef.current) {
        const volData = data
          .filter(p => p.volume != null)
          .map(p => ({
            time:  Math.floor(p.time / 1000) as number & { _brand: "UTCTimestamp" },
            value: p.volume!,
            color: (p.price >= (p.open ?? p.price))
              ? "rgba(34,197,94,0.25)"
              : "rgba(239,68,68,0.25)",
          }));
        if (volData.length) volSeriesRef.current.setData(volData);
      }
    } else {
      seriesRef.current.applyOptions({ color });
      const lineData = data.map(p => ({
        time:  Math.floor(p.time / 1000) as number & { _brand: "UTCTimestamp" },
        value: p.price,
      }));
      seriesRef.current.setData(lineData);
    }

    if (isKline) chartRef.current?.timeScale().fitContent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, effectiveType, isKline, priceToBeat]);

  // ── Update secondsVisible when switching kline / stream ────────────────────
  useEffect(() => {
    chartRef.current?.applyOptions({ timeScale: { secondsVisible: !isKline } });
  }, [isKline]);

  if (data.length < 2 && status !== "live") {
    return (
      <div className="w-full flex flex-col items-center justify-center gap-3 rounded-xl"
           style={{ height: 350, background: CHART_BG }}>
        <svg className="animate-spin w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
          {status === "connecting" ? `Connecting to ${label}…` : "Waiting for price data…"}
        </span>
      </div>
    );
  }

  return (
    <div ref={containerRef}
         className="w-full rounded-xl overflow-hidden"
         style={{ height: 350, background: CHART_BG }} />
  );
}

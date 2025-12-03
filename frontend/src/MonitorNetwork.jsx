import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import WifiHealthMeter from "./WifiHealthMeter";
import ScoreTrendChart from "./ScoreTrendChart";
import PerfTrendChart from "./PerfTrendChart";
import OutageCharts from "./OutageCharts";

const API = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8787";

const TIME_WINDOWS = [
  { value: 15 * 60 * 1000, label: "15m" },
  { value: 60 * 60 * 1000, label: "1h" },
  { value: 6 * 60 * 60 * 1000, label: "6h" },
  { value: 24 * 60 * 60 * 1000, label: "24h" },
  { value: 3 * 24 * 60 * 60 * 1000, label: "3d" },
  { value: 0, label: "All" },
];

// ✅ shared parser: supports numbers + ISO strings, no-TZ = local
function parseToLocalMs(ts) {
  if (ts == null) return null;
  if (typeof ts === "number") return ts < 1e12 ? ts * 1000 : ts;

  if (typeof ts === "string") {
    const s = ts.trim();
    const hasTZ = /[zZ]|[+-]\d\d:\d\d$/.test(s);
    if (hasTZ) {
      const p = Date.parse(s);
      return isNaN(p) ? null : p;
    }
    const localIso = s.includes("T") ? s : s.replace(" ", "T");
    const d = new Date(localIso);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

export default function MonitorNetwork() {
  const [series, setSeries] = useState({
    score_series: [],
    perf_series: [],
    outage_events: [],
  });
  const [report, setReport] = useState(null);

  const [monitorPollMs, setMonitorPollMs] = useState(60000);
  const [autoSpeedtestMs, setAutoSpeedtestMs] = useState(0);

  const [loadingSpeedtest, setLoadingSpeedtest] = useState(false);
  const [lastRefreshTs, setLastRefreshTs] = useState(null);

  const [speedTestMode, setSpeedTestMode] = useState("manual");
  const [lastSpeedTestTs, setLastSpeedTestTs] = useState(null);

  const [scoreWindowMs, setScoreWindowMs] = useState(60 * 60 * 1000);
  const [perfWindowMs, setPerfWindowMs] = useState(60 * 60 * 1000);
  const [outageWindowMs, setOutageWindowMs] = useState(60 * 60 * 1000);

  const pollRef = useRef(null);
  const speedRef = useRef(null);

  const fetchSeries = useCallback(async () => {
    const r = await fetch(`${API}/history-series`);
    const j = await r.json();
    setSeries(j ?? { score_series: [], perf_series: [], outage_events: [] });
  }, []);

  const fetchLatest = useCallback(async () => {
    const r = await fetch(`${API}/latest-report`);
    const j = await r.json();
    setReport(j ?? null);
  }, []);

  const monitorTick = useCallback(async () => {
    await fetch(`${API}/monitor-tick`, { method: "POST" });
    await fetchSeries();
    await fetchLatest();
    setLastRefreshTs(Date.now());
  }, [fetchSeries, fetchLatest]);

  const speedtestNow = useCallback(async () => {
    setLoadingSpeedtest(true);
    try {
      await fetch(`${API}/refresh-now`, { method: "POST" });
      await fetchSeries();
      await fetchLatest();
      const t = Date.now();
      setLastRefreshTs(t);
      setLastSpeedTestTs(t);
    } finally {
      setLoadingSpeedtest(false);
    }
  }, [fetchSeries, fetchLatest]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(monitorTick, monitorPollMs);
    return () => clearInterval(pollRef.current);
  }, [monitorTick, monitorPollMs]);

  useEffect(() => {
    if (speedRef.current) clearInterval(speedRef.current);
    if (!autoSpeedtestMs) return;
    speedRef.current = setInterval(speedtestNow, autoSpeedtestMs);
    return () => clearInterval(speedRef.current);
  }, [speedtestNow, autoSpeedtestMs]);

  useEffect(() => {
    setSpeedTestMode(autoSpeedtestMs ? "auto" : "manual");
  }, [autoSpeedtestMs]);

  useEffect(() => {
    fetchSeries();
    fetchLatest();
  }, [fetchSeries, fetchLatest]);

  const autoSpeedIntervalMin = autoSpeedtestMs
    ? Math.round(autoSpeedtestMs / 60000)
    : 60;

  const reportForMeter = useMemo(() => {
    if (!report || typeof report !== "object") return report;
    const {
      performance,
      perf,
      speeds,
      speedtest,
      speed_test,
      speedTest,
      ...rest
    } = report;
    return rest;
  }, [report]);

  const now = Date.now();

  const getTs = (item) => {
    if (!item || typeof item !== "object") return null;
    const raw =
      item.ts ??
      item.timestamp ??
      item.time ??
      item.t ??
      item.at ??
      item.date ??
      null;
    return parseToLocalMs(raw);
  };

  const filterByWindow = (arr, windowMs) => {
    if (!Array.isArray(arr)) return [];
    if (!windowMs) return arr;
    const cutoff = now - windowMs;
    return arr.filter((it) => {
      const ts = getTs(it);
      return ts == null ? true : ts >= cutoff;
    });
  };

  const scoreSeries = useMemo(
    () => filterByWindow(series.score_series, scoreWindowMs),
    [series.score_series, scoreWindowMs, now]
  );
  const perfSeries = useMemo(
    () => filterByWindow(series.perf_series, perfWindowMs),
    [series.perf_series, perfWindowMs, now]
  );
  const outageEvents = useMemo(
    () => filterByWindow(series.outage_events, outageWindowMs),
    [series.outage_events, outageWindowMs, now]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Wi-Fi cell untouched */}
        <div className="relative">
          <WifiHealthMeter
            report={reportForMeter}
            lastRefreshTs={lastRefreshTs}
            variant="compact"
            speedTestMode={speedTestMode}
            lastSpeedTestTs={lastSpeedTestTs}
            autoSpeedIntervalMin={autoSpeedIntervalMin}
            hidePerfTiles
            passiveIntervalMs={monitorPollMs}
          />

          <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-full bg-white/95 border border-emerald-200 px-2.5 py-1 shadow-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
            </span>
            <span className="text-[10px] font-extrabold tracking-wide text-emerald-700 uppercase">
              Live
            </span>
          </div>
        </div>

        {/* Speed test cell (same as before spec) */}
        <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm flex flex-col">
          <div className="text-sm font-semibold text-slate-900">Speed test</div>

          <div className="mt-3 grid grid-cols-3 gap-3">
            <SpeedTile label="Download" value={report?.performance?.download_mbps} unit="Mbps" />
            <SpeedTile label="Upload" value={report?.performance?.upload_mbps} unit="Mbps" />
            <SpeedTile label="Ping" value={report?.performance?.ping_ms} unit="ms" />
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              speedtestNow();
            }}
            disabled={loadingSpeedtest}
            className={`mt-4 w-full px-4 py-2 rounded-xl font-semibold border transition
              ${
                loadingSpeedtest
                  ? "bg-slate-100 text-slate-400 border-slate-150 cursor-not-allowed"
                  : "bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
              }`}
          >
            {loadingSpeedtest ? "Running speed test..." : "Run speed test now"}
          </button>

          {lastRefreshTs && (
            <div className="mt-1 text-[11px] text-slate-400 text-center">
              Last updated {new Date(lastRefreshTs).toLocaleString()}
            </div>
          )}

          {lastSpeedTestTs && (
            <div className="mt-2 text-[11px] text-slate-400 text-center">
              Speed test last run {new Date(lastSpeedTestTs).toLocaleTimeString()}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-900 font-semibold">Monitor update rate</div>
                <div className="text-[11px] text-slate-500">Passive polling</div>
              </div>
              <select
                className="border rounded-lg px-2 py-1 text-sm"
                value={monitorPollMs}
                onChange={(e) => setMonitorPollMs(Number(e.target.value))}
              >
                <option value={15000}>15s</option>
                <option value={30000}>30s</option>
                <option value={60000}>60s</option>
                <option value={120000}>2m</option>
                <option value={300000}>5m</option>
              </select>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-900 font-semibold">Auto speedtest</div>
                <div className="text-[11px] text-slate-500">Runs full refresh + speed test</div>
              </div>
              <select
                className="border rounded-lg px-2 py-1 text-sm"
                value={autoSpeedtestMs}
                onChange={(e) => setAutoSpeedtestMs(Number(e.target.value))}
              >
                <option value={0}>Off</option>
                <option value={300000}>5m</option>
                <option value={900000}>15m</option>
                <option value={1800000}>30m</option>
                <option value={3600000}>1h</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Perf graph first */}
      <div className="relative">
        <PerfTrendChart key={perfWindowMs} series={perfSeries} />
        <GraphRangeSelect value={perfWindowMs} onChange={setPerfWindowMs} />
      </div>

      <div className="relative">
        <ScoreTrendChart key={scoreWindowMs} series={scoreSeries} />
        <GraphRangeSelect value={scoreWindowMs} onChange={setScoreWindowMs} />
      </div>

      <div className="relative">
        <OutageCharts key={outageWindowMs} events={outageEvents} />
        <GraphRangeSelect value={outageWindowMs} onChange={setOutageWindowMs} />
      </div>
    </div>
  );
}

function GraphRangeSelect({ value, onChange }) {
  return (
    <div className="absolute top-2 right-2 z-10">
      <select
        className="border border-slate-200 bg-white/95 rounded-md px-1.5 py-0.5 text-[11px] text-slate-700 shadow-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {TIME_WINDOWS.map((w) => (
          <option key={w.value} value={w.value}>
            {w.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SpeedTile({ label, value, unit }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 min-w-0">
      <div className="text-[10px] sm:text-[11px] text-slate-500 uppercase tracking-wide truncate">
        {label}
      </div>
      <div className="mt-1 text-base sm:text-lg font-semibold text-slate-900 leading-tight truncate">
        {value ?? "—"}{" "}
        <span className="text-[10px] sm:text-xs font-normal text-slate-500">
          {unit}
        </span>
      </div>
    </div>
  );
}

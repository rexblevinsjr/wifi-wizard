import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

// ✅ no TZ string = LOCAL naive time (fixes "hours ahead")
function parseToLocalMs(ts) {
  if (ts == null) return null;

  if (typeof ts === "number") {
    return ts < 1e12 ? ts * 1000 : ts;
  }

  if (typeof ts === "string") {
    const s = ts.trim();
    const hasTZ = /[zZ]|[+-]\d\d:\d\d$/.test(s);

    if (hasTZ) {
      const p = Date.parse(s);
      return isNaN(p) ? null : p;
    }

    // ✅ treat as local-naive
    const localIso = s.includes("T") ? s : s.replace(" ", "T");
    const d = new Date(localIso);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  return null;
}

function normalize(raw = []) {
  const out = [];
  raw.forEach((p, i) => {
    const ms =
      parseToLocalMs(p.ts ?? p.t ?? p.timestamp ?? p.time ?? p.date) ?? i;

    out.push({
      ts: ms,
      download: Number(p.download_mbps ?? p.download ?? p.down ?? p.dl ?? null),
      upload: Number(p.upload_mbps ?? p.upload ?? p.up ?? p.ul ?? null),
      ping: Number(p.ping_ms ?? p.ping ?? p.latency ?? null),
    });
  });

  return out.sort((a, b) => a.ts - b.ts);
}

const fmtTime = (ms) => new Date(ms).toLocaleTimeString();

export default function PerfTrendChart({ series = [] }) {
  const data = useMemo(() => normalize(series), [series]);

  if (!data.length) {
    return (
      <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="text-sm font-semibold text-slate-900 mb-2">
          Performance Over Time
        </div>
        <div className="text-sm text-slate-500">
          No performance history yet.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
      <div className="text-sm font-semibold text-slate-900 mb-3">
        Performance Over Time
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="ts" tickFormatter={fmtTime} minTickGap={28} />
            <YAxis yAxisId="speed" domain={[0, "auto"]} />
            <YAxis yAxisId="ping" orientation="right" domain={[0, "auto"]} />
            <Tooltip labelFormatter={(v) => fmtTime(v)} />
            <Legend />

            <Line
              yAxisId="speed"
              type="monotone"
              dataKey="download"
              name="Download (Mbps)"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              yAxisId="speed"
              type="monotone"
              dataKey="upload"
              name="Upload (Mbps)"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              yAxisId="ping"
              type="monotone"
              dataKey="ping"
              name="Ping (ms)"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

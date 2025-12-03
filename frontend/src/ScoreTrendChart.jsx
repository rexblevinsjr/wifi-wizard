import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// Parse timestamps into *local* ms.
// - numbers: seconds or ms
// - strings with TZ (Z / +/-hh:mm): trust TZ
// - strings without TZ: treat as local-naive time
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

    // --- robust score extraction ---
    let rawScore =
      p.wifi_health_score ??
      p.health_score ??
      p.value ??
      p.score ??
      null;

    // if score is nested object, unwrap common shapes
    if (rawScore && typeof rawScore === "object") {
      rawScore =
        rawScore.wifi_health_score ??
        rawScore.health_score ??
        rawScore.score ??
        rawScore.value ??
        null;
    }

    const scoreNum = Number(rawScore);
    if (!Number.isFinite(scoreNum)) return;

    out.push({ ts: ms, score: scoreNum });
  });

  return out.sort((a, b) => a.ts - b.ts);
}

const fmtTime = (ms) => new Date(ms).toLocaleTimeString();

export default function ScoreTrendChart({ series = [] }) {
  const data = useMemo(() => normalize(series), [series]);

  if (!data.length) {
    return (
      <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="text-sm font-semibold text-slate-900 mb-2">
          Wi-Fi Health Over Time
        </div>
        <div className="text-sm text-slate-500">No score history yet.</div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
      <div className="text-sm font-semibold text-slate-900 mb-3">
        Wi-Fi Health Over Time
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="ts" tickFormatter={fmtTime} minTickGap={28} />
            <YAxis domain={[0, 100]} />
            <Tooltip labelFormatter={(v) => fmtTime(v)} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#0f172a"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

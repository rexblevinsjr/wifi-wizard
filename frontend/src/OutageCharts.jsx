import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// Parse timestamps into local Date.
// - numbers: seconds or ms
// - strings with TZ: trust TZ
// - strings without TZ: treat as local-naive
function parseToLocalDate(ts) {
  if (ts == null) return new Date(NaN);

  if (typeof ts === "number") {
    const ms = ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms);
  }

  if (typeof ts === "string") {
    const s = ts.trim();
    const hasTZ = /[zZ]|[+-]\d\d:\d\d$/.test(s);

    if (hasTZ) {
      const p = Date.parse(s);
      return isNaN(p) ? new Date(NaN) : new Date(p);
    }

    const localIso = s.includes("T") ? s : s.replace(" ", "T");
    const d = new Date(localIso);
    return isNaN(d.getTime()) ? new Date(NaN) : d;
  }

  return new Date(NaN);
}

function normalizeDaily(daily = []) {
  return (daily || [])
    .map((d) => {
      const date = parseToLocalDate(d.date ?? d.ts ?? d.t);
      return {
        dateLabel: isNaN(date.getTime())
          ? String(d.date ?? d.ts ?? d.t ?? "")
          : date.toLocaleDateString(),
        count: Number(d.count ?? d.outages ?? d.value ?? 0),
      };
    })
    .filter((x) => Number.isFinite(x.count));
}

export default function OutageCharts({ daily = [], events = [] }) {
  const data = normalizeDaily(daily);

  return (
    <div className="p-6 rounded-2xl bg-white border border-slate-100 shadow-sm">
      <div className="text-sm font-semibold text-slate-900 mb-3">
        Outages Over Time
      </div>

      {data.length ? (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dateLabel" minTickGap={24} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0f172a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="text-sm text-slate-500">No outages yet.</div>
      )}

      {/* Event list */}
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
          Recent outage events
        </div>

        {!events?.length ? (
          <div className="text-sm text-slate-500">None recorded.</div>
        ) : (
          <div className="space-y-2">
            {events.map((e, idx) => {
              const start = parseToLocalDate(
                e.ts_start ?? e.start_ts ?? e.start ?? e.ts
              ).toLocaleString();
              const end = parseToLocalDate(
                e.ts_end ?? e.end_ts ?? e.end ?? e.ts
              ).toLocaleString();

              return (
                <div
                  key={e.id ?? idx}
                  className="p-3 rounded-xl border border-slate-100 bg-slate-50"
                >
                  <div className="text-sm font-medium text-slate-900">
                    {start} → {end}
                  </div>
                  {e.reason && (
                    <div className="text-slate-600 text-xs mt-1">
                      {e.reason}
                    </div>
                  )}
                  {e.ssid_at_time && (
                    <div className="text-slate-500 text-xs">
                      SSID: {e.ssid_at_time}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

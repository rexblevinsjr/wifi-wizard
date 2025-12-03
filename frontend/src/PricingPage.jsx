import React from "react";
import { Link } from "react-router-dom";

export default function PricingPage() {
  return (
    <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-100 shadow-sm space-y-4">
      <h1 className="text-2xl font-extrabold text-slate-900">Pricing</h1>
      <p className="text-slate-700">
        Free network health checks forever. Monitor + Troubleshoot will be part of PRO.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50">
          <div className="text-lg font-bold text-slate-900">Free</div>
          <div className="text-3xl font-extrabold mt-1">$0</div>
          <ul className="mt-3 text-sm text-slate-700 space-y-1">
            <li>• Instant Network Health Test</li>
            <li>• Speed / Ping snapshot</li>
            <li>• Wi-Fi Health Score</li>
            <li>• Basic recommendations</li>
          </ul>
          <Link
            to="/"
            className="mt-4 inline-block px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold hover:bg-slate-100 transition"
          >
            Run free test
          </Link>
        </div>

        <div className="p-5 rounded-2xl border border-slate-900 bg-white shadow-sm">
          <div className="text-lg font-bold text-slate-900">Monitor PRO</div>
          <div className="text-3xl font-extrabold mt-1">$10/mo</div>
          <div className="text-xs text-slate-500">Early access pricing</div>
          <ul className="mt-3 text-sm text-slate-700 space-y-1">
            <li>• Monitor dashboard</li>
            <li>• Performance over time</li>
            <li>• Auto speedtests</li>
            <li>• AI troubleshooting</li>
            <li>• Requires Wi-Fi Probe</li>
          </ul>
          <Link
            to="/upgrade"
            className="mt-4 inline-block px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition"
          >
            See PRO details
          </Link>
        </div>
      </div>
    </div>
  );
}

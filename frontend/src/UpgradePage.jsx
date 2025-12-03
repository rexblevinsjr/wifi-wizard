import React from "react";
import { Link } from "react-router-dom";

export default function UpgradePage() {
  return (
    <div className="max-w-3xl mx-auto p-6 sm:p-8 rounded-3xl bg-white border border-slate-100 shadow-sm">
      <div className="text-sm space-y-4">
        <h1 className="text-2xl font-extrabold text-slate-900">
          Unlock Monitor + Troubleshoot
        </h1>

        <p className="text-slate-700">
          Upgrade to Pro and get access to live monitoring, deeper performance
          analytics, and a virtual network technician that helps diagnose and
          resolve issues fast.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="font-semibold text-slate-900">PRO Monthly</div>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">
              $9.99
            </div>
            <div className="text-xs text-slate-600 mt-1">Cancel anytime</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="font-semibold text-slate-900">PRO Yearly</div>
            <div className="text-3xl font-extrabold text-slate-900 mt-1">
              $99
            </div>
            <div className="text-xs text-slate-600 mt-1">2 months free</div>
          </div>
        </div>

        <button className="w-full mt-2 px-4 py-3 rounded-2xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition">
          Start PRO (coming soon)
        </button>

        <Link
          to="/"
          className="inline-block text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          Back to free test
        </Link>
      </div>
    </div>
  );
}

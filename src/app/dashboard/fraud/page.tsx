"use client";

import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import type { FraudEvent, UpsertFraudRuleRequest } from "@/lib/types";
import {
  ShieldAlert,
  Save,
  Loader2,
  AlertTriangle,
  ShieldOff,
} from "lucide-react";

const ruleTypes = [
  { value: "velocity", label: "Velocity Check", desc: "Max transactions per time window" },
  { value: "amount_limit", label: "Amount Limit", desc: "Block transactions above threshold" },
  { value: "duplicate", label: "Duplicate Detection", desc: "Detect duplicate payment attempts" },
  { value: "geo_block", label: "Geo Blocking", desc: "Block transactions from specific regions" },
];

export default function FraudPage() {
  const [events, setEvents] = useState<FraudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ruleForm, setRuleForm] = useState<UpsertFraudRuleRequest>({
    rule_type: "velocity",
    threshold: 10,
    action: "flag",
    enabled: true,
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await dashboard.listFraudEvents({ limit: 50 });
        setEvents(Array.isArray(data) ? data : []);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      await dashboard.upsertFraudRule(ruleForm);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      alert("Failed to save fraud rule");
    } finally {
      setSaving(false);
    }
  };

  const actionColors: Record<string, string> = {
    flag: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    block: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fraud Protection</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Configure fraud rules and monitor suspicious activity
        </p>
      </div>

      {/* Rule Editor */}
      <div className="rounded-xl border bg-[hsl(var(--card))] p-6">
        <h3 className="mb-4 text-sm font-medium">Configure Fraud Rule</h3>
        <form onSubmit={handleSaveRule} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rule Type</label>
              <select
                value={ruleForm.rule_type}
                onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })}
                className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              >
                {ruleTypes.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                {ruleTypes.find((rt) => rt.value === ruleForm.rule_type)?.desc}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Threshold</label>
              <input
                type="number"
                value={ruleForm.threshold}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, threshold: parseInt(e.target.value) || 0 })
                }
                min="1"
                className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Action</label>
              <select
                value={ruleForm.action}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, action: e.target.value as "flag" | "block" })
                }
                className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              >
                <option value="flag">Flag for Review</option>
                <option value="block">Block Transaction</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-3">
                <div
                  onClick={() => setRuleForm({ ...ruleForm, enabled: !ruleForm.enabled })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    ruleForm.enabled ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      ruleForm.enabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </div>
                <span className="text-sm font-medium">
                  {ruleForm.enabled ? "Enabled" : "Disabled"}
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} />}
              Save Rule
            </button>
            {saveSuccess && (
              <span className="text-sm text-emerald-600">Rule saved successfully!</span>
            )}
          </div>
        </form>
      </div>

      {/* Fraud Events Log */}
      <div className="rounded-xl border bg-[hsl(var(--card))]">
        <div className="border-b px-6 py-4">
          <h3 className="text-sm font-medium">Fraud Events</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[hsl(var(--muted-foreground))]">
              <ShieldAlert size={36} className="mb-3 opacity-30" />
              <p className="text-sm">No fraud events detected</p>
              <p className="text-xs">Events will appear here when fraud rules are triggered</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  <th className="px-6 py-3">Transaction</th>
                  <th className="px-6 py-3">Rule</th>
                  <th className="px-6 py-3">Risk Score</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b last:border-0">
                    <td className="px-6 py-3 text-sm font-mono">
                      {event.transaction_id.slice(0, 12)}...
                    </td>
                    <td className="px-6 py-3 text-sm capitalize">
                      {event.rule_type.replace("_", " ")}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                          <div
                            className={`h-full rounded-full ${
                              event.risk_score > 80
                                ? "bg-red-500"
                                : event.risk_score > 50
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(event.risk_score, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{event.risk_score}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${actionColors[event.action_taken] || actionColors.flag}`}
                      >
                        {event.action_taken === "block" ? (
                          <ShieldOff size={12} />
                        ) : (
                          <AlertTriangle size={12} />
                        )}
                        {event.action_taken}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                      {formatDate(event.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

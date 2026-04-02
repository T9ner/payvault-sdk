import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import type { FraudEvent, UpsertFraudRuleRequest } from "@/lib/types";
import {
  ShieldAlert,
  Loader2,
  AlertTriangle,
  ShieldOff,
} from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

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
  
  const { toast } = useToast();

  const [ruleForm, setRuleForm] = useState<UpsertFraudRuleRequest>({
    rule_type: "velocity",
    threshold: 10,
    action: "flag",
    enabled: true,
  });

  useEffect(() => {
    async function load() {
      try {
        const data = await dashboard.listFraudEvents({ limit: 50 });
        setEvents(Array.isArray(data) ? data : []);
      } catch (err: any) {
        setEvents([]);
        toast.error(err.message || "Failed to load fraud events.");
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await dashboard.upsertFraudRule(ruleForm);
      toast.success("Fraud rule updated successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update fraud rule.");
    } finally {
      setSaving(false);
    }
  };

  const actionColors: Record<string, string> = {
    flag: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-amber-200 dark:border-amber-900",
    block: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400 border-red-200 dark:border-red-900",
  };

  const columns: ColumnDef<FraudEvent>[] = [
    {
      header: "Transaction",
      accessorKey: (row) => <span className="font-mono text-xs">{row.transaction_id.slice(0, 16)}...</span>,
    },
    {
      header: "Rule",
      accessorKey: (row) => <span className="capitalize">{row.rule_type.replace(/_/g, " ")}</span>,
    },
    {
      header: "Risk Score",
      accessorKey: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-24 overflow-hidden rounded-full bg-[hsl(var(--muted))] border shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ease-out ${
                row.risk_score > 80
                  ? "bg-red-500"
                  : row.risk_score > 50
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(row.risk_score, 100)}%` }}
            />
          </div>
          <span className="text-xs font-semibold w-6">{row.risk_score}</span>
        </div>
      ),
    },
    {
      header: "Action",
      accessorKey: (row) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${actionColors[row.action_taken] || actionColors.flag}`}
        >
          {row.action_taken === "block" ? (
            <ShieldOff size={12} />
          ) : (
            <AlertTriangle size={12} />
          )}
          {row.action_taken.toUpperCase()}
        </span>
      ),
    },
    {
      header: "Date",
      accessorKey: (row) => <span className="text-[hsl(var(--muted-foreground))]">{formatDate(row.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fraud Protection"
        description="Configure fraud rules and monitor suspicious activity"
      />

      <div className="rounded-xl border bg-[hsl(var(--card))] p-6 shadow-sm overflow-hidden relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(var(--primary))]/5 blur-3xl rounded-full translate-x-10 -translate-y-10" />
        <h3 className="mb-6 text-sm font-semibold tracking-tight">Configure Fraud Rule</h3>
        <form onSubmit={handleSaveRule} className="space-y-6 relative">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2.5">
              <label className="text-sm font-medium">Rule Type</label>
              <select
                value={ruleForm.rule_type}
                onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })}
                className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30 transition-shadow"
              >
                {ruleTypes.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[hsl(var(--muted-foreground))] pl-1">
                {ruleTypes.find((rt) => rt.value === ruleForm.rule_type)?.desc}
              </p>
            </div>
            
            <div className="space-y-2.5">
              <label className="text-sm font-medium">Threshold Limit</label>
              <input
                type="number"
                value={ruleForm.threshold}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, threshold: parseInt(e.target.value) || 0 })
                }
                min="1"
                className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30 transition-shadow"
              />
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2.5">
              <label className="text-sm font-medium">Action on Detection</label>
              <select
                value={ruleForm.action}
                onChange={(e) =>
                  setRuleForm({ ...ruleForm, action: e.target.value as "flag" | "block" })
                }
                className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30 transition-shadow"
              >
                <option value="flag">Flag for Review</option>
                <option value="block">Block Transaction</option>
              </select>
            </div>
            
            <div className="flex flex-col justify-end pb-1.5">
              <label className="flex cursor-pointer items-center justify-between sm:justify-start gap-4 p-3 rounded-lg border bg-[hsl(var(--accent))]/50 transition-colors hover:bg-[hsl(var(--accent))]/80">
                <span className="text-sm font-medium">
                  {ruleForm.enabled ? "Rule is Active" : "Rule is Disabled"}
                </span>
                <Switch 
                  checked={ruleForm.enabled} 
                  onCheckedChange={(checked) => setRuleForm({ ...ruleForm, enabled: checked })} 
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t mt-6">
            <Button
              type="submit"
              disabled={saving}
              className="gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Configuration
            </Button>
          </div>
        </form>
      </div>

      <DataTable
        columns={columns}
        data={events}
        loading={loading}
        emptyIcon={ShieldAlert}
        emptyTitle="No fraud events detected"
        emptyDescription="Events will automatically appear here when any active fraud rules are triggered."
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import type { FraudEvent, UpsertFraudRuleRequest } from "@/lib/types";
import {
  ShieldAlert,
  Loader2,
  AlertTriangle,
  ShieldOff,
  ShieldCheck,
  Zap,
  Activity,
  ChevronRight,
  Fingerprint,
  Target,
  Settings2,
  Lock
} from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const ruleTypes = [
  { value: "velocity", label: "Velocity Check", desc: "Max transactions per time window", icon: Zap },
  { value: "amount_limit", label: "Amount Limit", desc: "Block transactions above threshold", icon: Target },
  { value: "duplicate", label: "Duplicate Detection", desc: "Detect duplicate payment attempts", icon: Fingerprint },
  { value: "geo_block", label: "Geo Blocking", desc: "Block transactions from specific regions", icon: Globe },
];

function Globe({ className }: { className?: string }) {
    return (
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={className}
        >
            <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
    )
}

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

  const columns: ColumnDef<FraudEvent>[] = [
    {
      header: "Ref ID",
      accessorKey: (row) => (
        <div className="flex items-center gap-2 group/row">
             <div className="p-1.5 bg-zinc-900 rounded-lg border border-zinc-800 group-hover/row:border-indigo-500/30 transition-colors">
                <Activity className="h-3 w-3 text-zinc-500" />
            </div>
            <span className="font-mono text-[10px] text-zinc-400 group-hover/row:text-zinc-200 transition-colors">
                {row.transaction_id.slice(0, 16)}...
            </span>
        </div>
      ),
    },
    {
      header: "Triggered Rule",
      accessorKey: (row) => (
        <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white uppercase tracking-tight">{row.rule_type.replace(/_/g, " ")}</span>
        </div>
      ),
    },
    {
      header: "Risk Score",
      accessorKey: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-900 border border-zinc-800 shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(row.risk_score, 100)}%` }}
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                row.risk_score > 80
                  ? "bg-gradient-to-r from-red-600 to-rose-400"
                  : row.risk_score > 50
                  ? "bg-gradient-to-r from-amber-600 to-orange-400"
                  : "bg-gradient-to-r from-emerald-600 to-teal-400"
              )}
            />
          </div>
          <span className={cn(
            "text-[10px] font-bold w-6",
            row.risk_score > 80 ? "text-red-400" : row.risk_score > 50 ? "text-amber-400" : "text-emerald-400"
          )}>{row.risk_score}</span>
        </div>
      ),
    },
    {
      header: "Action Take",
      accessorKey: (row) => (
        <div className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-bold border uppercase tracking-wider",
            row.action_taken === "block" 
                ? "bg-red-500/5 text-red-500 border-red-500/20" 
                : "bg-amber-500/5 text-amber-500 border-amber-500/20"
        )}>
          {row.action_taken === "block" ? (
            <ShieldOff size={10} />
          ) : (
            <AlertTriangle size={10} />
          )}
          {row.action_taken}
        </div>
      ),
    },
    {
      header: "Detected At",
      accessorKey: (row) => <span className="text-zinc-500 text-xs">{formatDate(row.created_at)}</span>,
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
           <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <ShieldAlert className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Security Engine</span>
           </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Fraud Protection</h1>
          <p className="text-zinc-400 mt-1">AI-powered risk mitigation and real-time transaction monitoring.</p>
        </div>
        
        <div className="px-4 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Active Firewall</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <SpotlightCard className="xl:col-span-1 p-0 overflow-hidden border-zinc-800/50 bg-zinc-900/10 h-fit">
              <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/30">
                  <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-indigo-400" />
                    Logic Tuning
                  </h3>
                  <div className="p-2 bg-zinc-950 border border-zinc-800 rounded-xl">
                      <Lock className="h-3.5 w-3.5 text-zinc-600" />
                  </div>
              </div>
              
              <form onSubmit={handleSaveRule} className="p-6 space-y-6">
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Evaluation Strategy</label>
                        <select
                            value={ruleForm.rule_type}
                            onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                        >
                            {ruleTypes.map((rt) => (
                                <option key={rt.value} value={rt.value}>
                                    {rt.label}
                                </option>
                            ))}
                        </select>
                        <div className="mt-2 p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl flex gap-3">
                            {(() => {
                                const Icon = ruleTypes.find(r => r.value === ruleForm.rule_type)?.icon || AlertTriangle;
                                return <Icon className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                            })()}
                            <p className="text-[11px] text-zinc-400 leading-relaxed italic">
                                {ruleTypes.find((rt) => rt.value === ruleForm.rule_type)?.desc}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Sensitivity Index</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={ruleForm.threshold}
                                onChange={(e) => setRuleForm({ ...ruleForm, threshold: parseInt(e.target.value) || 0 })}
                                min="1"
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-mono text-zinc-600">UNITS</div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Policy Enforcement</label>
                        <select
                            value={ruleForm.action}
                            onChange={(e) => setRuleForm({ ...ruleForm, action: e.target.value as "flag" | "block" })}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3.5 text-sm font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-all appearance-none cursor-pointer"
                        >
                            <option value="flag">Flag for Audit</option>
                            <option value="block">Automatic Drop</option>
                        </select>
                    </div>

                    <div className="pt-2">
                        <div className="flex items-center justify-between p-4 rounded-2xl border border-zinc-800 bg-zinc-950/50 group hover:border-zinc-700 transition-colors">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-bold text-white">Rule Status</span>
                                <span className={cn("text-[10px] font-medium uppercase tracking-tighter", ruleForm.enabled ? "text-emerald-500" : "text-zinc-600")}>
                                    {ruleForm.enabled ? "Currently Active" : "Bypass Mode"}
                                </span>
                            </div>
                            <Switch 
                                checked={ruleForm.enabled} 
                                onCheckedChange={(checked) => setRuleForm({ ...ruleForm, enabled: checked })} 
                            />
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold py-4 text-white shadow-xl shadow-indigo-600/20 active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
                >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <><ShieldCheck size={18} /> Apply Logic</>}
                </button>
              </form>
          </SpotlightCard>

          <SpotlightCard className="xl:col-span-2 p-0 overflow-hidden border-zinc-800/50 flex flex-col min-h-[500px]">
            <div className="p-6 border-b border-zinc-800/50 bg-zinc-900/30 flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="h-4 w-4 text-indigo-400" />
                    Incident Timeline
                </h3>
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] font-mono text-zinc-500">REAL-TIME MONITOR</span>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto">
                <DataTable
                    columns={columns}
                    data={events}
                    loading={loading}
                    emptyIcon={ShieldAlert}
                    emptyTitle="Threat level zero"
                    emptyDescription="No anomalies detected. The system is operating within normal safety parameters."
                    className="border-none"
                />
            </div>
          </SpotlightCard>
      </div>
    </div>
  );
}

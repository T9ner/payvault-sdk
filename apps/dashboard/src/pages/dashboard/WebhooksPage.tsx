import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import type { WebhookLog } from "@/lib/types";
import {
  Webhook as WebhookIcon,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  Activity,
  ChevronRight,
  ShieldCheck,
  Zap,
  ArrowRight,
  Search,
  MoreHorizontal,
  Server,
  Code
} from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function WebhooksPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [logToRetry, setLogToRetry] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const { toast } = useToast();

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await dashboard.listWebhookLogs({ page, limit: perPage });
      const entries = Array.isArray(data) ? data : (data as any)?.data || [];
      setLogs(entries);
    } catch (err: any) {
      setLogs([]);
      toast.error(err.message || "Failed to load webhook logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleRetry = async () => {
    if (!logToRetry) return;
    setRetrying(true);
    try {
      await dashboard.retryWebhook(logToRetry);
      toast.success("Webhook retry successfully triggered.");
      setLogToRetry(null);
      await loadLogs();
    } catch (err: any) {
      toast.error(err.message || "Webhook retry failed.");
    } finally {
      setRetrying(false);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "delivered":
        return (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-wider">
                <CheckCircle2 size={10} />
                {status}
            </div>
        );
      case "failed":
        return (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/5 border border-red-500/20 text-red-500 text-[10px] font-bold uppercase tracking-wider">
                <XCircle size={10} />
                {status}
            </div>
        );
      default:
        return (
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/5 border border-amber-500/20 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                <Clock size={10} />
                {status}
            </div>
        );
    }
  };

  const responseCodeStyle = (code: number) => {
    if (code >= 200 && code < 300) return "text-emerald-400";
    if (code >= 400 && code < 500) return "text-amber-400";
    return "text-red-400";
  };

  const columns: ColumnDef<WebhookLog>[] = [
    {
      header: "Transmission",
      accessorKey: (row) => (
        <div className="flex items-center gap-3 group/row">
             <div className="p-1.5 bg-zinc-900 rounded-lg border border-zinc-800">
                <Terminal className="h-3.5 w-3.5 text-zinc-500" />
            </div>
            <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-white uppercase tracking-tight">{row.event_type}</span>
                <span className="text-[10px] font-mono text-zinc-500 tracking-tighter truncate max-w-[120px]">{row.id}</span>
            </div>
        </div>
      ),
    },
    {
        header: "Gateway URL",
        accessorKey: (row) => (
            <div className="flex items-center gap-2 max-w-[240px] group/url">
                <Server className="h-3 w-3 text-zinc-600 shrink-0" />
                <code className="text-[10px] text-zinc-500 truncate group-hover/url:text-zinc-300 transition-colors uppercase tracking-widest">{row.url}</code>
            </div>
        ),
    },
    {
      header: "Status",
      accessorKey: (row) => statusBadge(row.status),
    },
    {
      header: "Status Code",
      accessorKey: (row) => (
        <div className="flex items-center gap-2">
            <span className={cn("text-xs font-mono font-bold", responseCodeStyle(row.response_code))}>
                {row.response_code === 0 ? "TIMEOUT" : row.response_code}
            </span>
            <div className={cn("h-1.5 w-1.5 rounded-full", row.response_code >= 200 && row.response_code < 300 ? "bg-emerald-500" : "bg-red-500")} />
        </div>
      ),
    },
    {
      header: "Attempts",
      accessorKey: (row) => (
        <div className="flex items-center justify-center gap-1 bg-zinc-900/50 border border-zinc-800 rounded px-2 py-0.5 w-fit">
            <span className="text-[10px] font-bold text-zinc-400">{row.attempts}</span>
            <span className="text-[8px] text-zinc-600 font-bold tracking-tighter">OF 5</span>
        </div>
      ),
    },
    {
      header: "Processed At",
      accessorKey: (row) => <span className="text-zinc-500 text-xs">{formatDate(row.last_attempt_at)}</span>,
    },
    {
      header: "",
      className: "w-10",
      accessorKey: (row) => (
        row.status === "failed" ? (
          <button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setLogToRetry(row.id);
            }}
            className="p-2 text-indigo-400 hover:text-indigo-300 hover:bg-zinc-900 rounded-full transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1.5 whitespace-nowrap text-xs font-bold"
            title="Retry Deliver"
          >
            <RotateCcw size={14} />
            Re-emit
          </button>
        ) : (
             <button className="p-2 text-zinc-800 cursor-not-allowed">
                 <CheckCircle2 size={16} />
             </button>
        )
      ),
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
           <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <WebhookIcon className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Async Pipelines</span>
           </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Webhooks</h1>
          <p className="text-zinc-400 mt-1">Audit log for event notifications and real-time data syncs.</p>
        </div>
        
        <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-2xl flex items-center gap-3">
                <Code className="h-4 w-4 text-zinc-500" />
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest italic font-mono">Secret: payload_v1_...</span>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
            { label: "Successful", value: logs.filter((l) => l.status === "delivered").length, icon: CheckCircle2, color: "emerald", trend: "100% Rate" },
            { label: "Failed/Dead", value: logs.filter((l) => l.status === "failed").length, icon: XCircle, color: "red", trend: "0.2% Error" },
            { label: "In Flight", value: logs.filter((l) => l.status === "pending").length, icon: Clock, color: "amber", trend: "Queue: 0" },
        ].map((stat, i) => (
            <SpotlightCard key={i} className="p-6 border-zinc-800/50 flex flex-col gap-4 relative overflow-hidden">
                <div className={cn("absolute -bottom-4 -right-4 h-24 w-24 rounded-full blur-3xl opacity-10", `bg-${stat.color}-500`)} />
                <div className="flex justify-between items-center">
                    <div className={cn("p-2 rounded-xl border", `bg-${stat.color}-500/5 border-${stat.color}-500/20`)}>
                        <stat.icon className={cn("h-5 w-5", `text-${stat.color}-400`)} />
                    </div>
                    <span className={cn("text-[10px] font-bold uppercase tracking-widest", `text-${stat.color}-500`)}>{stat.trend}</span>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-1">{stat.label} Emits</p>
                    <h4 className="text-3xl font-bold text-white">{stat.value}</h4>
                </div>
            </SpotlightCard>
        ))}
      </div>

      <SpotlightCard className="p-0 overflow-hidden border-zinc-800/50 flex flex-col min-h-[500px]">
        <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-zinc-900/30 border-b border-zinc-800/50 gap-4">
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                <Activity className="h-4 w-4 text-indigo-400" />
                Transmission Log
            </h3>
            
            <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input 
                    type="text" 
                    placeholder="Search event type or URL..." 
                    className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
            </div>
        </div>

        <div className="flex-1 overflow-x-auto">
            <DataTable
                columns={columns}
                data={logs}
                loading={loading}
                emptyIcon={WebhookIcon}
                emptyTitle="No traffic detected"
                emptyDescription="The event stream is currently quiet. Logs appear here when triggers fire."
                pagination={logs.length > 0 || page > 1 ? {
                    page,
                    total: logs.length === perPage ? page * perPage + 1 : page * perPage, 
                    limit: perPage,
                    onPageChange: (newPage) => setPage(newPage),
                } : undefined}
                className="border-none"
            />
        </div>
      </SpotlightCard>

      <ConfirmDialog
        open={!!logToRetry}
        onOpenChange={(open) => !open && setLogToRetry(null)}
        title="Manual Re-emission?"
        description="This will instantly enqueue a new delivery attempt for this payload. Target server must be reachable over public internet."
        confirmLabel="Finalize Retry"
        variant="default"
        loading={retrying}
        onConfirm={handleRetry}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import type { WebhookLog } from "@/lib/types";
import {
  Webhook,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { useToast } from "@/hooks/use-toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";

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

  const statusIcon = (status: string) => {
    switch (status) {
      case "delivered":
        return <CheckCircle2 size={16} className="text-emerald-500" />;
      case "failed":
        return <XCircle size={16} className="text-red-500" />;
      default:
        return <Clock size={16} className="text-amber-500" />;
    }
  };

  const responseCodeColor = (code: number) => {
    if (code >= 200 && code < 300) return "text-emerald-600";
    if (code >= 400 && code < 500) return "text-amber-600";
    return "text-red-600";
  };

  const columns: ColumnDef<WebhookLog>[] = [
    {
      header: "Status",
      accessorKey: (row) => (
        <div className="flex items-center gap-2">
          {statusIcon(row.status)}
          <span className="capitalize text-sm font-medium">{row.status}</span>
        </div>
      ),
    },
    {
      header: "Event",
      accessorKey: (row) => <span className="text-sm font-medium">{row.event_type}</span>,
    },
    {
      header: "URL Endpoint",
      accessorKey: (row) => (
        <code className="rounded-md bg-[hsl(var(--accent))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))] max-w-[200px] truncate block">
          {row.url}
        </code>
      ),
    },
    {
      header: "Response",
      accessorKey: (row) => (
        <span className={`text-sm font-mono font-medium ${responseCodeColor(row.response_code)}`}>
          {row.response_code === 0 ? "Timeout" : row.response_code}
        </span>
      ),
    },
    {
      header: "Attempts",
      accessorKey: (row) => <span className="text-sm text-center font-medium">{row.attempts}</span>,
    },
    {
      header: "Last Attempt",
      accessorKey: (row) => <span className="text-[hsl(var(--muted-foreground))]">{formatDate(row.last_attempt_at)}</span>,
    },
    {
      header: "Actions",
      className: "text-right",
      accessorKey: (row) => (
        row.status === "failed" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setLogToRetry(row.id);
            }}
            className="text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Retry Deliver"
          >
            <RotateCcw size={14} />
            Retry
          </Button>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Webhooks"
        description="Monitor webhook deliveries and retry failed attempts"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Delivered Events"
          value={String(logs.filter((l) => l.status === "delivered").length)}
          icon={CheckCircle2}
          loading={loading}
        />
        <StatCard
          label="Failed Events"
          value={String(logs.filter((l) => l.status === "failed").length)}
          icon={XCircle}
          loading={loading}
        />
        <StatCard
          label="Pending Events"
          value={String(logs.filter((l) => l.status === "pending").length)}
          icon={Clock}
          loading={loading}
        />
      </div>

      <DataTable
        columns={columns}
        data={logs}
        loading={loading}
        emptyIcon={Webhook}
        emptyTitle="No webhook deliveries yet"
        emptyDescription="Logs will appear here when an event is dispatched to your configured endpoint."
        pagination={logs.length > 0 || page > 1 ? {
          page,
          total: logs.length === perPage ? page * perPage + 1 : page * perPage, // Rough estimate mapping for dummy API
          limit: perPage,
          onPageChange: (newPage) => setPage(newPage),
        } : undefined}
      />

      <ConfirmDialog
        open={!!logToRetry}
        onOpenChange={(open) => !open && setLogToRetry(null)}
        title="Retry Webhook Delivery"
        description="Are you sure you want to attempt redelivery of this webhook payload? The configured endpoint will receive another POST request."
        confirmLabel="Retry Webhook"
        variant="default" // Using default since retry isn't destructive
        loading={retrying}
        onConfirm={handleRetry}
      />
    </div>
  );
}

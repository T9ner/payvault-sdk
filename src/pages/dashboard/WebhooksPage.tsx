import { useEffect, useState } from "react";
import { dashboard } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import type { WebhookLog } from "@/lib/types";
import {
  Webhook,
  RotateCcw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function WebhooksPage() {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 20;

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await dashboard.listWebhookLogs({ page, limit: perPage });
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page]);

  const handleRetry = async (id: string) => {
    setRetrying(id);
    try {
      await dashboard.retryWebhook(id);
      await loadLogs();
    } catch {
      alert("Retry failed");
    } finally {
      setRetrying("");
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

  const statusColors: Record<string, string> = {
    delivered: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  };

  const responseCodeColor = (code: number) => {
    if (code >= 200 && code < 300) return "text-emerald-600";
    if (code >= 400 && code < 500) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Monitor webhook deliveries and retry failed attempts
        </p>
      </div>

      {/* Stats */}
      {!loading && logs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border bg-[hsl(var(--card))] p-4">
            <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Delivered</p>
            <p className="mt-1 text-xl font-semibold text-emerald-600">
              {logs.filter((l) => l.status === "delivered").length}
            </p>
          </div>
          <div className="rounded-xl border bg-[hsl(var(--card))] p-4">
            <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Failed</p>
            <p className="mt-1 text-xl font-semibold text-red-600">
              {logs.filter((l) => l.status === "failed").length}
            </p>
          </div>
          <div className="rounded-xl border bg-[hsl(var(--card))] p-4">
            <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Pending</p>
            <p className="mt-1 text-xl font-semibold text-amber-600">
              {logs.filter((l) => l.status === "pending").length}
            </p>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="rounded-xl border bg-[hsl(var(--card))]">
        <div className="border-b px-6 py-4">
          <h3 className="text-sm font-medium">Delivery Log</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[hsl(var(--muted-foreground))]">
              <Webhook size={36} className="mb-3 opacity-30" />
              <p className="text-sm">No webhook deliveries yet</p>
              <p className="text-xs">Webhook logs will appear here when events are dispatched</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-[hsl(var(--muted-foreground))]">
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Event</th>
                  <th className="px-6 py-3">URL</th>
                  <th className="px-6 py-3">Response</th>
                  <th className="px-6 py-3">Attempts</th>
                  <th className="px-6 py-3">Last Attempt</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {statusIcon(log.status)}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[log.status]}`}
                        >
                          {log.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm">{log.event_type}</td>
                    <td className="px-6 py-3">
                      <code className="rounded bg-[hsl(var(--accent))] px-1.5 py-0.5 text-xs">
                        {log.url.length > 40 ? log.url.slice(0, 40) + "..." : log.url}
                      </code>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`text-sm font-mono font-medium ${responseCodeColor(log.response_code)}`}>
                        {log.response_code}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-center">
                      {log.attempts}
                    </td>
                    <td className="px-6 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                      {formatDate(log.last_attempt_at)}
                    </td>
                    <td className="px-6 py-3">
                      {log.status === "failed" && (
                        <button
                          onClick={() => handleRetry(log.id)}
                          disabled={retrying === log.id}
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--accent))] disabled:opacity-50"
                        >
                          {retrying === log.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw size={14} />
                          )}
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && logs.length > 0 && (
          <div className="flex items-center justify-between border-t px-6 py-3">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Page {page}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] disabled:opacity-30"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={logs.length < perPage}
                className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] disabled:opacity-30"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, RefreshCw } from "lucide-react";

import { queueApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface QueueItem {
  id: string;
  recipient: string;
  subject: string;
  status: string;
  errorInfo: string | null;
  createdAt: string;
  sentAt: string | null;
}

interface Stats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  sending: number;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  Pending: { label: "Pending", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  Sending: { label: "Sending", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  Sent:    { label: "Sent",    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  Failed:  { label: "Failed",  className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
};

const PAGE_SIZE = 50;

export default function EmailsPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadItems(false);
  }, [statusFilter, page]);

  async function loadData() {
    setLoading(true);
    try {
      const [itemsRes, statsRes] = await Promise.all([
        queueApi.getAll(statusFilter === "all" ? undefined : statusFilter, page, PAGE_SIZE),
        queueApi.getStats(),
      ]);
      setItems(itemsRes.data);
      setStats(statsRes.data);
    } catch {
      toast.error("Failed to load emails.");
    } finally {
      setLoading(false);
    }
  }

  async function loadItems(showRefresh = true) {
    if (showRefresh) setRefreshing(true);
    try {
      const [itemsRes, statsRes] = await Promise.all([
        queueApi.getAll(statusFilter === "all" ? undefined : statusFilter, page, PAGE_SIZE),
        queueApi.getStats(),
      ]);
      setItems(itemsRes.data);
      setStats(statsRes.data);
    } catch {
      toast.error("Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Emails</h1>
          <p className="text-muted-foreground text-sm mt-1">Email delivery log.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadItems(true)} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Sent", value: stats.sent },
            { label: "Pending", value: stats.pending + stats.sending },
            { label: "Failed", value: stats.failed },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border p-3 text-center">
              <div className="text-2xl font-semibold">{s.value.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Sending">Sending</SelectItem>
            <SelectItem value="Sent">Sent</SelectItem>
            <SelectItem value="Failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Mail className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No emails found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter !== "all" ? `No emails with status "${statusFilter}".` : "Send a broadcast to see emails here."}
          </p>
        </div>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const badge = STATUS_BADGE[item.status];
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.recipient}</TableCell>
                      <TableCell className="max-w-64 truncate text-sm">{item.subject}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge?.className ?? ""}`}>
                          {badge?.label ?? item.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {item.sentAt
                          ? new Date(item.sentAt).toLocaleString()
                          : <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-xs text-destructive">
                        {item.errorInfo ?? ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={items.length < PAGE_SIZE}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

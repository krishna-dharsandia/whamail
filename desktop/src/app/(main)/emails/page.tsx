"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Mail } from "lucide-react";

import { queueApi } from "@/lib/api";
import { useGlobalRefresh } from "../layout";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTableHeight } from "@/hooks/use-table-height";
import { Badge } from "@/components/ui/badge";

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

const STATUS_CLASS: Record<string, string> = {
  Pending: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Sending: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Sent:    "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Failed:  "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function EmailsPage() {
  const { containerRef, pageSize } = useTableHeight();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const loadItems = useCallback(async () => {
    try {
      const [itemsRes, statsRes] = await Promise.all([
        queueApi.getAll(statusFilter === "all" ? undefined : statusFilter, page, pageSize),
        queueApi.getStats(),
      ]);
      setItems(itemsRes.data);
      setStats(statsRes.data);
    } catch {
      toast.error("Failed to load emails.");
    }
  }, [statusFilter, page, pageSize]);

  useEffect(() => {
    setLoading(true);
    loadItems().finally(() => setLoading(false));
  }, [loadItems]);

  useGlobalRefresh(loadItems);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Stats + Filter Row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {stats && (
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="outline" className="text-muted-foreground">
              {stats.total.toLocaleString()} total
            </Badge>
            <Badge variant="outline" className="text-green-600 dark:text-green-400">
              {stats.sent} sent
            </Badge>
            <Badge variant="outline" className="text-yellow-600 dark:text-yellow-400">
              {stats.pending + stats.sending} pending
            </Badge>
            <Badge variant="outline" className="text-red-600 dark:text-red-400">
              {stats.failed} failed
            </Badge>
          </div>
        )}
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-36 h-8 text-xs">
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
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <Mail className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No emails found</p>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter !== "all" ? `No emails with status "${statusFilter}".` : "Send a broadcast to see emails here."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
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
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">{item.recipient}</TableCell>
                    <TableCell className="max-w-64 truncate text-sm">{item.subject}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[item.status] ?? ""}`}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {item.sentAt
                        ? new Date(item.sentAt).toLocaleString()
                        : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-destructive">
                      {item.errorInfo ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between shrink-0">
            <p className="text-xs text-muted-foreground">Page {page}</p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={items.length < pageSize}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

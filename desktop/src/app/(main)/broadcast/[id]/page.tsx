"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  MailOpen,
  Send,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";

import { broadcastApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface BroadcastContact {
  email: string;
  name: string | null;
  queueStatus: string | null;
  sentAt: string | null;
}

interface BroadcastResponse {
  id: string;
  name: string;
  status: string;
  audienceName: string;
  templateName: string;
  subjectOverride: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openCount: number;
  totalOpenCount: number;
  createdAt: string;
  sentAt: string | null;
}

interface BroadcastDetail {
  broadcast: BroadcastResponse;
  contacts: BroadcastContact[];
  invalidCount: number;
  notQueuedCount: number;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Sending: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email: string) {
  return EMAIL_REGEX.test(email);
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold leading-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Opened") {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" /> Opened</span>;
  }
  if (status === "Failed") {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-full"><XCircle className="h-3 w-3" /> Failed</span>;
  }
  if (status === "Sent") {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full"><Mail className="h-3 w-3" /> Sent</span>;
  }
  if (status === "Pending" || status === "Sending") {
    return <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/40 px-2 py-0.5 rounded-full"><Loader2 className="h-3 w-3 animate-spin" /> {status}</span>;
  }
  return null;
}

function ContactTable({ contacts, label, emptyMsg }: { contacts: BroadcastContact[]; label: string; emptyMsg: string }) {
  if (contacts.length === 0) return null;
  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-12">#</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Sent At</th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c, i) => (
            <tr key={c.email} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
              <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
              <td className="px-4 py-3 font-mono text-xs">{c.email}</td>
              <td className="px-4 py-3 text-muted-foreground">{c.name || "—"}</td>
              <td className="px-4 py-3">{c.queueStatus ? <StatusBadge status={c.queueStatus} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{c.sentAt ? new Date(c.sentAt).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RemovedSection({ contacts, label }: { contacts: BroadcastContact[]; label: string }) {
  if (contacts.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4" />
          {label} ({contacts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Email</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={c.email} className={`border-b last:border-0 ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground line-through">{c.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.name || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs text-red-600 border-red-300 dark:border-red-700">
                      {!isValidEmail(c.email) ? "Invalid email" : "Not in audience"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BroadcastDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<BroadcastDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadDetail();
  }, [id]);

  useEffect(() => {
    if (detail?.broadcast.status !== "Sending") return;
    const interval = setInterval(loadDetail, 5000);
    return () => clearInterval(interval);
  }, [detail?.broadcast.status]);

  async function loadDetail() {
    try {
      const res = await broadcastApi.getDetail(id);
      setDetail(res.data);
    } catch {
      toast.error("Failed to load broadcast.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSendRemaining() {
    setSending(true);
    try {
      await broadcastApi.sendRemaining(id);
      toast.success("Sending to remaining contacts.");
      loadDetail();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="font-medium">Broadcast not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/broadcast")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Broadcasts
        </Button>
      </div>
    );
  }

  const b = detail.broadcast;
  const openPct = b.totalRecipients > 0 ? Math.round((b.openCount / b.totalRecipients) * 100) : 0;

  // Categorize contacts
  const validContacts = detail.contacts.filter(c => isValidEmail(c.email));
  const invalidContacts = detail.contacts.filter(c => !isValidEmail(c.email));

  const opened = validContacts.filter(c => c.queueStatus === "Opened");
  const sent = validContacts.filter(c => c.queueStatus === "Sent");
  const failed = validContacts.filter(c => c.queueStatus === "Failed");
  const pending = validContacts.filter(c => c.queueStatus === "Pending" || c.queueStatus === "Sending");
  const notQueued = validContacts.filter(c => c.queueStatus === null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold truncate">{b.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[b.status] ?? ""}`}>{b.status}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {b.audienceName} &middot; {b.templateName}
            {b.subjectOverride && ` \u2014 "${b.subjectOverride}"`}
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />} label="Sent" value={`${b.sentCount}/${b.totalRecipients}`} color="bg-blue-100 dark:bg-blue-900/30" />
        <StatCard icon={<MailOpen className="h-4 w-4 text-green-600 dark:text-green-400" />} label="Unique Opens" value={`${b.openCount}/${b.totalRecipients}`} sub={`${openPct}% open rate`} color="bg-green-100 dark:bg-green-900/30" />
        <StatCard icon={<Mail className="h-4 w-4 text-violet-600 dark:text-violet-400" />} label="Total Opens" value={`${b.totalOpenCount}`} sub="including re-opens" color="bg-violet-100 dark:bg-violet-900/30" />
        <StatCard icon={<XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />} label="Failed" value={`${b.failedCount}/${b.totalRecipients}`} color="bg-red-100 dark:bg-red-900/30" />
      </div>

      {/* Audience Contacts Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>Audience Contacts ({detail.contacts.length})</span>
            <div className="flex gap-2 text-xs font-normal">
              <Badge variant="outline" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700">
                {validContacts.length} valid
              </Badge>
              {detail.invalidCount > 0 && (
                <Badge variant="outline" className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700">
                  {detail.invalidCount} invalid
                </Badge>
              )}
              {notQueued.length > 0 && (
                <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700">
                  {notQueued.length} not sent
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Opened Group */}
      {opened.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" /> Opened ({opened.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ContactTable contacts={opened} label="Opened" emptyMsg="" />
          </CardContent>
        </Card>
      )}

      {/* Sent Group */}
      {sent.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Mail className="h-4 w-4" /> Sent ({sent.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ContactTable contacts={sent} label="Sent" emptyMsg="" />
          </CardContent>
        </Card>
      )}

      {/* Pending/Sending Group */}
      {pending.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Pending ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ContactTable contacts={pending} label="Pending" emptyMsg="" />
          </CardContent>
        </Card>
      )}

      {/* Failed Group */}
      {failed.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
              <XCircle className="h-4 w-4" /> Failed ({failed.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ContactTable contacts={failed} label="Failed" emptyMsg="" />
          </CardContent>
        </Card>
      )}

      {/* Not Sent Group — future sending */}
      {notQueued.length > 0 && (
        <Card className="border-dashed border-yellow-300 dark:border-yellow-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                <Send className="h-4 w-4" /> Not Sent ({notQueued.length})
              </span>
              <Button size="sm" onClick={handleSendRemaining} disabled={sending}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Send Remaining
              </Button>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              These contacts have valid emails but were not yet queued for this broadcast.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <ContactTable contacts={notQueued} label="Not Sent" emptyMsg="" />
          </CardContent>
        </Card>
      )}

      {/* Removed / Invalid Contacts */}
      {invalidContacts.length > 0 && (
        <RemovedSection contacts={invalidContacts} label="Removed Contacts" />
      )}
    </div>
  );
}

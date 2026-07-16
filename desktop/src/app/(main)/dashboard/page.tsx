"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2, Mail, Megaphone, Send, Users, MessageCircle,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from "recharts";

import { broadcastApi, metricsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWhatsApp } from "@/hooks/use-whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Overview {
  sentToday: number;
  sentThisMonth: number;
  sentAllTime: number;
  messagesToday: number;
  messagesThisMonth: number;
  messagesAllTime: number;
  totalAudiences: number;
  totalContacts: number;
  totalBroadcasts: number;
  activeBroadcasts: number;
  pendingEmails: number;
  failedEmails: number;
  pendingMessages: number;
  failedMessages: number;
}

interface Broadcast {
  id: string;
  name: string;
  status: string;
  audienceName: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
}

interface DailyStat { date: string; count: number; }
interface StatusStat { status: string; count: number; }

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Sending: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const PIE_COLORS: Record<string, string> = {
  Draft: "#94a3b8",
  Sending: "#3b82f6",
  Completed: "#22c55e",
  Failed: "#ef4444",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { status: waStatus, info: waInfo } = useWhatsApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [statusStats, setStatusStats] = useState<StatusStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyRange, setDailyRange] = useState("30");

  useEffect(() => { load(); }, []);

  useEffect(() => {
    metricsApi.emailsPerDay(Number(dailyRange)).then((res) => setDaily(res.data)).catch(() => {});
  }, [dailyRange]);

  async function load() {
    try {
      const [overviewRes, broadcastsRes, dailyRes, statusRes] = await Promise.all([
        metricsApi.overview(),
        broadcastApi.getAll(),
        metricsApi.emailsPerDay(30),
        metricsApi.broadcastStatus(),
      ]);
      setOverview(overviewRes.data);
      setBroadcasts(broadcastsRes.data.slice(0, 5));
      setDaily(dailyRes.data);
      setStatusStats(statusRes.data);
    } catch {
      toast.error("Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const emailLimit = user?.role === "workspace" ? 5000 : 500;
  const quotaUsed = user?.emailsSent ?? 0;
  const quotaPercent = Math.min(Math.round((quotaUsed / emailLimit) * 100), 100);

  return (
    <div className="space-y-6 overflow-auto flex-1">
      {/* Stats Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Send className="h-4 w-4" /> Emails Sent Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overview?.sentToday.toLocaleString() ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {overview?.sentThisMonth.toLocaleString() ?? 0} this month · {overview?.sentAllTime.toLocaleString() ?? 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Messages Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overview?.messagesToday.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Contacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overview?.totalContacts.toLocaleString() ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">{overview?.totalAudiences ?? 0} audiences</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Megaphone className="h-4 w-4" /> Broadcasts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overview?.totalBroadcasts.toLocaleString() ?? 0}</div>
            {(overview?.activeBroadcasts ?? 0) > 0 && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {overview!.activeBroadcasts} sending now
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Connection Status + Quota */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">Gmail</p>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-xs text-muted-foreground">Connected</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">WhatsApp</p>
              <div className="flex items-center gap-1.5">
                <div className={`h-2 w-2 rounded-full ${waStatus === "ready" ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-xs text-muted-foreground">
                  {waStatus === "ready" ? waInfo?.name ?? "Connected" : "Not connected"}
                </span>
              </div>
            </div>
            {waStatus !== "ready" && (
              <Button asChild size="sm" variant="outline">
                <Link href="/whatsapp">Connect</Link>
              </Button>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-medium">Email Quota</span>
              <span className="text-muted-foreground">{quotaUsed}/{emailLimit.toLocaleString()}</span>
            </div>
            <Progress value={quotaPercent} className="h-1.5" />
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Emails Per Day</CardTitle>
              <Select value={dailyRange} onValueChange={setDailyRange}>
                <SelectTrigger className="w-28 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <RechartsTooltip
                  labelFormatter={(v: string) => new Date(v).toLocaleDateString()}
                  formatter={(v: number) => [v.toLocaleString(), "Emails"]}
                />
                <Bar dataKey="count" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Broadcast Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusStats.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                No broadcasts yet
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={statusStats}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                    >
                      {statusStats.map((s) => (
                        <Cell key={s.status} fill={PIE_COLORS[s.status] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(v: number) => [v, "Broadcasts"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex gap-3 flex-wrap justify-center">
                  {statusStats.map((s) => (
                    <div key={s.status} className="flex items-center gap-1.5 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[s.status] ?? "#94a3b8" }} />
                      <span className="text-muted-foreground">{s.status}</span>
                      <span className="font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Broadcasts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Recent Broadcasts</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/broadcast">View all</Link>
          </Button>
        </div>
        {broadcasts.length === 0 ? (
          <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
            No broadcasts yet
          </div>
        ) : (
          <div className="space-y-1.5">
            {broadcasts.map((b) => (
              <Link key={b.id} href={`/broadcast/${b.id}`} className="rounded-lg border p-2.5 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors block">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{b.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_COLORS[b.status] ?? ""}`}>{b.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{b.audienceName}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(b.createdAt).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

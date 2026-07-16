"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { metricsApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Overview {
  sentToday: number;
  sentThisMonth: number;
  sentAllTime: number;
  totalAudiences: number;
  totalContacts: number;
  totalBroadcasts: number;
  pendingEmails: number;
  failedEmails: number;
}

interface DailyStat { date: string; count: number; }
interface MonthlyStat { month: string; count: number; }
interface StatusStat { status: string; count: number; }

const PIE_COLORS: Record<string, string> = {
  Draft: "#94a3b8",
  Sending: "#3b82f6",
  Completed: "#22c55e",
  Failed: "#ef4444",
};

export default function MetricsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [monthly, setMonthly] = useState<MonthlyStat[]>([]);
  const [statusStats, setStatusStats] = useState<StatusStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyRange, setDailyRange] = useState("30");

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadDaily();
  }, [dailyRange]);

  async function loadAll() {
    try {
      const [overviewRes, dailyRes, monthlyRes, statusRes] = await Promise.all([
        metricsApi.overview(),
        metricsApi.emailsPerDay(30),
        metricsApi.emailsPerMonth(12),
        metricsApi.broadcastStatus(),
      ]);
      setOverview(overviewRes.data);
      setDaily(dailyRes.data);
      setMonthly(monthlyRes.data);
      setStatusStats(statusRes.data);
    } catch {
      toast.error("Failed to load metrics.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDaily() {
    try {
      const res = await metricsApi.emailsPerDay(Number(dailyRange));
      setDaily(res.data);
    } catch {
      // ignore
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
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Sent Today",       value: overview?.sentToday ?? 0 },
          { label: "Sent This Month",  value: overview?.sentThisMonth ?? 0 },
          { label: "Sent All Time",    value: overview?.sentAllTime ?? 0 },
          { label: "Failed",           value: overview?.failedEmails ?? 0 },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{s.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Emails Per Day */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Emails Sent Per Day</CardTitle>
            <Select value={dailyRange} onValueChange={setDailyRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                labelFormatter={(v: string) => new Date(v).toLocaleDateString()}
                formatter={(v: number) => [v.toLocaleString(), "Emails"]}
              />
              <Bar dataKey="count" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Emails Per Month */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Emails Sent Per Month</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: number) => [v.toLocaleString(), "Emails"]} />
                <Bar dataKey="count" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Broadcast Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Broadcast Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusStats.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
                No broadcasts yet.
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="60%" height={180}>
                  <PieChart>
                    <Pie
                      data={statusStats}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                    >
                      {statusStats.map((s) => (
                        <Cell key={s.status} fill={PIE_COLORS[s.status] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => [v, "Broadcasts"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {statusStats.map((s) => (
                    <div key={s.status} className="flex items-center gap-2 text-sm">
                      <span
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[s.status] ?? "#94a3b8" }}
                      />
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
    </div>
  );
}

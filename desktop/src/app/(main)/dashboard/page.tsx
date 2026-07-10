"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  BarChart2, Loader2, Mail, Megaphone, Plus, Send, Users, MessageCircle,
} from "lucide-react";

import { broadcastApi, metricsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useWhatsApp } from "@/hooks/use-whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

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

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Sending: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { status: waStatus, info: waInfo } = useWhatsApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const [overviewRes, broadcastsRes] = await Promise.all([
        metricsApi.overview(),
        broadcastApi.getAll(),
      ]);
      setOverview(overviewRes.data);
      setBroadcasts(broadcastsRes.data.slice(0, 5));
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome back{user?.fullName ? `, ${user.fullName.split(" ")[0]}` : ""}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Here's what's happening with your email campaigns.</p>
      </div>

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
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> Messages Sent Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{overview?.messagesToday.toLocaleString() ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" /> Total Contacts
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

      {/* Connection Status */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" /> Gmail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span className="text-sm">Connected</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${waStatus === "ready" ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-sm">
                  {waStatus === "ready" ? `Connected as ${waInfo?.name ?? "Unknown"}` : "Not connected"}
                </span>
              </div>
              {waStatus !== "ready" && (
                <Button asChild size="sm" variant="outline">
                  <Link href="/whatsapp">Connect</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Email Quota */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Email Quota</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={quotaPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{quotaUsed.toLocaleString()} emails sent</span>
            <span>{emailLimit.toLocaleString()} limit ({user?.role === "workspace" ? "Workspace" : "Standard"})</span>
          </div>
          {quotaPercent >= 80 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              You've used {quotaPercent}% of your quota. Upgrade to workspace for 5,000 emails.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-medium mb-3">Quick Actions</h2>
        <div className="flex gap-2 flex-wrap">
          <Button asChild size="sm">
            <Link href="/broadcast">
              <Plus className="h-4 w-4 mr-1" /> New Broadcast
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/audience">
              <Users className="h-4 w-4 mr-1" /> Manage Audiences
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/metrics">
              <BarChart2 className="h-4 w-4 mr-1" /> View Metrics
            </Link>
          </Button>
        </div>
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
          <div className="rounded-lg border p-6 text-center">
            <p className="text-sm text-muted-foreground">No broadcasts yet.</p>
            <Button asChild size="sm" className="mt-3">
              <Link href="/broadcast">Create your first broadcast</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {broadcasts.map((b) => {
              const progress = b.totalRecipients > 0
                ? Math.round(((b.sentCount + b.failedCount) / b.totalRecipients) * 100)
                : 0;
              return (
                <div key={b.id} className="rounded-lg border p-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{b.name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[b.status] ?? ""}`}>
                        {b.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{b.audienceName}</p>
                    {b.status === "Sending" && (
                      <Progress value={progress} className="h-1 mt-1.5" />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(b.createdAt).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

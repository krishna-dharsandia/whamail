"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, ExternalLink, Loader2, Megaphone, Plus, Send, Trash2,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { audienceApi, broadcastApi, templateApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

interface Broadcast {
  id: string;
  name: string;
  status: string;
  audienceId: string;
  audienceName: string;
  templateId: string;
  templateName: string;
  subjectOverride: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  sentAt: string | null;
}

interface Audience {
  id: string;
  name: string;
  contactCount: number;
}

interface Template {
  id: string;
  name: string;
  subjectTemplate: string;
}

const STATUS_COLORS: Record<string, string> = {
  Draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Sending: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

// 3-step wizard state
type WizardStep = 1 | 2 | 3;

export default function BroadcastPage() {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    audienceId: "",
    templateId: "",
    subjectOverride: "",
  });

  useEffect(() => {
    loadBroadcasts();
  }, []);

  // Auto-refresh every 5s when any broadcast is in "Sending" status
  useEffect(() => {
    const hasSending = broadcasts.some((b) => b.status === "Sending");
    if (!hasSending) return;
    const interval = setInterval(loadBroadcasts, 5000);
    return () => clearInterval(interval);
  }, [broadcasts]);

  async function loadBroadcasts() {
    try {
      const res = await broadcastApi.getAll();
      setBroadcasts(res.data);
    } catch {
      toast.error("Failed to load broadcasts.");
    } finally {
      setLoading(false);
    }
  }

  async function openWizard() {
    setForm({ name: "", audienceId: "", templateId: "", subjectOverride: "" });
    setWizardStep(1);
    setWizardOpen(true);
    setLoadingOptions(true);
    try {
      const [audsRes, tplsRes] = await Promise.all([audienceApi.getAll(), templateApi.getAll()]);
      setAudiences(audsRes.data);
      setTemplates(tplsRes.data);
    } catch {
      toast.error("Failed to load options.");
    } finally {
      setLoadingOptions(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await broadcastApi.create({
        name: form.name,
        audienceId: form.audienceId,
        templateId: form.templateId,
        subjectOverride: form.subjectOverride || undefined,
      });
      setBroadcasts((prev) => [res.data, ...prev]);
      setWizardOpen(false);
      toast.success("Broadcast created. Click Send when ready.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create broadcast.";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleSend(id: string) {
    setSending(id);
    try {
      const res = await broadcastApi.send(id);
      setBroadcasts((prev) => prev.map((b) => b.id === id ? res.data : b));
      toast.success("Broadcast is sending! Emails are being queued.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to send broadcast.";
      toast.error(msg);
    } finally {
      setSending(null);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await broadcastApi.delete(deleteId);
      setBroadcasts((prev) => prev.filter((b) => b.id !== deleteId));
      toast.success("Broadcast deleted.");
      setDeleteId(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete broadcast.";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  const selectedAudience = audiences.find((a) => a.id === form.audienceId);
  const selectedTemplate = templates.find((t) => t.id === form.templateId);

  const canProceedStep1 = !!form.name.trim();
  const canProceedStep2 = !!form.audienceId && !!form.templateId;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Broadcasts</h1>
          <p className="text-muted-foreground text-sm mt-1">Create and send email campaigns.</p>
        </div>
        <Button onClick={openWizard}>
          <Plus className="h-4 w-4 mr-2" /> New Broadcast
        </Button>
      </div>

      {broadcasts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Megaphone className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No broadcasts yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first broadcast to send emails to an audience.</p>
          <Button className="mt-4" onClick={openWizard}>
            <Plus className="h-4 w-4 mr-2" /> Create Broadcast
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {broadcasts.map((b) => {
            const progress = b.totalRecipients > 0
              ? Math.round(((b.sentCount + b.failedCount) / b.totalRecipients) * 100)
              : 0;

            return (
              <Card key={b.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{b.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[b.status] ?? ""}`}>
                          {b.status}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {b.audienceName} · {b.templateName}
                        {b.subjectOverride && ` · "${b.subjectOverride}"`}
                      </p>
                      {(b.status === "Sending" || b.status === "Completed") && (
                        <div className="mt-2 space-y-1">
                          <Progress value={progress} className="h-1.5" />
                          <p className="text-xs text-muted-foreground">
                            {b.sentCount} sent · {b.failedCount} failed · {b.totalRecipients} total
                          </p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {new Date(b.createdAt).toLocaleDateString()}
                        {b.sentAt && ` · Sent ${new Date(b.sentAt).toLocaleDateString()}`}
                      </p>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {b.status === "Draft" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleSend(b.id)}
                            disabled={sending === b.id}
                          >
                            {sending === b.id
                              ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                              : <Send className="h-4 w-4 mr-1" />
                            }
                            Send
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(b.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {b.status !== "Draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => router.push(`/broadcast/${b.id}`)}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" /> View
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Broadcast</DialogTitle>
            <DialogDescription>
              Step {wizardStep} of 3 — {wizardStep === 1 ? "Name" : wizardStep === 2 ? "Audience & Template" : "Review"}
            </DialogDescription>
          </DialogHeader>

          {loadingOptions ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="py-2 space-y-4">
              {/* Step 1: Name */}
              {wizardStep === 1 && (
                <div className="space-y-2">
                  <Label>Broadcast Name</Label>
                  <Input
                    autoFocus
                    placeholder="e.g. March Newsletter"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
              )}

              {/* Step 2: Audience & Template */}
              {wizardStep === 2 && (
                <>
                  <div className="space-y-2">
                    <Label>Audience</Label>
                    {audiences.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No audiences found. Create one first.</p>
                    ) : (
                      <Select value={form.audienceId} onValueChange={(v) => setForm((f) => ({ ...f, audienceId: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select an audience" />
                        </SelectTrigger>
                        <SelectContent>
                          {audiences.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name} ({a.contactCount} contacts)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Template</Label>
                    {templates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No templates found. Create one first.</p>
                    ) : (
                      <Select value={form.templateId} onValueChange={(v) => setForm((f) => ({ ...f, templateId: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Subject Override <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input
                      placeholder={selectedTemplate?.subjectTemplate ?? "Use template default"}
                      value={form.subjectOverride}
                      onChange={(e) => setForm((f) => ({ ...f, subjectOverride: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {/* Step 3: Review */}
              {wizardStep === 3 && (
                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{form.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Audience</span>
                    <span>{selectedAudience?.name} ({selectedAudience?.contactCount} contacts)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Template</span>
                    <span>{selectedTemplate?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subject</span>
                    <span className="text-right max-w-48 truncate">
                      {form.subjectOverride || selectedTemplate?.subjectTemplate}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2">
            {wizardStep > 1 && (
              <Button variant="outline" onClick={() => setWizardStep((s) => (s - 1) as WizardStep)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
            {wizardStep < 3 ? (
              <Button
                onClick={() => setWizardStep((s) => (s + 1) as WizardStep)}
                disabled={wizardStep === 1 ? !canProceedStep1 : !canProceedStep2}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create Broadcast
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Broadcast</DialogTitle>
            <DialogDescription>This will permanently delete the draft broadcast.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

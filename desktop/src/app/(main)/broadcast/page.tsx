"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, Loader2, Mail,
  Megaphone, MessageCircle, Plus, Send, Trash2,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { audienceApi, broadcastApi, templateApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageActions, useGlobalRefresh } from "../layout";
import { useTableHeight } from "@/hooks/use-table-height";

interface Broadcast {
  id: string;
  name: string;
  status: string;
  channel: string;
  audienceId: string;
  audienceName: string;
  templateId: string;
  templateName: string;
  subjectOverride: string | null;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  openCount?: number;
  totalOpenCount?: number;
  createdAt: string;
  sentAt: string | null;
}

interface Audience {
  id: string;
  name: string;
  contactCount: number;
  type: string;
}

interface Template {
  id: string;
  name: string;
  subjectTemplate: string;
}

const STATUS_VARIANT: Record<string, string> = {
  Draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  Sending: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  Completed: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

type WizardStep = 1 | 2 | 3;

export default function BroadcastPage() {
  const router = useRouter();
  const { containerRef, pageSize } = useTableHeight();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
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
    channel: "email" as "email" | "whatsapp",
    audienceId: "",
    templateId: "",
    subjectOverride: "",
  });

  const loadBroadcasts = useCallback(async () => {
    try {
      const res = await broadcastApi.getAll();
      setBroadcasts(res.data);
    } catch {
      toast.error("Failed to load broadcasts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBroadcasts(); }, [loadBroadcasts]);

  useEffect(() => {
    const hasSending = broadcasts.some((b) => b.status === "Sending");
    if (!hasSending) return;
    const interval = setInterval(loadBroadcasts, 5000);
    return () => clearInterval(interval);
  }, [broadcasts, loadBroadcasts]);

  useGlobalRefresh(loadBroadcasts);

  async function openWizard() {
    setForm({ name: "", channel: "email", audienceId: "", templateId: "", subjectOverride: "" });
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
        channel: form.channel,
      });
      setBroadcasts((prev) => [res.data, ...prev]);
      setWizardOpen(false);
      toast.success("Broadcast created.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to create.";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleSend(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSending(id);
    try {
      const res = await broadcastApi.send(id);
      setBroadcasts((prev) => prev.map((b) => b.id === id ? res.data : b));
      toast.success("Sending!");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to send.";
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
      toast.success("Deleted.");
      setDeleteId(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to delete.";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  const filteredAudiences = audiences.filter((a) => a.type === form.channel);
  const selectedAudience = filteredAudiences.find((a) => a.id === form.audienceId);
  const selectedTemplate = templates.find((t) => t.id === form.templateId);
  const canProceedStep1 = !!form.name.trim();
  const canProceedStep2 = !!form.audienceId && !!form.templateId;

  useEffect(() => {
    if (form.audienceId && !filteredAudiences.some((a) => a.id === form.audienceId)) {
      setForm((current) => ({ ...current, audienceId: "" }));
    }
  }, [filteredAudiences, form.audienceId]);

  // Sort broadcasts: Sending first, then Draft, Completed, Failed
  const STATUS_ORDER: Record<string, number> = { Sending: 0, Draft: 1, Completed: 2, Failed: 3 };
  const sorted = [...broadcasts].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
      <PageActions>
        <Button onClick={openWizard} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Broadcast
        </Button>
      </PageActions>

      {broadcasts.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <Megaphone className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No broadcasts yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first broadcast to get started.</p>
          <Button className="mt-4" onClick={openWizard}>
            <Plus className="h-4 w-4 mr-2" /> Create Broadcast
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((b, idx) => {
                  const openCount = b.openCount ?? 0;
                  const prevStatus = idx > 0 ? paged[idx - 1].status : null;
                  const showGroupHeader = b.status !== prevStatus;
                  return (
                    <>
                    {showGroupHeader && (
                      <TableRow key={`group-${b.status}`} className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={8} className="py-1.5 px-4">
                          <span className={`text-xs font-medium ${STATUS_VARIANT[b.status] ? "" : "text-muted-foreground"}`}>
                            {b.status} ({sorted.filter(s => s.status === b.status).length})
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow
                      key={b.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/broadcast/${b.id}`)}
                    >
                      <TableCell>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[200px]">{b.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {b.audienceName} · {b.templateName}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                          b.channel === "whatsapp"
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        }`}>
                          {b.channel === "whatsapp" ? "WA" : "Email"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_VARIANT[b.status] ?? ""}`}>
                          {b.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.sentCount}/{b.totalRecipients}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {openCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {b.failedCount > 0 ? (
                          <span className="text-red-600 dark:text-red-400">{b.failedCount}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {b.sentAt
                          ? new Date(b.sentAt).toLocaleDateString()
                          : new Date(b.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {b.status === "Draft" && (
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => handleSend(b.id, e)}
                              disabled={sending === b.id}
                            >
                              {sending === b.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Send className="h-3.5 w-3.5" />
                              }
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={(e) => { e.stopPropagation(); setDeleteId(b.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-3 shrink-0">
            <p className="text-xs text-muted-foreground">
              {broadcasts.length} broadcast{broadcasts.length !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={safePage === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                {safePage + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Wizard Dialog */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Broadcast</DialogTitle>
            <DialogDescription>
              Step {wizardStep} of 3 — {wizardStep === 1 ? "Channel & Name" : wizardStep === 2 ? "Audience & Template" : "Review"}
            </DialogDescription>
          </DialogHeader>

          {loadingOptions ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="py-2 space-y-4">
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, channel: "email" }))}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                          form.channel === "email"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/30"
                        }`}
                      >
                        <Mail className="h-6 w-6" />
                        <span className="text-sm font-medium">Email</span>
                        <span className="text-xs text-muted-foreground">Send via Gmail SMTP</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, channel: "whatsapp" }))}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-colors ${
                          form.channel === "whatsapp"
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-muted-foreground/30"
                        }`}
                      >
                        <MessageCircle className="h-6 w-6" />
                        <span className="text-sm font-medium">WhatsApp</span>
                        <span className="text-xs text-muted-foreground">Send via WhatsApp Web</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Broadcast Name</Label>
                    <Input
                      autoFocus
                      placeholder={form.channel === "whatsapp" ? "e.g. WhatsApp Campaign" : "e.g. March Newsletter"}
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <>
                  <div className="space-y-2">
                    <Label>Audience</Label>
                    {filteredAudiences.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No {form.channel === "whatsapp" ? "WhatsApp" : "email"} audiences found. Create one first.
                      </p>
                    ) : (
                      <Select value={form.audienceId} onValueChange={(v) => setForm((f) => ({ ...f, audienceId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select an audience" /></SelectTrigger>
                        <SelectContent>
                          {filteredAudiences.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name} ({a.contactCount} contacts)</SelectItem>
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
                        <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
                        <SelectContent>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {form.channel === "email" && (
                    <div className="space-y-2">
                      <Label>Subject Override <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input
                        placeholder={selectedTemplate?.subjectTemplate ?? "Use template default"}
                        value={form.subjectOverride}
                        onChange={(e) => setForm((f) => ({ ...f, subjectOverride: e.target.value }))}
                      />
                    </div>
                  )}
                </>
              )}

              {wizardStep === 3 && (
                <div className="rounded-lg border p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{form.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Channel</span>
                    <span className="flex items-center gap-1">
                      {form.channel === "whatsapp" ? <MessageCircle className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                      {form.channel === "whatsapp" ? "WhatsApp" : "Email"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Audience</span>
                    <span>{selectedAudience?.name} ({selectedAudience?.contactCount} contacts)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Template</span>
                    <span>{selectedTemplate?.name}</span>
                  </div>
                  {form.channel === "email" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subject</span>
                      <span className="text-right max-w-48 truncate">
                        {form.subjectOverride || selectedTemplate?.subjectTemplate}
                      </span>
                    </div>
                  )}
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

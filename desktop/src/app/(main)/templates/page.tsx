"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, File, LayoutTemplate, Loader2, Paperclip, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { audienceApi, fileApi, templateApi } from "@/lib/api";
import { useTableHeight } from "@/hooks/use-table-height";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UnlayerEditor, type UnlayerEditorHandle, type UnlayerDesign } from "@/components/unlayer-editor";
import { BreadcrumbLabel, PageActions, useGlobalRefresh } from "../layout";

interface Template {
  id: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  createdAt: string;
  updatedAt: string;
  attachmentFileIds?: string[];
}

interface UserFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  usageCount?: number;
  templateNames?: string[];
}

interface Audience {
  id: string;
  name: string;
  contactCount: number;
}

interface MergeTag {
  name: string;
  value: string;
  sample: string;
}

const DEFAULT_MERGE_TAGS: MergeTag[] = [
  { name: "Name", value: "{{name}}", sample: "John Doe" },
  { name: "Email", value: "{{email}}", sample: "user@example.com" },
];

const STORAGE_KEY = (id: string) => `mb_unlayer_${id}`;
const AUDIENCE_COLS_KEY = (id: string) => `mb_audience_cols_${id}`;

function saveDesignLocally(id: string, design: UnlayerDesign) {
  try {
    localStorage.setItem(STORAGE_KEY(id), JSON.stringify(design));
  } catch {
    // localStorage quota or unavailable — non-fatal
  }
}

function loadDesignLocally(id: string): UnlayerDesign | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(id));
    return raw ? (JSON.parse(raw) as UnlayerDesign) : null;
  } catch {
    return null;
  }
}

function loadMergeTagsForAudience(audienceId: string): MergeTag[] | null {
  try {
    const raw = localStorage.getItem(AUDIENCE_COLS_KEY(audienceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MergeTag[]) : null;
  } catch {
    return null;
  }
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ name: "", subjectTemplate: "" });
  const [initialDesign, setInitialDesign] = useState<UnlayerDesign | null>(null);

  // Audiences for merge-tag selector
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [selectedAudienceId, setSelectedAudienceId] = useState<string>("");
  const [activeMergeTags, setActiveMergeTags] = useState<MergeTag[]>(DEFAULT_MERGE_TAGS);

  // Files for attachments
  const [availableFiles, setAvailableFiles] = useState<UserFile[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  const editorRef = useRef<UnlayerEditorHandle>(null);
  const { containerRef, pageSize } = useTableHeight();
  const [tplPage, setTplPage] = useState(0);

  const isNew = editing?.id === "new";

  const loadTemplates = useCallback(async () => {
    try {
      const res = await templateApi.getAll();
      setTemplates(res.data);
    } catch {
      toast.error("Failed to load templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
    loadAudiences();
    loadFiles();
  }, [loadTemplates]);

  useGlobalRefresh(loadTemplates);

  async function loadFiles() {
    try {
      const res = await fileApi.getAll();
      setAvailableFiles(res.data);
    } catch {
      // non-fatal
    }
  }

  async function loadAudiences() {
    try {
      const res = await audienceApi.getAll();
      setAudiences(res.data);
    } catch {
      // non-fatal — merge tag selector will still work with defaults
    }
  }

  function handleAudienceSelect(audienceId: string) {
    setSelectedAudienceId(audienceId);
    if (!audienceId || audienceId === "__none__") {
      setActiveMergeTags(DEFAULT_MERGE_TAGS);
      return;
    }
    const tags = loadMergeTagsForAudience(audienceId);
    if (tags && tags.length > 0) {
      setActiveMergeTags(tags);
    } else {
      setActiveMergeTags(DEFAULT_MERGE_TAGS);
      toast.info("No custom merge tags found for this audience. Using defaults.");
    }
  }

  function openNew() {
    setForm({ name: "", subjectTemplate: "" });
    setInitialDesign(null);
    setSelectedAudienceId("");
    setActiveMergeTags(DEFAULT_MERGE_TAGS);
    setSelectedFileIds([]);
    setEditing({
      id: "new",
      name: "",
      subjectTemplate: "",
      bodyTemplate: "",
      createdAt: "",
      updatedAt: "",
    });
  }

  function openEdit(t: Template) {
    setForm({ name: t.name, subjectTemplate: t.subjectTemplate });
    setInitialDesign(loadDesignLocally(t.id));
    setSelectedAudienceId("");
    setActiveMergeTags(DEFAULT_MERGE_TAGS);
    setSelectedFileIds(t.attachmentFileIds ?? []);
    setEditing(t);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.subjectTemplate.trim()) {
      toast.error("Name and subject are required.");
      return;
    }
    if (!editorRef.current) {
      toast.error("Editor is not ready yet.");
      return;
    }
    setSaving(true);
    try {
      const { html, design } = await editorRef.current.exportHtml();
      const payload = {
        name: form.name.trim(),
        subjectTemplate: form.subjectTemplate.trim(),
        bodyTemplate: html,
        attachmentFileIds: selectedFileIds.length > 0 ? selectedFileIds : undefined,
      };

      if (isNew) {
        const res = await templateApi.create(payload);
        localStorage.removeItem(STORAGE_KEY("new"));
        saveDesignLocally(res.data.id, design);
        setTemplates((prev) => [res.data, ...prev]);
        toast.success("Template created.");
      } else if (editing) {
        const res = await templateApi.update(editing.id, payload);
        saveDesignLocally(editing.id, design);
        setTemplates((prev) =>
          prev.map((t) => (t.id === editing.id ? res.data : t))
        );
        toast.success("Template updated.");
      }
      setEditing(null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Failed to save template.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await templateApi.delete(deleteId);
      localStorage.removeItem(STORAGE_KEY(deleteId));
      setTemplates((prev) => prev.filter((t) => t.id !== deleteId));
      toast.success("Template deleted.");
      setDeleteId(null);
    } catch {
      toast.error("Failed to delete template.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ===== Editor View =====
  if (editing) {
    return (
      <div className="flex flex-col h-full gap-4">
        <BreadcrumbLabel>{isNew ? "New Template" : editing.name}</BreadcrumbLabel>
        <PageActions>
          <Button size="sm" type="submit" disabled={saving} form="template-form">
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {isNew ? "Create" : "Save"}
          </Button>
          <Button size="sm" variant="outline" type="button" onClick={() => setEditing(null)}>
            Cancel
          </Button>
        </PageActions>

        <form id="template-form" onSubmit={handleSave} className="flex flex-col flex-1 min-h-0 gap-4">
          {/* Name + Subject row */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                placeholder="e.g. Welcome Email"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                placeholder="e.g. Welcome, {{name}}!"
                value={form.subjectTemplate}
                onChange={(e) => setForm((f) => ({ ...f, subjectTemplate: e.target.value }))}
              />
            </div>
          </div>

          {/* Merge Tags section */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <Tags className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Merge Tags</span>
              <span className="text-xs text-muted-foreground">
                Pick an audience to load its merge tags into the editor
              </span>
            </div>

            <div className="flex items-start gap-4 flex-wrap">
              {/* Audience selector */}
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap text-muted-foreground shrink-0">
                  Audience:
                </Label>
                <Select
                  value={selectedAudienceId || "__none__"}
                  onValueChange={(v) =>
                    handleAudienceSelect(v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger className="h-8 text-xs w-52">
                    <SelectValue placeholder="Default tags only" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Default tags only</SelectItem>
                    {audiences.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        <span>{a.name}</span>
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({a.contactCount})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Active merge tag pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {activeMergeTags.map((tag) => (
                  <Badge
                    key={tag.value}
                    variant="secondary"
                    className="font-mono text-xs cursor-default"
                    title={`Sample: ${tag.sample}`}
                  >
                    {tag.value}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Attachments</span>
              <span className="text-xs text-muted-foreground">
                Select files to attach when sending emails with this template
              </span>
            </div>
            {availableFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No files uploaded. Go to Files to upload.</p>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {availableFiles.map((f) => {
                  const isSelected = selectedFileIds.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFileIds((prev) =>
                        isSelected ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                      )}
                      className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40"
                      }`}
                      title={f.usageCount ? `Already used in ${f.usageCount} template${f.usageCount === 1 ? "" : "s"}.` : "Not used in other templates yet."}
                    >
                      <File className="h-3 w-3" />
                      {f.originalName}
                      {isSelected && <X className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Drag-and-drop email editor */}
          <div>
            <UnlayerEditor
              key={editing.id}
              ref={editorRef}
              initialDesign={initialDesign}
              mergeTags={activeMergeTags}
            />
          </div>
        </form>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(templates.length / pageSize));
  const pagedTemplates = templates.slice(tplPage * pageSize, (tplPage + 1) * pageSize);

  // ===== Template List View =====
  return (
    <div ref={containerRef} className="flex flex-col flex-1 min-h-0">
      <PageActions>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Template
        </Button>
      </PageActions>

      {templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <LayoutTemplate className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No templates yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create a template to start sending broadcasts.
          </p>
          <Button className="mt-4" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" /> Create Template
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-md border flex-1 min-h-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Subject</th>
                  <th className="text-left px-4 py-2 font-medium">Updated</th>
                  <th className="text-right px-4 py-2 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedTemplates.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => openEdit(t)}
                  >
                    <td className="px-4 py-2 font-medium">{t.name}</td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-xs">{t.subjectTemplate}</td>
                    <td className="px-4 py-2 text-muted-foreground">{new Date(t.updatedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-3">
            <span className="text-xs text-muted-foreground">{templates.length} template{templates.length !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={tplPage === 0} onClick={() => setTplPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs">{tplPage + 1} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={tplPage >= totalPages - 1} onClick={() => setTplPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              This template will be permanently deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
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

"use client";

import { useEffect, useRef, useState, useCallback, DragEvent } from "react";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, File, FolderOpen, Loader2, Plus, Trash2, Upload,
} from "lucide-react";

import { fileApi } from "@/lib/api";
import { useTableHeight } from "@/hooks/use-table-height";
import { PageActions, useGlobalRefresh } from "../layout";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface UserFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  usageCount: number;
  templateNames?: string[];
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const { containerRef, pageSize } = useTableHeight();
  const [files, setFiles] = useState<UserFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    try {
      const res = await fileApi.getAll();
      setFiles(res.data);
    } catch {
      toast.error("Failed to load files.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);
  useGlobalRefresh(loadFiles);

  async function handleUpload(file: globalThis.File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10 MB limit.");
      return;
    }
    setUploading(true);
    try {
      const res = await fileApi.upload(file);
      setFiles((prev) => [res.data, ...prev]);
      toast.success(`Uploaded "${file.name}"`);
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await fileApi.delete(deleteId);
      setFiles((prev) => prev.filter((f) => f.id !== deleteId));
      toast.success("File deleted.");
      setDeleteId(null);
    } catch {
      toast.error("Failed to delete file.");
    } finally {
      setDeleting(false);
    }
  }

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Math.ceil(files.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paged = files.slice(safePage * pageSize, (safePage + 1) * pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col flex-1 min-h-0"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-10 w-10" />
            <p className="text-lg font-semibold">Drop file here</p>
            <p className="text-sm text-muted-foreground">Max 10 MB per file</p>
          </div>
        </div>
      )}

      <PageActions>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
          Upload
        </Button>
      </PageActions>

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No files yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Upload files to use as email attachments in templates.
          </p>
          <Button className="mt-4" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> Upload File
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Used In</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <File className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate max-w-[250px]">{f.originalName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{f.mimeType}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {f.usageCount > 0 ? (
                        <span title={f.templateNames?.join(", ")}>
                          {f.usageCount} template{f.usageCount === 1 ? "" : "s"}
                        </span>
                      ) : (
                        "Not attached"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatSize(f.size)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(f.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteId(f.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between pt-3 shrink-0">
            <p className="text-xs text-muted-foreground">{files.length} file{files.length !== 1 ? "s" : ""}</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground px-2">{safePage + 1} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground select-none mt-3">
            <Upload className="h-3.5 w-3.5 shrink-0" />
            Drag and drop files anywhere on this page to upload
          </div>
        </>
      )}

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
            <DialogDescription>
              This file will be permanently deleted. If it is attached to any template, it will be removed from those templates automatically.
            </DialogDescription>
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

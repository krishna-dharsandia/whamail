"use client";

import { useEffect, useRef, useState, useCallback, DragEvent } from "react";
import { toast } from "sonner";
import { Info, Loader2, Plus, Trash2, Upload, Users, X, ChevronRight, ChevronLeft } from "lucide-react";

import { audienceApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Audience {
  id: string;
  name: string;
  contactCount: number;
  createdAt: string;
}

interface Contact {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

/** A single parsed CSV row — all original columns preserved */
type CsvDataRow = Record<string, string>;

/** Describes what a column maps to in our system */
type ColumnRole = "email" | "name" | "custom" | "skip";

interface ColumnMapping {
  /** Original header from CSV */
  header: string;
  /** What role this column plays */
  role: ColumnRole;
  /** Variable name used for merge tags (relevant when role === "custom") */
  variableName: string;
  /** Sample value from first data row */
  sample: string;
}

interface MergeTag {
  name: string;
  value: string;
  sample: string;
}

// ─────────────────────────────────────────────
// CSV parsing helpers
// ─────────────────────────────────────────────

/** Parse a CSV line respecting double-quoted fields that may contain commas */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/** Parse full CSV text into headers + rows */
function parseCsvFull(text: string): { headers: string[]; rows: CsvDataRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]);

  const rows: CsvDataRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(line);
    const row: CsvDataRow = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

/** Case-insensitive match for "email" column */
function detectEmailHeader(headers: string[]): string | null {
  const patterns = ["email", "e-mail", "email address", "emailaddress", "e mail", "email_address"];
  for (const h of headers) {
    if (patterns.includes(h.toLowerCase().trim())) return h;
  }
  return null;
}

/** Case-insensitive match for "name" column */
function detectNameHeader(headers: string[]): string | null {
  const patterns = [
    "name", "full name", "fullname", "contact name", "first name",
    "firstname", "full_name", "contact_name", "first_name",
  ];
  for (const h of headers) {
    if (patterns.includes(h.toLowerCase().trim())) return h;
  }
  return null;
}

/** Convert a column header to a safe variable name */
function headerToVariableName(header: string): string {
  return (
    header
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_") || "field"
  );
}

/** Validate email */
function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Build initial column mappings from parsed headers */
function buildInitialMappings(headers: string[], firstRow: CsvDataRow | undefined): ColumnMapping[] {
  const emailHeader = detectEmailHeader(headers);
  const nameHeader = detectNameHeader(headers);

  return headers.map((header, idx) => {
    let role: ColumnRole = "custom";
    if (header === emailHeader) role = "email";
    else if (header === nameHeader) role = "name";
    // If no email header detected, use first column as email
    else if (!emailHeader && idx === 0) role = "email";

    return {
      header,
      role,
      variableName: headerToVariableName(header),
      sample: firstRow?.[header] ?? "",
    };
  });
}

/** Rebuild CSV file from mapped data rows, skipping "skip" columns */
function buildCsvFile(rows: CsvDataRow[], mappings: ColumnMapping[]): File {
  const emailCol = mappings.find((m) => m.role === "email");
  const nameCol = mappings.find((m) => m.role === "name");
  const customCols = mappings.filter((m) => m.role === "custom");

  const outputCols: Array<{ header: string; outName: string }> = [];
  if (emailCol) outputCols.push({ header: emailCol.header, outName: "email" });
  if (nameCol) outputCols.push({ header: nameCol.header, outName: "name" });
  customCols.forEach((m) => outputCols.push({ header: m.header, outName: m.variableName }));

  const headerLine = outputCols.map((c) => c.outName).join(",");
  const dataLines = rows.map((row) =>
    outputCols
      .map((c) => {
        const val = row[c.header] ?? "";
        return val.includes(",") || val.includes('"')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      })
      .join(",")
  );

  const content = [headerLine, ...dataLines].join("\n");
  return new File([content], "contacts.csv", { type: "text/csv" });
}

/** Save audience merge tags to localStorage */
function saveMergeTagsForAudience(audienceId: string, mappings: ColumnMapping[]) {
  try {
    const tags: MergeTag[] = [];

    const emailMap = mappings.find((m) => m.role === "email");
    const nameMap = mappings.find((m) => m.role === "name");

    tags.push({
      name: "Email",
      value: "{{email}}",
      sample: emailMap?.sample || "user@example.com",
    });
    if (nameMap) {
      tags.push({
        name: "Name",
        value: "{{name}}",
        sample: nameMap.sample || "John Doe",
      });
    }

    mappings
      .filter((m) => m.role === "custom")
      .forEach((m) => {
        tags.push({
          name: m.variableName
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          value: `{{${m.variableName}}}`,
          sample: m.sample || m.variableName,
        });
      });

    localStorage.setItem(`mb_audience_cols_${audienceId}`, JSON.stringify(tags));
  } catch {
    // non-fatal
  }
}

// ─────────────────────────────────────────────
// Column Mapping Step
// ─────────────────────────────────────────────

interface ColumnMappingStepProps {
  mappings: ColumnMapping[];
  onChange: (mappings: ColumnMapping[]) => void;
  onNext: () => void;
  onCancel: () => void;
}

function ColumnMappingStep({ mappings, onChange, onNext, onCancel }: ColumnMappingStepProps) {
  const hasEmail = mappings.some((m) => m.role === "email");

  function updateRole(idx: number, role: ColumnRole) {
    const next = mappings.map((m, i) => {
      if (i !== idx) {
        // Demote conflicting exclusive role
        if ((role === "email" || role === "name") && m.role === role) {
          return { ...m, role: "custom" as ColumnRole };
        }
        return m;
      }
      return { ...m, role };
    });
    onChange(next);
  }

  function updateVariableName(idx: number, variableName: string) {
    onChange(mappings.map((m, i) => (i === idx ? { ...m, variableName } : m)));
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Map your CSV columns to the correct fields. Columns set to{" "}
        <span className="font-medium text-foreground">Custom Field</span> become merge tags like{" "}
        <code className="bg-muted px-1 rounded text-xs">{"{{variable}}"}</code>.
      </p>

      <div className="overflow-auto rounded-md border max-h-[380px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[180px]">Column</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[185px]">Maps To</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground w-[175px]">Variable Name</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Sample Value</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m, idx) => (
              <tr key={idx} className="border-t hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2">
                  <Badge
                    variant="secondary"
                    className="font-mono text-xs max-w-[160px] truncate block"
                    title={m.header}
                  >
                    {m.header}
                  </Badge>
                </td>

                <td className="px-3 py-2">
                  <Select value={m.role} onValueChange={(v) => updateRole(idx, v as ColumnRole)}>
                    <SelectTrigger className="h-7 text-xs w-[165px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                          Email (required)
                        </span>
                      </SelectItem>
                      <SelectItem value="name">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          Name
                        </span>
                      </SelectItem>
                      <SelectItem value="custom">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
                          Custom Field
                        </span>
                      </SelectItem>
                      <SelectItem value="skip">
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block opacity-50" />
                          Skip
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </td>

                <td className="px-3 py-2">
                  {m.role === "custom" ? (
                    <div className="flex items-center gap-0.5">
                      <span className="text-xs text-muted-foreground select-none">&#123;&#123;</span>
                      <Input
                        className="h-7 text-xs w-[110px] font-mono"
                        value={m.variableName}
                        onChange={(e) =>
                          updateVariableName(
                            idx,
                            e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")
                          )
                        }
                      />
                      <span className="text-xs text-muted-foreground select-none">&#125;&#125;</span>
                    </div>
                  ) : m.role === "email" ? (
                    <code className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded">
                      {"{{email}}"}
                    </code>
                  ) : m.role === "name" ? (
                    <code className="text-xs text-green-600 bg-green-50 dark:bg-green-950/50 px-1.5 py-0.5 rounded">
                      {"{{name}}"}
                    </code>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">—</span>
                  )}
                </td>

                <td className="px-3 py-2">
                  <span
                    className="text-xs text-muted-foreground truncate max-w-[180px] block"
                    title={m.sample}
                  >
                    {m.sample || <em>empty</em>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!hasEmail && (
        <p className="text-xs text-destructive flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0" />
          You must map at least one column to <strong>Email (required)</strong>.
        </p>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={!hasEmail} onClick={onNext}>
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Spreadsheet Editor Step
// ─────────────────────────────────────────────

interface SpreadsheetEditorProps {
  rows: CsvDataRow[];
  mappings: ColumnMapping[];
  onChange: (rows: CsvDataRow[]) => void;
  onBack: () => void;
  onImport: () => void;
  importing: boolean;
}

function SpreadsheetEditor({
  rows,
  mappings,
  onChange,
  onBack,
  onImport,
  importing,
}: SpreadsheetEditorProps) {
  const visibleMappings = mappings.filter((m) => m.role !== "skip");
  const emailMapping = mappings.find((m) => m.role === "email");

  const validCount = rows.filter((row) => {
    const email = emailMapping ? (row[emailMapping.header] ?? "") : "";
    return isValidEmail(email);
  }).length;
  const invalidCount = rows.length - validCount;

  function updateCell(rowIdx: number, header: string, value: string) {
    onChange(rows.map((row, i) => (i === rowIdx ? { ...row, [header]: value } : row)));
  }

  function deleteRow(rowIdx: number) {
    onChange(rows.filter((_, i) => i !== rowIdx));
  }

  function addRow() {
    const emptyRow: CsvDataRow = {};
    mappings.forEach((m) => {
      emptyRow[m.header] = "";
    });
    onChange([...rows, emptyRow]);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Summary banner */}
      <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">
            {validCount} valid contact{validCount !== 1 ? "s" : ""}
          </span>{" "}
          will be imported.
          {invalidCount > 0 && (
            <>
              {" "}
              <span className="text-destructive font-medium">
                {invalidCount} row{invalidCount !== 1 ? "s" : ""} highlighted in red
              </span>{" "}
              have invalid emails and will be skipped — fix them to include those contacts.
            </>
          )}
        </span>
      </div>

      {/* Spreadsheet */}
      <div className="overflow-auto rounded-md border max-h-[400px] w-full">
        <table
          className="text-sm border-collapse"
          style={{ minWidth: `${visibleMappings.length * 150 + 80}px`, width: "100%" }}
        >
          <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-muted/90 w-9 min-w-[36px] text-center px-1 py-1.5 border-r text-xs font-medium text-muted-foreground">
                #
              </th>
              {visibleMappings.map((m) => (
                <th
                  key={m.header}
                  className="px-1.5 py-1.5 text-left font-medium text-xs text-muted-foreground whitespace-nowrap border-r last:border-r-0 min-w-[130px]"
                >
                  <div className="flex items-center gap-1 flex-wrap">
                    <span>{m.header}</span>
                    {m.role === "email" && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block shrink-0"
                        title="Email column"
                      />
                    )}
                    {m.role === "name" && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block shrink-0"
                        title="Name column"
                      />
                    )}
                    {m.role === "custom" && (
                      <code className="text-[10px] text-purple-500 leading-none">
                        {`{{${m.variableName}}}`}
                      </code>
                    )}
                  </div>
                </th>
              ))}
              <th className="sticky right-0 z-20 bg-muted/90 w-9 min-w-[36px] px-1 py-1.5 border-l" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const emailVal = emailMapping ? (row[emailMapping.header] ?? "") : "";
              const isInvalid = !isValidEmail(emailVal);
              return (
                <tr
                  key={rowIdx}
                  className={isInvalid ? "bg-destructive/5" : "hover:bg-muted/20"}
                >
                  <td
                    className={`sticky left-0 z-10 text-center text-xs text-muted-foreground px-1 py-0.5 border-r ${
                      isInvalid ? "bg-destructive/10" : "bg-background"
                    }`}
                  >
                    {rowIdx + 1}
                  </td>

                  {visibleMappings.map((m) => {
                    const isEmailCell = m.role === "email";
                    const cellInvalid = isEmailCell && isInvalid;
                    return (
                      <td key={m.header} className="px-1 py-0.5 border-r last:border-r-0">
                        <Input
                          className={`h-7 text-xs border-0 shadow-none focus-visible:ring-1 focus-visible:ring-offset-0 ${
                            cellInvalid
                              ? "bg-destructive/10 text-destructive placeholder:text-destructive/50 focus-visible:ring-destructive"
                              : "bg-transparent"
                          }`}
                          value={row[m.header] ?? ""}
                          onChange={(e) => updateCell(rowIdx, m.header, e.target.value)}
                        />
                      </td>
                    );
                  })}

                  <td
                    className={`sticky right-0 z-10 px-1 py-0.5 border-l ${
                      isInvalid ? "bg-destructive/10" : "bg-background"
                    }`}
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteRow(rowIdx)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Button type="button" variant="outline" size="sm" className="self-start" onClick={addRow}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Add Row
      </Button>

      <div className="flex gap-2 justify-between pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={importing || validCount === 0}
          onClick={onImport}
        >
          {importing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Import {validCount} Contact{validCount !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────

export default function AudiencePage() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);

  // Audience create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete audience dialog
  const [deleteAudienceId, setDeleteAudienceId] = useState<string | null>(null);
  const [deletingAudience, setDeletingAudience] = useState(false);

  // Detail view
  const [activeAudience, setActiveAudience] = useState<Audience | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  // Add single contact
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState({ email: "", name: "" });
  const [addingContact, setAddingContact] = useState(false);

  // Delete contact
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);

  // CSV import wizard: "closed" | "mapping" | "editing"
  const [csvDialogState, setCsvDialogState] = useState<"closed" | "mapping" | "editing">("closed");
  const [csvRows, setCsvRows] = useState<CsvDataRow[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [importing, setImporting] = useState(false);

  // Drag and drop
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAudiences();
  }, []);

  async function loadAudiences() {
    try {
      const res = await audienceApi.getAll();
      setAudiences(res.data);
    } catch {
      toast.error("Failed to load audiences.");
    } finally {
      setLoading(false);
    }
  }

  async function openAudience(audience: Audience) {
    setActiveAudience(audience);
    setContactsLoading(true);
    try {
      const res = await audienceApi.getContacts(audience.id);
      setContacts(res.data);
    } catch {
      toast.error("Failed to load contacts.");
    } finally {
      setContactsLoading(false);
    }
  }

  async function handleCreateAudience(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await audienceApi.create(newName.trim());
      setAudiences((prev) => [res.data, ...prev]);
      toast.success("Audience created.");
      setCreateOpen(false);
      setNewName("");
    } catch {
      toast.error("Failed to create audience.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteAudience() {
    if (!deleteAudienceId) return;
    setDeletingAudience(true);
    try {
      await audienceApi.delete(deleteAudienceId);
      try { localStorage.removeItem(`mb_audience_cols_${deleteAudienceId}`); } catch {}
      setAudiences((prev) => prev.filter((a) => a.id !== deleteAudienceId));
      if (activeAudience?.id === deleteAudienceId) setActiveAudience(null);
      toast.success("Audience deleted.");
      setDeleteAudienceId(null);
    } catch {
      toast.error("Failed to delete audience.");
    } finally {
      setDeletingAudience(false);
    }
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    if (!activeAudience) return;
    if (!isValidEmail(contactForm.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    setAddingContact(true);
    try {
      const res = await audienceApi.addContact(activeAudience.id, {
        email: contactForm.email.trim(),
        name: contactForm.name.trim() || undefined,
      });
      setContacts((prev) => [res.data, ...prev]);
      setActiveAudience((a) => (a ? { ...a, contactCount: a.contactCount + 1 } : a));
      setAudiences((prev) =>
        prev.map((a) =>
          a.id === activeAudience.id ? { ...a, contactCount: a.contactCount + 1 } : a
        )
      );
      toast.success("Contact added.");
      setAddContactOpen(false);
      setContactForm({ email: "", name: "" });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Failed to add contact.";
      toast.error(msg);
    } finally {
      setAddingContact(false);
    }
  }

  async function handleDeleteContact() {
    if (!activeAudience || !deleteContactId) return;
    setDeletingContact(true);
    try {
      await audienceApi.deleteContact(activeAudience.id, deleteContactId);
      setContacts((prev) => prev.filter((c) => c.id !== deleteContactId));
      setActiveAudience((a) =>
        a ? { ...a, contactCount: Math.max(0, a.contactCount - 1) } : a
      );
      setAudiences((prev) =>
        prev.map((a) =>
          a.id === activeAudience.id
            ? { ...a, contactCount: Math.max(0, a.contactCount - 1) }
            : a
        )
      );
      toast.success("Contact removed.");
      setDeleteContactId(null);
    } catch {
      toast.error("Failed to delete contact.");
    } finally {
      setDeletingContact(false);
    }
  }

  // ── CSV file processing ──

  function processCsvFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      toast.error("Please upload a CSV file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCsvFull(text);
      if (headers.length === 0 || rows.length === 0) {
        toast.error("The CSV file appears to be empty or has no data rows.");
        return;
      }
      setCsvRows(rows);
      setColumnMappings(buildInitialMappings(headers, rows[0]));
      setCsvDialogState("mapping");
    };
    reader.onerror = () => toast.error("Failed to read file.");
    reader.readAsText(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processCsvFile(file);
    e.target.value = "";
  }

  // ── Drag and drop ──

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      const file = e.dataTransfer.files?.[0];
      if (file) processCsvFile(file);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function handleImport() {
    if (!activeAudience) return;

    const emailMapping = columnMappings.find((m) => m.role === "email");
    if (!emailMapping) {
      toast.error("No email column mapped.");
      return;
    }

    const validRows = csvRows.filter((row) => isValidEmail(row[emailMapping.header] ?? ""));
    if (validRows.length === 0) {
      toast.error("No valid email addresses found.");
      return;
    }

    setImporting(true);
    try {
      const file = buildCsvFile(validRows, columnMappings);
      await audienceApi.uploadCsv(activeAudience.id, file);

      // Persist merge tags for this audience
      saveMergeTagsForAudience(activeAudience.id, columnMappings);

      // Refresh contacts list
      const contactsRes = await audienceApi.getContacts(activeAudience.id);
      setContacts(contactsRes.data);

      // Refresh audience count
      const allRes = await audienceApi.getAll();
      setAudiences(allRes.data);
      const updated = (allRes.data as Audience[]).find((a) => a.id === activeAudience.id);
      if (updated) setActiveAudience(updated);

      toast.success(
        `Imported ${validRows.length} contact${validRows.length !== 1 ? "s" : ""} successfully.`
      );
      setCsvDialogState("closed");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Import failed.";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  }

  // ─────────────────────────────────────────────
  // Loading state
  // ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Audience detail view
  // ─────────────────────────────────────────────

  if (activeAudience) {
    return (
      <div
        className="relative flex flex-col gap-4"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Full-screen drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Upload className="h-10 w-10" />
              <p className="text-lg font-semibold">Drop CSV file here</p>
              <p className="text-sm text-muted-foreground">Release to import contacts</p>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold truncate">{activeAudience.name}</h1>
            <p className="text-sm text-muted-foreground">
              {activeAudience.contactCount} contact
              {activeAudience.contactCount !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileInput}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
            <Button size="sm" onClick={() => setAddContactOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Contact
            </Button>
          </div>
        </div>

        {/* Drag hint */}
        <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 px-3 py-2 text-xs text-muted-foreground select-none">
          <Upload className="h-3.5 w-3.5 shrink-0" />
          Drag and drop a CSV file anywhere on this page to import contacts
        </div>

        {/* Contacts */}
        {contactsLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Users className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium">No contacts yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add contacts manually or import a CSV file.
            </p>
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.email}</TableCell>
                    <TableCell className="text-muted-foreground">{c.name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteContactId(c.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Add Contact Dialog */}
        <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Contact</DialogTitle>
              <DialogDescription>
                Add a single contact to {activeAudience.name}.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddContact}>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    placeholder="contact@example.com"
                    value={contactForm.email}
                    onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    placeholder="Jane Doe"
                    value={contactForm.name}
                    onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAddContactOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addingContact}>
                  {addingContact && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Add Contact
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Contact Dialog */}
        <Dialog open={!!deleteContactId} onOpenChange={() => setDeleteContactId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Contact</DialogTitle>
              <DialogDescription>
                This contact will be removed from the audience. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteContactId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteContact}
                disabled={deletingContact}
              >
                {deletingContact && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CSV Import Wizard Dialog */}
        <Dialog
          open={csvDialogState !== "closed"}
          onOpenChange={(open) => {
            if (!open && !importing) setCsvDialogState("closed");
          }}
        >
          <DialogContent className="!max-w-[92vw] w-[92vw]">
            <DialogHeader>
              <DialogTitle>
                {csvDialogState === "mapping" ? "Map CSV Columns" : "Review & Edit Contacts"}
              </DialogTitle>
              <DialogDescription>
                {csvDialogState === "mapping"
                  ? `Found ${columnMappings.length} column${columnMappings.length !== 1 ? "s" : ""} and ${csvRows.length} row${csvRows.length !== 1 ? "s" : ""}. Set how each column should be used.`
                  : `Review and edit the data before importing into "${activeAudience.name}".`}
              </DialogDescription>
            </DialogHeader>

            {/* Step indicator */}
            <div className="flex items-center gap-2 pb-1">
              <div
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  csvDialogState === "mapping" ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    csvDialogState === "mapping"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  1
                </span>
                Map Columns
              </div>
              <div className="h-px w-8 bg-border" />
              <div
                className={`flex items-center gap-1.5 text-xs font-medium ${
                  csvDialogState === "editing" ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    csvDialogState === "editing"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  2
                </span>
                Review &amp; Import
              </div>
            </div>

            {csvDialogState === "mapping" && (
              <ColumnMappingStep
                mappings={columnMappings}
                onChange={setColumnMappings}
                onNext={() => setCsvDialogState("editing")}
                onCancel={() => setCsvDialogState("closed")}
              />
            )}

            {csvDialogState === "editing" && (
              <SpreadsheetEditor
                rows={csvRows}
                mappings={columnMappings}
                onChange={setCsvRows}
                onBack={() => setCsvDialogState("mapping")}
                onImport={handleImport}
                importing={importing}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Audience list view
  // ─────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Audiences</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your contact lists and import contacts via CSV.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Audience
        </Button>
      </div>

      {audiences.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Users className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="font-medium">No audiences yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create an audience to start managing your contacts.
          </p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create Audience
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {audiences.map((a) => (
            <Card
              key={a.id}
              className="flex flex-col cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => openAudience(a)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-medium leading-snug">{a.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteAudienceId(a.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  {a.contactCount} contact{a.contactCount !== 1 ? "s" : ""}
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Created {new Date(a.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Audience Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Audience</DialogTitle>
            <DialogDescription>Give your audience a name to get started.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateAudience}>
            <div className="space-y-2 py-2">
              <Label>Audience Name</Label>
              <Input
                placeholder="e.g. Newsletter Subscribers"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !newName.trim()}>
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Audience Dialog */}
      <Dialog open={!!deleteAudienceId} onOpenChange={() => setDeleteAudienceId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Audience</DialogTitle>
            <DialogDescription>
              This audience and all its contacts will be permanently deleted. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteAudienceId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAudience}
              disabled={deletingAudience}
            >
              {deletingAudience && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Mail, Save, Trash2, Wifi } from "lucide-react";

import { credentialApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface Credential {
  id: string;
  gmailAddress: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  createdAt: string;
}

export default function SettingsPage() {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showTestForm, setShowTestForm] = useState(false);

  const [form, setForm] = useState({
    gmailAddress: "",
    appPassword: "",
    displayName: "",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
  });

  useEffect(() => {
    loadCredential();
  }, []);

  async function loadCredential() {
    try {
      const res = await credentialApi.get();
      setCredential(res.data);
      setForm((f) => ({ ...f, gmailAddress: res.data.gmailAddress, displayName: res.data.displayName, smtpHost: res.data.smtpHost, smtpPort: res.data.smtpPort }));
    } catch {
      // 404 = no credentials yet
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.gmailAddress || !form.appPassword) {
      toast.error("Gmail address and app password are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await credentialApi.save(form);
      setCredential(res.data);
      setForm((f) => ({ ...f, appPassword: "" }));
      toast.success("Gmail settings saved successfully.");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Failed to save settings.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testEmail) return;
    setTesting(true);
    try {
      await credentialApi.test(testEmail);
      toast.success(`Test email sent to ${testEmail}`);
      setShowTestForm(false);
      setTestEmail("");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Connection test failed.";
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Remove Gmail credentials? You won't be able to send emails until you reconfigure.")) return;
    setDeleting(true);
    try {
      await credentialApi.delete();
      setCredential(null);
      setForm({ gmailAddress: "", appPassword: "", displayName: "", smtpHost: "smtp.gmail.com", smtpPort: 587 });
      toast.success("Credentials removed.");
    } catch {
      toast.error("Failed to remove credentials.");
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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Configure your Gmail sending credentials.</p>
      </div>

      {credential ? (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
            <Wifi className="h-4 w-4" />
            <span>Connected as <strong>{credential.gmailAddress}</strong></span>
          </div>
          <Badge variant="outline" className="text-green-700 border-green-300 dark:text-green-300">Active</Badge>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <Mail className="h-4 w-4" />
          <span>No Gmail credentials configured. Add your Gmail app password to start sending.</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gmail Configuration</CardTitle>
          <CardDescription>
            Use a Gmail App Password — not your regular password.{" "}
            <a
              href="https://support.google.com/accounts/answer/185833"
              target="_blank"
              rel="noreferrer"
              className="underline hover:no-underline"
            >
              How to create one
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gmailAddress">Gmail Address</Label>
              <Input
                id="gmailAddress"
                type="email"
                placeholder="you@gmail.com"
                value={form.gmailAddress}
                onChange={(e) => setForm((f) => ({ ...f, gmailAddress: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="appPassword">App Password</Label>
              <div className="relative">
                <Input
                  id="appPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder={credential ? "Enter new password to update" : "xxxx xxxx xxxx xxxx"}
                  value={form.appPassword}
                  onChange={(e) => setForm((f) => ({ ...f, appPassword: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Stored encrypted. Never shared or logged.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <div className="relative">
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Whamail"
                  value={form.displayName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                  className="pr-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This name will appear as the sender in emails.
              </p>
            </div>


            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtpHost">SMTP Host</Label>
                <Input
                  id="smtpHost"
                  value={form.smtpHost}
                  onChange={(e) => setForm((f) => ({ ...f, smtpHost: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPort">SMTP Port</Label>
                <Input
                  id="smtpPort"
                  type="number"
                  value={form.smtpPort}
                  onChange={(e) => setForm((f) => ({ ...f, smtpPort: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {credential ? "Update" : "Save"} Settings
              </Button>
              {credential && (
                <Button type="button" variant="outline" onClick={() => setShowTestForm((v) => !v)}>
                  <Wifi className="h-4 w-4 mr-2" />
                  Test Connection
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {showTestForm && credential && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send Test Email</CardTitle>
            <CardDescription>Verify your configuration sends a real email.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTest} className="flex gap-2">
              <Input
                type="email"
                placeholder="recipient@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={testing}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Test"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {credential && (
        <>
          <Separator />
          <div>
            <h2 className="text-sm font-medium text-destructive mb-2">Danger Zone</h2>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Remove Gmail Credentials
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

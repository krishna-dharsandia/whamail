"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, QrCode, Phone, Send, CheckCircle2, XCircle, Wifi, WifiOff, User, Monitor } from "lucide-react";
import { useWhatsApp, type WhatsAppStatus } from "@/hooks/use-whatsapp";
import { SendRunCard } from "@/components/whatsapp/send-run-card";
import { SendingSettingsCard } from "@/components/whatsapp/sending-settings-card";
import { PageActions } from "../layout";
import { sounds } from "@/lib/sounds";
import { toast } from "sonner";

const STATUS_CONFIG: Record<WhatsAppStatus, { label: string; icon: typeof Wifi; color: string; busy?: boolean }> = {
  disconnected: { label: "Disconnected", icon: WifiOff, color: "bg-red-500" },
  initializing: { label: "Starting", icon: Loader2, color: "bg-blue-500", busy: true },
  qr: { label: "Scan QR code", icon: QrCode, color: "bg-yellow-500" },
  authenticated: { label: "Loading session", icon: Loader2, color: "bg-blue-500", busy: true },
  ready: { label: "Connected", icon: CheckCircle2, color: "bg-green-500" },
  error: { label: "Error", icon: XCircle, color: "bg-red-500" },
};

interface NumberCheck {
  registered: boolean;
  phone?: string;
  error?: string;
}

export default function WhatsAppPage() {
  const {
    status,
    qrCode,
    info,
    detail,
    hasSavedSession,
    run,
    isElectron,
    connect,
    disconnect,
    resetSession,
    sendMessage,
    checkNumber,
    startRun,
    stopRun,
  } = useWhatsApp();

  const fieldId = useId();
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [numberCheck, setNumberCheck] = useState<NumberCheck | null>(null);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const handleConnect = useCallback(async () => {
    sounds.click();
    setConnecting(true);
    const result = await connect();
    setConnecting(false);
    if (!result.success && result.error) {
      sounds.error();
      toast.error(result.error);
    }
  }, [connect]);

  const handleDisconnect = useCallback(async () => {
    sounds.click();
    await disconnect();
    toast.info("WhatsApp disconnected.");
  }, [disconnect]);

  const handleUnlink = useCallback(async () => {
    setUnlinking(true);
    const result = await resetSession();
    setUnlinking(false);
    setUnlinkOpen(false);
    if (result.success) toast.info("This device was unlinked from WhatsApp.");
    else toast.error(result.error || "Could not unlink this device.");
  }, [resetSession]);

  const handleSendTest = useCallback(async () => {
    if (!testPhone || !testMessage) return;
    setSending(true);
    sounds.send();
    const result = await sendMessage(testPhone, testMessage);
    setSending(false);
    if (result.success) {
      sounds.success();
      toast.success("Test message sent.");
      setTestPhone("");
      setTestMessage("");
      setNumberCheck(null);
    } else {
      sounds.error();
      toast.error(result.error || "The test message could not be sent.");
    }
  }, [testPhone, testMessage, sendMessage]);

  const handleCheckNumber = useCallback(async () => {
    if (!testPhone) return;
    setChecking(true);
    const result = await checkNumber(testPhone);
    setChecking(false);
    setNumberCheck(result);
    if (result.registered) sounds.success();
    else sounds.notification();
  }, [testPhone, checkNumber]);

  // Play the cues once per transition, not on every re-render.
  const previousStatus = useRef<WhatsAppStatus>(status);
  useEffect(() => {
    if (previousStatus.current !== status && status === "ready") sounds.whatsappConnected();
    previousStatus.current = status;
  }, [status]);

  const previousSent = useRef(run.sent);
  useEffect(() => {
    if (run.sent > previousSent.current) sounds.progress();
    previousSent.current = run.sent;
  }, [run.sent]);

  const previousPhase = useRef(run.phase);
  useEffect(() => {
    if (previousPhase.current !== run.phase && run.phase === "completed" && run.sent > 0) {
      sounds.broadcastComplete();
    }
    previousPhase.current = run.phase;
  }, [run.phase, run.sent]);

  const currentStatus = STATUS_CONFIG[status] ?? STATUS_CONFIG.disconnected;
  const StatusIcon = currentStatus.icon;
  const busy = status === "initializing" || status === "authenticated" || connecting;
  const ready = status === "ready";
  const testDisabled = !ready || !isElectron;

  let connectLabel = hasSavedSession ? "Reconnect" : "Connect";
  if (!isElectron) connectLabel = "Desktop app required";
  else if (status === "qr") connectLabel = "Waiting for scan";
  else if (status === "authenticated") connectLabel = "Loading session";
  else if (status === "initializing" || connecting) connectLabel = "Starting";
  else if (status === "error") connectLabel = "Try again";

  let idleText = "Connect to link this computer to your WhatsApp account.";
  if (!isElectron) idleText = "Open the desktop app to connect.";
  else if (status === "error") idleText = detail || "The connection failed. Try again.";
  else if (busy) idleText = detail || "Starting WhatsApp Web";
  else if (status === "disconnected" && detail && detail !== "Not connected") idleText = detail;
  else if (hasSavedSession) idleText = "Your saved login will be restored. No QR scan needed.";

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <PageActions>
          <div className="flex items-center gap-2">
            {!isElectron && (
              <Badge variant="outline" className="text-xs">
                <Monitor className="h-3 w-3 mr-1" aria-hidden="true" />
                Web mode
              </Badge>
            )}
            <div className={`h-2 w-2 rounded-full ${currentStatus.color}`} aria-hidden="true" />
            <Badge variant={ready ? "default" : "secondary"}>
              <StatusIcon
                className={`h-3 w-3 mr-1 ${currentStatus.busy ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
              />
              {currentStatus.label}
            </Badge>
          </div>
        </PageActions>

        {!isElectron && !ready && (
          <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Monitor className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Running in web mode</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  Connecting WhatsApp, scanning the QR code, and sending messages all happen in the Whamail desktop
                  app. Open it to connect your account.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" aria-hidden="true" />
                Connection
              </CardTitle>
              <CardDescription>
                {ready
                  ? "Your WhatsApp account is connected"
                  : isElectron
                    ? "Link your WhatsApp account to this computer"
                    : "Open the desktop app to connect"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div aria-live="polite">
                {ready && info ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <User className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-medium truncate">{info.name}</p>
                        {info.phone && <p className="text-sm text-muted-foreground">+{info.phone}</p>}
                      </div>
                    </div>
                    {info.platform && <p className="text-sm text-muted-foreground">Phone: {info.platform}</p>}
                  </div>
                ) : status === "qr" && qrCode ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-white rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrCode} alt="QR code to link WhatsApp" className="w-64 h-64" />
                    </div>
                    <p className="text-sm text-muted-foreground text-center">
                      On your phone, open WhatsApp, go to Settings, then Linked devices, and choose Link a device.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                      {busy ? (
                        <Loader2 className="h-8 w-8 motion-safe:animate-spin text-muted-foreground" aria-hidden="true" />
                      ) : status === "error" ? (
                        <XCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
                      ) : (
                        <Phone className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground text-center text-pretty max-w-xs">{idleText}</p>
                  </div>
                )}
              </div>

              <Separator />

              {ready ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" onClick={handleDisconnect} className="sm:flex-1" disabled={!isElectron}>
                    <WifiOff className="h-4 w-4 mr-2" aria-hidden="true" />
                    Disconnect
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setUnlinkOpen(true)}
                    className="sm:flex-1"
                    disabled={!isElectron}
                  >
                    Unlink device
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={handleConnect}
                    disabled={!isElectron || busy || status === "qr"}
                    className="w-full"
                  >
                    {busy || status === "qr" ? (
                      <Loader2 className="h-4 w-4 mr-2 motion-safe:animate-spin" aria-hidden="true" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-2" aria-hidden="true" />
                    )}
                    {connectLabel}
                  </Button>
                  {isElectron && (status === "qr" || busy) && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={handleDisconnect}>
                      Cancel
                    </Button>
                  )}
                  {isElectron && hasSavedSession && !busy && status !== "qr" && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setUnlinkOpen(true)}>
                      Unlink device and scan a new QR code
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <SendRunCard status={status} isElectron={isElectron} run={run} startRun={startRun} stopRun={stopRun} />

          {isElectron && <SendingSettingsCard refreshKey={run.sent} />}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" aria-hidden="true" />
                Test message
              </CardTitle>
              <CardDescription>Send one message to check that the connection works</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`${fieldId}-phone`}>Phone number</Label>
                <div className="flex gap-2">
                  <Input
                    id={`${fieldId}-phone`}
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="+919876543210"
                    value={testPhone}
                    aria-describedby={numberCheck ? `${fieldId}-phone-result` : undefined}
                    onChange={(e) => {
                      setTestPhone(e.target.value);
                      setNumberCheck(null);
                    }}
                    disabled={testDisabled}
                  />
                  <Button
                    variant="outline"
                    onClick={handleCheckNumber}
                    disabled={testDisabled || !testPhone || checking}
                  >
                    {checking && <Loader2 className="h-4 w-4 mr-2 motion-safe:animate-spin" aria-hidden="true" />}
                    Check
                  </Button>
                </div>
                {numberCheck && (
                  <p
                    id={`${fieldId}-phone-result`}
                    role="status"
                    className={`text-xs ${numberCheck.registered ? "text-green-600 dark:text-green-400" : "text-destructive"}`}
                  >
                    {numberCheck.registered
                      ? `${numberCheck.phone ?? "This number"} is on WhatsApp`
                      : (numberCheck.error ?? `${numberCheck.phone ?? "This number"} is not on WhatsApp`)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${fieldId}-message`}>Message</Label>
                <Input
                  id={`${fieldId}-message`}
                  placeholder="Hello! This is a test message from Whamail."
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  disabled={testDisabled}
                />
              </div>

              <Button
                onClick={handleSendTest}
                disabled={testDisabled || !testPhone || !testMessage || sending}
                className="w-full"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 mr-2 motion-safe:animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                )}
                Send test message
              </Button>
              {testDisabled && (
                <p className="text-xs text-muted-foreground">
                  {isElectron ? "Connect WhatsApp to send a test message." : "Test messages need the desktop app."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {[
                "Connect and scan the QR code with your phone. You only do this once per computer.",
                "Create a WhatsApp audience and a message template, then send a broadcast.",
                "Whamail sends the queued messages one at a time while this app stays open.",
              ].map((step, index) => (
                <li key={step} className="flex flex-col items-center gap-2 p-4 rounded-lg bg-muted/50">
                  <div
                    className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <span className="text-lg font-bold">{index + 1}</span>
                  </div>
                  <p className="text-center text-pretty">{step}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink this device?</AlertDialogTitle>
            <AlertDialogDescription>
              {ready
                ? "This removes Whamail from your WhatsApp linked devices and deletes the saved login on this computer. Any send run in progress stops."
                : "This deletes the saved login on this computer. If Whamail still appears under Linked devices on your phone, remove it there too."}{" "}
              To connect again you will need to scan a new QR code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>Keep linked</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={unlinking}
              onClick={(event) => {
                event.preventDefault();
                void handleUnlink();
              }}
            >
              {unlinking && <Loader2 className="h-4 w-4 mr-2 motion-safe:animate-spin" aria-hidden="true" />}
              Unlink device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

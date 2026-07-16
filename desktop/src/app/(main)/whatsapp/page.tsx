"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, QrCode, Phone, Send, CheckCircle2, XCircle, Wifi, WifiOff, User, Monitor } from "lucide-react";
import { useWhatsApp } from "@/hooks/use-whatsapp";
import { PageActions } from "../layout";
import { sounds } from "@/lib/sounds";
import { toast } from "sonner";

export default function WhatsAppPage() {
  const {
    status,
    qrCode,
    info,
    detail,
    sendProgress,
    isElectron,
    connect,
    disconnect,
    sendMessage,
    checkNumber,
  } = useWhatsApp();

  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [numberRegistered, setNumberRegistered] = useState<boolean | null>(null);

  const handleConnect = useCallback(async () => {
    sounds.click();
    const result = await connect();
    if (!result.success && result.error) {
      sounds.error();
      toast.error(result.error);
    }
  }, [connect]);

  const handleDisconnect = useCallback(async () => {
    sounds.click();
    await disconnect();
    toast.info("WhatsApp disconnected");
  }, [disconnect]);

  const handleSendTest = useCallback(async () => {
    if (!testPhone || !testMessage) return;
    setSending(true);
    sounds.send();
    const result = await sendMessage(testPhone, testMessage);
    setSending(false);
    if (result.success) {
      sounds.success();
      toast.success("Message sent!");
      setTestPhone("");
      setTestMessage("");
    } else {
      sounds.error();
      toast.error(result.error || "Failed to send");
    }
  }, [testPhone, testMessage, sendMessage]);

  const handleCheckNumber = useCallback(async () => {
    if (!testPhone) return;
    setChecking(true);
    const result = await checkNumber(testPhone);
    setChecking(false);
    setNumberRegistered(result.registered);
    if (result.registered) {
      sounds.success();
    } else {
      sounds.notification();
    }
  }, [testPhone, checkNumber]);

  useEffect(() => {
    if (status === "ready") {
      sounds.whatsappConnected();
    }
  }, [status]);

  useEffect(() => {
    if (sendProgress && sendProgress.status === "sent") {
      sounds.progress();
    }
  }, [sendProgress]);

  const statusConfig = {
    disconnected: { label: "Disconnected", icon: WifiOff, color: "bg-red-500" },
    qr: { label: "Scan QR Code", icon: QrCode, color: "bg-yellow-500" },
    authenticated: { label: "Authenticating...", icon: Loader2, color: "bg-blue-500" },
    ready: { label: "Connected", icon: CheckCircle2, color: "bg-green-500" },
    error: { label: "Error", icon: XCircle, color: "bg-red-500" },
  };

  const currentStatus = statusConfig[status] || statusConfig.disconnected;
  const StatusIcon = currentStatus.icon;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        <PageActions>
          <div className="flex items-center gap-2">
            {!isElectron && (
              <Badge variant="outline" className="text-xs">
                <Monitor className="h-3 w-3 mr-1" />
                Web Mode
              </Badge>
            )}
            <div className={`h-2 w-2 rounded-full ${currentStatus.color}`} />
            <Badge variant={status === "ready" ? "default" : "secondary"}>
              <StatusIcon className={`h-3 w-3 mr-1 ${status === "authenticated" ? "animate-spin" : ""}`} />
              {currentStatus.label}
            </Badge>
          </div>
        </PageActions>

        {/* Web mode banner */}
        {!isElectron && status !== "ready" && (
          <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30">
            <CardContent className="p-4 flex items-start gap-3">
              <Monitor className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Running in web mode
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  WhatsApp connection requires the Whamail desktop app. QR scanning, sending messages, and number
                  checking need Electron. Open the desktop app to connect your WhatsApp account.
                </p>
                {info && (
                  <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                    Last connected session: <strong>{info.name}</strong> (+{info.phone})
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                Connection
              </CardTitle>
              <CardDescription>
                {status === "ready"
                  ? "Your WhatsApp account is connected"
                  : isElectron
                    ? "Scan the QR code with your phone to connect"
                    : "Open the desktop app to connect"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {status === "ready" && info ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <User className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{info.name}</p>
                      <p className="text-sm text-muted-foreground">+{info.phone}</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Platform: {info.platform}
                  </p>
                </div>
              ) : qrCode ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="p-4 bg-white rounded-xl">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    Open WhatsApp on your phone, go to Settings &gt; Linked Devices &gt; Link a Device
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-8">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    {status === "authenticated" ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : (
                      <Phone className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    {status === "error"
                      ? detail || "Connection failed. Please try again."
                      : status === "authenticated"
                      ? "Authenticating with WhatsApp..."
                      : isElectron
                        ? "Click connect to start"
                        : "Open desktop app to connect"}
                  </p>
                </div>
              )}

              <Separator />

              <div className="flex gap-2">
                {status === "ready" ? (
                  <Button variant="destructive" onClick={handleDisconnect} className="flex-1" disabled={!isElectron}>
                    <WifiOff className="h-4 w-4 mr-2" />
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    onClick={handleConnect}
                    disabled={!isElectron || status === "authenticated" || status === "qr"}
                    className="flex-1"
                  >
                    {status === "authenticated" || status === "qr" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-2" />
                    )}
                    {!isElectron
                      ? "Desktop app required"
                      : status === "qr" ? "Waiting for scan..." : status === "authenticated" ? "Authenticating..." : "Connect"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Test Message
              </CardTitle>
              <CardDescription>
                Send a test message to verify your connection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="+919876543210"
                    value={testPhone}
                    onChange={(e) => {
                      setTestPhone(e.target.value);
                      setNumberRegistered(null);
                    }}
                    disabled={status !== "ready" || !isElectron}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCheckNumber}
                    disabled={status !== "ready" || !testPhone || checking || !isElectron}
                  >
                    {checking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Phone className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {numberRegistered !== null && (
                  <p className={`text-xs ${numberRegistered ? "text-green-600" : "text-red-600"}`}>
                    {numberRegistered ? "Number is on WhatsApp" : "Number is NOT on WhatsApp"}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Input
                  placeholder="Hello! This is a test message from Whamail."
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  disabled={status !== "ready" || !isElectron}
                />
              </div>

              <Button
                onClick={handleSendTest}
                disabled={status !== "ready" || !testPhone || !testMessage || sending || !isElectron}
                className="w-full"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Test Message
              </Button>
            </CardContent>
          </Card>
        </div>

        {sendProgress && sendProgress.total > 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Send Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Sending to {sendProgress.phone}</span>
                  <span>{sendProgress.current} / {sendProgress.total}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(sendProgress.current / sendProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-muted/50">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold">1</span>
                </div>
                <p className="text-center">Click Connect and scan the QR code with your phone</p>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-muted/50">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold">2</span>
                </div>
                <p className="text-center">Create audiences with phone numbers and message templates</p>
              </div>
              <div className="flex flex-col items-center gap-2 p-4 rounded-lg bg-muted/50">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold">3</span>
                </div>
                <p className="text-center">Create WhatsApp broadcasts and send messages to your audience</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

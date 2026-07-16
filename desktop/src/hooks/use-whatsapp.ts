"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type WhatsAppStatus = "disconnected" | "qr" | "authenticated" | "ready" | "error";

interface WhatsAppInfo {
  name: string;
  phone: string;
  platform: string;
}

interface SendProgress {
  current: number;
  total: number;
  phone: string;
  status: string;
}

interface UseWhatsAppReturn {
  status: WhatsAppStatus;
  qrCode: string | null;
  info: WhatsAppInfo | null;
  detail: string | null;
  sendProgress: SendProgress | null;
  isElectron: boolean;
  connect: () => Promise<{ success: boolean; error?: string }>;
  disconnect: () => Promise<{ success: boolean }>;
  sendMessage: (phone: string, message: string) => Promise<{ success: boolean; error?: string; messageId?: string }>;
  sendBatch: (messages: Array<{ phone: string; message: string }>) => Promise<{ success: boolean; results?: Array<{ phone: string; success: boolean; error?: string }> }>;
  checkNumber: (phone: string) => Promise<{ registered: boolean }>;
  getInfo: () => Promise<WhatsAppInfo | null>;
}

function getElectronWhatsApp(): any {
  if (typeof window === "undefined") return null;
  const win = window as any;
  return win.electronAPI?.whatsapp ?? null;
}

export function useWhatsApp(): UseWhatsAppReturn {
  const [status, setStatus] = useState<WhatsAppStatus>("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [info, setInfo] = useState<WhatsAppInfo | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [sendProgress, setSendProgress] = useState<SendProgress | null>(null);
  const cleanupRefs = useRef<Array<() => void>>([]);

  const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI?.whatsapp;

  useEffect(() => {
    const wa = getElectronWhatsApp();
    if (!wa) {
      // Web mode: try to load session status from backend API
      loadWebStatus();
      return;
    }

    wa.getStatus().then((data: { status: WhatsAppStatus; qr: string | null }) => {
      setStatus(data.status);
      if (data.qr) setQrCode(data.qr);
    });

    const cleanupQr = wa.onQr((dataUrl: string) => {
      setQrCode(dataUrl);
    });

    const cleanupStatus = wa.onStatus((data: { status: WhatsAppStatus; detail?: string }) => {
      setStatus(data.status);
      setDetail(data.detail ?? null);
      if (data.status === "ready") {
        wa.getInfo().then((i: WhatsAppInfo | null) => {
          if (i) setInfo(i);
        });
      }
      if (data.status === "disconnected") {
        setQrCode(null);
        setInfo(null);
      }
    });

    const cleanupProgress = wa.onSendProgress((data: SendProgress) => {
      setSendProgress(data);
    });

    cleanupRefs.current = [cleanupQr, cleanupStatus, cleanupProgress];

    return () => {
      cleanupRefs.current.forEach((fn) => fn());
      cleanupRefs.current = [];
    };
  }, []);

  async function loadWebStatus() {
    try {
      const { whatsappApi } = await import("@/lib/api");
      const res = await whatsappApi.getSession();
      if (res.data) {
        setStatus("ready");
        setInfo({
          name: res.data.pushName ?? "",
          phone: res.data.phoneNumber ?? "",
          platform: res.data.platform ?? "",
        });
      }
    } catch {
      // No session — that's fine
    }
  }

  const connect = useCallback(async () => {
    const wa = getElectronWhatsApp();
    if (!wa) return { success: false, error: "WhatsApp connection requires the desktop app. Open Whamail desktop to connect." };
    return wa.connect();
  }, []);

  const disconnect = useCallback(async () => {
    const wa = getElectronWhatsApp();
    if (!wa) return { success: false };
    return wa.disconnect();
  }, []);

  const sendMessage = useCallback(async (phone: string, message: string) => {
    const wa = getElectronWhatsApp();
    if (!wa) return { success: false, error: "Sending requires the desktop app." };
    return wa.sendMessage(phone, message);
  }, []);

  const sendBatch = useCallback(async (messages: Array<{ phone: string; message: string }>) => {
    const wa = getElectronWhatsApp();
    if (!wa) return { success: false, error: "Sending requires the desktop app." };
    return wa.sendBatch(messages);
  }, []);

  const checkNumber = useCallback(async (phone: string) => {
    const wa = getElectronWhatsApp();
    if (!wa) return { registered: false };
    return wa.checkNumber(phone);
  }, []);

  const getInfoCb = useCallback(async () => {
    const wa = getElectronWhatsApp();
    if (!wa) return null;
    return wa.getInfo();
  }, []);

  return {
    status,
    qrCode,
    info,
    detail,
    sendProgress,
    isElectron,
    connect,
    disconnect,
    sendMessage,
    sendBatch,
    checkNumber,
    getInfo: getInfoCb,
  };
}

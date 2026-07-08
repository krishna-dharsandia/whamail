import axios from "axios";
import { createSupabaseClient } from "./supabase";

let _supabase: ReturnType<typeof createSupabaseClient> | null = null;
function getSupabase() {
  if (!_supabase) _supabase = createSupabaseClient();
  return _supabase;
}
import { resolveApiUrl } from "@/hooks/use-desktop";

let cachedBaseUrl: string | null = null;

async function getBaseUrl(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  const electron = typeof window !== "undefined" ? (window as any).electronAPI : undefined;
  cachedBaseUrl = await resolveApiUrl(electron);
  return cachedBaseUrl!;
}

async function createClient() {
  const baseURL = await getBaseUrl();
  const instance = axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    timeout: 8_000,
  });

  // Attach Supabase JWT token on every request
  instance.interceptors.request.use(async (config) => {
    const { data: { session } } = await getSupabase().auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
    return config;
  });

  return instance;
}

// Lazily-initialized API client
let apiPromise: Promise<ReturnType<typeof axios.create>> | null = null;
async function getApi() {
  if (!apiPromise) {
    apiPromise = createClient();
  }
  return apiPromise;
}

// ===== Auth =====
export const authApi = {
  syncProfile: async (data: { fullName?: string; avatarUrl?: string; authProvider: string }) =>
    (await getApi()).post("/auth/sync", data),
  profile: async () => (await getApi()).get("/auth/profile"),
};

// ===== Credentials =====
export const credentialApi = {
  save: async (data: { gmailAddress: string; appPassword: string; smtpHost?: string; smtpPort?: number }) =>
    (await getApi()).post("/credentials", data),
  get: async () => (await getApi()).get("/credentials"),
  delete: async () => (await getApi()).delete("/credentials"),
  test: async (toEmail: string) => (await getApi()).post("/credentials/test", { toEmail }),
};

// ===== Templates =====
export const templateApi = {
  getAll: async () => (await getApi()).get("/templates"),
  getById: async (id: string) => (await getApi()).get(`/templates/${id}`),
  create: async (data: { name: string; subjectTemplate: string; bodyTemplate: string }) =>
    (await getApi()).post("/templates", data),
  update: async (id: string, data: { name: string; subjectTemplate: string; bodyTemplate: string }) =>
    (await getApi()).put(`/templates/${id}`, data),
  delete: async (id: string) => (await getApi()).delete(`/templates/${id}`),
};

// ===== Audiences =====
export const audienceApi = {
  getAll: async () => (await getApi()).get("/audiences"),
  getById: async (id: string) => (await getApi()).get(`/audiences/${id}`),
  create: async (name: string) => (await getApi()).post("/audiences", { name }),
  delete: async (id: string) => (await getApi()).delete(`/audiences/${id}`),
  getContacts: async (id: string) => (await getApi()).get(`/audiences/${id}/contacts`),
  addContact: async (id: string, data: { email: string; name?: string }) =>
    (await getApi()).post(`/audiences/${id}/contacts`, data),
  deleteContact: async (audienceId: string, contactId: string) =>
    (await getApi()).delete(`/audiences/${audienceId}/contacts/${contactId}`),
  uploadCsv: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return (await getApi()).post(`/audiences/${id}/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ===== Broadcasts =====
export const broadcastApi = {
  getAll: async () => (await getApi()).get("/broadcasts"),
  getById: async (id: string) => (await getApi()).get(`/broadcasts/${id}`),
  getDetail: async (id: string) => (await getApi()).get(`/broadcasts/${id}/detail`),
  create: async (data: { name: string; audienceId: string; templateId: string; subjectOverride?: string }) =>
    (await getApi()).post("/broadcasts", data),
  send: async (id: string) => (await getApi()).post(`/broadcasts/${id}/send`),
  sendRemaining: async (id: string) => (await getApi()).post(`/broadcasts/${id}/send-remaining`),
  delete: async (id: string) => (await getApi()).delete(`/broadcasts/${id}`),
};

// ===== Email Queue =====
export const queueApi = {
  getAll: async (status?: string, page?: number, pageSize?: number) =>
    (await getApi()).get("/queue", { params: { status, page, pageSize } }),
  getStats: async () => (await getApi()).get("/queue/stats"),
  enqueueBatch: async (
    emails: Array<{
      recipient: string;
      templateId?: string;
      subject?: string;
      body?: string;
      mergeData?: Record<string, string>;
    }>
  ) => (await getApi()).post("/queue/batch", { emails }),
  cancel: async (id: string) => (await getApi()).delete(`/queue/${id}`),
};

// ===== Metrics =====
export const metricsApi = {
  overview: async () => (await getApi()).get("/metrics/overview"),
  emailsPerDay: async (days?: number) => (await getApi()).get("/metrics/emails-per-day", { params: { days } }),
  emailsPerMonth: async (months?: number) => (await getApi()).get("/metrics/emails-per-month", { params: { months } }),
  broadcastStatus: async () => (await getApi()).get("/metrics/broadcast-status"),
};

import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { getCookie, setCookie, removeCookie } from "@/lib/cookies";
import type {
  AuthResponse,
  Merchant,
  APIKey,
  ProviderCredentials,
  ChargeRequest,
  ChargeResponse,
  PaymentLink,
  CreatePaymentLinkRequest,
  Plan,
  CreatePlanRequest,
  Subscription,
  FraudRule,
  UpsertFraudRuleRequest,
  FraudEvent,
  WebhookLog,
  TransactionListResponse,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ── Axios instance ──────────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token to requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getCookie("pv_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    console.log("[API] Request with token to:", config.url);
  } else {
    console.log("[API] Request WITHOUT token to:", config.url);
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (
      response.data &&
      typeof response.data === "object" &&
      "success" in response.data &&
      response.data.success === true &&
      "data" in response.data
    ) {
      response.data = response.data.data;
    }
    return response;
  },
  (error) => {
    const apiError = error.response?.data?.error;
    if (apiError && typeof apiError === "string") {
      error.message = apiError;
    }

    // Auto-redirect on 401 for dashboard (JWT-protected) routes only.
    // We scope this to /dashboard/ to avoid catching API-key endpoints.
    const requestUrl = error.config?.url || "";
    if (
      error.response?.status === 401 &&
      requestUrl.includes("/dashboard")
    ) {
      console.warn("[Auth] Session expired — redirecting to sign-in.");
      removeCookie("pv_token");
      if (typeof window !== "undefined" && !window.location.pathname.includes("/sign-in")) {
        window.location.href = `/sign-in?redirect=${encodeURIComponent(window.location.pathname)}`;
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth ────────────────────────────────────────────────────
export const auth = {
  login: (data: any) => 
    api.post<AuthResponse>("/auth/login", data).then((r) => r.data),
  
  register: (data: any) => 
    api.post<AuthResponse>("/auth/register", data).then((r) => r.data),

  getMe: () => api.get<Merchant>("/auth/me").then((r) => r.data),

  setToken: (token: string) => {
    console.log("[Auth] Setting token");
    setCookie("pv_token", token);
  },

  getToken: () => {
    const token = getCookie("pv_token");
    console.log("[Auth] Getting token:", token ? "exists" : "missing");
    return token;
  },

  logout: () => {
    console.log("[Auth] Logging out");
    removeCookie("pv_token");
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
  },

  isAuthenticated: () => {
    const hasToken = !!getCookie("pv_token");
    console.log("[Auth] Checking authentication:", hasToken);
    return hasToken;
  },
};

// ── Dashboard (JWT-protected) ───────────────────────────────
export const dashboard = {
  // API Keys
  generateAPIKey: () =>
    api.post<APIKey>("/dashboard/api-keys").then((r) => r.data),
  listAPIKeys: () =>
    api.get<{ items: APIKey[] }>("/dashboard/api-keys").then((r) => r.data.items),

  // Provider credentials
  saveProviderCredentials: (data: ProviderCredentials) =>
    api.post("/dashboard/providers", data).then((r) => r.data),

  // Payment Links
  createPaymentLink: (data: CreatePaymentLinkRequest) =>
    api.post<PaymentLink>("/dashboard/links", data).then((r) => r.data),

  listPaymentLinks: () =>
    api.get<PaymentLink[]>("/dashboard/links").then((r) => r.data),

  deactivatePaymentLink: (id: string) =>
    api.post(`/dashboard/links/${id}/deactivate`).then((r) => r.data),

  deletePaymentLink: (id: string) =>
    api.delete(`/dashboard/links/${id}`).then((r) => r.data),

  // Subscriptions
  listSubscriptions: () =>
    api.get<Subscription[]>("/dashboard/subscriptions").then((r) => r.data),

  listPlans: () =>
    api.get<any[]>("/dashboard/plans").then((r) => r.data),

  createPlan: (data: CreatePlanRequest) =>
    api.post<Plan>("/dashboard/plans", data).then((r) => r.data),

  cancelSubscription: (id: string) =>
    api.post(`/dashboard/subscriptions/${id}/cancel`).then((r) => r.data),

  // Fraud
  upsertFraudRule: (data: UpsertFraudRuleRequest) =>
    api.put<FraudRule>("/dashboard/fraud/rules", data).then((r) => r.data),

  listFraudEvents: (params?: { page?: number; limit?: number }) =>
    api.get<FraudEvent[]>("/dashboard/fraud/events", { params }).then((r) => r.data),

  // Webhooks
  listWebhookLogs: (params?: { page?: number; limit?: number }) =>
    api.get<WebhookLog[]>("/dashboard/webhooks/logs", { params }).then((r) => r.data),

  retryWebhook: (id: string) =>
    api.post(`/dashboard/webhooks/logs/${id}/retry`).then((r) => r.data),

  // Analytics
  getAnalyticsVolume: (days: number = 30) =>
    api.get<any[]>("/dashboard/analytics/volume", { params: { days } }).then((r) => r.data),

  getOverviewStats: (days: number = 30) =>
    api.get<any>("/dashboard/analytics/overview", { params: { days } }).then((r) => r.data),
};

// ── Payments (API-key-protected, but we call from dashboard context) ──
export const payments = {
  charge: (data: ChargeRequest) =>
    api.post<ChargeResponse>("/dashboard/transactions/charge", data).then((r) => r.data),

  listTransactions: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    provider?: string;
    currency?: string;
  }): Promise<TransactionListResponse> => {
    const limit = params?.limit || 20;
    const page = params?.page || 1;
    const offset = (page - 1) * limit;

    const queryParams: Record<string, any> = { limit, offset };
    if (params?.status && params.status !== "all") {
      queryParams.status = params.status;
    }
    if (params?.provider && params.provider !== "all") {
      queryParams.provider = params.provider;
    }
    if (params?.currency && params.currency !== "all") {
      queryParams.currency = params.currency;
    }

    const res = await api.get("/dashboard/transactions", { params: queryParams });
    return res.data;
  },
  getActivity: async () => {
    const res = await api.get("/dashboard/transactions/activity");
    return res.data.transactions;
  },
  verify: async (reference: string) => {
    const res = await api.get(`/dashboard/transactions/${reference}/verify`);
    return res.data;
  },
  refund: async (data: { reference: string; amount?: number }) => {
    const res = await api.post("/dashboard/transactions/refund", data);
    return res.data;
  },
  getStatus: async (reference: string) => {
    const res = await api.get(`/dashboard/transactions/${reference}/status`);
    return res.data;
  },
  getBatchStatus: async (references: string[]) => {
    // API keys only, rarely used by dashboard itself
    const res = await api.post("/payments/status/batch", { references });
    return res.data.statuses;
  },
};

export default api;

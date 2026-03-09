import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  APIKey,
  ProviderCredentials,
  Transaction,
  ChargeRequest,
  ChargeResponse,
  RefundRequest,
  PaymentLink,
  CreatePaymentLinkRequest,
  Plan,
  CreatePlanRequest,
  Subscription,
  FraudRule,
  UpsertFraudRuleRequest,
  FraudEvent,
  WebhookLog,
  TransactionStatusResponse,
  StatusTransition,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// ── Axios instance ──────────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT token to dashboard requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = Cookies.get("pv_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      // Don't redirect if already on auth pages
      if (!window.location.pathname.startsWith("/auth")) {
        Cookies.remove("pv_token");
        window.location.href = "/auth/login";
      }
    }
    return Promise.reject(err);
  }
);

// ── Auth ────────────────────────────────────────────────────
export const auth = {
  register: (data: RegisterRequest) =>
    api.post<AuthResponse>("/auth/register", data).then((r) => r.data),

  login: (data: LoginRequest) =>
    api.post<AuthResponse>("/auth/login", data).then((r) => r.data),

  setToken: (token: string) => {
    Cookies.set("pv_token", token, { expires: 7, sameSite: "lax" });
  },

  getToken: () => Cookies.get("pv_token"),

  logout: () => {
    Cookies.remove("pv_token");
    window.location.href = "/auth/login";
  },

  isAuthenticated: () => !!Cookies.get("pv_token"),
};

// ── Dashboard (JWT-protected) ───────────────────────────────
export const dashboard = {
  // API Keys
  generateAPIKey: () =>
    api.post<APIKey>("/dashboard/api-keys").then((r) => r.data),

  // Provider credentials
  saveProviderCredentials: (data: ProviderCredentials) =>
    api.post("/dashboard/providers", data).then((r) => r.data),

  // Payment Links
  createPaymentLink: (data: CreatePaymentLinkRequest) =>
    api.post<PaymentLink>("/dashboard/links", data).then((r) => r.data),

  listPaymentLinks: () =>
    api.get<PaymentLink[]>("/dashboard/links").then((r) => r.data),

  deactivatePaymentLink: (id: string) =>
    api.delete(`/dashboard/links/${id}`).then((r) => r.data),

  // Subscriptions
  listSubscriptions: () =>
    api.get<Subscription[]>("/dashboard/subscriptions").then((r) => r.data),

  createPlan: (data: CreatePlanRequest) =>
    api.post<Plan>("/dashboard/subscriptions/plans", data).then((r) => r.data),

  cancelSubscription: (id: string) =>
    api.post(`/dashboard/subscriptions/${id}/cancel`).then((r) => r.data),

  // Fraud
  upsertFraudRule: (data: UpsertFraudRuleRequest) =>
    api.put<FraudRule>("/dashboard/fraud/rules", data).then((r) => r.data),

  listFraudEvents: (params?: { page?: number; limit?: number }) =>
    api.get<FraudEvent[]>("/dashboard/fraud/events", { params }).then((r) => r.data),

  // Webhooks
  listWebhookLogs: (params?: { page?: number; limit?: number }) =>
    api.get<WebhookLog[]>("/dashboard/webhooks", { params }).then((r) => r.data),

  retryWebhook: (id: string) =>
    api.post(`/dashboard/webhooks/${id}/retry`).then((r) => r.data),
};

// ── Payments (API-key-protected, but we call from dashboard context) ──
export const payments = {
  charge: (data: ChargeRequest) =>
    api.post<ChargeResponse>("/payments/charge", data).then((r) => r.data),

  verify: (reference: string) =>
    api.get<Transaction>(`/payments/verify/${reference}`).then((r) => r.data),

  refund: (data: RefundRequest) =>
    api.post("/payments/refund", data).then((r) => r.data),

  listTransactions: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<Transaction[]>("/payments/transactions", { params }).then((r) => r.data),

  getStatus: (reference: string) =>
    api.get<TransactionStatusResponse>(`/payments/status/${reference}`).then((r) => r.data),

  getActivity: (limit?: number) =>
    api.get<{ transactions: StatusTransition[]; count: number }>("/payments/activity", {
      params: { limit },
    }).then((r) => r.data),
};

export default api;

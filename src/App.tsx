import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme-provider";
import DashboardLayout from "@/layouts/DashboardLayout";
import AuthLayout from "@/layouts/AuthLayout";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import OAuthCallbackPage from "@/pages/auth/OAuthCallbackPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import TransactionsPage from "@/pages/dashboard/TransactionsPage";
import LinksPage from "@/pages/dashboard/LinksPage";
import SubscriptionsPage from "@/pages/dashboard/SubscriptionsPage";
import FraudPage from "@/pages/dashboard/FraudPage";
import WebhooksPage from "@/pages/dashboard/WebhooksPage";
import SettingsPage from "@/pages/dashboard/SettingsPage";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";

export default function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<AuthLayout />}>
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="callback" element={<OAuthCallbackPage />} />
            </Route>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="transactions" element={<TransactionsPage />} />
            <Route path="links" element={<LinksPage />} />
            <Route path="subscriptions" element={<SubscriptionsPage />} />
            <Route path="fraud" element={<FraudPage />} />
            <Route path="webhooks" element={<WebhooksPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      </AuthProvider>
      <Toaster />
    </ThemeProvider>
  );
}

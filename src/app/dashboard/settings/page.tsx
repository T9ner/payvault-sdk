"use client";

import { useState } from "react";
import { dashboard } from "@/lib/api";
import { copyToClipboard } from "@/lib/formatters";
import type { APIKey } from "@/lib/types";
import {
  Key,
  Copy,
  Check,
  Loader2,
  Eye,
  EyeOff,
  Shield,
  AlertTriangle,
} from "lucide-react";

export default function SettingsPage() {
  // API Key state
  const [apiKey, setApiKey] = useState<APIKey | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Provider credentials state
  const [provider, setProvider] = useState<"paystack" | "flutterwave">("paystack");
  const [secretKey, setSecretKey] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [providerSaved, setProviderSaved] = useState(false);

  const handleGenerateKey = async () => {
    if (
      apiKey &&
      !confirm(
        "Generating a new API key will not revoke existing keys. Continue?"
      )
    )
      return;

    setGeneratingKey(true);
    try {
      const key = await dashboard.generateAPIKey();
      setApiKey(key);
      setShowKey(true);
    } catch {
      alert("Failed to generate API key");
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleCopyKey = async () => {
    if (!apiKey?.key) return;
    await copyToClipboard(apiKey.key);
    setKeyCopied(true);
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider(true);
    setProviderSaved(false);
    try {
      await dashboard.saveProviderCredentials({
        provider,
        secret_key: secretKey,
      });
      setProviderSaved(true);
      setSecretKey("");
      setTimeout(() => setProviderSaved(false), 3000);
    } catch {
      alert("Failed to save provider credentials");
    } finally {
      setSavingProvider(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Manage your API keys and payment provider integrations
        </p>
      </div>

      {/* API Keys Section */}
      <div className="rounded-xl border bg-[hsl(var(--card))] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Key size={18} className="text-[hsl(var(--muted-foreground))]" />
          <h3 className="font-medium">API Keys</h3>
        </div>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          API keys are used to authenticate requests from your application to PayVault.
          Keep your keys secure and never expose them in client-side code.
        </p>

        {apiKey && (
          <div className="mb-4 rounded-lg border bg-[hsl(var(--accent))]/50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Your API Key</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={handleCopyKey}
                  className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                >
                  {keyCopied ? (
                    <Check size={14} className="text-emerald-500" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>
            <code className="block break-all rounded bg-[hsl(var(--background))] px-3 py-2 text-sm font-mono">
              {showKey ? apiKey.key : "sk_live_" + "*".repeat(32)}
            </code>
            <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle size={12} />
              <span>Copy this key now. It won&apos;t be shown again.</span>
            </div>
          </div>
        )}

        <button
          onClick={handleGenerateKey}
          disabled={generatingKey}
          className="flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {generatingKey ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Key size={16} />
          )}
          Generate New API Key
        </button>
      </div>

      {/* Provider Credentials Section */}
      <div className="rounded-xl border bg-[hsl(var(--card))] p-6">
        <div className="mb-4 flex items-center gap-2">
          <Shield size={18} className="text-[hsl(var(--muted-foreground))]" />
          <h3 className="font-medium">Payment Provider Credentials</h3>
        </div>
        <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
          Connect your Paystack or Flutterwave account by providing your secret key.
          This enables PayVault to process payments through your preferred provider.
        </p>

        <form onSubmit={handleSaveProvider} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Provider</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProvider("paystack")}
                  className={`flex h-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                    provider === "paystack"
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "hover:bg-[hsl(var(--accent))]"
                  }`}
                >
                  Paystack
                </button>
                <button
                  type="button"
                  onClick={() => setProvider("flutterwave")}
                  className={`flex h-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                    provider === "flutterwave"
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "hover:bg-[hsl(var(--accent))]"
                  }`}
                >
                  Flutterwave
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Secret Key</label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder={
                    provider === "paystack"
                      ? "sk_live_xxxxxxxxxx"
                      : "FLWSECK-xxxxxxxxxx"
                  }
                  required
                  className="flex h-10 w-full rounded-lg border bg-transparent px-3 py-2 pr-10 text-sm font-mono outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
                >
                  {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={savingProvider || !secretKey}
              className="flex h-9 items-center gap-2 rounded-lg bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingProvider ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Shield size={16} />
              )}
              Save Credentials
            </button>
            {providerSaved && (
              <span className="text-sm text-emerald-600">
                {provider.charAt(0).toUpperCase() + provider.slice(1)} credentials saved!
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Info Box */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 text-amber-600" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Security Note</p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Your provider secret keys are encrypted at rest using AES-256-GCM.
              API keys are hashed and only the prefix is stored for identification.
              Never share your secret keys or API keys publicly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

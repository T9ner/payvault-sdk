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
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState<APIKey | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [provider, setProvider] = useState<"paystack" | "flutterwave">("paystack");
  const [secretKey, setSecretKey] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  const { toast } = useToast();

  const handleGenerateKey = async () => {
    if (
      apiKey &&
      !confirm(
        "Generating a new API key will not revoke existing keys. Continue?"
      )
    ) {
      return;
    }

    setGeneratingKey(true);
    try {
      const key = await dashboard.generateAPIKey();
      setApiKey(key);
      setShowKey(true);
      toast.success("New API key generated successfully.");
    } catch {
      toast.error("Failed to generate API key.");
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleCopyKey = async () => {
    if (!apiKey?.key) return;
    await copyToClipboard(apiKey.key);
    setKeyCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setKeyCopied(false), 2000);
  };

  const handleSaveProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider(true);
    try {
      await dashboard.saveProviderCredentials({
        provider,
        secret_key: secretKey,
      });
      setSecretKey("");
      toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} credentials saved securely.`);
    } catch {
      toast.error("Failed to save provider credentials.");
    } finally {
      setSavingProvider(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader
        title="Settings"
        description="Manage your API keys and payment provider integrations"
      />

      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {/* API Keys Section */}
          <div className="rounded-xl border bg-[hsl(var(--card))] shadow-sm overflow-hidden">
            <div className="border-b px-6 py-4 flex items-center justify-between bg-[hsl(var(--muted))]/30">
              <div className="flex items-center gap-2">
                <Key size={18} className="text-[hsl(var(--primary))]" />
                <h3 className="font-medium">API Keys</h3>
              </div>
            </div>
            <div className="p-6 space-y-4 relative">
              <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-2xl">
                API keys are used to authenticate requests from your application to PayVault.
                Keep your keys secure and never expose them in client-side code.
              </p>

              {apiKey && (
                <div className="rounded-lg border bg-[hsl(var(--accent))]/50 p-4 mt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Your Live API Key</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors"
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        onClick={handleCopyKey}
                        className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))] transition-colors"
                      >
                        {keyCopied ? (
                          <Check size={14} className="text-emerald-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                  <code className="block break-all rounded-md bg-[hsl(var(--background))] px-4 py-3 text-sm font-mono border">
                    {showKey ? apiKey.key : "sk_live_" + "*".repeat(32)}
                  </code>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                    <AlertTriangle size={14} />
                    <span>Copy this key now. It won&apos;t be shown again.</span>
                  </div>
                </div>
              )}

              <div className="pt-4 mt-2 border-t">
                <Button
                  onClick={handleGenerateKey}
                  disabled={generatingKey}
                  className="gap-2"
                >
                  {generatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key size={16} />}
                  Generate New API Key
                </Button>
              </div>
            </div>
          </div>

          {/* Provider Credentials Section */}
          <div className="rounded-xl border bg-[hsl(var(--card))] shadow-sm overflow-hidden">
            <div className="border-b px-6 py-4 flex items-center justify-between bg-[hsl(var(--muted))]/30">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-[hsl(var(--primary))]" />
                <h3 className="font-medium">Payment Provider</h3>
              </div>
            </div>
            
            <form onSubmit={handleSaveProvider} className="p-6 space-y-6">
              <p className="text-sm text-[hsl(var(--muted-foreground))] max-w-2xl">
                Connect your Paystack or Flutterwave account by providing your secret key.
                This enables PayVault to process payments through your preferred provider directly.
              </p>

              <div className="grid gap-6">
                <div className="space-y-3">
                  <label className="text-sm font-medium">Select Provider</label>
                  <Tabs value={provider} onValueChange={(val: any) => setProvider(val)} className="w-full sm:w-[400px]">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="paystack">Paystack</TabsTrigger>
                      <TabsTrigger value="flutterwave">Flutterwave</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <div className="space-y-3 max-w-md">
                  <label className="text-sm font-medium">Secret Key</label>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder={
                        provider === "paystack"
                          ? "sk_live_v2_xxxxxxxxxx"
                          : "FLWSECK-xxxxxxxxxx"
                      }
                      required
                      className="flex h-10 w-full rounded-md border bg-transparent px-3 py-2 pr-10 text-sm font-mono outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]/30 transition-shadow"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
                    >
                      {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button
                  type="submit"
                  disabled={savingProvider || !secretKey}
                  className="gap-2"
                >
                  {savingProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield size={16} />}
                  Save Credentials
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20 shadow-sm">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-500">
                <AlertTriangle size={18} />
                <h4 className="text-sm font-semibold">Security Note</h4>
              </div>
              <p className="text-xs text-amber-700/90 dark:text-amber-400/80 leading-relaxed">
                Your provider secret keys are strictly encrypted at rest using AES-256-GCM.
                API keys are salted and hashed immediately upon creation, and only the prefix is stored for identification.
                PayVault personnel cannot read your API tokens.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

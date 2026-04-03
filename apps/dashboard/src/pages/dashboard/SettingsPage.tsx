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
  Lock,
  Zap,
  Globe,
  Settings2,
  ShieldCheck,
  Fingerprint,
  Cpu,
  ChevronRight
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

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
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
           <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <Settings2 className="h-4 w-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Configuration</span>
           </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">System Settings</h1>
          <p className="text-zinc-400 mt-1">Manage your integration keys and provider vault.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          {/* API Keys Section */}
          <SpotlightCard className="p-0 overflow-hidden border-zinc-800/50 bg-zinc-900/10">
            <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/30">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                        <Key className="h-4 w-4 text-indigo-400" />
                    </div>
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Developer Credentials</h3>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Production Environment</span>
                </div>
            </div>
            
            <div className="p-8 space-y-6">
              <p className="text-sm text-zinc-500 leading-relaxed max-w-2xl">
                API keys authorize your application to access the PayVault infrastructure. 
                Treat these as sensitive credentials: never commit them to source control or share them in unsecured channels.
              </p>

              <AnimatePresence mode="wait">
                {apiKey ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="rounded-[2rem] bg-zinc-950 border border-zinc-800 p-8 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl" />
                    
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Fingerprint className="h-4 w-4 text-indigo-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Merchant API Key</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowKey(!showKey)}
                          className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-900 rounded-xl transition-all"
                        >
                          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <button
                          onClick={handleCopyKey}
                          className="p-2 text-zinc-500 hover:text-indigo-400 hover:bg-zinc-900 rounded-xl transition-all"
                        >
                          {keyCopied ? (
                            <Check size={16} className="text-emerald-500" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                    
                    <div className="group relative">
                        <code className="block break-all rounded-2xl bg-zinc-900 px-6 py-5 text-sm font-mono border border-zinc-800 text-zinc-300 group-hover:border-indigo-500/30 transition-all select-all">
                            {showKey ? apiKey.key : "sk_live_" + "•".repeat(32)}
                        </code>
                    </div>

                    <div className="mt-6 flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                      <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                      <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider italic">Write this down. This is the only time the full secret will be displayed.</span>
                    </div>
                  </motion.div>
                ) : (
                    <div className="p-12 border-2 border-dashed border-zinc-800 rounded-[2.5rem] flex flex-col items-center justify-center text-center bg-zinc-950/20">
                        <div className="p-4 bg-zinc-900 rounded-2xl mb-4 border border-zinc-800">
                             <Lock fontSize={24} className="text-zinc-700 h-8 w-8" />
                        </div>
                        <h4 className="text-white font-bold mb-1">No Active Integration Keys</h4>
                        <p className="text-zinc-500 text-sm max-w-xs italic">Generate a live key to begin processing real-world transactions.</p>
                    </div>
                )}
              </AnimatePresence>

              <div className="pt-6 border-t border-zinc-800/50">
                <button
                  onClick={handleGenerateKey}
                  disabled={generatingKey}
                  className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-sm text-white shadow-xl shadow-indigo-600/20 transition-all active:scale-[0.98] flex items-center gap-2"
                >
                  {generatingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap size={18} />}
                  provision New API Key
                </button>
              </div>
            </div>
          </SpotlightCard>

          {/* Provider Credentials Section */}
          <SpotlightCard className="p-0 overflow-hidden border-zinc-800/50 bg-zinc-900/10">
            <div className="p-6 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/30">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                        <Shield className="h-4 w-4 text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Gateway Vault</h3>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-950 border border-zinc-800 rounded-lg">
                    <ShieldCheck className="h-3 w-3 text-emerald-500" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">AES-256 Encrypted</span>
                </div>
            </div>
            
            <form onSubmit={handleSaveProvider} className="p-8 space-y-8">
              <p className="text-sm text-zinc-500 leading-relaxed max-w-2xl">
                Bridge your PayVault instance with downstream processors. Provide your secret keys to enable 
                direct clearing through your preferred financial gateway.
              </p>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Selected Processor</label>
                  <div className="flex p-1.5 bg-zinc-950 border border-zinc-800 rounded-[1.25rem] w-full sm:w-[480px]">
                      {["paystack", "flutterwave"].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setProvider(p as any)}
                            className={cn(
                                "flex-1 py-3 text-xs font-bold rounded-xl transition-all relative capitalize",
                                provider === p ? "text-white" : "text-zinc-500 hover:text-zinc-300"
                            )}
                          >
                              {provider === p && (
                                  <motion.div 
                                    layoutId="provider-tab"
                                    className="absolute inset-0 bg-zinc-800 rounded-xl border border-zinc-700/50 shadow-inner"
                                    transition={{ type: "spring", bounce: 0.1, duration: 0.4 }}
                                  />
                              )}
                              <span className="relative z-10">{p}</span>
                          </button>
                      ))}
                  </div>
                </div>

                <div className="space-y-2 max-w-xl">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 px-1">Gateway Secret Key</label>
                  <div className="relative group">
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
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-5 pr-12 py-4 text-sm font-mono text-white focus:outline-none focus:border-indigo-500/50 focus:bg-zinc-900/80 transition-all placeholder:text-zinc-700"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-zinc-500 hover:text-white transition-colors"
                    >
                      {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 px-1 mt-2">
                       <div className="h-1 w-1 rounded-full bg-zinc-700" />
                       <span className="text-[10px] text-zinc-600 font-medium">Key will be stored in our multi-tenant secure HSM.</span>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-zinc-800/50">
                <button
                  type="submit"
                  disabled={savingProvider || !secretKey}
                  className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 rounded-2xl font-bold text-sm text-white shadow-xl shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center gap-2"
                >
                  {savingProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck size={18} />}
                  Commit Credentials
                </button>
              </div>
            </form>
          </SpotlightCard>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          <SpotlightCard className="p-8 border-zinc-800/50 bg-indigo-500/[0.03] space-y-6">
            <div className="flex flex-col gap-4">
              <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Cpu className="h-6 w-6 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-md font-bold text-white tracking-tight uppercase">Encryption Protocol</h4>
                <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                   Your core secrets are isolated within a hardware-backed vault. We use <span className="text-indigo-400 font-bold">AES-256-GCM</span> with unique salt per merchant.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-zinc-800/50">
                <div className="flex items-start gap-3">
                    <div className="mt-1 p-1 bg-amber-500/10 rounded-full">
                        <AlertTriangle size={10} className="text-amber-500" />
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">Revoking an API key instantly terminates all active sessions associated with that token.</p>
                </div>
                <div className="flex items-start gap-3">
                    <div className="mt-1 p-1 bg-emerald-500/10 rounded-full">
                        <Check size={10} className="text-emerald-500" />
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-tight">PCI-DSS Level 1 compliance remains intact as sensitive data never touches your app server.</p>
                </div>
            </div>
          </SpotlightCard>

          <div className="p-6 rounded-[2rem] border border-zinc-800 bg-zinc-950/50">
              <h5 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4">Quick Shortcuts</h5>
              <div className="space-y-2">
                  <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900 transition-colors group">
                      <span className="text-xs font-bold text-zinc-400 group-hover:text-white">API Reference</span>
                      <ChevronRight size={14} className="text-zinc-600 group-hover:text-indigo-400" />
                  </button>
                  <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900 transition-colors group">
                      <span className="text-xs font-bold text-zinc-400 group-hover:text-white">Web SDK Setup</span>
                      <ChevronRight size={14} className="text-zinc-600 group-hover:text-indigo-400" />
                  </button>
                  <button className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-zinc-900 transition-colors group">
                      <span className="text-xs font-bold text-zinc-400 group-hover:text-white">System Status</span>
                      <ChevronRight size={14} className="text-zinc-600 group-hover:text-indigo-400" />
                  </button>
              </div>
          </div>
        </div>
      </div>
    </div>
  );
}

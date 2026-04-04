import { useState } from "react";
import { dashboard } from "@/lib/api";
import { toast } from "sonner";
import type { APIKey } from "@/lib/types";

export function useSystemSettings() {
  const [apiKey, setApiKey] = useState<APIKey | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [provider, setProvider] = useState<"paystack" | "flutterwave">("paystack");
  const [secretKey, setSecretKey] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);

  

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
      toast.success("Cryptographic access vector established.");
    } catch (err: any) {
      console.error("Vector Provisioning Aborted:", err);
      toast.error("Internal service failure. Unable to allocate new key scope.");
    } finally {
      setGeneratingKey(false);
    }
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
      toast.success(`Vault synchronized for secondary processor.`);
    } catch (err: any) {
      console.error("Downstream Encryption Override Failed:", err);
      toast.error("Vault rejected payload validation. Connection secure.");
    } finally {
      setSavingProvider(false);
    }
  };

  return {
    apiKey,
    generatingKey,
    keyCopied,
    setKeyCopied,
    showKey,
    setShowKey,
    provider,
    setProvider,
    secretKey,
    setSecretKey,
    showSecret,
    setShowSecret,
    savingProvider,
    handleGenerateKey,
    handleSaveProvider
  };
}

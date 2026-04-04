import { useState, useEffect, useCallback } from "react";
import { dashboard } from "@/lib/api";
import { toast } from "sonner";
import type { FraudEvent, UpsertFraudRuleRequest } from "@/lib/types";

export function useFraudProtection() {
  const [events, setEvents] = useState<FraudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  

  const [ruleForm, setRuleForm] = useState<UpsertFraudRuleRequest>({
    rule_type: "velocity",
    threshold: 10,
    action: "flag",
    enabled: true,
  });

  const loadEvents = useCallback(async () => {
    try {
      const data = await dashboard.listFraudEvents({ limit: 50 });
      setEvents(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error("Firewall Sync Malfunction:", err);
      setEvents([]);
      toast.error("Real-time event feed unresponsive. Displaying historical logs.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await dashboard.upsertFraudRule(ruleForm);
      toast.success("Security engines recalibrated.");
    } catch (err: any) {
      console.error("Policy Application Denied:", err);
      toast.error("Failed to inject rule into security layer. Please audit parameters.");
    } finally {
      setSaving(false);
    }
  };

  return {
    events,
    loading,
    saving,
    ruleForm,
    setRuleForm,
    handleSaveRule
  };
}

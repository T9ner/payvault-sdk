import { Zap, Target, Fingerprint, Globe } from "lucide-react";

export const fallbackActivityData = [
    { name: "Mon", income: 4000, expense: 2400 },
    { name: "Tue", income: 3000, expense: 1398 },
    { name: "Wed", income: 2000, expense: 9800 },
    { name: "Thu", income: 2780, expense: 3908 },
    { name: "Fri", income: 1890, expense: 4800 },
    { name: "Sat", income: 2390, expense: 3800 },
    { name: "Sun", income: 3490, expense: 4300 },
];

export const fallbackPieData = [
    { name: "USD", value: 400, color: "#0f172a" },
    { name: "EUR", value: 300, color: "#3b82f6" }
];

export const transactionStatusTabs = [
    { value: "all", label: "All" },
    { value: "success", label: "Success" },
    { value: "pending", label: "Pending" },
    { value: "failed", label: "Failed" },
    { value: "refunded", label: "Refunded" },
];

export const fraudRuleTypes = [
    { value: "velocity", label: "Velocity Check", desc: "Max transactions per time window", icon: Zap },
    { value: "amount_limit", label: "Amount Limit", desc: "Block transactions above threshold", icon: Target },
    { value: "duplicate", label: "Duplicate Detection", desc: "Detect duplicate payment attempts", icon: Fingerprint },
    { value: "geo_block", label: "Geo Blocking", desc: "Block transactions from specific regions", icon: Globe },
];

export const settingsIntegrationResources = [
    "API Reference",
    "Web SDK Guide",
    "Webhooks & Events",
    "Security Best Practices"
];

import { useState, useEffect, useCallback } from "react";
import { dashboard as dashboardApi, payments } from "@/lib/api";
import { toast } from "sonner";
import { fallbackActivityData } from "@/data/mockData";
import type { PaginatedResponse, PaymentLink } from "@/lib/types";

export function useDashboard() {
    const [stats, setStats] = useState<any>(null);
    const [chartData, setChartData] = useState<any[]>([]);
    const [currencies, setCurrencies] = useState<string[]>([]);
    const [activeLinksCount, setActiveLinksCount] = useState(0);
    const [isUsingFallback, setIsUsingFallback] = useState(false);

    const loadData = useCallback(async () => {
        try {
            const [overviewRes, volumeRes, linksRes, txRes] = await Promise.allSettled([
                dashboardApi.getOverviewStats(7),
                dashboardApi.getAnalyticsVolume(7),
                dashboardApi.listPaymentLinks(),
                payments.listTransactions({ limit: 6 }),
            ]);

            const oStats = overviewRes.status === "fulfilled" ? overviewRes.value : null;
            const vPoints = volumeRes.status === "fulfilled" ? volumeRes.value : [];
            const linksData = linksRes.status === "fulfilled" ? linksRes.value : [];
            
            // Error handling pattern: Extract rejections to log but don't break the UI.
            [overviewRes, volumeRes, linksRes, txRes].forEach((res, idx) => {
                if (res.status === "rejected") {
                    console.error(`Dashboard Fetch Error [Resource ${idx}]:`, res.reason);
                }
            });

            setStats(oStats);
            
            const linksArray = Array.isArray(linksData) ? linksData : ((linksData as unknown as PaginatedResponse<PaymentLink>)?.items || []);
            setActiveLinksCount(linksArray.filter((l: any) => l.is_active).length);

            const grouped: Record<string, Record<string, number>> = {};
            const currs = new Set<string>();

            if (Array.isArray(vPoints)) {
                vPoints.forEach((pt: any) => {
                    if (!grouped[pt.date]) grouped[pt.date] = {};
                    grouped[pt.date][pt.currency] = pt.total;
                    currs.add(pt.currency);
                });
            }

            const currsArray = Array.from(currs);
            
            if (currsArray.length > 0) {
                const today = new Date();
                const timeline = Array.from({ length: 7 }).map((_, i) => {
                    const d = new Date(today);
                    d.setDate(d.getDate() - (6 - i));
                    const dateStr = d.toISOString().split("T")[0];
                    const nameStr = d.toLocaleDateString("en-US", { weekday: 'short' });

                    const dayData: any = { name: nameStr };
                    currsArray.forEach(c => {
                       dayData[c] = grouped[dateStr]?.[c] || 0;
                    });
                    return dayData;
                });

                setCurrencies(currsArray);
                setChartData(timeline);
                setIsUsingFallback(false);
            } else {
                // If the database is empty, provide fallbacks so the charts don't render broken
                setCurrencies(['USD', 'EUR']);
                setChartData(fallbackActivityData.map(d => ({
                    name: d.name,
                    USD: d.income,
                    EUR: d.expense
                })));
                setIsUsingFallback(true);
            }
        } catch (err: any) {
            console.error('Failed to load dashboard data overview:', err);
            toast.error("Couldn't load dashboard data. Showing sample data.");
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return {
        stats,
        chartData,
        currencies,
        activeLinksCount,
        isUsingFallback
    };
}

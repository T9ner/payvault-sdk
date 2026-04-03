import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export const timeRanges = ["Daily", "Monthly", "Yearly"];

export function TimeToggle({ 
    active, 
    onChange 
}: { 
    active: string; 
    onChange: (val: string) => void 
}) {
    return (
        <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-lg">
            {timeRanges.map((range) => (
                <button
                    key={range}
                    onClick={() => onChange(range)}
                    className={cn(
                        "relative px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                        active === range ? "text-white" : "text-zinc-400 hover:text-zinc-200"
                    )}
                >
                    {active === range && (
                        <motion.div
                            layoutId="active-toggle"
                            className="absolute inset-0 bg-indigo-600 rounded-md shadow-md -z-0"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                    )}
                    <span className="relative z-10">{range}</span>
                </button>
            ))}
        </div>
    );
}

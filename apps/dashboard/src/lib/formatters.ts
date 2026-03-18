import { format, formatDistanceToNow } from "date-fns";

/**
 * Format amount in minor units (kobo/cents) to display string.
 * e.g. 500000 NGN -> "NGN 5,000.00"
 */
export function formatCurrency(amount: number, currency = "NGN"): string {
  const major = amount / 100;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(major);
}

/**
 * Format amount already in major units.
 */
export function formatMajorCurrency(amount: number, currency = "NGN"): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format ISO date string to readable format.
 * e.g. "2024-03-09T12:00:00Z" -> "Mar 9, 2024 12:00 PM"
 */
export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), "MMM d, yyyy h:mm a");
}

/**
 * Format ISO date string to short date.
 * e.g. "2024-03-09T12:00:00Z" -> "Mar 9, 2024"
 */
export function formatShortDate(dateStr: string): string {
  return format(new Date(dateStr), "MMM d, yyyy");
}

/**
 * Format ISO date string to relative time.
 * e.g. "5 minutes ago"
 */
export function formatRelative(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

/**
 * Truncate a string with ellipsis.
 */
export function truncate(str: string, maxLen = 20): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

/**
 * Copy text to clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

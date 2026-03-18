package services

import (
	"time"
)

// ── Period Calculation Helpers ──────────────────────────────────────

// CalculateNextPeriodEnd computes the next billing period end date.
// Respects the billing_cycle_anchor (day of month).
// If anchor is 31 and month has 30 days, use last day of month.
func CalculateNextPeriodEnd(currentEnd time.Time, interval string, intervalCount int, anchor int) time.Time {
	switch interval {
	case "daily":
		return currentEnd.AddDate(0, 0, intervalCount)
	case "weekly":
		return currentEnd.AddDate(0, 0, 7*intervalCount)
	case "monthly":
		next := currentEnd.AddDate(0, intervalCount, 0)
		// Clamp to anchor day, respecting month length
		return clampToAnchorDay(next, anchor)
	case "yearly":
		next := currentEnd.AddDate(intervalCount, 0, 0)
		return clampToAnchorDay(next, anchor)
	}
	return currentEnd
}

// clampToAnchorDay sets the day to the anchor, or last day of month if anchor exceeds month length.
func clampToAnchorDay(t time.Time, anchor int) time.Time {
	year, month, _ := t.Date()
	lastDay := time.Date(year, month+1, 0, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location()).Day()
	day := anchor
	if day > lastDay {
		day = lastDay
	}
	return time.Date(year, month, day, t.Hour(), t.Minute(), t.Second(), t.Nanosecond(), t.Location())
}

// ── Proration Calculation Helper ────────────────────────────────────

// CalculateProration computes the fair-value proration for a mid-cycle plan change.
// Returns the amount to charge the customer (positive = charge, zero = no charge for downgrades).
func CalculateProration(currentAmount, newAmount int64, periodStart, periodEnd, adjustmentDate time.Time) int64 {
	totalDays := periodEnd.Sub(periodStart).Hours() / 24
	daysUsed := adjustmentDate.Sub(periodStart).Hours() / 24
	daysRemaining := totalDays - daysUsed

	if totalDays <= 0 {
		return 0
	}

	// Credit for unused portion of current plan
	credit := float64(currentAmount) * (daysRemaining / totalDays)

	// Cost for remaining portion on new plan
	charge := float64(newAmount) * (daysRemaining / totalDays)

	// Net amount (only charge, never refund)
	net := int64(charge - credit)
	if net < 0 {
		return 0 // Downgrades: no refund, change at period end via 'auto' timing
	}
	return net
}

// ── Status Transition State Machine ─────────────────────────────────

var validTransitions = map[string][]string{
	"incomplete":             {"active", "incomplete_expired"},
	"trialing":               {"active", "past_due", "canceled"},
	"active":                 {"past_due", "cancellation_scheduled", "canceled"},
	"past_due":               {"active", "unpaid", "canceled"},
	"unpaid":                 {"active", "canceled"},
	"cancellation_scheduled": {"active", "canceled"},
}

// CanTransition validates if a subscription can move to a new status.
func CanTransition(from, to string) bool {
	allowed, ok := validTransitions[from]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
}

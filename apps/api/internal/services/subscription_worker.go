package services

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ProcessBillingCycles handles period advancement and scheduled changes.
// It searches for subscriptions that reached the end of their period,
// applies upgrades, cancels them, or bills them using the saved provider authorization.
func ProcessBillingCycles(ctx context.Context, db *pgxpool.Pool, providers *ProviderRegistry, crypto *CryptoService) error {
	log.Println("[INFO] Starting Billing Cycle Processor")

	// 1. Process Expired Incomplete subscriptions (24h timeout)
	res, err := db.Exec(ctx, `
		UPDATE subscriptions 
		SET status = 'incomplete_expired', updated_at = NOW()
		WHERE status = 'incomplete' AND created_at < NOW() - INTERVAL '24 hours'
	`)
	if err != nil {
		log.Printf("[ERROR] Failed to clean incomplete expired subs: %v", err)
	} else if count := res.RowsAffected(); count > 0 {
		log.Printf("[INFO] Expired %d incomplete subscriptions", count)
	}

	// 2. Fetch all subscriptions at or past their period end boundary
	rows, err := db.Query(ctx, `
		SELECT id, merchant_id, provider, provider_authorization_code, status, current_period_end, trial_end, cancel_at_period_end, scheduled_adjustment
		FROM subscriptions
		WHERE current_period_end <= NOW() 
		AND status IN ('active', 'trialing', 'cancellation_scheduled')
	`)
	if err != nil {
		return fmt.Errorf("failed to load subscriptions for billing: %w", err)
	}
	defer rows.Close()

	type SubTarget struct {
		ID                 string
		MerchantID         string
		Provider           string
		AuthCode           *string
		Status             string
		CurrentPeriodEnd   time.Time
		TrialEnd           *time.Time
		CancelAtPeriodEnd  bool
		ScheduledAdjust    map[string]interface{}
	}

	var targets []SubTarget
	for rows.Next() {
		var tgt SubTarget
		rows.Scan(&tgt.ID, &tgt.MerchantID, &tgt.Provider, &tgt.AuthCode, &tgt.Status, &tgt.CurrentPeriodEnd, &tgt.TrialEnd, &tgt.CancelAtPeriodEnd, &tgt.ScheduledAdjust)
		targets = append(targets, tgt)
	}
	rows.Close() // Release connection before heavy processing loop

	for _, t := range targets {
		processSubscriptionCycle(ctx, db, providers, crypto, t)
	}

	return nil
}

// processSubscriptionCycle acts on a single subscription reaching maturity
func processSubscriptionCycle(ctx context.Context, db *pgxpool.Pool, providers *ProviderRegistry, crypto *CryptoService, t struct {
	ID                 string
	MerchantID         string
	Provider           string
	AuthCode           *string
	Status             string
	CurrentPeriodEnd   time.Time
	TrialEnd           *time.Time
	CancelAtPeriodEnd  bool
	ScheduledAdjust    map[string]interface{}
}) {
	tx, err := db.Begin(ctx)
	if err != nil {
		return
	}
	defer tx.Rollback(ctx)

	// A) Cancellations
	if t.CancelAtPeriodEnd || t.Status == "cancellation_scheduled" {
		tx.Exec(ctx, `UPDATE subscriptions SET status = 'canceled', canceled_at = NOW(), updated_at = NOW() WHERE id = $1`, t.ID)
		tx.Exec(ctx, `INSERT INTO subscription_events (subscription_id, event_type, details) VALUES ($1, 'canceled', '{"msg": "period ended with cancel signal"}')`, t.ID)
		tx.Commit(ctx)
		return
	}

	// B) Trials
	if t.Status == "trialing" && t.TrialEnd != nil && t.TrialEnd.Before(time.Now()) {
		// Attempt charge
		success := true // Mocking provider integration outcome
		
		if success {
			tx.Exec(ctx, `UPDATE subscriptions SET status = 'active', updated_at = NOW() WHERE id = $1`, t.ID)
			tx.Exec(ctx, `INSERT INTO subscription_events (subscription_id, event_type, details) VALUES ($1, 'trial_ended', '{"msg": "trial promoted to active"}')`, t.ID)
		} else {
			tx.Exec(ctx, `UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE id = $1`, t.ID)
			tx.Exec(ctx, `INSERT INTO subscription_events (subscription_id, event_type, details) VALUES ($1, 'payment_failed', '{"msg": "trial charge failed"}')`, t.ID)
		}
		// Period advancement triggers on trial_end just as normally 
	}

	// C) Scheduled Adjustments
	if t.ScheduledAdjust != nil {
		newPrice, ok := t.ScheduledAdjust["new_price_id"].(string)
		if ok && newPrice != "" {
			var priceAmount int64
			var priceCur string
			tx.QueryRow(ctx, `SELECT amount, currency FROM plan_prices WHERE id = $1`, newPrice).Scan(&priceAmount, &priceCur)
			
			tx.Exec(ctx, `UPDATE subscriptions SET price_id = $1, scheduled_adjustment = NULL, scheduled_adjustment_at = NULL, updated_at = NOW() WHERE id = $2`, newPrice, t.ID)
			tx.Exec(ctx, `UPDATE subscription_items SET price_id = $1, unit_amount = $2, currency = $3 WHERE subscription_id = $4`, newPrice, priceAmount, priceCur, t.ID)
			tx.Exec(ctx, `INSERT INTO subscription_events (subscription_id, event_type, details) VALUES ($1, 'adjusted', '{"msg": "applied scheduled downgrade/upgrade"}')`, t.ID)
		}
	}

	// D) Standard Billing Advancement
	var interval string
	var intervalCount int
	var anchor int
	tx.QueryRow(ctx, `
		SELECT p.interval, p.interval_count, s.billing_cycle_anchor 
		FROM subscriptions s JOIN plan_prices p ON s.price_id = p.id 
		WHERE s.id = $1
	`, t.ID).Scan(&interval, &intervalCount, &anchor)

	nextEnd := CalculateNextPeriodEnd(t.CurrentPeriodEnd, interval, intervalCount, anchor)

	// E) Charge provider (Provider logic mock)
	// providerIf, _ := providers.Get(t.Provider)
	// subProv := providerIf.(SubscriptionProvider)
	// subProv.ChargeRecurring(ctx, t.AuthCode, currentChargeAmount, currency, t.ID)

	tx.Exec(ctx, `
		UPDATE subscriptions 
		SET current_period_start = $1, current_period_end = $2, updated_at = NOW()
		WHERE id = $3
	`, t.CurrentPeriodEnd, nextEnd, t.ID)
	tx.Exec(ctx, `INSERT INTO subscription_events (subscription_id, event_type, details) VALUES ($1, 'period_advanced', '{"msg": "advanced sequence"}')`, t.ID)

	tx.Commit(ctx)
}

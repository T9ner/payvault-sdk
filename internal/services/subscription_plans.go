package services

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// ── Plans (Merchant Dashboard) ────────────────────────────────────

func (s *SubscriptionService) CreatePlan(ctx context.Context, merchantID string, input CreatePlanInput) (*Plan, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	plan := &Plan{
		MerchantID:  merchantID,
		Name:        input.Name,
		Description: input.Description,
		Active:      true,
		Metadata:    input.Metadata,
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO plans (merchant_id, name, description, active, metadata)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at, updated_at
	`, plan.MerchantID, plan.Name, plan.Description, plan.Active, jsonbOrEmpty(plan.Metadata),
	).Scan(&plan.ID, &plan.CreatedAt, &plan.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create plan: %w", err)
	}

	for _, pInput := range input.Prices {
		price := PlanPrice{
			PlanID:          plan.ID,
			Nickname:        pInput.Nickname,
			Amount:          pInput.Amount,
			Currency:        pInput.Currency,
			Interval:        pInput.Interval,
			IntervalCount:   pInput.IntervalCount,
			TrialPeriodDays: pInput.TrialPeriodDays,
			Active:          true,
		}
		if price.IntervalCount <= 0 {
			price.IntervalCount = 1
		}

		err = tx.QueryRow(ctx, `
			INSERT INTO plan_prices (plan_id, nickname, amount, currency, interval, interval_count, trial_period_days, active)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			RETURNING id, created_at
		`, price.PlanID, price.Nickname, price.Amount, price.Currency, price.Interval,
			price.IntervalCount, price.TrialPeriodDays, price.Active,
		).Scan(&price.ID, &price.CreatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to create price: %w", err)
		}
		plan.Prices = append(plan.Prices, price)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return plan, nil
}

func (s *SubscriptionService) ListPlans(ctx context.Context, merchantID string) ([]Plan, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, name, description, active, metadata, created_at, updated_at
		FROM plans WHERE merchant_id = $1 ORDER BY created_at DESC
	`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var plans []Plan
	var planIDs []string
	planMap := make(map[string]*Plan)

	for rows.Next() {
		var p Plan
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Active, &p.Metadata, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		plans = append(plans, p)
		planIDs = append(planIDs, p.ID)
		planMap[p.ID] = &plans[len(plans)-1]
	}
	rows.Close() // Close early as we will do another query

	if len(planIDs) == 0 {
		return plans, nil
	}

	// Fetch prices for all plans
	priceRows, err := s.db.Query(ctx, `
		SELECT id, plan_id, nickname, amount, currency, interval, interval_count, trial_period_days, active, created_at
		FROM plan_prices WHERE plan_id = ANY($1) ORDER BY created_at ASC
	`, planIDs)
	if err != nil {
		return nil, err
	}
	defer priceRows.Close()

	for priceRows.Next() {
		var pr PlanPrice
		if err := priceRows.Scan(&pr.ID, &pr.PlanID, &pr.Nickname, &pr.Amount, &pr.Currency, &pr.Interval,
			&pr.IntervalCount, &pr.TrialPeriodDays, &pr.Active, &pr.CreatedAt); err != nil {
			return nil, err
		}
		if p, ok := planMap[pr.PlanID]; ok {
			p.Prices = append(p.Prices, pr)
		}
	}

	return plans, nil
}

func (s *SubscriptionService) UpdatePlan(ctx context.Context, merchantID, planID string, active *bool, name, description *string) error {
	// Build dynamic update
	query := "UPDATE plans SET updated_at = NOW()"
	args := []interface{}{}
	argID := 1

	if active != nil {
		query += fmt.Sprintf(", active = $%d", argID)
		args = append(args, *active)
		argID++
	}
	if name != nil {
		query += fmt.Sprintf(", name = $%d", argID)
		args = append(args, *name)
		argID++
	}
	if description != nil {
		query += fmt.Sprintf(", description = $%d", argID)
		args = append(args, *description)
		argID++
	}

	query += fmt.Sprintf(" WHERE id = $%d AND merchant_id = $%d", argID, argID+1)
	args = append(args, planID, merchantID)

	res, err := s.db.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *SubscriptionService) AddPriceToPlan(ctx context.Context, merchantID, planID string, input CreatePriceInput) (*PlanPrice, error) {
	// Ensure plan belongs to merchant
	var exists bool
	err := s.db.QueryRow(ctx, `SELECT true FROM plans WHERE id = $1 AND merchant_id = $2`, planID, merchantID).Scan(&exists)
	if err != nil || !exists {
		return nil, fmt.Errorf("plan not found")
	}

	price := &PlanPrice{
		PlanID:          planID,
		Nickname:        input.Nickname,
		Amount:          input.Amount,
		Currency:        input.Currency,
		Interval:        input.Interval,
		IntervalCount:   input.IntervalCount,
		TrialPeriodDays: input.TrialPeriodDays,
		Active:          true,
	}
	if price.IntervalCount <= 0 {
		price.IntervalCount = 1
	}

	err = s.db.QueryRow(ctx, `
		INSERT INTO plan_prices (plan_id, nickname, amount, currency, interval, interval_count, trial_period_days, active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`, price.PlanID, price.Nickname, price.Amount, price.Currency, price.Interval,
		price.IntervalCount, price.TrialPeriodDays, price.Active,
	).Scan(&price.ID, &price.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to add price: %w", err)
	}

	return price, nil
}

func (s *SubscriptionService) DeactivatePrice(ctx context.Context, merchantID, planID, priceID string) error {
	// Ensure plan belongs to merchant
	var exists bool
	err := s.db.QueryRow(ctx, `SELECT true FROM plans WHERE id = $1 AND merchant_id = $2`, planID, merchantID).Scan(&exists)
	if err != nil || !exists {
		return fmt.Errorf("plan not found")
	}

	res, err := s.db.Exec(ctx, `
		UPDATE plan_prices SET active = false, updated_at = NOW() WHERE id = $1 AND plan_id = $2
	`, priceID, planID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

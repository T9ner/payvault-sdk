package services

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type FraudService struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

func NewFraudService(db *pgxpool.Pool, redisClient *redis.Client) *FraudService {
	return &FraudService{db: db, redis: redisClient}
}

// ── Types ────────────────────────────────────────────────────────

type FraudEvent struct {
	ID            string    `json:"id"`
	TransactionID string    `json:"transaction_id"`
	RuleType      string    `json:"rule_type"`
	RiskScore     int       `json:"risk_score"`
	ActionTaken   string    `json:"action_taken"`
	CreatedAt     time.Time `json:"created_at"`
}

type UpsertFraudRuleRequest struct {
	RuleType string `json:"rule_type"` // "velocity" | "amount_limit" | "duplicate" | "geo_block"
	Threshold int    `json:"threshold"`
	Action    string `json:"action"`    // "flag" | "block"
	Enabled   bool   `json:"enabled"`
}

type FraudRule struct {
	ID        string `json:"id"`
	RuleType  string `json:"rule_type"`
	Threshold int    `json:"threshold"`
	Action    string `json:"action"`
	Enabled   bool   `json:"enabled"`
}

type FraudCheckInput struct {
	MerchantID    string
	TransactionID string
	Amount        int64
	Email         string
	IPAddress     string
	CountryCode   string // from IP lookup
	CardCountry   string // from BIN lookup
}

// ── Core Evaluator ───────────────────────────────────────────────

type FraudDecision string

const (
	FraudActionAllow FraudDecision = "allow"
	FraudActionFlag  FraudDecision = "flag"
	FraudActionBlock FraudDecision = "block"
)

// CheckFraud runs all active rules. Returns the most severe action and composite risk score.
// Severity: block > flag > allow.
func (s *FraudService) CheckFraud(ctx context.Context, input FraudCheckInput) (FraudDecision, int, error) {
	rules, err := s.listActiveRules(ctx, input.MerchantID)
	if err != nil {
		return FraudActionAllow, 0, err
	}

	finalDecision := FraudActionAllow
	totalRiskScore := 0
	rulesTriggered := 0

	for _, rule := range rules {
		triggered := false
		score := 0

		switch rule.RuleType {
		case "velocity":
			triggered, score = s.checkVelocity(ctx, input, rule.Threshold)
		case "amount_limit":
			triggered, score = s.checkAmountLimit(ctx, input, rule.Threshold)
		case "duplicate":
			triggered, score = s.checkDuplicate(ctx, input, rule.Threshold) // threshold might be minutes
		case "geo_block":
			triggered, score = s.checkGeoBlock(ctx, input) // simple mismatch
		}

		if triggered {
			rulesTriggered++
			totalRiskScore += score

			// Escalate severity
			if rule.Action == "block" {
				finalDecision = FraudActionBlock
			} else if rule.Action == "flag" && finalDecision != FraudActionBlock {
				finalDecision = FraudActionFlag
			}

			// Log the event per triggered rule
			s.logEvent(ctx, input, rule.RuleType, score, rule.Action)
		}
	}

	// Average or cap the composite risk score
	if rulesTriggered > 0 {
		totalRiskScore = int(math.Min(float64(totalRiskScore)/float64(rulesTriggered), 100))
	}

	return finalDecision, totalRiskScore, nil
}

// ── Engine Mechanics ─────────────────────────────────────────────

func (s *FraudService) checkVelocity(ctx context.Context, input FraudCheckInput, threshold int) (bool, int) {
	// Look at number of transactions this email has made in the last 15 minutes globally
	key := fmt.Sprintf("fraud:vel:%s:%s", input.MerchantID, input.Email)
	count := s.incrementCounter(ctx, key, 15*time.Minute)

	if count > int64(threshold) {
		ratio := float64(count) / float64(threshold)
		return true, int(math.Min(ratio*50, 100))
	}
	return false, 0
}

func (s *FraudService) checkAmountLimit(ctx context.Context, input FraudCheckInput, threshold int) (bool, int) {
	if input.Amount > int64(threshold) {
		ratio := float64(input.Amount) / float64(threshold)
		return true, int(math.Min(ratio*60, 100)) // Can max out at 100 if extremely high
	}
	return false, 0
}

func (s *FraudService) checkDuplicate(ctx context.Context, input FraudCheckInput, windowMinutes int) (bool, int) {
	if windowMinutes <= 0 {
		windowMinutes = 5 // Default short window
	}
	// Check if same email + same amount exists in the recent window
	key := fmt.Sprintf("fraud:dup:%s:%s:%d", input.MerchantID, input.Email, input.Amount)
	count := s.incrementCounter(ctx, key, time.Duration(windowMinutes)*time.Minute)

	if count > 1 {
		return true, 85 // High risk for exact duplicate attempts spanning same customer + amount
	}
	return false, 0
}

func (s *FraudService) checkGeoBlock(ctx context.Context, input FraudCheckInput) (bool, int) {
	if input.CountryCode == "" || input.CardCountry == "" {
		return false, 0
	}
	if input.CountryCode != input.CardCountry {
		return true, 70 // Medium-high risk flag for mismatched IPs and Cards
	}
	return false, 0
}

// ── Database Access ──────────────────────────────────────────────

func (s *FraudService) UpsertFraudRule(ctx context.Context, merchantID string, req UpsertFraudRuleRequest) (*FraudRule, error) {
	query := `
		INSERT INTO fraud_rules (merchant_id, rule_type, threshold, action, enabled)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (merchant_id, rule_type)
		DO UPDATE SET threshold = $3, action = $4, enabled = $5, updated_at = NOW()
		RETURNING id, rule_type, threshold, action, enabled
	`
	var rule FraudRule
	err := s.db.QueryRow(ctx, query, merchantID, req.RuleType, req.Threshold, req.Action, req.Enabled).
		Scan(&rule.ID, &rule.RuleType, &rule.Threshold, &rule.Action, &rule.Enabled)
	return &rule, err
}

func (s *FraudService) ListFraudRules(ctx context.Context, merchantID string) ([]FraudRule, error) {
	rows, err := s.db.Query(ctx, "SELECT id, rule_type, threshold, action, enabled FROM fraud_rules WHERE merchant_id = $1 ORDER BY rule_type", merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []FraudRule
	for rows.Next() {
		var r FraudRule
		if err := rows.Scan(&r.ID, &r.RuleType, &r.Threshold, &r.Action, &r.Enabled); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	return rules, nil
}

func (s *FraudService) ListFraudEvents(ctx context.Context, merchantID string, limit int) ([]FraudEvent, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, transaction_id, rule_type, risk_score, action_taken, created_at
		FROM fraud_events WHERE merchant_id = $1
		ORDER BY created_at DESC LIMIT $2
	`, merchantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []FraudEvent
	for rows.Next() {
		var e FraudEvent
		if err := rows.Scan(&e.ID, &e.TransactionID, &e.RuleType, &e.RiskScore, &e.ActionTaken, &e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	if events == nil {
		events = []FraudEvent{}
	}
	return events, nil
}

// ── Private Helpers ────────────────────────────────────────────

func (s *FraudService) listActiveRules(ctx context.Context, merchantID string) ([]FraudRule, error) {
	rows, err := s.db.Query(ctx, "SELECT rule_type, threshold, action FROM fraud_rules WHERE merchant_id = $1 AND enabled = true", merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []FraudRule
	for rows.Next() {
		var r FraudRule
		if err := rows.Scan(&r.RuleType, &r.Threshold, &r.Action); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	return rules, nil
}

func (s *FraudService) logEvent(ctx context.Context, input FraudCheckInput, ruleType string, score int, action string) {
	// Usually transactions might not be inserted yet when validation runs, but per prompt it wants the ID.
	// Typically we'd use a zero-uuid if transaction ID isn't resolved, but we'll fulfill the schema logic.
	txID := input.TransactionID
	if txID == "" {
		txID = "00000000-0000-0000-0000-000000000000" // Fallback fallback if strictly tied
	}

	_, _ = s.db.Exec(ctx, `
		INSERT INTO fraud_events (merchant_id, transaction_id, rule_type, risk_score, action_taken, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, input.MerchantID, txID, ruleType, score, action, fmt.Sprintf(`{"email":%q, "ip":%q}`, input.Email, input.IPAddress))
}

func (s *FraudService) incrementCounter(ctx context.Context, key string, window time.Duration) int64 {
	pipe := s.redis.Pipeline()
	countCmd := pipe.Incr(ctx, key)
	pipe.Expire(ctx, key, window)
	_, _ = pipe.Exec(ctx)
	count, _ := countCmd.Result()
	return count
}

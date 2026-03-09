package services

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

// FraudService implements heuristic-based fraud detection using Redis sliding windows
// and configurable per-merchant rules. No ML -- pure statistics and velocity checks.
//
// How it works:
//   1. Before a charge is processed, EvaluateTransaction() runs all enabled rules
//   2. Each rule contributes a weighted score (0-100 scale)
//   3. Scores are combined into a composite risk score
//   4. Based on the merchant's thresholds: allow, flag for review, or block
//   5. Every evaluation is logged to fraud_events for audit and tuning
//
// Built-in rules:
//   - velocity_email:    Same email hitting X transactions in Y minutes
//   - velocity_ip:       Same IP hitting X transactions in Y minutes
//   - velocity_card:     Same card fingerprint across multiple merchants
//   - amount_anomaly:    Transaction deviates significantly from merchant's average
//   - geo_mismatch:      IP country doesn't match card issuing country
//   - device_fingerprint: Same device used with multiple cards
type FraudService struct {
	db    *pgxpool.Pool
	redis *redis.Client
}

func NewFraudService(db *pgxpool.Pool, redisClient *redis.Client) *FraudService {
	return &FraudService{db: db, redis: redisClient}
}

// ── Core Evaluation ──────────────────────────────────────────────

// FraudCheckInput contains all signals available at charge time.
type FraudCheckInput struct {
	MerchantID  string
	Email       string
	IPAddress   string
	Amount      int64  // In kobo
	Currency    string
	CardHash    string // Hashed card fingerprint (first6 + last4 + expiry)
	DeviceID    string // Client-side device fingerprint (optional)
	CountryCode string // IP-derived country code (optional)
	CardCountry string // Card issuing country (optional)
}

// FraudCheckResult is the outcome of evaluating all rules.
type FraudCheckResult struct {
	RiskScore   float64            `json:"risk_score"`    // 0-100 composite score
	Action      string             `json:"action"`        // "allow", "flag", or "block"
	RuleResults []RuleResult       `json:"rule_results"`  // Individual rule outcomes
	Blocked     bool               `json:"blocked"`       // Convenience flag
}

type RuleResult struct {
	RuleName    string  `json:"rule_name"`
	Score       float64 `json:"score"`       // This rule's contribution (0-100)
	Weight      float64 `json:"weight"`      // How much this rule matters (0-1)
	Triggered   bool    `json:"triggered"`
	Details     string  `json:"details"`     // Human-readable explanation
}

// EvaluateTransaction runs all enabled fraud rules and returns a risk assessment.
// Call this BEFORE processing a charge. If result.Blocked == true, reject the transaction.
func (s *FraudService) EvaluateTransaction(ctx context.Context, input FraudCheckInput) (*FraudCheckResult, error) {
	// Load merchant's fraud rules (or use defaults)
	rules, err := s.loadRules(ctx, input.MerchantID)
	if err != nil {
		return nil, err
	}

	var results []RuleResult
	var totalWeightedScore float64
	var totalWeight float64

	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}

		var rr RuleResult
		switch rule.Name {
		case "velocity_email":
			rr = s.checkVelocityEmail(ctx, input, rule)
		case "velocity_ip":
			rr = s.checkVelocityIP(ctx, input, rule)
		case "velocity_card":
			rr = s.checkVelocityCard(ctx, input, rule)
		case "amount_anomaly":
			rr = s.checkAmountAnomaly(ctx, input, rule)
		case "geo_mismatch":
			rr = s.checkGeoMismatch(ctx, input, rule)
		case "device_fingerprint":
			rr = s.checkDeviceFingerprint(ctx, input, rule)
		default:
			continue
		}

		results = append(results, rr)
		totalWeightedScore += rr.Score * rr.Weight
		totalWeight += rr.Weight
	}

	// Compute composite risk score
	var compositeScore float64
	if totalWeight > 0 {
		compositeScore = totalWeightedScore / totalWeight
	}
	compositeScore = math.Min(compositeScore, 100)

	// Determine action based on merchant thresholds
	action := s.determineAction(ctx, input.MerchantID, compositeScore)

	result := &FraudCheckResult{
		RiskScore:   math.Round(compositeScore*100) / 100,
		Action:      action,
		RuleResults: results,
		Blocked:     action == "block",
	}

	// Log the fraud event
	s.logFraudEvent(ctx, input, result)

	return result, nil
}

// ── Rule: Email Velocity ─────────────────────────────────────────
// Detects: Same email making too many payment attempts in a short window.
// How: Redis sliding window counter keyed by merchant:email.

func (s *FraudService) checkVelocityEmail(ctx context.Context, input FraudCheckInput, rule FraudRule) RuleResult {
	maxAttempts := getConfigInt(rule.Config, "max_attempts", 5)
	windowMinutes := getConfigInt(rule.Config, "window_minutes", 10)

	key := fmt.Sprintf("fraud:vel:email:%s:%s", input.MerchantID, input.Email)
	count := s.incrementSlidingWindow(ctx, key, time.Duration(windowMinutes)*time.Minute)

	triggered := count > int64(maxAttempts)
	score := 0.0
	if triggered {
		// Score scales with how far over the limit: 2x over = 100
		ratio := float64(count) / float64(maxAttempts)
		score = math.Min(ratio*50, 100)
	}

	return RuleResult{
		RuleName:  "velocity_email",
		Score:     score,
		Weight:    getConfigFloat(rule.Config, "weight", 0.25),
		Triggered: triggered,
		Details:   fmt.Sprintf("%d attempts from %s in %d min (limit: %d)", count, input.Email, windowMinutes, maxAttempts),
	}
}

// ── Rule: IP Velocity ────────────────────────────────────────────
// Detects: Same IP address generating excessive transactions.
// How: Redis sliding window counter keyed by merchant:ip.

func (s *FraudService) checkVelocityIP(ctx context.Context, input FraudCheckInput, rule FraudRule) RuleResult {
	if input.IPAddress == "" {
		return RuleResult{RuleName: "velocity_ip", Weight: getConfigFloat(rule.Config, "weight", 0.20)}
	}

	maxAttempts := getConfigInt(rule.Config, "max_attempts", 10)
	windowMinutes := getConfigInt(rule.Config, "window_minutes", 5)

	key := fmt.Sprintf("fraud:vel:ip:%s:%s", input.MerchantID, input.IPAddress)
	count := s.incrementSlidingWindow(ctx, key, time.Duration(windowMinutes)*time.Minute)

	triggered := count > int64(maxAttempts)
	score := 0.0
	if triggered {
		ratio := float64(count) / float64(maxAttempts)
		score = math.Min(ratio*50, 100)
	}

	return RuleResult{
		RuleName:  "velocity_ip",
		Score:     score,
		Weight:    getConfigFloat(rule.Config, "weight", 0.20),
		Triggered: triggered,
		Details:   fmt.Sprintf("%d attempts from IP %s in %d min (limit: %d)", count, input.IPAddress, windowMinutes, maxAttempts),
	}
}

// ── Rule: Card Velocity ──────────────────────────────────────────
// Detects: Same card being used across many different merchants or emails.
// How: Redis set of unique merchant:email combos per card hash.

func (s *FraudService) checkVelocityCard(ctx context.Context, input FraudCheckInput, rule FraudRule) RuleResult {
	if input.CardHash == "" {
		return RuleResult{RuleName: "velocity_card", Weight: getConfigFloat(rule.Config, "weight", 0.25)}
	}

	maxMerchants := getConfigInt(rule.Config, "max_merchants", 3)
	windowMinutes := getConfigInt(rule.Config, "window_minutes", 60)

	key := fmt.Sprintf("fraud:vel:card:%s", input.CardHash)
	member := fmt.Sprintf("%s:%s", input.MerchantID, input.Email)

	// Add this combo and count unique members
	s.redis.SAdd(ctx, key, member)
	s.redis.Expire(ctx, key, time.Duration(windowMinutes)*time.Minute)
	count, _ := s.redis.SCard(ctx, key).Result()

	triggered := count > int64(maxMerchants)
	score := 0.0
	if triggered {
		score = math.Min(float64(count)/float64(maxMerchants)*60, 100)
	}

	return RuleResult{
		RuleName:  "velocity_card",
		Score:     score,
		Weight:    getConfigFloat(rule.Config, "weight", 0.25),
		Triggered: triggered,
		Details:   fmt.Sprintf("card used with %d unique merchant:email combos in %d min (limit: %d)", count, windowMinutes, maxMerchants),
	}
}

// ── Rule: Amount Anomaly ─────────────────────────────────────────
// Detects: Transaction amount significantly deviates from merchant's historical average.
// How: Compare against rolling average stored in PostgreSQL.
// A ₦5,000 avg merchant suddenly seeing ₦500,000 = red flag.

func (s *FraudService) checkAmountAnomaly(ctx context.Context, input FraudCheckInput, rule FraudRule) RuleResult {
	stdDevMultiplier := getConfigFloat(rule.Config, "std_dev_multiplier", 3.0)
	minTransactions := getConfigInt(rule.Config, "min_transactions", 10) // Need enough data

	// Fetch merchant's transaction stats
	var avgAmount, stdDev float64
	var txnCount int
	err := s.db.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(AVG(amount), 0), COALESCE(STDDEV_POP(amount), 0)
		FROM transactions
		WHERE merchant_id = $1 AND status = 'success' AND currency = $2
		  AND created_at > NOW() - INTERVAL '30 days'
	`, input.MerchantID, input.Currency).Scan(&txnCount, &avgAmount, &stdDev)
	if err != nil || txnCount < minTransactions {
		// Not enough data to evaluate -- allow
		return RuleResult{
			RuleName: "amount_anomaly",
			Weight:   getConfigFloat(rule.Config, "weight", 0.20),
			Details:  fmt.Sprintf("insufficient data (%d transactions, need %d)", txnCount, minTransactions),
		}
	}

	// How many standard deviations from mean?
	deviation := 0.0
	if stdDev > 0 {
		deviation = math.Abs(float64(input.Amount)-avgAmount) / stdDev
	}

	triggered := deviation > stdDevMultiplier
	score := 0.0
	if triggered {
		// Score based on how extreme the deviation is
		score = math.Min((deviation/stdDevMultiplier)*40, 100)
	}

	return RuleResult{
		RuleName:  "amount_anomaly",
		Score:     score,
		Weight:    getConfigFloat(rule.Config, "weight", 0.20),
		Triggered: triggered,
		Details:   fmt.Sprintf("amount %d is %.1f std devs from avg %.0f (threshold: %.1f)", input.Amount, deviation, avgAmount, stdDevMultiplier),
	}
}

// ── Rule: Geo Mismatch ───────────────────────────────────────────
// Detects: IP geolocation country doesn't match card issuing country.
// How: Compare input.CountryCode (from IP) vs input.CardCountry (from BIN lookup).
// Nigerian card + US IP = suspicious (could be VPN or legitimate travel).

func (s *FraudService) checkGeoMismatch(ctx context.Context, input FraudCheckInput, rule FraudRule) RuleResult {
	if input.CountryCode == "" || input.CardCountry == "" {
		return RuleResult{
			RuleName: "geo_mismatch",
			Weight:   getConfigFloat(rule.Config, "weight", 0.15),
			Details:  "insufficient geo data",
		}
	}

	mismatch := input.CountryCode != input.CardCountry
	score := 0.0
	if mismatch {
		score = getConfigFloat(rule.Config, "mismatch_score", 70)
	}

	return RuleResult{
		RuleName:  "geo_mismatch",
		Score:     score,
		Weight:    getConfigFloat(rule.Config, "weight", 0.15),
		Triggered: mismatch,
		Details:   fmt.Sprintf("IP country=%s, card country=%s", input.CountryCode, input.CardCountry),
	}
}

// ── Rule: Device Fingerprint ─────────────────────────────────────
// Detects: Same device being used with multiple different cards.
// How: Redis set of card hashes per device ID. >N unique cards = suspicious.

func (s *FraudService) checkDeviceFingerprint(ctx context.Context, input FraudCheckInput, rule FraudRule) RuleResult {
	if input.DeviceID == "" || input.CardHash == "" {
		return RuleResult{
			RuleName: "device_fingerprint",
			Weight:   getConfigFloat(rule.Config, "weight", 0.15),
			Details:  "no device fingerprint provided",
		}
	}

	maxCards := getConfigInt(rule.Config, "max_cards_per_device", 3)
	windowMinutes := getConfigInt(rule.Config, "window_minutes", 1440) // 24 hours

	key := fmt.Sprintf("fraud:device:%s", input.DeviceID)
	s.redis.SAdd(ctx, key, input.CardHash)
	s.redis.Expire(ctx, key, time.Duration(windowMinutes)*time.Minute)
	count, _ := s.redis.SCard(ctx, key).Result()

	triggered := count > int64(maxCards)
	score := 0.0
	if triggered {
		score = math.Min(float64(count)/float64(maxCards)*60, 100)
	}

	return RuleResult{
		RuleName:  "device_fingerprint",
		Score:     score,
		Weight:    getConfigFloat(rule.Config, "weight", 0.15),
		Triggered: triggered,
		Details:   fmt.Sprintf("device %s used with %d unique cards in %d min (limit: %d)", input.DeviceID[:8]+"...", count, windowMinutes, maxCards),
	}
}

// ── Rule Loading ─────────────────────────────────────────────────

type FraudRule struct {
	Name    string
	Enabled bool
	Action  string                 // "allow", "flag", "block"
	Config  map[string]interface{} // Rule-specific thresholds
}

func (s *FraudService) loadRules(ctx context.Context, merchantID string) ([]FraudRule, error) {
	rows, err := s.db.Query(ctx, `
		SELECT rule_name, is_enabled, action, config
		FROM fraud_rules WHERE merchant_id = $1
	`, merchantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []FraudRule
	for rows.Next() {
		var r FraudRule
		if err := rows.Scan(&r.Name, &r.Enabled, &r.Action, &r.Config); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}

	// If merchant has no custom rules, use sensible defaults
	if len(rules) == 0 {
		rules = defaultFraudRules()
	}

	return rules, nil
}

func defaultFraudRules() []FraudRule {
	return []FraudRule{
		{
			Name: "velocity_email", Enabled: true, Action: "flag",
			Config: map[string]interface{}{"max_attempts": 5, "window_minutes": 10, "weight": 0.25},
		},
		{
			Name: "velocity_ip", Enabled: true, Action: "flag",
			Config: map[string]interface{}{"max_attempts": 10, "window_minutes": 5, "weight": 0.20},
		},
		{
			Name: "velocity_card", Enabled: true, Action: "block",
			Config: map[string]interface{}{"max_merchants": 3, "window_minutes": 60, "weight": 0.25},
		},
		{
			Name: "amount_anomaly", Enabled: true, Action: "flag",
			Config: map[string]interface{}{"std_dev_multiplier": 3.0, "min_transactions": 10, "weight": 0.20},
		},
		{
			Name: "geo_mismatch", Enabled: true, Action: "flag",
			Config: map[string]interface{}{"mismatch_score": 70, "weight": 0.15},
		},
		{
			Name: "device_fingerprint", Enabled: true, Action: "flag",
			Config: map[string]interface{}{"max_cards_per_device": 3, "window_minutes": 1440, "weight": 0.15},
		},
	}
}

// ── Threshold Decision ───────────────────────────────────────────

func (s *FraudService) determineAction(ctx context.Context, merchantID string, score float64) string {
	// Check if merchant has custom thresholds
	var flagThreshold, blockThreshold float64
	err := s.db.QueryRow(ctx, `
		SELECT
			COALESCE((config->>'flag_threshold')::float, 30),
			COALESCE((config->>'block_threshold')::float, 70)
		FROM fraud_rules
		WHERE merchant_id = $1 AND rule_name = '_thresholds'
	`, merchantID).Scan(&flagThreshold, &blockThreshold)
	if err != nil {
		// Defaults: flag at 30, block at 70
		flagThreshold = 30
		blockThreshold = 70
	}

	switch {
	case score >= blockThreshold:
		return "block"
	case score >= flagThreshold:
		return "flag"
	default:
		return "allow"
	}
}

// ── Fraud Event Logging ──────────────────────────────────────────

func (s *FraudService) logFraudEvent(ctx context.Context, input FraudCheckInput, result *FraudCheckResult) {
	for _, rr := range result.RuleResults {
		if !rr.Triggered {
			continue // Only log triggered rules
		}
		_, _ = s.db.Exec(ctx, `
			INSERT INTO fraud_events (merchant_id, rule_name, risk_score, action, details)
			VALUES ($1, $2, $3, $4::fraud_action, $5)
		`, input.MerchantID, rr.RuleName, rr.Score, result.Action,
			fmt.Sprintf(`{"details":%q,"email":%q,"ip":%q}`, rr.Details, input.Email, input.IPAddress))
	}
}

// ── Merchant Rule Management ─────────────────────────────────────

type UpdateFraudRuleInput struct {
	RuleName  string                 `json:"rule_name" validate:"required"`
	IsEnabled *bool                  `json:"is_enabled,omitempty"`
	Action    string                 `json:"action,omitempty" validate:"omitempty,oneof=allow flag block"`
	Config    map[string]interface{} `json:"config,omitempty"`
}

func (s *FraudService) UpsertRule(ctx context.Context, merchantID string, input UpdateFraudRuleInput) error {
	enabled := true
	if input.IsEnabled != nil {
		enabled = *input.IsEnabled
	}
	action := input.Action
	if action == "" {
		action = "flag"
	}

	_, err := s.db.Exec(ctx, `
		INSERT INTO fraud_rules (merchant_id, rule_name, is_enabled, action, config)
		VALUES ($1, $2, $3, $4::fraud_action, $5)
		ON CONFLICT (merchant_id, rule_name)
		DO UPDATE SET is_enabled = $3, action = $4::fraud_action, config = $5, updated_at = NOW()
	`, merchantID, input.RuleName, enabled, action, jsonbOrEmpty(input.Config))
	return err
}

func (s *FraudService) ListFraudEvents(ctx context.Context, merchantID string, limit, offset int) ([]FraudEventSummary, int, error) {
	var total int
	err := s.db.QueryRow(ctx, `SELECT COUNT(*) FROM fraud_events WHERE merchant_id = $1`, merchantID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, rule_name, risk_score, action, details, created_at
		FROM fraud_events WHERE merchant_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`, merchantID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var events []FraudEventSummary
	for rows.Next() {
		var e FraudEventSummary
		if err := rows.Scan(&e.ID, &e.RuleName, &e.RiskScore, &e.Action, &e.Details, &e.CreatedAt); err != nil {
			return nil, 0, err
		}
		events = append(events, e)
	}

	return events, total, nil
}

type FraudEventSummary struct {
	ID        string    `json:"id"`
	RuleName  string    `json:"rule_name"`
	RiskScore float64   `json:"risk_score"`
	Action    string    `json:"action"`
	Details   string    `json:"details"`
	CreatedAt time.Time `json:"created_at"`
}

// ── Redis Sliding Window ─────────────────────────────────────────
// Uses sorted sets with timestamp scores for precise sliding windows.
// More accurate than simple INCR+EXPIRE which can miss edge cases.

func (s *FraudService) incrementSlidingWindow(ctx context.Context, key string, window time.Duration) int64 {
	now := time.Now()
	windowStart := now.Add(-window)

	pipe := s.redis.Pipeline()

	// Remove expired entries
	pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart.UnixNano()))

	// Add current event
	pipe.ZAdd(ctx, key, redis.Z{
		Score:  float64(now.UnixNano()),
		Member: fmt.Sprintf("%d:%s", now.UnixNano(), randomHex(4)),
	})

	// Count events in window
	countCmd := pipe.ZCard(ctx, key)

	// Set TTL to auto-cleanup
	pipe.Expire(ctx, key, window+time.Minute)

	_, _ = pipe.Exec(ctx)

	count, _ := countCmd.Result()
	return count
}

// ── Config Helpers ───────────────────────────────────────────────

func getConfigInt(config map[string]interface{}, key string, defaultVal int) int {
	if config == nil {
		return defaultVal
	}
	if v, ok := config[key]; ok {
		switch val := v.(type) {
		case float64:
			return int(val)
		case int:
			return val
		}
	}
	return defaultVal
}

func getConfigFloat(config map[string]interface{}, key string, defaultVal float64) float64 {
	if config == nil {
		return defaultVal
	}
	if v, ok := config[key]; ok {
		switch val := v.(type) {
		case float64:
			return val
		case int:
			return float64(val)
		}
	}
	return defaultVal
}

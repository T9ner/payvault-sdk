//go:build integration

package services_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	testDB  *pgxpool.Pool
	testSeq uint64
)

func TestMain(m *testing.M) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://payvault:payvault@localhost:5433/payvault_test?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		panic("failed to connect to test database: " + err.Error())
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		panic("failed to ping test database: " + err.Error())
	}

	if err := runTestMigrations(dbURL); err != nil {
		pool.Close()
		panic("failed to run test migrations: " + err.Error())
	}

	testDB = pool
	code := m.Run()
	pool.Close()
	os.Exit(code)
}

func runTestMigrations(dbURL string) error {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return fmt.Errorf("resolve current file path")
	}

	migrationsDir := filepath.Clean(filepath.Join(filepath.Dir(file), "../../migrations"))
	migrator, err := migrate.New("file://"+migrationsDir, dbURL)
	if err != nil {
		return err
	}
	defer migrator.Close()

	if err := migrator.Up(); err != nil && err != migrate.ErrNoChange {
		return err
	}

	return nil
}

func beginTestTx(t *testing.T) (context.Context, pgx.Tx) {
	t.Helper()

	ctx := context.Background()
	tx, err := testDB.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}

	t.Cleanup(func() {
		_ = tx.Rollback(ctx)
	})

	return ctx, tx
}

func createMerchant(t *testing.T, ctx context.Context, tx pgx.Tx) string {
	t.Helper()

	var merchantID string
	email := fmt.Sprintf("it-%s@example.com", uniqueSuffix("merchant"))
	err := tx.QueryRow(ctx, `
		INSERT INTO merchants (business_name, email, password_hash)
		VALUES ($1, $2, $3)
		RETURNING id
	`, "Integration Merchant", email, "$2a$10$integrationhash").Scan(&merchantID)
	if err != nil {
		t.Fatalf("insert merchant: %v", err)
	}

	return merchantID
}

func createTransaction(t *testing.T, ctx context.Context, tx pgx.Tx, merchantID, status string) (string, string) {
	t.Helper()

	reference := fmt.Sprintf("ref_%s", uniqueSuffix("txn"))
	var txnID string
	err := tx.QueryRow(ctx, `
		INSERT INTO transactions (merchant_id, reference, provider, amount, currency, email, status, environment, metadata, channel)
		VALUES ($1, $2, 'paystack', 500000, 'NGN', $3, $4, 'test', $5, 'card')
		RETURNING id
	`, merchantID, reference, fmt.Sprintf("txn-%s@example.com", uniqueSuffix("email")), status, map[string]any{"source": "integration"}).Scan(&txnID)
	if err != nil {
		t.Fatalf("insert transaction: %v", err)
	}

	return txnID, reference
}

func createPlanPrice(t *testing.T, ctx context.Context, tx pgx.Tx, merchantID string) (string, string) {
	t.Helper()

	var planID string
	err := tx.QueryRow(ctx, `
		INSERT INTO plans (merchant_id, name, description, metadata)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, merchantID, "Starter Plan", "integration", map[string]any{"source": "integration"}).Scan(&planID)
	if err != nil {
		t.Fatalf("insert plan: %v", err)
	}

	var priceID string
	err = tx.QueryRow(ctx, `
		INSERT INTO plan_prices (plan_id, nickname, amount, currency, interval, interval_count, trial_period_days, active)
		VALUES ($1, $2, 250000, 'NGN', 'monthly', 1, 0, true)
		RETURNING id
	`, planID, "Monthly").Scan(&priceID)
	if err != nil {
		t.Fatalf("insert plan price: %v", err)
	}

	return planID, priceID
}

func insertProviderCredential(t *testing.T, ctx context.Context, tx pgx.Tx, merchantID, provider string) {
	t.Helper()

	_, err := tx.Exec(ctx, `
		INSERT INTO provider_credentials (merchant_id, provider, encrypted_secret)
		VALUES ($1, $2, $3)
		ON CONFLICT (merchant_id, provider)
		DO UPDATE SET encrypted_secret = $3, updated_at = NOW()
	`, merchantID, provider, "encrypted-secret")
	if err != nil {
		t.Fatalf("insert provider credential: %v", err)
	}
}

func uniqueSuffix(prefix string) string {
	return fmt.Sprintf("%s_%d_%d", prefix, time.Now().UnixNano(), atomic.AddUint64(&testSeq, 1))
}

func TestTransactionQueriesMatchSchema(t *testing.T) {
	ctx, tx := beginTestTx(t)
	merchantID := createMerchant(t, ctx, tx)

	reference := fmt.Sprintf("ref_%s", uniqueSuffix("initiate"))
	var txnID string
	err := tx.QueryRow(ctx, `
		INSERT INTO transactions (merchant_id, reference, provider, amount, currency, email, status, environment, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
		RETURNING id
	`, merchantID, reference, "paystack", int64(500000), "NGN", "charge@example.com", "test", map[string]any{"attempt": 1}).Scan(&txnID)
	if err != nil {
		t.Fatalf("InitiateCharge insert failed: %v", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE transactions SET provider_ref = $1, updated_at = NOW() WHERE id = $2
	`, "ps_ref_123", txnID); err != nil {
		t.Fatalf("InitiateCharge provider_ref update failed: %v", err)
	}

	var verifyTxnID, provider, status, providerRef string
	var amount int64
	var currency string
	err = tx.QueryRow(ctx, `
		SELECT id, provider, status, provider_ref, amount, currency
		FROM transactions WHERE merchant_id = $1 AND reference = $2
	`, merchantID, reference).Scan(&verifyTxnID, &provider, &status, &providerRef, &amount, &currency)
	if err != nil {
		t.Fatalf("VerifyTransaction select failed: %v", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE transactions SET status = $1, channel = $2, provider_response = $3, paid_at = NOW(), updated_at = NOW()
		WHERE id = $4
	`, "success", "card", map[string]any{"status": "success"}, txnID); err != nil {
		t.Fatalf("VerifyTransaction update failed: %v", err)
	}

	failedTxnID, _ := createTransaction(t, ctx, tx, merchantID, "pending")
	if _, err := tx.Exec(ctx, `
		UPDATE transactions SET status = 'failed', failed_at = NOW(), updated_at = NOW() WHERE id = $1
	`, failedTxnID); err != nil {
		t.Fatalf("provider failure status update failed: %v", err)
	}

	var refundTxnID, refundProvider, refundStatus, refundProviderRef string
	var refundAmount int64
	var refundCurrency string
	err = tx.QueryRow(ctx, `
		SELECT id, provider, status, provider_ref, amount, currency
		FROM transactions WHERE merchant_id = $1 AND reference = $2
	`, merchantID, reference).Scan(&refundTxnID, &refundProvider, &refundStatus, &refundProviderRef, &refundAmount, &refundCurrency)
	if err != nil {
		t.Fatalf("RefundTransaction select failed: %v", err)
	}

	var totalRefunded int64
	err = tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount), 0) FROM refunds
		WHERE transaction_id = $1 AND status != 'failed'
	`, refundTxnID).Scan(&totalRefunded)
	if err != nil {
		t.Fatalf("RefundTransaction sum failed: %v", err)
	}

	var refundID string
	err = tx.QueryRow(ctx, `
		INSERT INTO refunds (merchant_id, transaction_id, provider, provider_ref, amount, currency, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, merchantID, refundTxnID, refundProvider, "refund_ref_123", int64(100000), refundCurrency, "pending").Scan(&refundID)
	if err != nil {
		t.Fatalf("RefundTransaction insert failed: %v", err)
	}

	if _, err := tx.Exec(ctx, `UPDATE transactions SET status = 'refunded', refunded_at = NOW(), updated_at = NOW() WHERE id = $1`, refundTxnID); err != nil {
		t.Fatalf("RefundTransaction refunded update failed: %v", err)
	}

	var total int
	err = tx.QueryRow(ctx, `SELECT COUNT(*) FROM transactions WHERE merchant_id = $1`, merchantID).Scan(&total)
	if err != nil {
		t.Fatalf("ListTransactions count failed: %v", err)
	}
	if total < 2 {
		t.Fatalf("ListTransactions count returned %d, want at least 2", total)
	}

	rows, err := tx.Query(ctx, `
		SELECT id, reference, provider, amount, currency, email, status, channel, environment, created_at
		FROM transactions WHERE merchant_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3
	`, merchantID, 10, 0)
	if err != nil {
		t.Fatalf("ListTransactions select failed: %v", err)
	}
	defer rows.Close()

	if !rows.Next() {
		t.Fatal("ListTransactions returned no rows")
	}
	var listedID, listedReference, listedProvider, listedCurrency, listedEmail, listedStatus, listedEnvironment string
	var listedAmount int64
	var listedChannel *string
	var listedCreatedAt time.Time
	if err := rows.Scan(&listedID, &listedReference, &listedProvider, &listedAmount, &listedCurrency, &listedEmail, &listedStatus, &listedChannel, &listedEnvironment, &listedCreatedAt); err != nil {
		t.Fatalf("ListTransactions scan failed: %v", err)
	}
	rows.Close()

	var lookedUpMerchantID string
	err = tx.QueryRow(ctx, `
		SELECT merchant_id FROM transactions WHERE reference = $1 OR provider_ref = $1
	`, "ps_ref_123").Scan(&lookedUpMerchantID)
	if err != nil {
		t.Fatalf("LookupMerchantByReference query failed: %v", err)
	}
	if lookedUpMerchantID != merchantID {
		t.Fatalf("LookupMerchantByReference returned %s, want %s", lookedUpMerchantID, merchantID)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_log (merchant_id, actor, action, resource_type, resource_id, changes)
		VALUES ($1, $2, $3, 'transaction', $4, $5)
	`, merchantID, "merchant:"+merchantID, "transaction.initiated", txnID, map[string]any{"msg": "integration"}); err != nil {
		t.Fatalf("auditLog insert failed: %v", err)
	}

	if refundID == "" {
		t.Fatal("refund insert did not return id")
	}
}

func TestStatusQueriesMatchSchema(t *testing.T) {
	ctx, tx := beginTestTx(t)
	merchantID := createMerchant(t, ctx, tx)
	txnID, reference := createTransaction(t, ctx, tx, merchantID, "refunded")

	if _, err := tx.Exec(ctx, `
		UPDATE transactions
		SET provider_ref = $1, paid_at = NOW(), failed_at = NOW(), refunded_at = NOW(), updated_at = NOW()
		WHERE id = $2
	`, "status_ref_123", txnID); err != nil {
		t.Fatalf("seed status transaction timestamps: %v", err)
	}

	var gotReference, gotStatus, provider, channel, currency string
	var amount int64
	var paidAt, failedAt, refundedAt *time.Time
	var updatedAt time.Time
	err := tx.QueryRow(ctx, `
		SELECT reference, status, amount, currency, provider, channel,
		       paid_at, failed_at, refunded_at, updated_at
		FROM transactions
		WHERE merchant_id = $1 AND reference = $2
	`, merchantID, reference).Scan(&gotReference, &gotStatus, &amount, &currency, &provider, &channel, &paidAt, &failedAt, &refundedAt, &updatedAt)
	if err != nil {
		t.Fatalf("GetStatus query failed: %v", err)
	}
	if paidAt == nil || failedAt == nil || refundedAt == nil {
		t.Fatal("GetStatus did not scan transaction timestamps")
	}

	rows, err := tx.Query(ctx, `
		SELECT reference, status, amount, currency, provider, channel,
		       paid_at, failed_at, refunded_at, updated_at
		FROM transactions
		WHERE merchant_id = $1 AND reference = ANY($2)
		ORDER BY created_at DESC
	`, merchantID, []string{reference})
	if err != nil {
		t.Fatalf("GetBatchStatus query failed: %v", err)
	}
	defer rows.Close()
	if !rows.Next() {
		t.Fatal("GetBatchStatus returned no rows")
	}
	if err := rows.Scan(&gotReference, &gotStatus, &amount, &currency, &provider, &channel, &paidAt, &failedAt, &refundedAt, &updatedAt); err != nil {
		t.Fatalf("GetBatchStatus scan failed: %v", err)
	}
	rows.Close()

	recentRows, err := tx.Query(ctx, `
		SELECT reference, status, amount, currency, provider, channel,
		       paid_at, failed_at, refunded_at, updated_at
		FROM transactions
		WHERE merchant_id = $1
		ORDER BY updated_at DESC
		LIMIT $2
	`, merchantID, 5)
	if err != nil {
		t.Fatalf("RecentTransitions query failed: %v", err)
	}
	defer recentRows.Close()
	if !recentRows.Next() {
		t.Fatal("RecentTransitions returned no rows")
	}
	if err := recentRows.Scan(&gotReference, &gotStatus, &amount, &currency, &provider, &channel, &paidAt, &failedAt, &refundedAt, &updatedAt); err != nil {
		t.Fatalf("RecentTransitions scan failed: %v", err)
	}
}

func TestSubscriptionQueriesMatchSchema(t *testing.T) {
	ctx, tx := beginTestTx(t)
	merchantID := createMerchant(t, ctx, tx)
	_, priceID := createPlanPrice(t, ctx, tx, merchantID)
	insertProviderCredential(t, ctx, tx, merchantID, "paystack")

	var fetchedPriceID, planID, currency, interval, nickname, planName string
	var amount int64
	var intervalCount, trialPeriodDays int
	err := tx.QueryRow(ctx, `
		SELECT p.id, p.plan_id, p.amount, p.currency, p.interval, p.interval_count, p.trial_period_days, p.nickname, pl.name
		FROM plan_prices p
		JOIN plans pl ON p.plan_id = pl.id
		WHERE p.id = $1 AND pl.merchant_id = $2 AND p.active = true AND pl.active = true
	`, priceID, merchantID).Scan(&fetchedPriceID, &planID, &amount, &currency, &interval, &intervalCount, &trialPeriodDays, &nickname, &planName)
	if err != nil {
		t.Fatalf("SubscribeCustomer plan lookup failed: %v", err)
	}

	now := time.Now().UTC()
	currentPeriodEnd := now.Add(30 * 24 * time.Hour)
	var subID string
	var createdAt, updatedAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO subscriptions (
			merchant_id, plan_id, price_id, customer_email, customer_name, status,
			current_period_start, current_period_end, billing_cycle_anchor, trial_end,
			provider, provider_authorization_code, metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6,
			$7, $8, $9, $10,
			$11, $12, $13
		) RETURNING id, created_at, updated_at
	`, merchantID, planID, fetchedPriceID, "subscriber@example.com", "Subscriber", "active", now, currentPeriodEnd, now.Day(), nil, "paystack", "AUTH_123", map[string]any{"source": "integration"}).Scan(&subID, &createdAt, &updatedAt)
	if err != nil {
		t.Fatalf("SubscribeCustomer insert failed: %v", err)
	}

	var itemID string
	err = tx.QueryRow(ctx, `
		INSERT INTO subscription_items (subscription_id, price_id, quantity, unit_amount, currency)
		VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at
	`, subID, fetchedPriceID, 1, amount, currency).Scan(&itemID, &createdAt)
	if err != nil {
		t.Fatalf("SubscribeCustomer item insert failed: %v", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO subscription_events (subscription_id, event_type, new_status, details)
		VALUES ($1, 'created', $2, $3)
	`, subID, "active", map[string]any{"price_id": fetchedPriceID}); err != nil {
		t.Fatalf("SubscribeCustomer event insert failed: %v", err)
	}

	var status, provider string
	err = tx.QueryRow(ctx, `
		SELECT status, provider FROM subscriptions WHERE id = $1 AND merchant_id = $2 FOR UPDATE
	`, subID, merchantID).Scan(&status, &provider)
	if err != nil {
		t.Fatalf("CancelSubscription select failed: %v", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE subscriptions SET status = 'cancellation_scheduled', cancel_at_period_end = true, cancel_scheduled_at = NOW(), cancellation_reason = $1, updated_at = NOW()
		WHERE id = $2
	`, "customer requested", subID); err != nil {
		t.Fatalf("CancelSubscription scheduled update failed: %v", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE subscriptions SET status = 'canceled', canceled_at = NOW(), cancellation_reason = $1, updated_at = NOW()
		WHERE id = $2
	`, "customer requested", subID); err != nil {
		t.Fatalf("CancelSubscription immediate update failed: %v", err)
	}

	var encryptedSecret string
	err = tx.QueryRow(ctx, `
		SELECT encrypted_secret FROM provider_credentials
		WHERE merchant_id = $1 AND provider = $2
	`, merchantID, "paystack").Scan(&encryptedSecret)
	if err != nil {
		t.Fatalf("getMerchantProviderKey query failed: %v", err)
	}
	if encryptedSecret == "" || itemID == "" || createdAt.IsZero() || updatedAt.IsZero() || provider == "" || status == "" {
		t.Fatal("subscription query setup did not return expected data")
	}
}

func TestFraudQueriesMatchSchema(t *testing.T) {
	ctx, tx := beginTestTx(t)
	merchantID := createMerchant(t, ctx, tx)

	var ruleID, ruleType, action string
	var threshold int
	var enabled bool
	err := tx.QueryRow(ctx, `
		INSERT INTO fraud_rules (merchant_id, rule_type, threshold, action, enabled)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (merchant_id, rule_type)
		DO UPDATE SET threshold = $3, action = $4, enabled = $5, updated_at = NOW()
		RETURNING id, rule_type, threshold, action, enabled
	`, merchantID, "velocity", 3, "block", true).Scan(&ruleID, &ruleType, &threshold, &action, &enabled)
	if err != nil {
		t.Fatalf("UpsertFraudRule insert failed: %v", err)
	}

	err = tx.QueryRow(ctx, `
		INSERT INTO fraud_rules (merchant_id, rule_type, threshold, action, enabled)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (merchant_id, rule_type)
		DO UPDATE SET threshold = $3, action = $4, enabled = $5, updated_at = NOW()
		RETURNING id, rule_type, threshold, action, enabled
	`, merchantID, "velocity", 5, "flag", false).Scan(&ruleID, &ruleType, &threshold, &action, &enabled)
	if err != nil {
		t.Fatalf("UpsertFraudRule update failed: %v", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO fraud_events (merchant_id, transaction_id, rule_type, risk_score, action_taken, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, merchantID, uuid.NewString(), "velocity", 85, "flag", map[string]any{"email": "fraud@example.com", "ip": "127.0.0.1"})
	if err != nil {
		t.Fatalf("logEvent insert failed: %v", err)
	}

	if ruleID == "" || ruleType == "" || action == "" || threshold != 5 || enabled {
		t.Fatal("fraud rule upsert did not return updated values")
	}
}

func TestSettingsQueriesMatchSchema(t *testing.T) {
	ctx, tx := beginTestTx(t)
	merchantID := createMerchant(t, ctx, tx)

	var keyID string
	var createdAt time.Time
	err := tx.QueryRow(ctx, `
		INSERT INTO api_keys (merchant_id, key_hash, key_prefix)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`, merchantID, fmt.Sprintf("hash_%s", uniqueSuffix("key")), "sk_live_test").Scan(&keyID, &createdAt)
	if err != nil {
		t.Fatalf("GenerateAPIKey insert failed: %v", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO provider_credentials (merchant_id, provider, encrypted_secret)
		VALUES ($1, $2, $3)
		ON CONFLICT (merchant_id, provider)
		DO UPDATE SET encrypted_secret = $3, updated_at = NOW()
	`, merchantID, "paystack", "encrypted-v1")
	if err != nil {
		t.Fatalf("SaveProviderCredentials insert failed: %v", err)
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO provider_credentials (merchant_id, provider, encrypted_secret)
		VALUES ($1, $2, $3)
		ON CONFLICT (merchant_id, provider)
		DO UPDATE SET encrypted_secret = $3, updated_at = NOW()
	`, merchantID, "paystack", "encrypted-v2")
	if err != nil {
		t.Fatalf("SaveProviderCredentials upsert failed: %v", err)
	}

	if keyID == "" || createdAt.IsZero() {
		t.Fatal("GenerateAPIKey did not return persisted values")
	}
}

func TestWebhookDeliveryQueriesMatchSchema(t *testing.T) {
	ctx, tx := beginTestTx(t)
	merchantID := createMerchant(t, ctx, tx)

	if _, err := tx.Exec(ctx, `
		UPDATE merchants SET webhook_url = $1, webhook_secret = $2 WHERE id = $3
	`, "https://example.com/webhooks", "supersecret", merchantID); err != nil {
		t.Fatalf("seed merchant webhook config: %v", err)
	}

	var webhookURL, webhookSecret string
	err := tx.QueryRow(ctx, `
		SELECT COALESCE(webhook_url, ''), COALESCE(webhook_secret, '')
		FROM merchants WHERE id = $1
	`, merchantID).Scan(&webhookURL, &webhookSecret)
	if err != nil {
		t.Fatalf("DispatchWebhook merchant lookup failed: %v", err)
	}

	var logID string
	now := time.Now().UTC()
	err = tx.QueryRow(ctx, `
		INSERT INTO webhook_logs (merchant_id, event_type, url, payload, status, response_code, attempts, last_attempt_at)
		VALUES ($1, $2, $3, $4, 'pending', 0, 0, $5) RETURNING id
	`, merchantID, "transaction.success", webhookURL, map[string]any{"transaction_id": uuid.NewString()}, now).Scan(&logID)
	if err != nil {
		t.Fatalf("DispatchWebhook log insert failed: %v", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE webhook_logs
		SET status = $1, response_code = $2, response_body = $3, attempts = attempts + 1, last_attempt_at = NOW()
		WHERE id = $4
	`, "delivered", 200, "ok", logID); err != nil {
		t.Fatalf("markWebhookLog update failed: %v", err)
	}

	if webhookURL == "" || webhookSecret == "" || logID == "" {
		t.Fatal("webhook delivery queries did not return expected values")
	}
}

func TestPaymentLinkQueriesMatchSchema(t *testing.T) {
	ctx, tx := beginTestTx(t)
	merchantID := createMerchant(t, ctx, tx)

	var linkID string
	var createdAt time.Time
	slug := fmt.Sprintf("pay-%s", uniqueSuffix("link"))
	amount := int64(750000)
	err := tx.QueryRow(ctx, `
		INSERT INTO payment_links (merchant_id, slug, name, description, link_type, amount, currency, redirect_url, expires_at, metadata)
		VALUES ($1, $2, $3, $4, $5::link_type, $6, $7, $8, $9, $10)
		RETURNING id, created_at
	`, merchantID, slug, "Launch Payment", "integration", "fixed", &amount, "NGN", "https://example.com/return", time.Now().UTC().Add(24*time.Hour), map[string]any{"source": "integration"}).Scan(&linkID, &createdAt)
	if err != nil {
		t.Fatalf("CreateLink insert failed: %v", err)
	}

	var gotID, gotSlug, gotName, gotLinkType, gotCurrency string
	var gotDescription, gotRedirectURL *string
	var gotAmount *int64
	var isActive bool
	var expiresAt *time.Time
	var totalPaid int64
	var totalCount int
	var metadata map[string]any
	err = tx.QueryRow(ctx, `
		SELECT id, slug, name, description, link_type, amount, currency, redirect_url,
		       is_active, expires_at, total_paid, total_count, metadata, created_at
		FROM payment_links WHERE slug = $1
	`, slug).Scan(&gotID, &gotSlug, &gotName, &gotDescription, &gotLinkType, &gotAmount, &gotCurrency, &gotRedirectURL, &isActive, &expiresAt, &totalPaid, &totalCount, &metadata, &createdAt)
	if err != nil {
		t.Fatalf("GetBySlug query failed: %v", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO merchant_settings (merchant_id, default_provider, default_currency)
		VALUES ($1, $2, $3)
	`, merchantID, "paystack", "NGN"); err != nil {
		t.Fatalf("seed merchant settings: %v", err)
	}

	var checkoutLinkID, checkoutMerchantID, checkoutLinkType, checkoutCurrency string
	var fixedAmount *int64
	var redirectURL *string
	var checkoutActive bool
	var checkoutExpiresAt *time.Time
	err = tx.QueryRow(ctx, `
		SELECT id, merchant_id, link_type, amount, currency, redirect_url, is_active, expires_at
		FROM payment_links WHERE slug = $1
	`, slug).Scan(&checkoutLinkID, &checkoutMerchantID, &checkoutLinkType, &fixedAmount, &checkoutCurrency, &redirectURL, &checkoutActive, &checkoutExpiresAt)
	if err != nil {
		t.Fatalf("Checkout payment link lookup failed: %v", err)
	}

	var defaultProvider string
	err = tx.QueryRow(ctx, `
		SELECT default_provider FROM merchant_settings WHERE merchant_id = $1
	`, merchantID).Scan(&defaultProvider)
	if err != nil {
		t.Fatalf("Checkout merchant_settings lookup failed: %v", err)
	}

	if gotID == "" || linkID == "" || gotSlug != slug || gotLinkType != "fixed" || gotAmount == nil || !isActive || createdAt.IsZero() || checkoutLinkID == "" || checkoutMerchantID != merchantID || checkoutLinkType == "" || fixedAmount == nil || defaultProvider == "" {
		t.Fatal("payment link queries did not return expected values")
	}
}

func TestSchemaConstraintsSurfaceDatabaseErrors(t *testing.T) {
	t.Run("transactions_not_null", func(t *testing.T) {
		ctx, tx := beginTestTx(t)
		merchantID := createMerchant(t, ctx, tx)

		if _, err := tx.Exec(ctx, `
			INSERT INTO transactions (merchant_id, reference, provider, amount, currency, status, environment, metadata)
			VALUES ($1, $2, 'paystack', 500000, 'NGN', 'pending', 'test', '{}')
		`, merchantID, fmt.Sprintf("missing-email-%s", uniqueSuffix("txn"))); err == nil {
			t.Fatal("expected NOT NULL violation when email is omitted")
		}
	})

	t.Run("refunds_foreign_key", func(t *testing.T) {
		ctx, tx := beginTestTx(t)
		merchantID := createMerchant(t, ctx, tx)

		if _, err := tx.Exec(ctx, `
			INSERT INTO refunds (merchant_id, transaction_id, provider, provider_ref, amount, currency, status)
			VALUES ($1, $2, 'paystack', 'bad_ref', 50000, 'NGN', 'pending')
		`, merchantID, uuid.NewString()); err == nil {
			t.Fatal("expected foreign key violation for unknown transaction_id")
		}
	})

	t.Run("payment_links_enum", func(t *testing.T) {
		ctx, tx := beginTestTx(t)
		merchantID := createMerchant(t, ctx, tx)

		if _, err := tx.Exec(ctx, `
			INSERT INTO payment_links (merchant_id, slug, name, description, link_type, amount, currency, redirect_url, expires_at, metadata)
			VALUES ($1, $2, $3, $4, $5::link_type, $6, $7, $8, $9, $10)
		`, merchantID, fmt.Sprintf("bad-%s", uniqueSuffix("link")), "Broken Link", "integration", "invalid", int64(1000), "NGN", nil, nil, map[string]any{"source": "integration"}); err == nil {
			t.Fatal("expected enum cast failure for invalid payment link type")
		}
	})

	t.Run("fraud_events_valid_uuid", func(t *testing.T) {
		ctx, tx := beginTestTx(t)
		merchantID := createMerchant(t, ctx, tx)
		txnID, _ := createTransaction(t, ctx, tx, merchantID, "success")

		if _, err := tx.Exec(ctx, `
			INSERT INTO fraud_events (merchant_id, transaction_id, rule_type, risk_score, action_taken, metadata)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, merchantID, txnID, "velocity", 80, "flag", map[string]any{"ok": true}); err != nil {
			t.Fatalf("fraud_events valid UUID insert failed: %v", err)
		}
	})
}

package services

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AnalyticsService provides aggregated transaction metrics for the dashboard.
type AnalyticsService struct {
	db *pgxpool.Pool
}

func NewAnalyticsService(db *pgxpool.Pool) *AnalyticsService {
	return &AnalyticsService{db: db}
}

// ─── Types ──────────────────────────────────────────────────────────────────

// VolumePoint is a single data-point on the volume chart (one day, one currency).
type VolumePoint struct {
	Date     string  `json:"date"`     // YYYY-MM-DD
	Currency string  `json:"currency"` // ISO 4217 (e.g. "NGN", "USD", "KES")
	Total    float64 `json:"total"`    // Major units (naira, dollars, etc.)
	Count    int     `json:"count"`    // Number of successful transactions
}

// OverviewStats are the dashboard KPI cards.
type OverviewStats struct {
	// Per-currency totals for the selected window
	TotalVolume  map[string]float64 `json:"total_volume"`  // currency → major units
	TotalCount   int                `json:"total_count"`   // all successful txns
	PendingCount int                `json:"pending_count"` // currently pending
	FailureRate  float64            `json:"failure_rate"`  // percentage (0-100)
}

// ─── GetTransactionVolume ────────────────────────────────────────────────────

// GetTransactionVolume returns daily successful transaction volume broken down by
// currency for the given merchant over the specified number of past days.
// It returns one row per (date, currency) combination.
func (s *AnalyticsService) GetTransactionVolume(
	ctx context.Context,
	merchantID string,
	days int,
) ([]VolumePoint, error) {
	if days <= 0 {
		days = 30
	}

	rows, err := s.db.Query(ctx, `
		SELECT
			TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS date,
			currency,
			-- amount is stored in minor units (kobo/cents); convert to major
			SUM(amount) / 100.0                             AS total,
			COUNT(*)                                         AS count
		FROM transactions
		WHERE
			merchant_id = $1
			AND status   = 'success'
			AND created_at >= NOW() - ($2 || ' days')::INTERVAL
		GROUP BY date, currency
		ORDER BY date ASC, currency ASC
	`, merchantID, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []VolumePoint
	for rows.Next() {
		var p VolumePoint
		if err := rows.Scan(&p.Date, &p.Currency, &p.Total, &p.Count); err != nil {
			return nil, err
		}
		points = append(points, p)
	}

	return points, rows.Err()
}

// ─── GetOverviewStats ────────────────────────────────────────────────────────

// GetOverviewStats returns dashboard KPI aggregates for the given rolling window.
func (s *AnalyticsService) GetOverviewStats(
	ctx context.Context,
	merchantID string,
	days int,
) (*OverviewStats, error) {
	if days <= 0 {
		days = 30
	}
	since := time.Now().UTC().AddDate(0, 0, -days)

	// Total volume per currency (success only)
	volRows, err := s.db.Query(ctx, `
		SELECT currency, COALESCE(SUM(amount) / 100.0, 0)
		FROM transactions
		WHERE merchant_id = $1 AND status = 'success' AND created_at >= $2
		GROUP BY currency
	`, merchantID, since)
	if err != nil {
		return nil, err
	}
	defer volRows.Close()

	totalVolume := map[string]float64{}
	for volRows.Next() {
		var currency string
		var vol float64
		if err := volRows.Scan(&currency, &vol); err != nil {
			return nil, err
		}
		totalVolume[currency] = vol
	}

	// Count statistics: success, pending, failed (all in one pass)
	type counts struct {
		status string
		n      int
	}
	statusRows, err := s.db.Query(ctx, `
		SELECT status, COUNT(*) FROM transactions
		WHERE merchant_id = $1 AND created_at >= $2
		GROUP BY status
	`, merchantID, since)
	if err != nil {
		return nil, err
	}
	defer statusRows.Close()

	var successCount, pendingCount, failedCount int
	for statusRows.Next() {
		var st string
		var n int
		if err := statusRows.Scan(&st, &n); err != nil {
			return nil, err
		}
		switch st {
		case "success":
			successCount = n
		case "pending":
			pendingCount = n
		case "failed":
			failedCount = n
		}
	}

	total := successCount + failedCount // exclude pending from rate calc
	failureRate := 0.0
	if total > 0 {
		failureRate = float64(failedCount) / float64(total) * 100
	}

	return &OverviewStats{
		TotalVolume:  totalVolume,
		TotalCount:   successCount,
		PendingCount: pendingCount,
		FailureRate:  failureRate,
	}, nil
}

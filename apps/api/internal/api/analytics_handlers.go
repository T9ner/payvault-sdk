package api

import (
	"encoding/json"
	"net/http"
	"strconv"
)

// ==================== Analytics Handlers ====================

// GET /dashboard/analytics/volume?days=30
func (h *Handlers) GetAnalyticsVolume(w http.ResponseWriter, r *http.Request) {
	// Must be authenticated merchant
	merchantID := r.Context().Value("merchantID").(string)

	daysStr := r.URL.Query().Get("days")
	days := 30
	if parsed, err := strconv.Atoi(daysStr); err == nil && parsed > 0 {
		days = parsed
	}

	points, err := h.analytics.GetTransactionVolume(r.Context(), merchantID, days)
	if err != nil {
		http.Error(w, `{"error": "failed to fetch transaction volume"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    points,
	})
}

// GET /dashboard/analytics/overview?days=30
func (h *Handlers) GetOverviewStats(w http.ResponseWriter, r *http.Request) {
	// Must be authenticated merchant
	merchantID := r.Context().Value("merchantID").(string)

	daysStr := r.URL.Query().Get("days")
	days := 30
	if parsed, err := strconv.Atoi(daysStr); err == nil && parsed > 0 {
		days = parsed
	}

	stats, err := h.analytics.GetOverviewStats(r.Context(), merchantID, days)
	if err != nil {
		http.Error(w, `{"error": "failed to fetch overview stats"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    stats,
	})
}

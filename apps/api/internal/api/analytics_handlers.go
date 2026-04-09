package api

import (
	"net/http"
	"strconv"

	"payvault-api/internal/middleware"
)

// ==================== Analytics Handlers ====================

// GET /dashboard/analytics/volume?days=30
func (h *Handlers) GetAnalyticsVolume(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	if merchantID == "" {
		middleware.ErrorResponse(w, http.StatusUnauthorized, "missing merchant ID")
		return
	}

	daysStr := r.URL.Query().Get("days")
	days := 30
	if parsed, err := strconv.Atoi(daysStr); err == nil && parsed > 0 {
		days = parsed
	}

	points, err := h.analytics.GetTransactionVolume(r.Context(), merchantID, days)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, "failed to fetch transaction volume")
		return
	}

	middleware.JSONResponse(w, http.StatusOK, points)
}

// GET /dashboard/analytics/overview?days=30
func (h *Handlers) GetOverviewStats(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	if merchantID == "" {
		middleware.ErrorResponse(w, http.StatusUnauthorized, "missing merchant ID")
		return
	}

	daysStr := r.URL.Query().Get("days")
	days := 30
	if parsed, err := strconv.Atoi(daysStr); err == nil && parsed > 0 {
		days = parsed
	}

	stats, err := h.analytics.GetOverviewStats(r.Context(), merchantID, days)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, "failed to fetch overview stats")
		return
	}

	middleware.JSONResponse(w, http.StatusOK, stats)
}

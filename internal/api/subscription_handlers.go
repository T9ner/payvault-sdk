package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"payvault-api/internal/middleware"
	"payvault-api/internal/services"
)

// ==================== Dashboard Plans API ====================

// GET /api/v1/dashboard/plans
func (h *Handlers) ListPlans(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	plans, err := h.subs.ListPlans(r.Context(), merchantID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, plans)
}

// POST /api/v1/dashboard/plans
func (h *Handlers) CreatePlan(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())

	var input services.CreatePlanInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	plan, err := h.subs.CreatePlan(r.Context(), merchantID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, plan)
}

// PATCH /api/v1/dashboard/plans/{id}
func (h *Handlers) UpdatePlan(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	planID := chi.URLParam(r, "id")

	var input struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Active      *bool   `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	err := h.subs.UpdatePlan(r.Context(), merchantID, planID, input.Active, input.Name, input.Description)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]string{"message": "Plan updated"})
}

// POST /api/v1/dashboard/plans/{id}/prices
func (h *Handlers) AddPriceToPlan(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	planID := chi.URLParam(r, "id")

	var input services.CreatePriceInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	price, err := h.subs.AddPriceToPlan(r.Context(), merchantID, planID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, price)
}

// PATCH /api/v1/dashboard/plans/{plan_id}/prices/{price_id}
func (h *Handlers) DeactivatePrice(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	planID := chi.URLParam(r, "plan_id")
	priceID := chi.URLParam(r, "price_id")

	err := h.subs.DeactivatePrice(r.Context(), merchantID, planID, priceID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]string{"message": "Price deactivated"})
}

// ==================== Dashboard Subscriptions API ====================

// GET /api/v1/dashboard/subscriptions
func (h *Handlers) ListSubscriptions(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	limit, offset := parsePagination(r)
	
	status := r.URL.Query().Get("status")
	planID := r.URL.Query().Get("plan_id")
	customerEmail := r.URL.Query().Get("customer_email")

	subs, total, err := h.subs.ListSubscriptions(r.Context(), merchantID, status, planID, customerEmail, limit, offset)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]interface{}{
		"subscriptions": subs,
		"total":         total,
		"limit":         limit,
		"offset":        offset,
	})
}

// GET /api/v1/dashboard/subscriptions/{id}
func (h *Handlers) GetSubscriptionDetail(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	subID := chi.URLParam(r, "id")

	sub, err := h.subs.GetSubscriptionDetail(r.Context(), merchantID, subID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, sub)
}

// POST /api/v1/dashboard/subscriptions/{id}/cancel
func (h *Handlers) CancelSubscription(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	subID := chi.URLParam(r, "id")

	var input services.CancelSubscriptionRequest
	json.NewDecoder(r.Body).Decode(&input) // optional body

	if input.Timing == "" {
		input.Timing = "at_end_of_period"
	}

	var reasonPtr *string
	if input.Reason != "" {
		reasonPtr = &input.Reason
	}

	err := h.subs.CancelSubscription(r.Context(), merchantID, subID, input.Timing, reasonPtr)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]string{"message": "Subscription canceled"})
}

// POST /api/v1/dashboard/subscriptions/{id}/uncancel
func (h *Handlers) UncancelSubscription(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	subID := chi.URLParam(r, "id")

	err := h.subs.UncancelSubscription(r.Context(), merchantID, subID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, map[string]string{"message": "Subscription cancellation reversed"})
}

// ==================== Public Subscriptions API ====================

// POST /api/v1/public/subscriptions
func (h *Handlers) PublicSubscribe(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context()) // Extracted from API key by middleware

	var input services.PublicSubscribeInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	sub, err := h.subs.SubscribeCustomer(r.Context(), merchantID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusCreated, sub)
}

// GET /api/v1/public/subscriptions
func (h *Handlers) PublicListSubscriptions(w http.ResponseWriter, r *http.Request) {
	h.ListSubscriptions(w, r) // same logic, just behind API key auth
}

// POST /api/v1/public/subscriptions/{id}/adjust
func (h *Handlers) PublicAdjustSubscription(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	subID := chi.URLParam(r, "id")

	var input services.AdjustSubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	sub, err := h.subs.AdjustSubscription(r.Context(), merchantID, subID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, sub)
}

// POST /api/v1/public/subscriptions/{id}/preview-adjustment
func (h *Handlers) PublicPreviewAdjustment(w http.ResponseWriter, r *http.Request) {
	merchantID := middleware.GetMerchantID(r.Context())
	subID := chi.URLParam(r, "id")

	var input services.AdjustSubscriptionRequest
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	preview, err := h.subs.PreviewAdjustment(r.Context(), merchantID, subID, input)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.JSONResponse(w, http.StatusOK, preview)
}

// POST /api/v1/public/subscriptions/{id}/cancel
func (h *Handlers) PublicCancelSubscription(w http.ResponseWriter, r *http.Request) {
	h.CancelSubscription(w, r)
}

// POST /api/v1/public/subscriptions/{id}/uncancel
func (h *Handlers) PublicUncancelSubscription(w http.ResponseWriter, r *http.Request) {
	h.UncancelSubscription(w, r)
}

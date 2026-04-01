package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// ── extractReference ─────────────────────────────────────────────

func TestExtractReference_Paystack(t *testing.T) {
	event := map[string]interface{}{
		"event": "charge.success",
		"data": map[string]interface{}{
			"reference": "pvt_ps_abc123",
			"amount":    500000,
		},
	}

	ref := extractReference(event, "paystack")
	if ref != "pvt_ps_abc123" {
		t.Errorf("extractReference(paystack) = %q, want %q", ref, "pvt_ps_abc123")
	}
}

func TestExtractReference_Flutterwave(t *testing.T) {
	event := map[string]interface{}{
		"event": "charge.completed",
		"data": map[string]interface{}{
			"tx_ref": "pvt_fw_xyz789",
			"amount": 5000,
		},
	}

	ref := extractReference(event, "flutterwave")
	if ref != "pvt_fw_xyz789" {
		t.Errorf("extractReference(flutterwave) = %q, want %q", ref, "pvt_fw_xyz789")
	}
}

func TestExtractReference_UnknownProvider(t *testing.T) {
	event := map[string]interface{}{
		"data": map[string]interface{}{
			"reference": "xxx",
		},
	}

	ref := extractReference(event, "stripe")
	if ref != "" {
		t.Errorf("extractReference(stripe) = %q, want empty string", ref)
	}
}

func TestExtractReference_MissingData(t *testing.T) {
	// Event with no "data" key
	event := map[string]interface{}{
		"event": "charge.success",
	}

	ref := extractReference(event, "paystack")
	if ref != "" {
		t.Errorf("extractReference with missing data = %q, want empty", ref)
	}
}

func TestExtractReference_MissingReference(t *testing.T) {
	// Event with "data" but no reference field
	event := map[string]interface{}{
		"data": map[string]interface{}{
			"amount": 500000,
		},
	}

	ref := extractReference(event, "paystack")
	if ref != "" {
		t.Errorf("extractReference with missing ref = %q, want empty", ref)
	}
}

// ── extractSubscriptionData ─────────────────────────────────────

func TestExtractSubscriptionData_DirectSubscriptionCode(t *testing.T) {
	event := map[string]interface{}{
		"event": "subscription.create",
		"data": map[string]interface{}{
			"subscription_code": "SUB_abc123",
		},
	}

	code, eventType := extractSubscriptionData(event, "paystack")
	if code != "SUB_abc123" {
		t.Errorf("code = %q, want %q", code, "SUB_abc123")
	}
	if eventType != "subscription.create" {
		t.Errorf("eventType = %q, want %q", eventType, "subscription.create")
	}
}

func TestExtractSubscriptionData_NestedInPlan(t *testing.T) {
	event := map[string]interface{}{
		"event": "charge.success",
		"data": map[string]interface{}{
			"plan": map[string]interface{}{
				"subscription_code": "SUB_nested",
			},
		},
	}

	code, eventType := extractSubscriptionData(event, "paystack")
	if code != "SUB_nested" {
		t.Errorf("code = %q, want %q", code, "SUB_nested")
	}
	if eventType != "charge.success" {
		t.Errorf("eventType = %q, want %q", eventType, "charge.success")
	}
}

func TestExtractSubscriptionData_NoSubscription(t *testing.T) {
	event := map[string]interface{}{
		"event": "charge.success",
		"data": map[string]interface{}{
			"reference": "pvt_ps_001",
		},
	}

	code, eventType := extractSubscriptionData(event, "paystack")
	if code != "" {
		t.Errorf("code = %q, want empty string (not a subscription event)", code)
	}
	if eventType != "" {
		t.Errorf("eventType = %q, want empty string", eventType)
	}
}

func TestExtractSubscriptionData_NonPaystack(t *testing.T) {
	// Flutterwave subscription handling isn't implemented
	event := map[string]interface{}{
		"event": "subscription.create",
		"data": map[string]interface{}{
			"subscription_code": "SUB_fw",
		},
	}

	code, _ := extractSubscriptionData(event, "flutterwave")
	if code != "" {
		t.Errorf("code = %q, want empty for non-paystack", code)
	}
}

// ── parsePagination ─────────────────────────────────────────────

func TestParsePagination_ValidValues(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/test?limit=50&offset=10", nil)
	limit, offset := parsePagination(req)

	if limit != 50 {
		t.Errorf("limit = %d, want 50", limit)
	}
	if offset != 10 {
		t.Errorf("offset = %d, want 10", offset)
	}
}

func TestParsePagination_Defaults(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/test", nil)
	limit, offset := parsePagination(req)

	// Default limit should be 20, offset should be 0
	if limit != 20 {
		t.Errorf("default limit = %d, want 20", limit)
	}
	if offset != 0 {
		t.Errorf("default offset = %d, want 0", offset)
	}
}

func TestParsePagination_OverMaxLimit(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/test?limit=500", nil)
	limit, _ := parsePagination(req)

	// Limit > 100 should default to 20
	if limit != 20 {
		t.Errorf("limit for 500 = %d, want 20 (default)", limit)
	}
}

func TestParsePagination_NegativeValues(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/test?limit=-5&offset=-10", nil)
	limit, offset := parsePagination(req)

	if limit != 20 {
		t.Errorf("negative limit = %d, want 20 (default)", limit)
	}
	if offset != 0 {
		t.Errorf("negative offset = %d, want 0", offset)
	}
}

func TestParsePagination_InvalidValues(t *testing.T) {
	req := httptest.NewRequest("GET", "/api/test?limit=abc&offset=xyz", nil)
	limit, offset := parsePagination(req)

	if limit != 20 {
		t.Errorf("invalid limit = %d, want 20 (default)", limit)
	}
	if offset != 0 {
		t.Errorf("invalid offset = %d, want 0", offset)
	}
}

// ── HealthCheck handler ─────────────────────────────────────────

func TestHealthCheck_ReturnsHealthy(t *testing.T) {
	h := &Handlers{} // No dependencies needed for basic health check

	req := httptest.NewRequest("GET", "/health", nil)
	rr := httptest.NewRecorder()

	h.HealthCheck(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("HealthCheck status = %d, want %d", rr.Code, http.StatusOK)
	}

	body := rr.Body.String()
	if body == "" {
		t.Fatal("HealthCheck returned empty body")
	}

	// Should contain "healthy"
	if !contains(body, "healthy") {
		t.Errorf("HealthCheck body should contain 'healthy', got: %s", body)
	}

	// Should contain service name
	if !contains(body, "payvault-api") {
		t.Errorf("HealthCheck body should contain 'payvault-api', got: %s", body)
	}
}

// helper
func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, sep string) bool {
	for i := 0; i <= len(s)-len(sep); i++ {
		if s[i:i+len(sep)] == sep {
			return true
		}
	}
	return false
}

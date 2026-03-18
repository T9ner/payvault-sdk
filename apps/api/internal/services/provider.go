package services

import (
	"context"
	"fmt"
)

// Provider defines the interface every payment provider must implement.
// Adding a new provider (e.g., Stripe, Monnify) = implement this interface.
type Provider interface {
	Name() string
	InitiateCharge(ctx context.Context, req ChargeRequest) (*ChargeResponse, error)
	VerifyTransaction(ctx context.Context, providerRef string) (*VerifyResponse, error)
	Refund(ctx context.Context, providerRef string, amountKobo int64) (*RefundResponse, error)
	VerifyWebhookSignature(payload []byte, signature string, secret string) bool
}

// ChargeRequest is the unified input for initiating a payment.
type ChargeRequest struct {
	Reference   string
	AmountKobo  int64  // Amount in smallest currency unit (kobo for NGN, cents for USD)
	Currency    string // e.g., "NGN", "USD"
	Email       string
	CallbackURL string
	Metadata    map[string]interface{}
}

// ChargeResponse is the unified output after initiating a payment.
type ChargeResponse struct {
	ProviderRef  string // Provider's transaction reference
	AuthURL      string // Redirect URL for customer to complete payment
	Status       string // "pending", "success", "failed"
	RawResponse  map[string]interface{}
}

// VerifyResponse is the unified output after verifying a transaction.
type VerifyResponse struct {
	ProviderRef  string
	Status       string // "success", "failed", "abandoned", "pending"
	AmountKobo   int64
	Currency     string
	PaidAt       string
	Channel      string // "card", "bank_transfer", "ussd", etc.
	RawResponse  map[string]interface{}
}

// RefundResponse is the unified output after processing a refund.
type RefundResponse struct {
	ProviderRef string
	Status      string // "pending", "processed", "failed"
	AmountKobo  int64
	RawResponse map[string]interface{}
}

// ProviderRegistry holds all registered payment providers.
type ProviderRegistry struct {
	providers map[string]Provider
}

func NewProviderRegistry() *ProviderRegistry {
	return &ProviderRegistry{providers: make(map[string]Provider)}
}

func (r *ProviderRegistry) Register(p Provider) {
	r.providers[p.Name()] = p
}

func (r *ProviderRegistry) Get(name string) (Provider, error) {
	p, ok := r.providers[name]
	if !ok {
		return nil, fmt.Errorf("provider %q not registered", name)
	}
	return p, nil
}

func (r *ProviderRegistry) List() []string {
	names := make([]string, 0, len(r.providers))
	for name := range r.providers {
		names = append(names, name)
	}
	return names
}

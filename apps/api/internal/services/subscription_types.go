package services

import (
	"time"
)

// ============ PLANS & PRICES ============

type Plan struct {
	ID          string                 `json:"id"`
	MerchantID  string                 `json:"merchant_id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description,omitempty"`
	Active      bool                   `json:"active"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	Prices      []PlanPrice            `json:"prices,omitempty"`
}

type PlanPrice struct {
	ID              string    `json:"id"`
	PlanID          string    `json:"plan_id"`
	Nickname        string    `json:"nickname,omitempty"`
	Amount          int64     `json:"amount"`
	Currency        string    `json:"currency"`
	Interval        string    `json:"interval"`
	IntervalCount   int       `json:"interval_count"`
	TrialPeriodDays int       `json:"trial_period_days"`
	Active          bool      `json:"active"`
	CreatedAt       time.Time `json:"created_at"`
}

type CreatePlanInput struct {
	Name        string                 `json:"name" validate:"required"`
	Description string                 `json:"description,omitempty"`
	Prices      []CreatePriceInput     `json:"prices" validate:"required,min=1"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type CreatePriceInput struct {
	Nickname        string `json:"nickname,omitempty"`
	Amount          int64  `json:"amount" validate:"required,gt=0"`
	Currency        string `json:"currency" validate:"required"`
	Interval        string `json:"interval" validate:"required,oneof=daily weekly monthly yearly"`
	IntervalCount   int    `json:"interval_count,omitempty"`
	TrialPeriodDays int    `json:"trial_period_days,omitempty"`
}

// ============ SUBSCRIPTIONS ============

type Subscription struct {
	ID                        string                 `json:"id"`
	PlanID                    string                 `json:"plan_id"`
	PlanName                  string                 `json:"plan_name"`
	PriceID                   string                 `json:"price_id"`
	CustomerEmail             string                 `json:"customer_email"`
	CustomerName              string                 `json:"customer_name,omitempty"`
	Status                    string                 `json:"status"`
	CurrentPeriodStart        time.Time              `json:"current_period_start"`
	CurrentPeriodEnd          time.Time              `json:"current_period_end"`
	BillingCycleAnchor        int                    `json:"billing_cycle_anchor"`
	TrialEnd                  *time.Time             `json:"trial_end,omitempty"`
	CancelAtPeriodEnd         bool                   `json:"cancel_at_period_end"`
	CancelScheduledAt         *time.Time             `json:"cancel_scheduled_at,omitempty"`
	CanceledAt                *time.Time             `json:"canceled_at,omitempty"`
	CancellationReason        *string                `json:"cancellation_reason,omitempty"`
	Provider                  string                 `json:"provider"`
	ProviderSubscriptionID    *string                `json:"provider_subscription_id,omitempty"`
	ProviderCustomerCode      *string                `json:"provider_customer_code,omitempty"`
	ProviderAuthorizationCode *string                `json:"provider_authorization_code,omitempty"`
	ScheduledAdjustment       map[string]interface{} `json:"scheduled_adjustment,omitempty"`
	ScheduledAdjustmentAt     *time.Time             `json:"scheduled_adjustment_at,omitempty"`
	Metadata                  map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt                 time.Time              `json:"created_at"`
	UpdatedAt                 time.Time              `json:"updated_at"`

	Items  []SubscriptionItem  `json:"items,omitempty"`
	Events []SubscriptionEvent `json:"events,omitempty"`
}

type SubscriptionItem struct {
	ID             string    `json:"id"`
	SubscriptionID string    `json:"subscription_id"`
	PriceID        string    `json:"price_id"`
	PlanName       string    `json:"plan_name,omitempty"`
	PriceNickname  string    `json:"price_nickname,omitempty"`
	Quantity       int       `json:"quantity"`
	UnitAmount     int64     `json:"unit_amount"`
	Currency       string    `json:"currency"`
	CreatedAt      time.Time `json:"created_at"`
}

type SubscriptionEvent struct {
	ID             string                 `json:"id"`
	SubscriptionID string                 `json:"subscription_id"`
	EventType      string                 `json:"event_type"`
	PreviousStatus *string                `json:"previous_status,omitempty"`
	NewStatus      *string                `json:"new_status,omitempty"`
	Details        map[string]interface{} `json:"details,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
}

// ============ ADJUSTMENT & CANCEL ============

type AdjustSubscriptionRequest struct {
	NewPriceID string `json:"new_price_id" validate:"required"`
	Timing     string `json:"timing" validate:"required,oneof=immediately at_end_of_period auto"`
	Prorate    *bool  `json:"prorate,omitempty"` // Defaults to true
}

type AdjustmentPreview struct {
	CurrentPlan        string `json:"current_plan"`
	NewPlan            string `json:"new_plan"`
	IsUpgrade          bool   `json:"is_upgrade"`
	ResolvedTiming     string `json:"resolved_timing"`
	ProrationAmount    int64  `json:"proration_amount"`
	NewRecurringAmount int64  `json:"new_recurring_amount"`
	Currency           string `json:"currency"`
	EffectiveDate      string `json:"effective_date"`
}

type CancelSubscriptionRequest struct {
	Timing string `json:"timing" validate:"omitempty,oneof=immediately at_end_of_period"`
	Reason string `json:"reason,omitempty"`
}

// ============ PUBLIC SUBSCRIBE ============

type PublicSubscribeInput struct {
	PriceID                   string                 `json:"price_id" validate:"required"`
	CustomerEmail             string                 `json:"customer_email" validate:"required,email"`
	CustomerName              string                 `json:"customer_name,omitempty"`
	Provider                  string                 `json:"provider" validate:"required"`
	PaymentReference          string                 `json:"payment_reference,omitempty"`
	ProviderAuthorizationCode string                 `json:"provider_authorization_code,omitempty"`
	Metadata                  map[string]interface{} `json:"metadata,omitempty"`
}

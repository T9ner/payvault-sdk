package queue

import (
	"context"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// NewRedisClient creates a new Redis client from a URL.
func NewRedisClient(redisURL string) *redis.Client {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("invalid redis url: %v", err)
	}

	opts.PoolSize = 20
	opts.MinIdleConns = 5
	opts.MaxRetries = 3
	opts.ReadTimeout = 5 * time.Second
	opts.WriteTimeout = 5 * time.Second

	client := redis.NewClient(opts)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		log.Fatalf("redis ping failed: %v", err)
	}

	return client
}

// ── Queue Keys ───────────────────────────────────────────────────
const (
	QueueWebhookForward = "payvault:queue:webhook_forward"
	QueueWebhookRetry   = "payvault:queue:webhook_retry"
)

// ── Queue Adapter ────────────────────────────────────────────────
// QueueAdapter wraps a Redis client to satisfy the Enqueue interface
// expected by TransactionService and other services.

type QueueAdapter struct {
	client *redis.Client
}

// NewQueueAdapter creates a QueueAdapter wrapping the given Redis client.
func NewQueueAdapter(client *redis.Client) *QueueAdapter {
	return &QueueAdapter{client: client}
}

// Enqueue pushes a job payload onto the appropriate Redis queue based on jobType.
// Job types map to queue keys: "webhook_forward" -> QueueWebhookForward, etc.
func (qa *QueueAdapter) Enqueue(jobType string, payload []byte) error {
	queueKey := "payvault:queue:" + jobType
	return qa.client.LPush(context.Background(), queueKey, payload).Err()
}

// ── Webhook Deliverer Interface ──────────────────────────────────
// Decouples the worker pool from the services package to avoid circular imports.
// WebhookDeliveryService satisfies this interface.

type WebhookDeliverer interface {
	// DeliverWebhook deserializes a job, fetches the merchant webhook URL,
	// POSTs the event payload, and handles success/failure with retries.
	DeliverWebhook(ctx context.Context, jobData string) error

	// ProcessRetryQueue checks the delayed retry sorted set for due jobs
	// and re-enqueues them to the main forward queue.
	ProcessRetryQueue(ctx context.Context)
}

// ── Worker Pool ──────────────────────────────────────────────────

// WorkerPool processes background jobs from Redis queues.
type WorkerPool struct {
	redis     *redis.Client
	deliverer WebhookDeliverer
	stopCh    chan struct{}
}

// NewWorkerPool creates a worker pool for processing background jobs.
func NewWorkerPool(redisClient *redis.Client) *WorkerPool {
	return &WorkerPool{
		redis:  redisClient,
		stopCh: make(chan struct{}),
	}
}

// SetDeliverer wires the webhook delivery service into the worker pool.
// Called after both the pool and the service are created (breaks init cycle).
func (wp *WorkerPool) SetDeliverer(d WebhookDeliverer) {
	wp.deliverer = d
}

// Start begins processing jobs from all queues.
func (wp *WorkerPool) Start(ctx context.Context) {
	if wp.deliverer == nil {
		log.Println("worker pool: WARNING -- no webhook deliverer set, webhook jobs will be skipped")
	}

	// Forward queue: processes new webhook delivery jobs
	log.Println("worker pool: starting webhook forward worker (2 goroutines)")
	go wp.processForwardQueue(ctx)
	go wp.processForwardQueue(ctx) // 2 concurrent workers

	// Retry queue: polls the delayed sorted set every 5 seconds
	log.Println("worker pool: starting webhook retry poller")
	go wp.pollRetryQueue(ctx)
}

// Stop signals all workers to shut down.
func (wp *WorkerPool) Stop() {
	close(wp.stopCh)
	log.Println("worker pool: stopped")
}

// processForwardQueue blocks on the forward list, delivering each webhook.
func (wp *WorkerPool) processForwardQueue(ctx context.Context) {
	for {
		select {
		case <-wp.stopCh:
			return
		case <-ctx.Done():
			return
		default:
			// BRPop blocks for up to 5s waiting for a job
			result, err := wp.redis.BRPop(ctx, 5*time.Second, QueueWebhookForward).Result()
			if err != nil {
				// Timeout or context cancelled -- loop back
				continue
			}

			jobData := result[1] // result[0] is the queue key

			if wp.deliverer == nil {
				log.Printf("worker: skipping webhook job (no deliverer configured)")
				continue
			}

			if err := wp.deliverer.DeliverWebhook(ctx, jobData); err != nil {
				log.Printf("worker: webhook delivery error: %v", err)
				// Error is already handled inside DeliverWebhook (retry or dead-letter).
				// We just log it here for observability.
			}
		}
	}
}

// pollRetryQueue checks the delayed retry sorted set every 5 seconds
// and moves due jobs back to the forward queue.
func (wp *WorkerPool) pollRetryQueue(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-wp.stopCh:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			if wp.deliverer != nil {
				wp.deliverer.ProcessRetryQueue(ctx)
			}
		}
	}
}

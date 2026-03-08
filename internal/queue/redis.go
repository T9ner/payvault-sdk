package queue

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/T9ner/payvault-api/internal/config"
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
	QueueWebhookForward = "payvault:queue:webhook_forward" // Webhook forwarding jobs
	QueueWebhookRetry   = "payvault:queue:webhook_retry"   // Failed webhooks for retry
)

// Job represents a queued work item.
type Job struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Payload   string `json:"payload"` // JSON-encoded job data
	Attempts  int    `json:"attempts"`
	MaxRetry  int    `json:"max_retry"`
	CreatedAt int64  `json:"created_at"`
}

// Enqueue pushes a job onto a Redis list.
func Enqueue(ctx context.Context, client *redis.Client, queueKey string, job []byte) error {
	return client.LPush(ctx, queueKey, job).Err()
}

// Dequeue pops a job from a Redis list (blocking).
func Dequeue(ctx context.Context, client *redis.Client, queueKey string, timeout time.Duration) (string, error) {
	result, err := client.BRPop(ctx, timeout, queueKey).Result()
	if err != nil {
		return "", err
	}
	return result[1], nil // result[0] is the key name
}

// ── Worker Pool ──────────────────────────────────────────────────

// WorkerPool processes background jobs from Redis queues.
type WorkerPool struct {
	redis  *redis.Client
	db     *pgxpool.Pool
	cfg    *config.Config
	stopCh chan struct{}
}

// NewWorkerPool creates a worker pool for processing background jobs.
func NewWorkerPool(redisClient *redis.Client, db *pgxpool.Pool, cfg *config.Config) *WorkerPool {
	return &WorkerPool{
		redis:  redisClient,
		db:     db,
		cfg:    cfg,
		stopCh: make(chan struct{}),
	}
}

// Start begins processing jobs from all queues.
func (wp *WorkerPool) Start(ctx context.Context) {
	log.Println("worker pool: starting webhook forward worker")
	go wp.processQueue(ctx, QueueWebhookForward)

	log.Println("worker pool: starting webhook retry worker")
	go wp.processQueue(ctx, QueueWebhookRetry)
}

// Stop signals all workers to shut down.
func (wp *WorkerPool) Stop() {
	close(wp.stopCh)
	log.Println("worker pool: stopped")
}

func (wp *WorkerPool) processQueue(ctx context.Context, queueKey string) {
	for {
		select {
		case <-wp.stopCh:
			return
		case <-ctx.Done():
			return
		default:
			jobData, err := Dequeue(ctx, wp.redis, queueKey, 5*time.Second)
			if err != nil {
				// Timeout or context cancelled -- loop and try again
				continue
			}

			switch queueKey {
			case QueueWebhookForward, QueueWebhookRetry:
				wp.processWebhookJob(ctx, jobData)
			}
		}
	}
}

// processWebhookJob handles forwarding a webhook to a merchant's URL.
// Implementation will be in Phase 4 (webhook relay).
func (wp *WorkerPool) processWebhookJob(ctx context.Context, jobData string) {
	// TODO: Phase 4 -- parse job, HTTP POST to merchant webhook URL,
	// handle retries with exponential backoff
	log.Printf("worker: processing webhook job (len=%d)", len(jobData))
}

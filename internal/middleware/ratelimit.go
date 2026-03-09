package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimiter provides per-merchant rate limiting using Redis sliding windows.
type RateLimiter struct {
	redis *redis.Client
	rps   int
	burst int
}

// NewRateLimiter creates a new RateLimiter.
func NewRateLimiter(redisClient *redis.Client, rps, burst int) *RateLimiter {
	return &RateLimiter{redis: redisClient, rps: rps, burst: burst}
}

// Limit is a chi middleware that enforces rate limits.
func (rl *RateLimiter) Limit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		merchantID := GetMerchantID(r.Context())
		if merchantID.String() == "00000000-0000-0000-0000-000000000000" {
			next.ServeHTTP(w, r)
			return
		}

		key := fmt.Sprintf("payvault:ratelimit:%s", merchantID.String())
		allowed, err := checkRateLimit(r.Context(), rl.redis, key, rl.rps, rl.burst)
		if err != nil {
			// If Redis is down, allow the request (fail open)
			next.ServeHTTP(w, r)
			return
		}

		if !allowed {
			w.Header().Set("Retry-After", "1")
			writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func checkRateLimit(ctx context.Context, client *redis.Client, key string, rps, burst int) (bool, error) {
	now := time.Now().Unix()
	windowKey := fmt.Sprintf("%s:%d", key, now)

	pipe := client.Pipeline()
	incr := pipe.Incr(ctx, windowKey)
	pipe.Expire(ctx, windowKey, 2*time.Second)

	prevKey := fmt.Sprintf("%s:%d", key, now-1)
	prevCount := pipe.Get(ctx, prevKey)

	_, err := pipe.Exec(ctx)
	if err != nil && err != redis.Nil {
		return false, err
	}

	currentCount := incr.Val()
	var prevVal int64
	if v, err := prevCount.Int64(); err == nil {
		prevVal = v
	}

	totalRate := float64(prevVal)*0.5 + float64(currentCount)
	return totalRate <= float64(burst), nil
}

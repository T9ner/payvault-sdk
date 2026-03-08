package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/T9ner/payvault-api/internal/config"
)

// RateLimit middleware uses Redis sliding window rate limiting per merchant.
func RateLimit(redisClient *redis.Client, cfg *config.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			merchantID := GetMerchantID(r.Context())
			if merchantID.String() == "00000000-0000-0000-0000-000000000000" {
				// No merchant context (unauthenticated routes) -- use IP
				next.ServeHTTP(w, r)
				return
			}

			key := fmt.Sprintf("payvault:ratelimit:%s", merchantID.String())
			allowed, err := checkRateLimit(r.Context(), redisClient, key, cfg.RateLimitRPS, cfg.RateLimitBurst)
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
}

// checkRateLimit implements a sliding window counter using Redis.
func checkRateLimit(ctx context.Context, client *redis.Client, key string, rps, burst int) (bool, error) {
	now := time.Now().Unix()
	windowKey := fmt.Sprintf("%s:%d", key, now)

	pipe := client.Pipeline()
	incr := pipe.Incr(ctx, windowKey)
	pipe.Expire(ctx, windowKey, 2*time.Second)

	// Also check previous second for sliding window
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

	// Sliding window: weight previous second's count
	totalRate := float64(prevVal)*0.5 + float64(currentCount)

	return totalRate <= float64(burst), nil
}

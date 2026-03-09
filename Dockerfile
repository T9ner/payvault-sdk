# Build Stage
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Copy dependency files first for layer caching
COPY go.mod go.sum* ./
RUN go mod download 2>/dev/null || true

# Copy source code
COPY . .

# Tidy and download dependencies
RUN go mod tidy && go mod download

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags='-w -s -extldflags "-static"' \
    -o /app/payvault-api \
    ./cmd/api

# Runtime Stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

# Non-root user for security
RUN adduser -D -u 1000 payvault

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/payvault-api .

# Copy migrations (needed at runtime for auto-migrate)
COPY --from=builder /app/migrations ./migrations

# Switch to non-root user
USER payvault

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["./payvault-api"]

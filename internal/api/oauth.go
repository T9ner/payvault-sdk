package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"payvault-api/internal/middleware"
)

type githubTokenResponse struct {
	AccessToken string `json:"access_token"`
	Scope       string `json:"scope"`
	TokenType   string `json:"token_type"`
}

type githubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

// GithubLogin initiates the OAuth flow.
func (h *Handlers) GithubLogin(w http.ResponseWriter, r *http.Request) {
	stateBytes := make([]byte, 16)
	_, _ = rand.Read(stateBytes)
	state := hex.EncodeToString(stateBytes)

	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		Expires:  time.Now().Add(10 * time.Minute),
		HttpOnly: true,
		Secure:   h.config.Environment == "production",
		SameSite: http.SameSiteLaxMode,
	})

	redirectURI := fmt.Sprintf("http://localhost:%s/api/v1/auth/github/callback", h.config.Port)

	u, _ := url.Parse("https://github.com/login/oauth/authorize")
	q := u.Query()
	q.Set("client_id", h.config.GithubClientID)
	q.Set("redirect_uri", redirectURI)
	q.Set("scope", "read:user user:email")
	q.Set("state", state)
	u.RawQuery = q.Encode()

	http.Redirect(w, r, u.String(), http.StatusTemporaryRedirect)
}

// GithubCallback exchanges the code for a token and logs the user in.
func (h *Handlers) GithubCallback(w http.ResponseWriter, r *http.Request) {
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")

	cookieState, err := r.Cookie("oauth_state")
	if err != nil || cookieState.Value != state {
		http.Redirect(w, r, fmt.Sprintf("%s/auth/callback?error=invalid_state", h.config.FrontendURL), http.StatusTemporaryRedirect)
		return
	}

	token, err := h.exchangeGithubCode(r.Context(), code)
	if err != nil {
		h.redirectWithError(w, r, "failed_exchange")
		return
	}

	ghUser, err := h.fetchGithubUser(r.Context(), token)
	if err != nil {
		h.redirectWithError(w, r, "failed_profile")
		return
	}

	ghEmail, err := h.fetchGithubEmail(r.Context(), token)
	if err != nil {
		h.redirectWithError(w, r, "failed_email")
		return
	}

	merchant, err := h.auth.UpsertGithubMerchant(r.Context(), ghUser.ID, ghUser.Login, ghEmail, ghUser.AvatarURL)
	if err != nil {
		h.redirectWithError(w, r, "failed_upsert")
		return
	}

	jwtToken, err := h.auth.GenerateJWT(merchant.ID, merchant.Email)
	if err != nil {
		h.redirectWithError(w, r, "failed_jwt")
		return
	}

	http.Redirect(w, r, fmt.Sprintf("%s/auth/callback?token=%s", h.config.FrontendURL, jwtToken), http.StatusTemporaryRedirect)
}

func (h *Handlers) redirectWithError(w http.ResponseWriter, r *http.Request, code string) {
	http.Redirect(w, r, fmt.Sprintf("%s/auth/callback?error=%s", h.config.FrontendURL, code), http.StatusTemporaryRedirect)
}

func (h *Handlers) exchangeGithubCode(ctx context.Context, code string) (string, error) {
	body, _ := json.Marshal(map[string]string{
		"client_id":     h.config.GithubClientID,
		"client_secret": h.config.GithubClientSecret,
		"code":          code,
	})

	req, _ := http.NewRequestWithContext(ctx, "POST", "https://github.com/login/oauth/access_token", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result githubTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.AccessToken, nil
}

func (h *Handlers) fetchGithubUser(ctx context.Context, token string) (*githubUser, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var user githubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}
	return &user, nil
}

func (h *Handlers) fetchGithubEmail(ctx context.Context, token string) (string, error) {
	req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.github.com/user/emails", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var emails []githubEmail
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", err
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	if len(emails) > 0 {
		return emails[0].Email, nil
	}
	return "", fmt.Errorf("no email found")
}

// GetMe returns the authenticated user's profile.
func (h *Handlers) GetMe(w http.ResponseWriter, r *http.Request) {
	merchantID, _ := r.Context().Value(middleware.ContextMerchantID).(string)
	if merchantID == "" {
		middleware.ErrorResponse(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	merchant, err := h.auth.GetMerchantByID(r.Context(), merchantID)
	if err != nil {
		middleware.ErrorResponse(w, http.StatusNotFound, "merchant not found")
		return
	}

	// Just returning the merchant struct to align with existing dashboard payload.
	middleware.JSONResponse(w, http.StatusOK, merchant)
}

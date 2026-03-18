package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
)

// CryptoService handles encryption/decryption using AES-256-GCM.
type CryptoService struct {
	hexKey string
}

// NewCryptoService creates a new CryptoService with the given hex-encoded key.
func NewCryptoService(hexKey string) *CryptoService {
	return &CryptoService{hexKey: hexKey}
}

// Encrypt encrypts plaintext using AES-256-GCM.
func (c *CryptoService) Encrypt(plaintext string) (string, error) {
	key, err := hex.DecodeString(c.hexKey)
	if err != nil {
		return "", fmt.Errorf("decode encryption key: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(ciphertext), nil
}

// Decrypt decrypts hex-encoded ciphertext using AES-256-GCM.
func (c *CryptoService) Decrypt(ciphertextHex string) (string, error) {
	key, err := hex.DecodeString(c.hexKey)
	if err != nil {
		return "", fmt.Errorf("decode encryption key: %w", err)
	}

	ciphertext, err := hex.DecodeString(ciphertextHex)
	if err != nil {
		return "", fmt.Errorf("decode ciphertext: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}

	return string(plaintext), nil
}
/**
 * PayVault Checkout v1.0.0
 * Embeddable payment checkout widget for African payments (Paystack + Flutterwave)
 * Zero dependencies, vanilla JS, production-grade.
 *
 * Usage:
 *   PayVaultCheckout.open({
 *     publicKey: 'pk_test_xxx',
 *     amount: 5000,
 *     currency: 'NGN',
 *     email: 'customer@example.com',
 *     customerName: 'John Doe',
 *     onSuccess: (response) => console.log('Paid!', response),
 *     onClose: () => console.log('Closed'),
 *     onError: (err) => console.error(err),
 *   });
 *
 * (c) 2026 PayVault. All rights reserved.
 */
;(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONSTANTS
  // ---------------------------------------------------------------------------

  const VERSION = '1.0.0';
  const NAMESPACE = 'pv';
  const DEFAULT_API_URL = '/api/pay';
  const AUTO_CLOSE_DELAY = 3000; // ms after success
  const BANK_TRANSFER_TIMEOUT = 30 * 60; // 30 minutes in seconds

  /** Supported payment channels */
  const CHANNELS = {
    card: { label: 'Card', icon: '\uD83D\uDCB3' },
    bank_transfer: { label: 'Bank Transfer', icon: '\uD83C\uDFE6' },
    ussd: { label: 'USSD', icon: '#' },
    mobile_money: { label: 'Mobile Money', icon: '\uD83D\uDCF1' },
  };

  const DEFAULT_CHANNELS = ['card', 'bank_transfer', 'ussd', 'mobile_money'];

  /** Card brand patterns */
  const CARD_BRANDS = [
    { name: 'verve',      pattern: /^(506[01]|507[89]|6500)/ },
    { name: 'visa',       pattern: /^4/ },
    { name: 'mastercard', pattern: /^(5[1-5]|2[2-7])/ },
  ];

  /** USSD bank codes (Nigeria) */
  const USSD_BANKS = [
    { name: 'GTBank',          code: '*737*', dialFormat: '*737*AMOUNT*1#' },
    { name: 'First Bank',      code: '*894*', dialFormat: '*894*AMOUNT#' },
    { name: 'UBA',             code: '*919*', dialFormat: '*919*AMOUNT#' },
    { name: 'Zenith Bank',     code: '*966*', dialFormat: '*966*AMOUNT#' },
    { name: 'Access Bank',     code: '*901*', dialFormat: '*901*AMOUNT#' },
    { name: 'Sterling Bank',   code: '*822*', dialFormat: '*822*AMOUNT#' },
    { name: 'Stanbic IBTC',    code: '*909*', dialFormat: '*909*AMOUNT#' },
    { name: 'Fidelity Bank',   code: '*770*', dialFormat: '*770*AMOUNT#' },
  ];

  /** Mobile money country configs */
  const MOMO_COUNTRIES = [
    { code: 'NG', name: 'Nigeria',      dialCode: '+234', networks: ['MTN', 'Airtel', 'Glo', '9mobile'] },
    { code: 'GH', name: 'Ghana',        dialCode: '+233', networks: ['MTN', 'Vodafone', 'AirtelTigo'] },
    { code: 'KE', name: 'Kenya',        dialCode: '+254', networks: ['M-Pesa', 'Airtel Money'] },
    { code: 'ZA', name: 'South Africa', dialCode: '+27',  networks: ['MTN', 'Vodacom'] },
  ];

  /** Currency symbols */
  const CURRENCY_SYMBOLS = {
    NGN: '\u20A6', GHS: 'GH\u20B5', KES: 'KSh', ZAR: 'R', USD: '$', GBP: '\u00A3', EUR: '\u20AC',
  };

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  /** Create an element with classes and optional attributes */
  function el(tag, classes, attrs) {
    const node = document.createElement(tag);
    if (classes) {
      (Array.isArray(classes) ? classes : [classes]).forEach(function (c) { node.classList.add(c); });
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    }
    return node;
  }

  /** Format amount with thousand separators */
  function formatAmount(amount, currency) {
    var symbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
    var parts = Number(amount).toFixed(2).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return symbol + parts.join('.');
  }

  /** Luhn check for card number validation */
  function luhnCheck(num) {
    var digits = num.replace(/\D/g, '');
    if (digits.length < 13) return false;
    var sum = 0;
    var alt = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var n = parseInt(digits[i], 10);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  /** Detect card brand from number */
  function detectBrand(number) {
    var cleaned = number.replace(/\s/g, '');
    for (var i = 0; i < CARD_BRANDS.length; i++) {
      if (CARD_BRANDS[i].pattern.test(cleaned)) return CARD_BRANDS[i].name;
    }
    return null;
  }

  /** Generate a random reference if none provided */
  function generateRef() {
    return 'pv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
  }

  /** Format seconds as MM:SS */
  function formatTime(secs) {
    var m = Math.floor(secs / 60);
    var s = secs % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /** Detect mobile money network from phone number (basic heuristic) */
  function detectNetwork(phone, countryCode) {
    // Simplified: return first network for the country
    var country = MOMO_COUNTRIES.find(function (c) { return c.code === countryCode; });
    if (!country) return null;
    // In production this would use prefix tables
    return country.networks[0];
  }

  // ---------------------------------------------------------------------------
  // CSS AUTO-INJECTION
  // ---------------------------------------------------------------------------

  function injectCSS() {
    // Determine the script's own base URL
    var scripts = document.querySelectorAll('script[src]');
    var selfScript = null;
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].src && scripts[i].src.indexOf('payvault-checkout') !== -1) {
        selfScript = scripts[i];
        break;
      }
    }

    var cssUrl = 'payvault-checkout.css';
    if (selfScript) {
      var base = selfScript.src.substring(0, selfScript.src.lastIndexOf('/') + 1);
      cssUrl = base + 'payvault-checkout.css';
    }

    // Don't inject twice
    if (document.querySelector('link[href*="payvault-checkout.css"]')) return;

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  // ---------------------------------------------------------------------------
  // CARD BRAND SVG ICONS (inline, no external deps)
  // ---------------------------------------------------------------------------

  var BRAND_ICONS = {
    visa: '<svg class="pv-card-brand-svg" viewBox="0 0 48 32" fill="none"><rect width="48" height="32" rx="4" fill="#1A1F71"/><path d="M19.5 21H17L18.8 11H21.3L19.5 21ZM15.2 11L12.8 18L12.5 16.5L12.5 16.5L11.6 12C11.6 12 11.5 11 10.2 11H6.1L6 11.2C6 11.2 7.5 11.5 9.2 12.5L11.5 21H14.1L17.8 11H15.2ZM37 21H39.3L37.3 11H35.3C34.2 11 33.9 11.8 33.9 11.8L30.1 21H32.7L33.2 19.5H36.4L36.7 21H37ZM34 17.5L35.3 13.8L36 17.5H34ZM29.2 13.7L29.5 12C29.5 12 28.2 11.5 26.8 11.5C25.3 11.5 22 12.2 22 15C22 17.5 25.5 17.5 25.5 18.8C25.5 20 22.5 19.7 21.2 18.8L20.8 20.5C20.8 20.5 22.2 21.2 24 21.2C25.8 21.2 28.2 20.2 28.2 17.6C28.2 15 24.6 14.7 24.6 13.7C24.6 12.7 27 12.8 28.2 13.5L29.2 13.7Z" fill="white"/></svg>',
    mastercard: '<svg class="pv-card-brand-svg" viewBox="0 0 48 32" fill="none"><rect width="48" height="32" rx="4" fill="#252525"/><circle cx="19" cy="16" r="9" fill="#EB001B"/><circle cx="29" cy="16" r="9" fill="#F79E1B"/><path d="M24 9.3A9 9 0 0 1 27.5 16 9 9 0 0 1 24 22.7 9 9 0 0 1 20.5 16 9 9 0 0 1 24 9.3Z" fill="#FF5F00"/></svg>',
    verve: '<svg class="pv-card-brand-svg" viewBox="0 0 48 32" fill="none"><rect width="48" height="32" rx="4" fill="#00425F"/><text x="24" y="19" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="11" fill="white">Verve</text><rect x="8" y="6" width="12" height="3" rx="1.5" fill="#E31837"/><rect x="8" y="6" width="6" height="3" rx="1.5" fill="#0E9B4B"/></svg>',
  };

  // ---------------------------------------------------------------------------
  // MAIN CHECKOUT CLASS
  // ---------------------------------------------------------------------------

  function Checkout() {
    this._isOpen = false;
    this._config = null;
    this._root = null;
    this._activeTab = null;
    this._state = 'idle'; // idle | processing | success | error
    this._timerInterval = null;
    this._scrollY = 0;
    this._boundKeyHandler = this._handleKeyDown.bind(this);
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  /**
   * Open the checkout modal.
   * @param {Object} config - Checkout configuration
   */
  Checkout.prototype.open = function (config) {
    if (this._isOpen) {
      console.warn('[PayVault] Checkout is already open.');
      return;
    }

    // Merge defaults
    this._config = Object.assign({
      publicKey: '',
      amount: 0,
      currency: 'NGN',
      email: '',
      customerName: '',
      reference: generateRef(),
      channels: DEFAULT_CHANNELS,
      metadata: {},
      theme: 'light',
      apiUrl: DEFAULT_API_URL,
      onSuccess: function () {},
      onClose: function () {},
      onError: function () {},
    }, config);

    // Validate required fields
    if (!this._config.amount || this._config.amount <= 0) {
      console.error('[PayVault] amount is required and must be > 0');
      return;
    }
    if (!this._config.email) {
      console.error('[PayVault] email is required');
      return;
    }

    // Filter channels to only supported ones
    this._config.channels = this._config.channels.filter(function (ch) {
      return CHANNELS[ch];
    });
    if (this._config.channels.length === 0) {
      this._config.channels = ['card'];
    }

    this._isOpen = true;
    this._state = 'idle';
    this._build();
    this._mount();
    this._bindEvents();
    this._setActiveTab(this._config.channels[0]);

    // Lock background scroll
    this._scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + this._scrollY + 'px';
    document.body.style.width = '100%';

    // Animate in
    requestAnimationFrame(function () {
      this._root.classList.add('pv-open');
      // Focus first interactive element
      var firstInput = this._root.querySelector('.pv-tab-panel.pv-active input, .pv-tab-panel.pv-active select');
      if (firstInput) firstInput.focus();
    }.bind(this));
  };

  /**
   * Close the checkout modal.
   */
  Checkout.prototype.close = function () {
    if (!this._isOpen) return;

    this._root.classList.remove('pv-open');
    this._root.classList.add('pv-closing');

    // Clean up timer
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }

    // Restore scroll
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, this._scrollY);

    // Remove after animation
    setTimeout(function () {
      this._unmount();
      this._isOpen = false;
      this._state = 'idle';
      if (this._config && typeof this._config.onClose === 'function') {
        this._config.onClose();
      }
    }.bind(this), 300);
  };

  // ---------------------------------------------------------------------------
  // DOM CONSTRUCTION
  // ---------------------------------------------------------------------------

  Checkout.prototype._build = function () {
    var cfg = this._config;
    var isTest = cfg.publicKey && cfg.publicKey.indexOf('pk_test') === 0;

    this._root = el('div', 'pv-checkout', {
      'data-theme': cfg.theme,
      'role': 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Payment checkout',
    });

    var html = '';

    // Backdrop
    html += '<div class="pv-backdrop"></div>';

    // Modal container
    html += '<div class="pv-modal" role="document">';

    // Test mode banner
    if (isTest) {
      html += '<div class="pv-test-banner"><span class="pv-test-badge">TEST MODE</span></div>';
    }

    // Header
    html += '<div class="pv-header">';
    html += '  <button class="pv-close-btn" aria-label="Close checkout" type="button">';
    html += '    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    html += '  </button>';
    html += '  <div class="pv-header-info">';
    html += '    <div class="pv-logo">';
    html += '      <svg viewBox="0 0 32 32" width="32" height="32"><rect width="32" height="32" rx="8" fill="var(--pv-primary)"/><path d="M10 16l4 4 8-8" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    html += '    </div>';
    html += '    <div class="pv-amount">' + formatAmount(cfg.amount, cfg.currency) + '</div>';
    html += '    <div class="pv-email">' + this._escapeHtml(cfg.email) + '</div>';
    html += '  </div>';
    html += '</div>';

    // Tab navigation
    if (cfg.channels.length > 1) {
      html += '<div class="pv-tabs" role="tablist">';
      cfg.channels.forEach(function (ch) {
        var channel = CHANNELS[ch];
        html += '<button class="pv-tab" data-channel="' + ch + '" role="tab" aria-selected="false" type="button">';
        html += '  <span class="pv-tab-label">' + channel.label + '</span>';
        html += '</button>';
      });
      html += '<div class="pv-tab-indicator"></div>';
      html += '</div>';
    }

    // Content area
    html += '<div class="pv-content">';

    // --- Card Panel ---
    if (cfg.channels.indexOf('card') !== -1) {
      html += '<div class="pv-tab-panel" data-panel="card">';
      html += '  <form class="pv-card-form" autocomplete="on" novalidate>';

      // Card holder name
      html += '  <div class="pv-field">';
      html += '    <input type="text" id="pv-card-name" class="pv-input" placeholder=" " autocomplete="cc-name" />';
      html += '    <label for="pv-card-name" class="pv-label">Cardholder Name</label>';
      html += '  </div>';

      // Card number
      html += '  <div class="pv-field pv-field-card-number">';
      html += '    <input type="text" id="pv-card-number" class="pv-input" placeholder=" " inputmode="numeric" autocomplete="cc-number" maxlength="23" />';
      html += '    <label for="pv-card-number" class="pv-label">Card Number</label>';
      html += '    <div class="pv-card-brand" aria-hidden="true"></div>';
      html += '  </div>';

      // Expiry + CVV row
      html += '  <div class="pv-field-row">';
      html += '    <div class="pv-field pv-field-half">';
      html += '      <input type="text" id="pv-card-expiry" class="pv-input" placeholder=" " inputmode="numeric" autocomplete="cc-exp" maxlength="5" />';
      html += '      <label for="pv-card-expiry" class="pv-label">MM / YY</label>';
      html += '    </div>';
      html += '    <div class="pv-field pv-field-half">';
      html += '      <input type="text" id="pv-card-cvv" class="pv-input" placeholder=" " inputmode="numeric" autocomplete="cc-csc" maxlength="4" />';
      html += '      <label for="pv-card-cvv" class="pv-label">CVV</label>';
      html += '    </div>';
      html += '  </div>';

      // Pay button
      html += '  <button type="submit" class="pv-pay-btn">';
      html += '    <span class="pv-pay-text">Pay ' + formatAmount(cfg.amount, cfg.currency) + '</span>';
      html += '    <span class="pv-spinner" aria-hidden="true"></span>';
      html += '  </button>';
      html += '  </form>';

      // Error area
      html += '  <div class="pv-error-box" aria-live="polite" hidden></div>';
      html += '</div>';
    }

    // --- Bank Transfer Panel ---
    if (cfg.channels.indexOf('bank_transfer') !== -1) {
      html += '<div class="pv-tab-panel" data-panel="bank_transfer">';
      html += '  <div class="pv-transfer-info">';
      html += '    <p class="pv-transfer-instruction">Transfer <strong>' + formatAmount(cfg.amount, cfg.currency) + '</strong> to the account below</p>';
      html += '    <div class="pv-transfer-details">';
      html += '      <div class="pv-transfer-row">';
      html += '        <span class="pv-transfer-label">Bank</span>';
      html += '        <span class="pv-transfer-value" id="pv-transfer-bank">Wema Bank</span>';
      html += '      </div>';
      html += '      <div class="pv-transfer-row pv-transfer-account-row">';
      html += '        <span class="pv-transfer-label">Account Number</span>';
      html += '        <span class="pv-transfer-value pv-account-number" id="pv-transfer-account">0123456789</span>';
      html += '        <button class="pv-copy-btn" type="button" aria-label="Copy account number" data-copy="0123456789">';
      html += '          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>';
      html += '        </button>';
      html += '      </div>';
      html += '      <div class="pv-transfer-row">';
      html += '        <span class="pv-transfer-label">Amount</span>';
      html += '        <span class="pv-transfer-value">' + formatAmount(cfg.amount, cfg.currency) + '</span>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="pv-timer">';
      html += '      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
      html += '      <span>Expires in <strong id="pv-transfer-timer">' + formatTime(BANK_TRANSFER_TIMEOUT) + '</strong></span>';
      html += '    </div>';
      html += '    <button type="button" class="pv-pay-btn pv-confirm-transfer-btn">';
      html += '      <span class="pv-pay-text">I\'ve sent the money</span>';
      html += '      <span class="pv-spinner" aria-hidden="true"></span>';
      html += '    </button>';
      html += '  </div>';
      html += '  <div class="pv-error-box" aria-live="polite" hidden></div>';
      html += '</div>';
    }

    // --- USSD Panel ---
    if (cfg.channels.indexOf('ussd') !== -1) {
      html += '<div class="pv-tab-panel" data-panel="ussd">';
      html += '  <div class="pv-ussd-info">';
      html += '    <div class="pv-field">';
      html += '      <select id="pv-ussd-bank" class="pv-input pv-select">';
      html += '        <option value="" disabled selected>Select your bank</option>';
      USSD_BANKS.forEach(function (bank) {
        html += '      <option value="' + bank.code + '">' + bank.name + '</option>';
      });
      html += '      </select>';
      html += '      <label for="pv-ussd-bank" class="pv-label pv-label-select">Bank</label>';
      html += '    </div>';
      html += '    <div class="pv-ussd-code-box" id="pv-ussd-code-box" hidden>';
      html += '      <p class="pv-ussd-instruction">Dial the code below on your phone</p>';
      html += '      <div class="pv-ussd-code" id="pv-ussd-code"></div>';
      html += '      <button type="button" class="pv-copy-btn pv-copy-ussd" aria-label="Copy USSD code">';
      html += '        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>';
      html += '        <span>Copy</span>';
      html += '      </button>';
      html += '    </div>';
      html += '    <button type="button" class="pv-pay-btn pv-confirm-ussd-btn" disabled>';
      html += '      <span class="pv-pay-text">I\'ve completed payment</span>';
      html += '      <span class="pv-spinner" aria-hidden="true"></span>';
      html += '    </button>';
      html += '  </div>';
      html += '  <div class="pv-error-box" aria-live="polite" hidden></div>';
      html += '</div>';
    }

    // --- Mobile Money Panel ---
    if (cfg.channels.indexOf('mobile_money') !== -1) {
      html += '<div class="pv-tab-panel" data-panel="mobile_money">';
      html += '  <div class="pv-momo-info">';
      html += '    <div class="pv-field">';
      html += '      <select id="pv-momo-country" class="pv-input pv-select">';
      MOMO_COUNTRIES.forEach(function (c, i) {
        html += '      <option value="' + c.code + '"' + (i === 0 ? ' selected' : '') + '>' + c.name + ' (' + c.dialCode + ')</option>';
      });
      html += '      </select>';
      html += '      <label for="pv-momo-country" class="pv-label pv-label-select">Country</label>';
      html += '    </div>';
      html += '    <div class="pv-field pv-field-phone">';
      html += '      <span class="pv-phone-prefix" id="pv-momo-prefix">' + MOMO_COUNTRIES[0].dialCode + '</span>';
      html += '      <input type="tel" id="pv-momo-phone" class="pv-input pv-input-phone" placeholder=" " autocomplete="tel" />';
      html += '      <label for="pv-momo-phone" class="pv-label pv-label-phone">Phone Number</label>';
      html += '    </div>';
      html += '    <div class="pv-momo-network" id="pv-momo-network" hidden>';
      html += '      <span class="pv-network-badge"></span>';
      html += '    </div>';
      html += '    <button type="button" class="pv-pay-btn pv-confirm-momo-btn">';
      html += '      <span class="pv-pay-text">Pay ' + formatAmount(cfg.amount, cfg.currency) + '</span>';
      html += '      <span class="pv-spinner" aria-hidden="true"></span>';
      html += '    </button>';
      html += '  </div>';
      html += '  <div class="pv-error-box" aria-live="polite" hidden></div>';
      html += '</div>';
    }

    // --- Success Overlay ---
    html += '<div class="pv-success-overlay" hidden>';
    html += '  <div class="pv-success-icon">';
    html += '    <svg class="pv-checkmark" viewBox="0 0 52 52">';
    html += '      <circle class="pv-checkmark-circle" cx="26" cy="26" r="25" fill="none"/>';
    html += '      <path class="pv-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>';
    html += '    </svg>';
    html += '  </div>';
    html += '  <p class="pv-success-text">Payment Successful</p>';
    html += '  <p class="pv-success-subtext">' + formatAmount(cfg.amount, cfg.currency) + ' paid</p>';
    html += '</div>';

    html += '</div>'; // .pv-content

    // Footer
    html += '<div class="pv-footer">';
    html += '  <div class="pv-secured">';
    html += '    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
    html += '    <span>Secured by <strong>PayVault</strong></span>';
    html += '  </div>';
    html += '</div>';

    html += '</div>'; // .pv-modal

    this._root.innerHTML = html;
  };

  Checkout.prototype._escapeHtml = function (str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  // ---------------------------------------------------------------------------
  // MOUNT / UNMOUNT
  // ---------------------------------------------------------------------------

  Checkout.prototype._mount = function () {
    document.body.appendChild(this._root);
  };

  Checkout.prototype._unmount = function () {
    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    document.removeEventListener('keydown', this._boundKeyHandler);
    this._root = null;
  };

  // ---------------------------------------------------------------------------
  // TAB MANAGEMENT
  // ---------------------------------------------------------------------------

  Checkout.prototype._setActiveTab = function (channel) {
    if (this._activeTab === channel) return;
    this._activeTab = channel;

    var root = this._root;

    // Update tab buttons
    var tabs = root.querySelectorAll('.pv-tab');
    var indicator = root.querySelector('.pv-tab-indicator');
    tabs.forEach(function (tab) {
      var isActive = tab.getAttribute('data-channel') === channel;
      tab.classList.toggle('pv-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');

      // Move indicator
      if (isActive && indicator) {
        indicator.style.width = tab.offsetWidth + 'px';
        indicator.style.left = tab.offsetLeft + 'px';
      }
    });

    // Update panels
    var panels = root.querySelectorAll('.pv-tab-panel');
    panels.forEach(function (panel) {
      var isActive = panel.getAttribute('data-panel') === channel;
      panel.classList.toggle('pv-active', isActive);
    });

    // Start bank transfer timer if switching to that tab
    if (channel === 'bank_transfer') {
      this._startTransferTimer();
    } else if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  };

  // ---------------------------------------------------------------------------
  // EVENT BINDING
  // ---------------------------------------------------------------------------

  Checkout.prototype._bindEvents = function () {
    var self = this;
    var root = this._root;

    // Close button
    root.querySelector('.pv-close-btn').addEventListener('click', function () {
      self.close();
    });

    // Backdrop click
    root.querySelector('.pv-backdrop').addEventListener('click', function () {
      self.close();
    });

    // Keyboard
    document.addEventListener('keydown', this._boundKeyHandler);

    // Tab clicks
    root.querySelectorAll('.pv-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        self._setActiveTab(this.getAttribute('data-channel'));
      });
    });

    // --- Card form ---
    var cardForm = root.querySelector('.pv-card-form');
    if (cardForm) {
      // Card number formatting
      var cardInput = root.querySelector('#pv-card-number');
      cardInput.addEventListener('input', function () {
        self._formatCardNumber(this);
      });

      // Expiry formatting
      var expiryInput = root.querySelector('#pv-card-expiry');
      expiryInput.addEventListener('input', function () {
        self._formatExpiry(this);
      });

      // CVV restriction
      var cvvInput = root.querySelector('#pv-card-cvv');
      cvvInput.addEventListener('input', function () {
        this.value = this.value.replace(/\D/g, '').slice(0, 4);
      });

      // Form submission
      cardForm.addEventListener('submit', function (e) {
        e.preventDefault();
        self._submitCard();
      });
    }

    // --- Bank Transfer ---
    var transferBtn = root.querySelector('.pv-confirm-transfer-btn');
    if (transferBtn) {
      transferBtn.addEventListener('click', function () {
        self._confirmTransfer();
      });
    }

    // --- USSD ---
    var ussdBank = root.querySelector('#pv-ussd-bank');
    if (ussdBank) {
      ussdBank.addEventListener('change', function () {
        self._selectUSSDBank(this.value);
      });
    }

    var ussdBtn = root.querySelector('.pv-confirm-ussd-btn');
    if (ussdBtn) {
      ussdBtn.addEventListener('click', function () {
        self._confirmUSSD();
      });
    }

    // --- Mobile Money ---
    var momoCountry = root.querySelector('#pv-momo-country');
    if (momoCountry) {
      momoCountry.addEventListener('change', function () {
        var country = MOMO_COUNTRIES.find(function (c) { return c.code === momoCountry.value; });
        if (country) {
          root.querySelector('#pv-momo-prefix').textContent = country.dialCode;
        }
      });
    }

    var momoPhone = root.querySelector('#pv-momo-phone');
    if (momoPhone) {
      momoPhone.addEventListener('input', function () {
        self._handleMomoPhoneInput(this);
      });
    }

    var momoBtn = root.querySelector('.pv-confirm-momo-btn');
    if (momoBtn) {
      momoBtn.addEventListener('click', function () {
        self._submitMobileMoney();
      });
    }

    // --- Copy buttons ---
    root.querySelectorAll('.pv-copy-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self._handleCopy(this);
      });
    });
  };

  // ---------------------------------------------------------------------------
  // KEYBOARD HANDLER
  // ---------------------------------------------------------------------------

  Checkout.prototype._handleKeyDown = function (e) {
    if (!this._isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    }
  };

  // ---------------------------------------------------------------------------
  // CARD NUMBER FORMATTING & BRAND DETECTION
  // ---------------------------------------------------------------------------

  Checkout.prototype._formatCardNumber = function (input) {
    var raw = input.value.replace(/\D/g, '').slice(0, 19);
    var formatted = '';
    for (var i = 0; i < raw.length; i++) {
      if (i > 0 && i % 4 === 0) formatted += ' ';
      formatted += raw[i];
    }
    input.value = formatted;

    // Detect and display brand
    var brand = detectBrand(raw);
    var brandContainer = this._root.querySelector('.pv-card-brand');
    if (brand && BRAND_ICONS[brand]) {
      brandContainer.innerHTML = BRAND_ICONS[brand];
      brandContainer.classList.add('pv-brand-visible');
    } else {
      brandContainer.innerHTML = '';
      brandContainer.classList.remove('pv-brand-visible');
    }

    // Clear field-level error
    input.closest('.pv-field').classList.remove('pv-field-error');
  };

  // ---------------------------------------------------------------------------
  // EXPIRY FORMATTING
  // ---------------------------------------------------------------------------

  Checkout.prototype._formatExpiry = function (input) {
    var raw = input.value.replace(/\D/g, '').slice(0, 4);
    if (raw.length >= 2) {
      input.value = raw.slice(0, 2) + ' / ' + raw.slice(2);
    } else {
      input.value = raw;
    }
    input.closest('.pv-field').classList.remove('pv-field-error');
  };

  // ---------------------------------------------------------------------------
  // CARD FORM VALIDATION
  // ---------------------------------------------------------------------------

  Checkout.prototype._validateCardForm = function () {
    var root = this._root;
    var errors = [];

    // Card holder name
    var name = root.querySelector('#pv-card-name').value.trim();
    if (!name) {
      root.querySelector('#pv-card-name').closest('.pv-field').classList.add('pv-field-error');
      errors.push('Cardholder name is required');
    }

    // Card number
    var cardNumber = root.querySelector('#pv-card-number').value.replace(/\s/g, '');
    if (!cardNumber || cardNumber.length < 13) {
      root.querySelector('#pv-card-number').closest('.pv-field').classList.add('pv-field-error');
      errors.push('Enter a valid card number');
    } else if (!luhnCheck(cardNumber)) {
      root.querySelector('#pv-card-number').closest('.pv-field').classList.add('pv-field-error');
      errors.push('Card number is invalid');
    }

    // Expiry
    var expiryRaw = root.querySelector('#pv-card-expiry').value.replace(/\D/g, '');
    if (expiryRaw.length < 4) {
      root.querySelector('#pv-card-expiry').closest('.pv-field').classList.add('pv-field-error');
      errors.push('Enter a valid expiry date');
    } else {
      var month = parseInt(expiryRaw.slice(0, 2), 10);
      var year = parseInt('20' + expiryRaw.slice(2, 4), 10);
      var now = new Date();
      if (month < 1 || month > 12 || year < now.getFullYear() ||
        (year === now.getFullYear() && month < now.getMonth() + 1)) {
        root.querySelector('#pv-card-expiry').closest('.pv-field').classList.add('pv-field-error');
        errors.push('Card has expired');
      }
    }

    // CVV
    var cvv = root.querySelector('#pv-card-cvv').value.replace(/\D/g, '');
    if (cvv.length < 3) {
      root.querySelector('#pv-card-cvv').closest('.pv-field').classList.add('pv-field-error');
      errors.push('Enter a valid CVV');
    }

    return errors;
  };

  // ---------------------------------------------------------------------------
  // CARD SUBMISSION
  // ---------------------------------------------------------------------------

  Checkout.prototype._submitCard = function () {
    if (this._state === 'processing') return;

    // Clear previous errors
    this._clearErrors('card');

    var errors = this._validateCardForm();
    if (errors.length > 0) {
      this._showError('card', errors[0]);
      // Shake animation
      var form = this._root.querySelector('.pv-card-form');
      form.classList.add('pv-shake');
      setTimeout(function () { form.classList.remove('pv-shake'); }, 500);
      return;
    }

    var root = this._root;
    var cfg = this._config;

    var payload = {
      channel: 'card',
      publicKey: cfg.publicKey,
      reference: cfg.reference,
      amount: cfg.amount,
      currency: cfg.currency,
      email: cfg.email,
      customerName: cfg.customerName,
      metadata: cfg.metadata,
      card: {
        number: root.querySelector('#pv-card-number').value.replace(/\s/g, ''),
        expMonth: root.querySelector('#pv-card-expiry').value.replace(/\D/g, '').slice(0, 2),
        expYear: root.querySelector('#pv-card-expiry').value.replace(/\D/g, '').slice(2, 4),
        cvv: root.querySelector('#pv-card-cvv').value,
        name: root.querySelector('#pv-card-name').value.trim(),
      },
    };

    this._processPayment(payload, 'card');
  };

  // ---------------------------------------------------------------------------
  // BANK TRANSFER
  // ---------------------------------------------------------------------------

  Checkout.prototype._startTransferTimer = function () {
    if (this._timerInterval) return;

    var remaining = BANK_TRANSFER_TIMEOUT;
    var timerEl = this._root.querySelector('#pv-transfer-timer');
    if (!timerEl) return;

    var self = this;
    this._timerInterval = setInterval(function () {
      remaining--;
      if (remaining <= 0) {
        clearInterval(self._timerInterval);
        self._timerInterval = null;
        timerEl.textContent = '00:00';
        self._showError('bank_transfer', 'Transfer window has expired. Please start a new payment.');
        return;
      }
      timerEl.textContent = formatTime(remaining);
    }, 1000);
  };

  Checkout.prototype._confirmTransfer = function () {
    if (this._state === 'processing') return;

    var cfg = this._config;
    var payload = {
      channel: 'bank_transfer',
      publicKey: cfg.publicKey,
      reference: cfg.reference,
      amount: cfg.amount,
      currency: cfg.currency,
      email: cfg.email,
      customerName: cfg.customerName,
      metadata: cfg.metadata,
    };

    this._processPayment(payload, 'bank_transfer');
  };

  // ---------------------------------------------------------------------------
  // USSD
  // ---------------------------------------------------------------------------

  Checkout.prototype._selectUSSDBank = function (bankCode) {
    var root = this._root;
    var cfg = this._config;
    var bank = USSD_BANKS.find(function (b) { return b.code === bankCode; });
    if (!bank) return;

    var ussdCode = bank.dialFormat.replace('AMOUNT', cfg.amount);
    var codeBox = root.querySelector('#pv-ussd-code-box');
    var codeEl = root.querySelector('#pv-ussd-code');
    codeEl.textContent = ussdCode;
    codeBox.removeAttribute('hidden');

    // Enable confirm button
    root.querySelector('.pv-confirm-ussd-btn').removeAttribute('disabled');

    // Set up copy for USSD
    var copyBtn = root.querySelector('.pv-copy-ussd');
    copyBtn.setAttribute('data-copy', ussdCode);
  };

  Checkout.prototype._confirmUSSD = function () {
    if (this._state === 'processing') return;

    var cfg = this._config;
    var bankCode = this._root.querySelector('#pv-ussd-bank').value;

    var payload = {
      channel: 'ussd',
      publicKey: cfg.publicKey,
      reference: cfg.reference,
      amount: cfg.amount,
      currency: cfg.currency,
      email: cfg.email,
      customerName: cfg.customerName,
      metadata: cfg.metadata,
      ussd: { bankCode: bankCode },
    };

    this._processPayment(payload, 'ussd');
  };

  // ---------------------------------------------------------------------------
  // MOBILE MONEY
  // ---------------------------------------------------------------------------

  Checkout.prototype._handleMomoPhoneInput = function (input) {
    // Strip non-digits
    input.value = input.value.replace(/[^\d]/g, '');

    // Auto-detect network
    var countryCode = this._root.querySelector('#pv-momo-country').value;
    var networkEl = this._root.querySelector('#pv-momo-network');
    var badge = networkEl.querySelector('.pv-network-badge');

    if (input.value.length >= 4) {
      var network = detectNetwork(input.value, countryCode);
      if (network) {
        badge.textContent = network;
        networkEl.removeAttribute('hidden');
      }
    } else {
      networkEl.setAttribute('hidden', '');
    }
  };

  Checkout.prototype._submitMobileMoney = function () {
    if (this._state === 'processing') return;

    var root = this._root;
    var phone = root.querySelector('#pv-momo-phone').value.trim();
    if (!phone || phone.length < 7) {
      this._showError('mobile_money', 'Enter a valid phone number');
      return;
    }

    var cfg = this._config;
    var countryCode = root.querySelector('#pv-momo-country').value;
    var prefix = root.querySelector('#pv-momo-prefix').textContent;

    var payload = {
      channel: 'mobile_money',
      publicKey: cfg.publicKey,
      reference: cfg.reference,
      amount: cfg.amount,
      currency: cfg.currency,
      email: cfg.email,
      customerName: cfg.customerName,
      metadata: cfg.metadata,
      mobileMoney: {
        phone: prefix + phone,
        country: countryCode,
      },
    };

    this._processPayment(payload, 'mobile_money');
  };

  // ---------------------------------------------------------------------------
  // COPY TO CLIPBOARD
  // ---------------------------------------------------------------------------

  Checkout.prototype._handleCopy = function (btn) {
    var text = btn.getAttribute('data-copy');
    if (!text) return;

    navigator.clipboard.writeText(text).then(function () {
      var origHTML = btn.innerHTML;
      btn.innerHTML = '<span style="font-size:12px">Copied!</span>';
      btn.classList.add('pv-copied');
      setTimeout(function () {
        btn.innerHTML = origHTML;
        btn.classList.remove('pv-copied');
      }, 1500);
    }).catch(function () {
      // Fallback: select + copy
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  };

  // ---------------------------------------------------------------------------
  // PAYMENT PROCESSING
  // ---------------------------------------------------------------------------

  Checkout.prototype._processPayment = function (payload, panel) {
    var self = this;
    var cfg = this._config;

    this._setState('processing', panel);

    // POST to API
    fetch(cfg.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.publicKey,
      },
      body: JSON.stringify(payload),
    })
    .then(function (res) {
      if (!res.ok) {
        return res.json().then(function (data) {
          throw new Error(data.message || 'Payment failed (HTTP ' + res.status + ')');
        }).catch(function (parseErr) {
          if (parseErr.message && parseErr.message !== 'Payment failed') throw parseErr;
          throw new Error('Payment failed. Please try again.');
        });
      }
      return res.json();
    })
    .then(function (data) {
      if (data.success) {
        if (data.authorizationUrl) {
          // Redirect-based flow (3DS, bank auth, etc.)
          window.location.href = data.authorizationUrl;
        } else {
          // Direct success
          self._setState('success', panel);
          if (typeof cfg.onSuccess === 'function') {
            cfg.onSuccess(data);
          }
          // Auto-close after delay
          setTimeout(function () {
            self.close();
          }, AUTO_CLOSE_DELAY);
        }
      } else {
        throw new Error(data.message || 'Payment was not successful.');
      }
    })
    .catch(function (err) {
      self._setState('error', panel);
      self._showError(panel, err.message || 'An unexpected error occurred.');
      if (typeof cfg.onError === 'function') {
        cfg.onError(err);
      }
    });
  };

  // ---------------------------------------------------------------------------
  // STATE MANAGEMENT
  // ---------------------------------------------------------------------------

  Checkout.prototype._setState = function (state, panel) {
    this._state = state;
    var root = this._root;

    // Get the pay button in the current panel
    var panelEl = root.querySelector('[data-panel="' + panel + '"]');
    var payBtn = panelEl ? panelEl.querySelector('.pv-pay-btn') : null;

    switch (state) {
      case 'processing':
        if (payBtn) {
          payBtn.classList.add('pv-loading');
          payBtn.setAttribute('disabled', '');
        }
        break;

      case 'success':
        if (payBtn) {
          payBtn.classList.remove('pv-loading');
          payBtn.removeAttribute('disabled');
        }
        // Show success overlay
        var overlay = root.querySelector('.pv-success-overlay');
        overlay.removeAttribute('hidden');
        overlay.classList.add('pv-success-animate');
        break;

      case 'error':
        if (payBtn) {
          payBtn.classList.remove('pv-loading');
          payBtn.removeAttribute('disabled');
        }
        break;

      case 'idle':
      default:
        if (payBtn) {
          payBtn.classList.remove('pv-loading');
          payBtn.removeAttribute('disabled');
        }
        break;
    }
  };

  // ---------------------------------------------------------------------------
  // ERROR DISPLAY
  // ---------------------------------------------------------------------------

  Checkout.prototype._showError = function (panel, message) {
    var panelEl = this._root.querySelector('[data-panel="' + panel + '"]');
    if (!panelEl) return;
    var errorBox = panelEl.querySelector('.pv-error-box');
    if (!errorBox) return;

    errorBox.textContent = message;
    errorBox.removeAttribute('hidden');
    errorBox.classList.add('pv-error-visible');

    // Auto-hide after 8 seconds
    setTimeout(function () {
      errorBox.setAttribute('hidden', '');
      errorBox.classList.remove('pv-error-visible');
    }, 8000);
  };

  Checkout.prototype._clearErrors = function (panel) {
    var panelEl = this._root.querySelector('[data-panel="' + panel + '"]');
    if (!panelEl) return;

    // Clear field errors
    panelEl.querySelectorAll('.pv-field-error').forEach(function (f) {
      f.classList.remove('pv-field-error');
    });

    // Hide error box
    var errorBox = panelEl.querySelector('.pv-error-box');
    if (errorBox) {
      errorBox.setAttribute('hidden', '');
      errorBox.classList.remove('pv-error-visible');
    }
  };

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  // Auto-inject stylesheet
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectCSS);
    } else {
      injectCSS();
    }
  }

  // Expose singleton
  var instance = new Checkout();
  global.PayVaultCheckout = {
    version: VERSION,
    open: function (config) { return instance.open(config); },
    close: function () { return instance.close(); },
  };

})(typeof window !== 'undefined' ? window : this);

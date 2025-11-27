/**
 * Marketing Attribution Tracker
 * Collects and persists visitor attribution data for 90 days
 * Optimized for GA4 (Google Analytics 4)
 */

class AttributionTracker {
  constructor(config = {}) {
    this.storageKey = config.storageKey || "visitor_attribution";
    this.expirationDays = config.expirationDays || 90;
    this.measurementId = config.gaMeasurementId || null; // GA4 Measurement ID (required for gtag)
    this.debug = config.debug || false;
  }

  /**
   * Initialize the tracker - call this on page load
   * @returns {Promise<Object>} Attribution data
   */
  async init() {
    try {
      // Check if we already have valid data
      const existingData = this.getStoredData();

      if (existingData && !this.isExpired(existingData.timestamp)) {
        this.log("Valid attribution data already exists:", existingData);
        return existingData;
      }

      // Collect new data on first visit or after expiration
      const attributionData = await this.collectAttributionData();
      this.storeData(attributionData);

      this.log("New attribution data collected:", attributionData);
      return attributionData;
    } catch (error) {
      console.error("Failed to initialize attribution tracker:", error);
      return null;
    }
  }

  /**
   * Collect all attribution metrics
   * @returns {Promise<Object>} Attribution data object
   */
  async collectAttributionData() {
    const urlParams = new URLSearchParams(window.location.search);

    // Collect Google Analytics 4 Client ID asynchronously
    const gaClientId = await this.getGA4ClientId();

    return {
      // Click IDs
      gclid: urlParams.get("gclid") || null,
      fbclid: urlParams.get("fbclid") || null,

      // UTM Parameters
      utm_source: urlParams.get("utm_source") || null,
      utm_medium: urlParams.get("utm_medium") || null,
      utm_campaign: urlParams.get("utm_campaign") || null,
      utm_term: urlParams.get("utm_term") || null,
      utm_content: urlParams.get("utm_content") || null,

      // Page and referrer info
      landing_page: this.getLandingPage(),
      referrer: document.referrer || null,

      // Analytics IDs
      ga_client_id: gaClientId,

      // Session info
      session_id: this.generateSessionId(),
      timestamp: Date.now(),

      // Browser info (useful for attribution analysis)
      user_agent: navigator.userAgent,
      language: navigator.language || navigator.userLanguage,

      // First touch attribution (preserve original source)
      is_first_touch: true,
    };
  }

  /**
   * Get the current page URL as landing page (cleaned)
   */
  getLandingPage() {
    // Remove sensitive parameters before storing
    const url = new URL(window.location.href);
    const sensitiveParams = ["token", "key", "password", "secret", "auth"];

    sensitiveParams.forEach((param) => {
      url.searchParams.delete(param);
    });

    return url.href;
  }

  /**
   * Get Google Analytics 4 Client ID
   * @returns {Promise<string|null>}
   */
  async getGA4ClientId() {
    // Try methods in order of reliability

    // 1. Try to get from _ga cookie first (most reliable and immediate)
    const cookieClientId = this.getGACookieClientId();
    if (cookieClientId) {
      this.log("GA4 Client ID retrieved from cookie:", cookieClientId);
      return cookieClientId;
    }

    // 2. Try gtag if available and measurement ID is provided
    if (typeof gtag !== "undefined" && this.measurementId) {
      try {
        const gtagClientId = await this.getGtagClientId();
        if (gtagClientId) {
          this.log("GA4 Client ID retrieved from gtag:", gtagClientId);
          return gtagClientId;
        }
      } catch (error) {
        this.log("Failed to get gtag client ID:", error);
      }
    }

    // 3. Wait for GA to initialize and retry cookie (fallback)
    if (typeof gtag !== "undefined") {
      this.log("Waiting for GA4 to initialize...");
      await this.waitForGA4();

      const retryCookieId = this.getGACookieClientId();
      if (retryCookieId) {
        this.log(
          "GA4 Client ID retrieved from cookie after wait:",
          retryCookieId,
        );
        return retryCookieId;
      }
    }

    this.log("Could not retrieve GA4 Client ID");
    return null;
  }

  /**
   * Extract GA4 client ID from _ga cookie
   */
  getGACookieClientId() {
    const cookies = document.cookie.split("; ");

    for (const cookie of cookies) {
      if (cookie.startsWith("_ga=")) {
        // GA4 cookie format: GA1.1.XXXXXXXXXX.YYYYYYYYYY or GA1.2.XXXXXXXXXX.YYYYYYYYYY
        const value = cookie.substring(4); // Remove '_ga='
        const parts = value.split(".");

        if (parts.length >= 4) {
          // Standard GA4 format
          return `${parts[2]}.${parts[3]}`;
        }
      }
    }

    // Also check for _ga_<MEASUREMENT_ID> cookies (GA4 specific)
    for (const cookie of cookies) {
      if (cookie.startsWith("_ga_")) {
        this.log(
          "Found GA4 measurement-specific cookie:",
          cookie.split("=")[0],
        );
      }
    }

    return null;
  }

  /**
   * Get client ID from GA4 gtag - Promisified with timeout
   * @returns {Promise<string|null>}
   */
  getGtagClientId() {
    return new Promise((resolve, reject) => {
      if (typeof gtag !== "undefined" && this.measurementId) {
        // Set a timeout to prevent hanging
        const timeout = setTimeout(() => {
          reject(new Error("Gtag client ID fetch timeout"));
        }, 3000);

        try {
          gtag("get", this.measurementId, "client_id", (clientId) => {
            clearTimeout(timeout);
            resolve(clientId || null);
          });
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      } else {
        resolve(null);
      }
    });
  }

  /**
   * Wait for GA4 to initialize (useful when script loads async)
   * @returns {Promise<void>}
   */
  waitForGA4(maxAttempts = 10, interval = 500) {
    return new Promise((resolve) => {
      let attempts = 0;

      const checkGA = () => {
        attempts++;

        // Check if _ga cookie exists
        if (this.getGACookieClientId()) {
          resolve();
          return;
        }

        // Check if we've exceeded max attempts
        if (attempts >= maxAttempts) {
          this.log(`GA4 not initialized after ${maxAttempts} attempts`);
          resolve();
          return;
        }

        // Try again after interval
        setTimeout(checkGA, interval);
      };

      checkGA();
    });
  }

  /**
   * Generate a unique session ID
   */
  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Store attribution data in localStorage with error handling
   */
  storeData(data) {
    try {
      // Check localStorage availability
      if (!this.isStorageAvailable()) {
        console.warn("localStorage is not available");
        return false;
      }

      // Check storage quota
      const dataString = JSON.stringify(data);
      if (dataString.length > 5000) {
        // Reasonable limit for attribution data
        console.warn("Attribution data too large to store");
        return false;
      }

      localStorage.setItem(this.storageKey, dataString);
      return true;
    } catch (error) {
      // Handle quota exceeded or other storage errors
      if (error.name === "QuotaExceededError") {
        console.error("localStorage quota exceeded");
        this.clearOldData(); // Try to clear old data
      } else {
        console.error("Failed to store attribution data:", error);
      }
      return false;
    }
  }

  /**
   * Retrieve stored attribution data with validation
   */
  getStoredData() {
    try {
      if (!this.isStorageAvailable()) {
        return null;
      }

      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        return null;
      }

      const data = JSON.parse(stored);

      // Validate the data structure
      if (typeof data !== "object" || !data.timestamp) {
        this.log("Invalid stored data structure, clearing...");
        this.clearData();
        return null;
      }

      return data;
    } catch (error) {
      console.error("Failed to retrieve attribution data:", error);
      // Clear corrupted data
      this.clearData();
      return null;
    }
  }

  /**
   * Check if localStorage is available
   */
  isStorageAvailable() {
    try {
      const test = "__attribution_test__";
      localStorage.setItem(test, "test");
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if stored data has expired
   */
  isExpired(timestamp) {
    if (!timestamp || typeof timestamp !== "number") {
      return true;
    }

    const expirationTime =
      timestamp + this.expirationDays * 24 * 60 * 60 * 1000;
    return Date.now() > expirationTime;
  }

  /**
   * Get current attribution data (either from storage or collect new)
   * @returns {Promise<Object>}
   */
  async getAttributionData() {
    const stored = this.getStoredData();

    if (stored && !this.isExpired(stored.timestamp)) {
      return stored;
    }

    return await this.init();
  }

  /**
   * Clear stored attribution data
   */
  clearData() {
    try {
      localStorage.removeItem(this.storageKey);
      this.log("Attribution data cleared");
    } catch (error) {
      console.error("Failed to clear attribution data:", error);
    }
  }

  /**
   * Clear old attribution data (for quota management)
   */
  clearOldData() {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();

      keys.forEach((key) => {
        if (key.startsWith("visitor_attribution")) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            if (data && data.timestamp && this.isExpired(data.timestamp)) {
              localStorage.removeItem(key);
            }
          } catch (e) {
            // Remove corrupted data
            localStorage.removeItem(key);
          }
        }
      });
    } catch (error) {
      console.error("Failed to clear old data:", error);
    }
  }

  /**
   * Get attribution data formatted for API submission
   * @returns {Promise<Object>}
   */
  async getDataForSubmission() {
    const data = await this.getAttributionData();
    if (!data) return null;

    // Remove internal fields and sensitive data
    const {
      timestamp,
      session_id,
      user_agent,
      is_first_touch,
      ...submissionData
    } = data;

    // Clean up null values
    Object.keys(submissionData).forEach((key) => {
      if (submissionData[key] === null || submissionData[key] === "") {
        delete submissionData[key];
      }
    });

    return submissionData;
  }

  /**
   * Update attribution data with additional information
   * Useful for adding data that becomes available after initial load
   */
  async updateAttributionData(updates) {
    const currentData = await this.getAttributionData();
    if (!currentData) return null;

    const updatedData = {
      ...currentData,
      ...updates,
      updated_at: Date.now(),
    };

    this.storeData(updatedData);
    return updatedData;
  }

  /**
   * Get days until expiration
   */
  getDaysUntilExpiration() {
    const data = this.getStoredData();
    if (!data || !data.timestamp) return 0;

    const expirationTime =
      data.timestamp + this.expirationDays * 24 * 60 * 60 * 1000;
    const remainingMs = expirationTime - Date.now();

    return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  }

  /**
   * Check if current session has attribution parameters
   * Useful for determining if this is a new marketing touchpoint
   */
  hasAttributionParams() {
    const urlParams = new URLSearchParams(window.location.search);

    // Check for any attribution-related parameters
    const attributionParams = [
      "gclid",
      "fbclid",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
    ];

    return attributionParams.some((param) => urlParams.has(param));
  }

  /**
   * Debug logging
   */
  log(...args) {
    if (this.debug) {
      console.log("[AttributionTracker]", ...args);
    }
  }
}

// Export for use in other files
if (typeof module !== "undefined" && module.exports) {
  module.exports = AttributionTracker;
} else {
  window.AttributionTracker = AttributionTracker;
}

// Auto-initialize if data-auto-init attribute is present
document.addEventListener("DOMContentLoaded", () => {
  const script = document.querySelector(
    'script[data-auto-init="attribution-tracker"]',
  );
  if (script) {
    const config = {
      gaMeasurementId: script.getAttribute("data-ga-measurement-id"),
      debug: script.getAttribute("data-debug") === "true",
      expirationDays:
        parseInt(script.getAttribute("data-expiration-days")) || 90,
    };

    const tracker = new AttributionTracker(config);
    window.attributionTracker = tracker; // Make available globally

    tracker.init().then((data) => {
      // Dispatch custom event with attribution data
      window.dispatchEvent(
        new CustomEvent("attribution-ready", { detail: data }),
      );
    });
  }
});

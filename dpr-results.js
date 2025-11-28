(function() {
  // ============================================================
  // GLOBAL STATE
  // ============================================================

  // Track which fields came from sessionStorage only (exclude from URL)
  const sessionOnlyFields = new Set();

  // Flag to prevent infinite loop when syncing fields
  let isSyncing = false;

  // ============================================================
  // STORAGE HELPER FUNCTIONS
  // ============================================================

  /**
   * Retrieve non-personal quote data from localStorage
   * @returns {Object|null} Parsed localStorage data or null if unavailable
   */
  function getLocalStorageData() {
    try {
      const raw = localStorage.getItem('dpr_local_data');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to read from localStorage:', e);
      return null;
    }
  }

  /**
   * Retrieve personal contact data from sessionStorage
   * @returns {Object|null} Parsed sessionStorage data or null if unavailable
   */
  function getSessionStorageData() {
    try {
      const raw = sessionStorage.getItem('dpr_session_data');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to read from sessionStorage:', e);
      return null;
    }
  }

  /**
   * Retrieve marketing attribution data from localStorage
   * @returns {Object} Attribution data or empty object if unavailable
   */
  function getAttributionData() {
    try {
      const raw = localStorage.getItem('visitor_attribution');
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to read attribution data:', e);
      return {};
    }
  }

  // ============================================================
  // STORAGE UPDATE FUNCTIONS
  // ============================================================

  /**
   * Update a single field in localStorage (dpr_local_data)
   * @param {string} fieldName - The field name to update
   * @param {*} value - The new value for the field
   * @returns {boolean} True if update succeeded, false otherwise
   */
  function updateLocalStorage(fieldName, value) {
    try {
      const data = getLocalStorageData() || {};
      data[fieldName] = value;
      localStorage.setItem('dpr_local_data', JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Failed to update localStorage:', e);
      return false;
    }
  }

  /**
   * Update a single field in sessionStorage (dpr_session_data)
   * @param {string} fieldName - The field name to update
   * @param {*} value - The new value for the field
   * @returns {boolean} True if update succeeded, false otherwise
   */
  function updateSessionStorage(fieldName, value) {
    try {
      const data = getSessionStorageData() || {};
      data[fieldName] = value;
      sessionStorage.setItem('dpr_session_data', JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Failed to update sessionStorage:', e);
      return false;
    }
  }

  // ============================================================
  // URL PARAMETER FUNCTIONS
  // ============================================================

  /**
   * Parse current URL query parameters
   * @returns {Object} Object with all query parameters
   */
  function getQueryParams() {
    const params = {};
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  /**
   * Update URL query parameters without creating history entries
   * @param {Object} params - Key-value pairs to set as query parameters
   */
  function updateQueryParams(params) {
    const url = new URL(window.location.href);

    // Clear all existing params
    const currentParams = Array.from(url.searchParams.keys());
    currentParams.forEach(key => {
      url.searchParams.delete(key);
    });

    // Set new params (skip empty values)
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    });

    window.history.replaceState({}, '', url.toString());
  }

  /**
   * Rebuild URL params from current localStorage state
   * Excludes sessionStorage-only fields
   */
  function syncAllParamsFromStorage() {
    const localData = getLocalStorageData();
    if (!localData) return;

    const params = {};

    Object.entries(localData).forEach(([key, value]) => {
      // Exclude sessionStorage-only fields
      if (!sessionOnlyFields.has(key) && value !== null && value !== undefined && value !== '') {
        params[key] = value;
      }
    });

    updateQueryParams(params);
  }

  // ============================================================
  // FORM FIELD VALUE MANAGEMENT
  // ============================================================

  /**
   * Get current value from a form field
   * @param {HTMLFormElement} formEl - The form element
   * @param {string} fieldName - The name of the field
   * @returns {string|null} The field value or null
   */
  function getFieldValue(formEl, fieldName) {
    const elements = formEl.elements[fieldName];

    if (!elements) return null;

    // Handle radio buttons (NodeList)
    if (elements instanceof RadioNodeList) {
      return elements.value || null;
    }

    // Handle single element (select, text input, checkbox)
    if (elements.type === 'checkbox') {
      return elements.checked ? elements.value || 'true' : null;
    }

    return elements.value || null;
  }

  /**
   * Set value on a form field
   * @param {HTMLFormElement} formEl - The form element
   * @param {string} fieldName - The name of the field
   * @param {string} value - The value to set
   */
  function setFieldValue(formEl, fieldName, value) {
    const elements = formEl.elements[fieldName];

    if (!elements) return;

    // Handle radio buttons (NodeList)
    if (elements instanceof RadioNodeList) {
      // First, remove Webflow checked class from all radios in this group
      for (const radio of elements) {
        const customInput = radio.parentElement?.querySelector('.w-radio-input');
        if (customInput) {
          customInput.classList.remove('w--redirected-checked');
        }
      }

      // Then set the matching radio as checked
      for (const radio of elements) {
        if (radio.value === value) {
          radio.checked = true;

          // Add Webflow checked class to the custom radio input
          const customInput = radio.parentElement?.querySelector('.w-radio-input');
          if (customInput) {
            customInput.classList.add('w--redirected-checked');
          }

          radio.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
      return;
    }

    // Handle select element
    if (elements.tagName === 'SELECT') {
      elements.value = value;
      elements.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // Handle checkbox
    if (elements.type === 'checkbox') {
      elements.checked = value === 'true' || value === elements.value;
      elements.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // Handle text input
    elements.value = value;
    elements.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Update ALL form fields with the same name across the page
   * @param {string} fieldName - The field name to sync
   * @param {*} value - The value to set
   */
  function syncAllFieldsWithName(fieldName, value) {
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
      const field = form.elements[fieldName];
      if (field) {
        setFieldValue(form, fieldName, value);
      }
    });
  }

  // ============================================================
  // INITIALIZATION & SYNCING
  // ============================================================

  /**
   * Populate all form fields on page load
   * Priority: URL params > localStorage > sessionStorage > console.log
   */
  function prefillAllForms() {
    // Step 1: Get all data sources
    const urlParams = getQueryParams();
    const localData = getLocalStorageData() || {};
    const sessionData = getSessionStorageData() || {};

    // Step 2: Get all unique field names from all forms
    const forms = document.querySelectorAll('form');
    const allFieldNames = new Set();

    forms.forEach(form => {
      Array.from(form.elements).forEach(element => {
        if (element.name) {
          allFieldNames.add(element.name);
        }
      });
    });

    // Step 3: For each field, apply priority logic
    allFieldNames.forEach(fieldName => {
      let valueToUse = null;
      let sourceStorage = null; // 'local' or 'session'

      // Priority 1: URL params (update localStorage)
      if (urlParams[fieldName]) {
        valueToUse = urlParams[fieldName];
        updateLocalStorage(fieldName, valueToUse);
        sourceStorage = 'local';
      }
      // Priority 2: localStorage (update URL params)
      else if (localData[fieldName] !== undefined && localData[fieldName] !== null) {
        valueToUse = localData[fieldName];
        sourceStorage = 'local';
      }
      // Priority 3: sessionStorage (NO URL update, mark as session-only)
      else if (sessionData[fieldName] !== undefined && sessionData[fieldName] !== null) {
        valueToUse = sessionData[fieldName];
        sourceStorage = 'session';
        sessionOnlyFields.add(fieldName); // Track for URL exclusion
      }
      // Priority 4: Nothing found
      else {
        console.log(`No value found for field: ${fieldName}`);
        return;
      }

      // Populate all forms with this field
      syncAllFieldsWithName(fieldName, valueToUse);
    });

    // Step 4: Update URL params from localStorage (excluding session-only fields)
    if (Object.keys(urlParams).length === 0) {
      // Only update URL if there were no initial URL params
      syncAllParamsFromStorage();
    }
  }

  /**
   * Handler for when a form field changes
   * @param {HTMLFormElement} formEl - The form element
   * @param {string} fieldName - The field name that changed
   */
  function syncFormFieldToStorage(formEl, fieldName) {
    // Prevent infinite loop from programmatic field updates
    if (isSyncing) return;

    isSyncing = true;

    try {
      // Get new value
      const value = getFieldValue(formEl, fieldName);

      // Update appropriate storage
      if (sessionOnlyFields.has(fieldName)) {
        updateSessionStorage(fieldName, value);
      } else {
        updateLocalStorage(fieldName, value);
      }

      // Sync all other fields with same name
      syncAllFieldsWithName(fieldName, value);

      // Update URL params (except sessionStorage-only fields)
      if (!sessionOnlyFields.has(fieldName)) {
        syncAllParamsFromStorage();
      }
    } finally {
      isSyncing = false;
    }
  }

  /**
   * Attach change listeners to all form fields
   */
  function setupFormChangeListeners() {
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
      Array.from(form.elements).forEach(element => {
        if (!element.name) return;

        const fieldName = element.name;

        // Handle radio buttons (NodeList)
        if (element instanceof RadioNodeList || element.type === 'radio') {
          // For radio buttons, we need to attach to each individual radio
          const radios = form.elements[fieldName];
          if (radios instanceof RadioNodeList) {
            for (const radio of radios) {
              radio.addEventListener('change', () => syncFormFieldToStorage(form, fieldName));
            }
          }
          return;
        }

        // Handle other field types
        const eventType = element.type === 'text' ? 'input' : 'change';
        element.addEventListener(eventType, () => syncFormFieldToStorage(form, fieldName));
      });
    });
  }

  // ============================================================
  // PAYLOAD BUILDING
  // ============================================================

  /**
   * Build API payload from stored data
   * Merges data from localStorage, sessionStorage, and attribution tracker
   * @returns {Object|null} Complete API payload or null if required data is missing
   */
  function buildPayload() {
    // Retrieve data from all storage sources
    const localData = getLocalStorageData();
    const sessionData = getSessionStorageData();
    const attributionData = getAttributionData();

    // Validate required data exists
    if (!localData || !sessionData) {
      console.error('Missing required quote data in storage');
      return null;
    }

    // Build the payload with proper type conversions
    const payload = {
      // Core quote fields (MUST convert strings to numbers)
      CoverageType: Number(localData.CoverageType),
      Province: Number(localData.Province),
      Age: Number(localData.Age),
      Dependents: Number(localData.Dependents || 0),
      CoverageTier: Number(localData.CoverageTier),
      InsuranceReason: localData.InsuranceReason ? Number(localData.InsuranceReason) : null,

      // Coverage options (new fields in DPR system)
      PreExisting: localData.PreExisting || null,
      PreExistingCoverage: localData.PreExistingCoverage ? Number(localData.PreExistingCoverage) : null,

      // Contact information
      EmailAddress: sessionData.EmailAddress || null,
      PhoneNumber: sessionData.PhoneNumber || null,
      MarketingPermission: sessionData.MarketingPermission === 'true' || sessionData.MarketingPermission === true,

      // Personal information
      FirstName: sessionData.FirstName || null,
      LastName: sessionData.LastName || null,

      // Attribution tracking data (merge all attribution fields)
      gclid: attributionData.gclid || null,
      fbclid: attributionData.fbclid || null,
      utm_source: attributionData.utm_source || null,
      utm_medium: attributionData.utm_medium || null,
      utm_campaign: attributionData.utm_campaign || null,
      utm_term: attributionData.utm_term || null,
      utm_content: attributionData.utm_content || null,
      referrer: attributionData.referrer || null,
      ga_client_id: attributionData.ga_client_id || null,
      landing_page: attributionData.landing_page || null,
      user_agent: attributionData.user_agent || null,
      language: attributionData.language || null,

      // ===================================================================
      // LEGACY FIELDS - Kept for API compatibility, separated for review
      // These fields are from the old quote system and may not be used
      // in the new DPR flow but are included for backward compatibility
      // ===================================================================
      LeftGroupHealthPlan: null,
      Prescription: null,
      CoverOption: null,
      PhoneExtension: null
    };

    return payload;
  }

  // ============================================================
  // API FUNCTIONS
  // ============================================================

  /**
   * Call the GreenShield quote API
   * @param {Object} payload - Complete API payload from buildPayload()
   * @returns {Promise<Object>} Full API response with QuoteSetId and PlanQuotes
   * @throws {Error} If API request fails or returns non-OK status
   */
  async function fetchQuotes(payload) {
    try {
      const res = await fetch('https://qagsd2cins.greenshield.ca/quoteset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('API Error Response:', errorText);
        throw new Error(`Quote API failed with status: ${res.status}`);
      }

      const json = await res.json();

      // Validate response structure
      if (!json.QuoteSetId || !json.PlanQuotes) {
        console.warn('API response missing expected fields:', json);
      }

      return json;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error; // Re-throw to allow caller to handle
    }
  }

  // ============================================================
  // RESULTS STORAGE
  // ============================================================

  /**
   * Save API results to sessionStorage with original form data
   * @param {Object} apiResponse - Full API response from fetchQuotes()
   * @param {Object} localData - Copy of dpr_local_data used for the request
   * @param {Object} sessionData - Copy of dpr_session_data used for the request
   * @returns {boolean} True if save succeeded, false otherwise
   */
  function saveResultsData(apiResponse, localData, sessionData) {
    try {
      const resultsData = {
        results: apiResponse,
        dpr_local_storage: localData,
        dpr_session_storage: sessionData
      };

      sessionStorage.setItem('dpr_results_data', JSON.stringify(resultsData));
      return true;
    } catch (e) {
      console.error('Failed to save results to sessionStorage:', e);
      return false;
    }
  }

  // ============================================================
  // ORCHESTRATION
  // ============================================================

  /**
   * Main orchestration function - loads data, builds payload, fetches quotes
   * This is the main entry point that should be called from initialize()
   * @returns {Promise<Object|null>} API response or null if failed
   */
  async function loadAndFetchQuotes() {
    try {
      // Step 1: Retrieve stored data
      const localData = getLocalStorageData();
      const sessionData = getSessionStorageData();

      if (!localData || !sessionData) {
        console.error('Missing required quote data. Cannot fetch quotes.');
        return null;
      }

      // Step 2: Build payload
      const payload = buildPayload();

      if (!payload) {
        console.error('Failed to build API payload');
        return null;
      }

      console.log('Fetching quotes with payload:', payload);

      // Step 3: Call API
      const apiResponse = await fetchQuotes(payload);

      console.log('Quote API response:', apiResponse);

      // Step 4: Save results
      const saved = saveResultsData(apiResponse, localData, sessionData);

      if (!saved) {
        console.warn('API call succeeded but failed to save results to storage');
      }

      return apiResponse;
    } catch (error) {
      console.error('Error in loadAndFetchQuotes:', error);
      return null;
    }
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  /**
   * Main initialization function
   */
  function initialize() {
    console.log('DPR Results: Initializing...');

    // Initialize value management system
    prefillAllForms();
    setupFormChangeListeners();
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();

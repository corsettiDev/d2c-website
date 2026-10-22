(function() {
  // ============================================================
  // GLOBAL STATE
  // ============================================================

  // Flag to prevent infinite loop when syncing fields
  let isSyncing = false;

  // Root API URL
  const rootApiURL = document.currentScript.getAttribute("data-api-url") || "https://qagsd2cins.greenshield.ca";

  // Filter style mode - controls whether filtering hides or just reorders plans
  // Options: "showAll" (reorder only), "limit" (reorder + hide), "hideOnly" (hide without reorder)
  const filterStyle = document.currentScript.getAttribute("data-filter-style") || "showAll";

  // Hospital accommodation text prefix
  const hospitalAccommodationText = document.currentScript.getAttribute("data-hospital-text") || "Add optional hospital accommodation for $";

  // Hospital rider modal: offer it on every plan (default) or only when the API returns the option
  const riderAllPlans = (document.currentScript.getAttribute("data-rider-all-plans") || "true") !== "false";


  // Plans that never get the rider modal (comma-separated PlanNames), e.g. LINK plans
  // where hospital accommodation is already an included benefit.
  const riderExcludedPlans = (document.currentScript.getAttribute("data-rider-exclude") || "")
    .split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

  // Apply button text
  const applyButtonText = document.currentScript.getAttribute("data-apply-button-text") || "Apply Now";

  // ============================================================
  // API DEBUG PANEL (QA aid)
  // ============================================================
  // Enabled by ?debug=api on any page (sticky for the tab via
  // sessionStorage; ?debug=off clears it) or data-api-debug="true" on
  // the loader embed. Records every midtier call (request, response,
  // status, timing) to sessionStorage['gs_api_debug_log'] grouped by
  // page load, then loads utilities/api-debug.js from the same commit
  // to render the panel below the results. No-op when disabled.
  const apiDebugEnabled = (function () {
    try {
      const flag = new URLSearchParams(window.location.search).get('debug');
      if (flag === 'api' || flag === 'on' || flag === '1') sessionStorage.setItem('gs_api_debug', '1');
      if (flag === 'off' || flag === '0') sessionStorage.removeItem('gs_api_debug');
      return document.currentScript.getAttribute('data-api-debug') === 'true'
        || sessionStorage.getItem('gs_api_debug') === '1';
    } catch (e) {
      return false;
    }
  })();

  if (apiDebugEnabled && !window.__gsApiDebugRecorder) {
    window.__gsApiDebugRecorder = true;

    const apiDebugPageLoad = {
      id: Date.now(),
      path: window.location.pathname + window.location.search,
      script: 'plan-card-display.js'
    };

    const apiDebugParse = (body) => {
      if (body === null || body === undefined) return null;
      try { return JSON.parse(body); } catch (e) { return String(body); }
    };

    const apiDebugRecord = (entry) => {
      try {
        const log = JSON.parse(sessionStorage.getItem('gs_api_debug_log') || '[]');
        log.push(entry);
        while (log.length > 25) log.shift();
        sessionStorage.setItem('gs_api_debug_log', JSON.stringify(log));
      } catch (e) {
        console.warn('API debug: could not store log entry', e);
      }
      document.dispatchEvent(new CustomEvent('gs-api-debug', { detail: entry }));
    };

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      if (!url.startsWith(rootApiURL)) return nativeFetch(input, init);

      const entry = Object.assign({}, apiDebugPageLoad, {
        at: new Date().toISOString(),
        method: ((init && init.method) || (input && input.method) || 'GET').toUpperCase(),
        url,
        request: apiDebugParse(init && init.body)
      });
      const started = performance.now();

      try {
        const res = await nativeFetch(input, init);
        entry.status = res.status;
        entry.ms = Math.round(performance.now() - started);
        entry.response = apiDebugParse(await res.clone().text());
        return res;
      } catch (err) {
        entry.ms = Math.round(performance.now() - started);
        entry.error = String(err);
        throw err;
      } finally {
        apiDebugRecord(entry);
      }
    };

    const apiDebugScript = document.createElement('script');
    apiDebugScript.src = document.currentScript.src.replace(/[^/]*$/, 'utilities/api-debug.js');
    apiDebugScript.dataset.pageLoadId = String(apiDebugPageLoad.id);
    apiDebugScript.dataset.apiUrl = rootApiURL;
    document.head.appendChild(apiDebugScript);
  }

  // Localized button state text (French on fr-ca pages)
  function isFrenchPage() {
    return (document.documentElement.lang || "").toLowerCase() === "fr-ca";
  }
  function loadingText() { return isFrenchPage() ? "Chargement..." : "Loading..."; }
  function errorRetryText() { return isFrenchPage() ? "Erreur – Réessayer" : "Error – Try Again"; }

  // Comparison feature state
  let selectedPlans = [];
  let isCompareActive = false;

  // Filter sets for plan visibility and ordering
  const INSURANCE_REASON_SETS = {
    '1': ['LINK 1', 'LINK 2', 'LINK 3', 'LINK 4', 'ZONE FUNDAMENTAL PLAN', 'ZONE 4', 'ZONE 5'],
    '2': ['LINK 4', 'ZONE 2', 'ZONE 3', 'ZONE FUNDAMENTAL PLAN'],
    '0': ['LINK 2', 'LINK 3', 'LINK 4', 'ZONE FUNDAMENTAL PLAN', 'ZONE 5', 'ZONE 6', 'ZONE 7']
  };

  const COVERAGE_TIER_SETS = {
    'basic': ['LINK 1', 'LINK 2', 'LINK 3', 'ZONE 2', 'ZONE 3', 'ZONE FUNDAMENTAL PLAN', 'ZONE 4', 'ZONE 5'],
    'comprehensive': ['LINK 1', 'LINK 2', 'LINK 3', 'LINK 4', 'ZONE 2', 'ZONE 3', 'ZONE 4', 'ZONE 5', 'ZONE 6', 'ZONE 7']
  };

  // Static filter scenarios - checked BEFORE dynamic intersection logic
  // These specific combinations override the standard intersection behavior
  // Key format: "InsuranceReason:CoverageTier"
  // Value: Array of plan names to show for this combination
  const STATIC_FILTER_SCENARIOS = {
    '0:comprehensive': ['LINK 4', 'LINK 3', 'ZONE 7', 'ZONE 6'],
    '1:all': ['LINK 4', 'LINK 3', 'LINK 2', 'LINK 1', 'ZONE 7', 'ZONE 6', 'ZONE 5', 'ZONE 4', 'ZONE FUNDAMENTAL PLAN'],
    '1:basic': ['LINK 2', 'LINK 1', 'ZONE 4', 'ZONE FUNDAMENTAL PLAN'],
    '1:comprehensive': ['LINK 4', 'LINK 3', 'LINK 1', 'ZONE 4'],
    '2:all': ['LINK 4', 'LINK 3', 'LINK 2', 'ZONE 7', 'ZONE 6', 'ZONE 5', 'ZONE FUNDAMENTAL PLAN', 'ZONE 3', 'ZONE 2'],
    '2:comprehensive': ['LINK 4', 'ZONE 7', 'ZONE 3']
  };

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
   * Remove a single field from localStorage (dpr_local_data)
   * Used when filter value is set to 'all' to prevent interference with dpr-results.js
   * @param {string} fieldName - The field name to remove
   * @returns {boolean} True if removal succeeded, false otherwise
   */
  function removeLocalStorageField(fieldName) {
    try {
      const data = getLocalStorageData() || {};
      delete data[fieldName];
      localStorage.setItem('dpr_local_data', JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('Failed to remove field from localStorage:', e);
      return false;
    }
  }

  // ============================================================
  // FIELD VALIDATION
  // ============================================================

  /**
   * Check if a field value is missing (null, undefined, or empty string)
   * @param {*} value - The value to check
   * @returns {boolean} True if value is missing, false otherwise
   */
  function isFieldMissing(value) {
    return value == null || value === '';
  }

  /**
   * Validate that API-required fields exist in localStorage
   * Simplified validation - only checks fields needed for API call
   * @returns {boolean} True if all required fields exist, false otherwise
   */
  function validateApiFields() {
    const localData = getLocalStorageData();

    if (!localData) {
      console.warn('No localStorage data found');
      return false;
    }

    // Always required fields
    if (isFieldMissing(localData.CoverageType)) {
      console.warn('Required field missing: CoverageType');
      return false;
    }
    if (isFieldMissing(localData.Age)) {
      console.warn('Required field missing: Age');
      return false;
    }
    if (isFieldMissing(localData.Province)) {
      console.warn('Required field missing: Province');
      return false;
    }

    // Conditionally required: Dependents (not needed if CoverageType == 0)
    if (localData.CoverageType != 0) {
      if (isFieldMissing(localData.Dependents)) {
        console.warn('Required field missing: Dependents (CoverageType is not 0)');
        return false;
      }
    }

    console.log('All API-required fields validated successfully');
    return true;
  }

  // ============================================================
  // PAYLOAD BUILDING
  // ============================================================

  /**
   * Build API payload from stored data
   * Merges data from localStorage and attribution tracker
   * Personal fields (sessionStorage) are set to null
   * @returns {Object|null} Complete API payload or null if required data is missing
   */
  function buildPayload() {
    // Retrieve data from storage sources
    const localData = getLocalStorageData();
    const attributionData = getAttributionData();

    // Validate required data exists
    if (!localData) {
      console.error('Missing required quote data in localStorage');
      return null;
    }

    // Build the payload with proper type conversions
    const payload = {
      // Core quote fields (MUST convert strings to numbers)
      CoverageType: Number(localData.CoverageType),
      Province: Number(localData.Province),
      Age: Number(localData.Age),
      Dependents: Number(localData.Dependents || 0),
      CoverageTier: localData.CoverageTier,
      InsuranceReason: localData.InsuranceReason ? Number(localData.InsuranceReason) : null,

      // Coverage options
      PreExisting: localData.PreExisting || null,
      PreExistingCoverage: localData.PreExistingCoverage || null,

      // Contact information (all null for this utility - no sessionStorage)
      EmailAddress: null,
      PhoneNumber: null,
      MarketingPermission: false,

      // Personal information (all null for this utility - no sessionStorage)
      FirstName: null,
      LastName: null,

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

      // Legacy fields - Kept for API compatibility
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
      const res = await fetch(`${rootApiURL}/quoteset`, {
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

  /**
   * Handle API call on page load
   * Simplified version - no redirect on missing fields, just hide blocks
   */
  async function handlePageLoadApiCall() {
    console.log('Plan Card Display: Starting page load API call...');

    // Track actual API success/failure status
    let apiSuccess = false;

    // Step 1: Validate required fields
    if (!validateApiFields()) {
      console.warn('Missing API-required fields - hiding dynamic blocks');
      hideDynamicBlocks();
      apiSuccess = false;
      // Don't return yet - need to dispatch event below
    } else {
      // Step 2: Show skeleton loaders
      showSkeletonLoaders();

      // Step 3: Build payload and call API
      try {
        const localData = getLocalStorageData();
        const payload = buildPayload();

        if (!payload) {
          console.error('Failed to build API payload');
          hideDynamicBlocks();
          apiSuccess = false;
        } else {
          console.log('Fetching quotes with payload:', payload);
          const apiResponse = await fetchQuotes(payload);

          if (apiResponse) {
            console.log('Page load API call succeeded');
            showDynamicBlocks();
            fillChart({ results: apiResponse, dpr_local_storage: localData });
            applyPlanVisibilityAndOrder();
            apiSuccess = true;
          } else {
            console.error('Page load API call failed');
            hideDynamicBlocks();
            apiSuccess = false;
          }
        }
      } catch (error) {
        console.error('Page load API call error:', error);
        hideDynamicBlocks();
        apiSuccess = false;
      } finally {
        // Step 4: Always hide skeleton loaders
        hideSkeletonLoaders();
      }
    }

    // Step 5: Always dispatch event to notify plan-injector
    // This runs whether API succeeded, failed, or validation failed
    // Use setTimeout to ensure event fires after plan-injector listener is registered
    setTimeout(() => {
      // Store event data in global flag for plan-injector to check (handles race condition)
      window.__plansPopulatedData = { success: apiSuccess };

      window.dispatchEvent(new CustomEvent('plans-populated', {
        detail: { success: apiSuccess }
      }));
      console.log(`Plan Card Display: Dispatched 'plans-populated' event with success=${apiSuccess}`);
    }, 0);
  }

  // ============================================================
  // PLAN FILTERING LOGIC
  // ============================================================

  /**
   * Get current filter state from localStorage
   * @returns {Object} Current filter values (defaults to 'all' if missing)
   */
  function getCurrentFilterState() {
    const localData = getLocalStorageData() || {};

    return {
      InsuranceReason: localData.InsuranceReason || 'all',
      CoverageTier: localData.CoverageTier || 'all'
    };
  }

  /**
   * Get list of plan names that match current filter criteria
   * Checks static filter scenarios FIRST, then falls back to dynamic logic
   * @param {Object} filterState - Current filter values
   * @returns {string[]|null} Array of matching plan names, or null if no filtering
   */
  function getFilteredPlans(filterState) {
    const { InsuranceReason, CoverageTier } = filterState;

    // Check for static filter scenarios FIRST
    const staticKey = `${InsuranceReason}:${CoverageTier}`;
    const staticScenario = STATIC_FILTER_SCENARIOS[staticKey];

    if (staticScenario) {
      console.log(`Using static filter scenario: ${staticKey}`);
      return staticScenario;
    }

    // Fall back to existing dynamic logic
    // Get plan sets for each filter
    const insuranceSet = INSURANCE_REASON_SETS[InsuranceReason];
    const tierSet = COVERAGE_TIER_SETS[CoverageTier];

    // If both are 'all' or missing → return null (no filtering)
    if (!insuranceSet && !tierSet) {
      return null;
    }

    // If one is 'all' → return the other set
    if (!insuranceSet) return tierSet;
    if (!tierSet) return insuranceSet;

    // Both filters set → return intersection
    return insuranceSet.filter(plan => tierSet.includes(plan));
  }

  /**
   * Reset filters to 'all' state
   * Used when activating comparison mode
   */
  function resetFiltersToAll() {
    // Remove filter fields from localStorage
    removeLocalStorageField('InsuranceReason');
    removeLocalStorageField('CoverageTier');

    // Update all filter form fields to 'all'
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
      if (form.elements['InsuranceReason']) {
        setFieldValue(form, 'InsuranceReason', 'all');
      }
      if (form.elements['CoverageTier']) {
        setFieldValue(form, 'CoverageTier', 'all');
      }
    });

    console.log('Filters reset to all');
  }

  /**
   * Disable filter controls
   * Used during active comparison
   */
  function disableFilterControls() {
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
      ['InsuranceReason', 'CoverageTier'].forEach(fieldName => {
        const elements = form.elements[fieldName];

        if (!elements) return;

        if (elements instanceof RadioNodeList) {
          for (const radio of elements) {
            radio.disabled = true;
          }
        } else {
          elements.disabled = true;
        }
      });
    });
  }

  /**
   * Enable filter controls
   * Used when comparison is cleared
   */
  function enableFilterControls() {
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
      ['InsuranceReason', 'CoverageTier'].forEach(fieldName => {
        const elements = form.elements[fieldName];

        if (!elements) return;

        if (elements instanceof RadioNodeList) {
          for (const radio of elements) {
            radio.disabled = false;
          }
        } else {
          elements.disabled = false;
        }
      });
    });
  }

  /**
   * Apply plan visibility and ordering based on current filter state
   * Behavior depends on filterStyle mode:
   * - showAll: Reorder plans (filtered first), all visible
   * - limit: Reorder plans (filtered first), hide non-matching
   * - hideOnly: Preserve original order, hide non-matching
   */
  function applyPlanVisibilityAndOrder() {
    // Step 1: Get current filter state
    const filterState = getCurrentFilterState();
    const filteredPlanNames = getFilteredPlans(filterState);

    // Step 2: Get all plan elements (exclude injected plans from plan-injector.js)
    const allPlanElements = document.querySelectorAll('[dpr-results-plan]:not([data-injected-plan])');

    if (allPlanElements.length === 0) {
      console.warn('No plan elements found on page');
      return;
    }

    // If no filtering (both 'all'), show all plans and keep existing DOM order
    if (!filteredPlanNames) {
      console.log('No filtering applied - showing all plans in existing order');
      allPlanElements.forEach(el => el.style.display = '');
      return;
    }

    // Step 3: Separate filtered from non-filtered plans
    const planArray = Array.from(allPlanElements);
    const filteredElements = [];
    const otherElements = [];

    planArray.forEach(planEl => {
      const planName = planEl.getAttribute('dpr-results-plan');
      if (filteredPlanNames.includes(planName)) {
        filteredElements.push(planEl);
      } else {
        otherElements.push(planEl);
      }
    });

    // Step 4: Apply filtering based on mode
    if (filterStyle === 'hideOnly') {
      // hideOnly mode: Preserve original DOM order, just hide non-matching
      filteredElements.forEach(el => el.style.display = '');
      otherElements.forEach(el => el.style.display = 'none');
      console.log(`Applied filtering (hideOnly mode): ${filteredElements.length} shown, ${otherElements.length} hidden, order preserved`);
    } else {
      // For 'limit' and 'showAll' modes: Reorder DOM first
      const planParent = planArray[0]?.parentElement;

      if (!planParent) {
        console.warn('Could not find plan parent container');
        return;
      }

      // Reorder DOM - filtered plans first (in existing DOM order), then others
      planArray.forEach(el => el.remove());
      filteredElements.forEach(el => planParent.appendChild(el));
      otherElements.forEach(el => planParent.appendChild(el));

      // Then apply visibility based on specific mode
      if (filterStyle === 'limit') {
        // Limit mode: Show only filtered plans, hide others
        filteredElements.forEach(el => el.style.display = '');
        otherElements.forEach(el => el.style.display = 'none');
        console.log(`Applied filtering (limit mode): ${filteredElements.length} shown, ${otherElements.length} hidden`);
      } else {
        // ShowAll mode (default): All plans visible, just reordered
        allPlanElements.forEach(el => el.style.display = '');
        console.log(`Applied filtering (showAll mode): ${filteredElements.length} filtered, ${otherElements.length} others`);
      }
    }
  }

  // ============================================================
  // PLAN COMPARISON FUNCTIONALITY
  // ============================================================

  /**
   * Add a plan to the comparison slots
   * @param {string} planName - The plan name to add
   */
  function addPlanToCompare(planName) {
    if (selectedPlans.length >= 3 || selectedPlans.includes(planName)) {
      return;
    }

    const compareSlots = document.querySelectorAll('[data-compare="outer-wrapper"]');

    // Find first available slot
    for (let i = 0; i < compareSlots.length; i++) {
      const slot = compareSlots[i];
      const wrapper = slot.querySelector('[data-compare="plan-wrapper"]');

      if (!wrapper.classList.contains('active')) {
        const nameElement = wrapper.querySelector('[data-compare="plan-name"]');
        nameElement.textContent = planName;
        wrapper.classList.add('active');
        selectedPlans.push(planName);
        break;
      }
    }
  }

  /**
   * Remove a plan from comparison and reorganize remaining plans
   * @param {string} planName - The plan name to remove
   */
  function removePlanFromCompare(planName) {
    const index = selectedPlans.indexOf(planName);
    if (index > -1) {
      selectedPlans.splice(index, 1);
    }

    const compareSlots = document.querySelectorAll('[data-compare="outer-wrapper"]');

    // Clear all slots
    compareSlots.forEach(slot => {
      const wrapper = slot.querySelector('[data-compare="plan-wrapper"]');
      const nameElement = wrapper.querySelector('[data-compare="plan-name"]');
      nameElement.textContent = '';
      wrapper.classList.remove('active');
    });

    // Re-add remaining plans in order
    selectedPlans.forEach((name, idx) => {
      const slot = compareSlots[idx];
      const wrapper = slot.querySelector('[data-compare="plan-wrapper"]');
      const nameElement = wrapper.querySelector('[data-compare="plan-name"]');
      nameElement.textContent = name;
      wrapper.classList.add('active');
    });
  }

  /**
   * Update checkbox states based on selection limit
   */
  function updateCheckboxState() {
    const checkboxes = document.querySelectorAll('[data-compare-trigger]');

    checkboxes.forEach(checkbox => {
      checkbox.disabled = selectedPlans.length >= 3 && !checkbox.checked;
    });
  }

  /**
   * Update compare button state and appearance
   */
  function updateCompareButtonState() {
    const compareButton = document.querySelector('[data-compare="compare-button"]');
    const compareComponent = document.querySelector('[data-compare="component"]');

    if (!compareButton) return;

    if (selectedPlans.length > 0) {
      compareButton.classList.remove('disabled');
      // Show the compare component when plans are selected
      if (compareComponent) {
        compareComponent.classList.remove('hide');
      }
    } else {
      compareButton.classList.add('disabled');
      // Hide the compare component when no plans are selected
      if (compareComponent) {
        compareComponent.classList.add('hide');
      }
      if (isCompareActive) {
        clearComparison();
      }
    }
  }

  /**
   * Activate comparison mode - hide non-selected plans
   */
  function activateComparison() {
    if (selectedPlans.length === 0) return;

    // Reset filters to 'all' before comparison
    resetFiltersToAll();

    // Hide non-selected plan columns (using dpr-results-plan attribute)
    const allPlanColumns = document.querySelectorAll('[dpr-results-plan]');
    allPlanColumns.forEach(column => {
      const planName = column.getAttribute('dpr-results-plan');
      if (!selectedPlans.includes(planName)) {
        column.classList.add('hide');
      } else {
        column.style.display = '';
      }
    });

    // Update compare button text
    const compareButton = document.querySelector('[data-compare="compare-button"]');
    if (compareButton) {
      const buttonText = compareButton.querySelector('div');
      if (buttonText) buttonText.textContent = 'Clear';
    }

    // Disable controls during comparison
    const checkboxes = document.querySelectorAll('[data-compare-trigger]');
    checkboxes.forEach(checkbox => checkbox.disabled = true);

    document.querySelectorAll('[data-compare="plan-remove"]').forEach(btn => {
      btn.style.display = 'none';
    });

    // Disable filter controls
    disableFilterControls();

    isCompareActive = true;
    console.log('Comparison mode activated');
  }

  /**
   * Clear comparison mode and restore normal view
   */
  function clearComparison() {
    // Show all columns (using dpr-results-plan attribute)
    const allPlanColumns = document.querySelectorAll('[dpr-results-plan]');
    allPlanColumns.forEach(column => {
      column.classList.remove('hide');
    });

    // Reset checkboxes
    const checkboxes = document.querySelectorAll('[data-compare-trigger]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
      checkbox.disabled = false;
    });

    // Clear comparison slots
    const compareSlots = document.querySelectorAll('[data-compare="outer-wrapper"]');
    compareSlots.forEach(slot => {
      const wrapper = slot.querySelector('[data-compare="plan-wrapper"]');
      const nameElement = wrapper.querySelector('[data-compare="plan-name"]');
      nameElement.textContent = '';
      wrapper.classList.remove('active');
    });

    // Update compare button
    const compareButton = document.querySelector('[data-compare="compare-button"]');
    if (compareButton) {
      const buttonText = compareButton.querySelector('div');
      if (buttonText) buttonText.textContent = 'Compare Plans';
    }

    // Show remove buttons
    document.querySelectorAll('[data-compare="plan-remove"]').forEach(btn => {
      btn.style.display = '';
    });

    // Re-enable filter controls
    enableFilterControls();

    // Reset state
    selectedPlans = [];
    isCompareActive = false;
    updateCompareButtonState();

    // Re-apply current filters
    applyPlanVisibilityAndOrder();

    console.log('Comparison mode cleared');
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
  // FORM SYNCING
  // ============================================================

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

      // CRITICAL: Don't save 'all' to storage - remove field instead
      // This prevents interference with dpr-results.js filtering logic
      if (value === 'all') {
        removeLocalStorageField(fieldName);
      } else {
        updateLocalStorage(fieldName, value);
      }

      // Sync all other fields with same name
      syncAllFieldsWithName(fieldName, value);

      // Trigger filtering update if filter field changed
      const filterFields = ['InsuranceReason', 'CoverageTier'];
      if (filterFields.includes(fieldName)) {
        applyPlanVisibilityAndOrder();
      }
    } finally {
      isSyncing = false;
    }
  }

  /**
   * Populate all form fields on page load from localStorage
   */
  function prefillAllForms() {
    const localData = getLocalStorageData() || {};
    const forms = document.querySelectorAll('form');

    forms.forEach(form => {
      Array.from(form.elements).forEach(element => {
        if (!element.name) return;

        const fieldName = element.name;
        const value = localData[fieldName];

        if (value !== undefined && value !== null) {
          setFieldValue(form, fieldName, value);
        }
      });
    });
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
  // UI STATE MANAGEMENT
  // ============================================================

  /**
   * Hide all dynamic content blocks
   */
  function hideDynamicBlocks() {
    const dynamicBlocks = document.querySelectorAll('[data-results="dynamic-block"]');

    dynamicBlocks.forEach(block => {
      block.style.display = 'none';
    });

    console.log(`Hidden ${dynamicBlocks.length} dynamic blocks`);
  }

  /**
   * Show all dynamic content blocks
   */
  function showDynamicBlocks() {
    const dynamicBlocks = document.querySelectorAll('[data-results="dynamic-block"]');

    dynamicBlocks.forEach(block => {
      block.style.display = '';  // Reset to CSS default
    });

    console.log(`Shown ${dynamicBlocks.length} dynamic blocks`);
  }

  // ============================================================
  // SKELETON LOADER FUNCTIONALITY
  // ============================================================

  /**
   * Create and display skeleton loaders on all marked elements
   */
  function showSkeletonLoaders() {
    const skeletonElements = document.querySelectorAll('[dpr-code-skeleton]');

    skeletonElements.forEach(element => {
      // Skip if skeleton already exists
      if (element.querySelector('.skeleton-loader')) return;

      const skeletonDiv = document.createElement('div');
      skeletonDiv.classList.add('skeleton-loader');
      element.style.position = 'relative';
      element.appendChild(skeletonDiv);
    });

    console.log(`Skeleton loaders shown on ${skeletonElements.length} elements`);
  }

  /**
   * Remove all skeleton loaders from the page
   */
  function hideSkeletonLoaders() {
    const skeletonLoaders = document.querySelectorAll('.skeleton-loader');

    skeletonLoaders.forEach(loader => {
      loader.remove();
    });

    console.log(`Removed ${skeletonLoaders.length} skeleton loaders`);
  }

  // ============================================================
  // RESULTS DISPLAY
  // ============================================================

  /**
   * Reset all plan prices and buttons to default hidden state
   */
  function resetChart() {
    const planItems = document.querySelectorAll('[dpr-results-plan]');

    planItems.forEach(planItem => {
      // Find all dynamic blocks or fall back to planItem
      const dynamicBlocks = planItem.querySelectorAll('[data-results="dynamic-block"]');
      const blocksToProcess = dynamicBlocks.length > 0 ? Array.from(dynamicBlocks) : [planItem];

      blocksToProcess.forEach(block => {
        // Hide/reset price element
        const priceEl = block.querySelector('[dpr-results-price="price"]');
        if (priceEl) {
          priceEl.textContent = '';
          priceEl.style.display = 'none';
        }

        // Hide/reset button(s)
        block.querySelectorAll('[dpr-results-apply="button"]').forEach(btn => {
          btn.style.display = 'none';
          btn.disabled = false;
          btn.textContent = applyButtonText;
          delete btn.dataset.confirmation;
        });

        // Hide/reset Quebec call button(s)
        block.querySelectorAll('[dpr-results-quebec="call"]').forEach(quebecBtn => {
          quebecBtn.style.display = 'none';
        });

        // Reset hospital rider modal state
        const riderModal = block.querySelector('[dpr-rider="modal"]');
        if (riderModal && riderModal.open) riderModal.close();
        delete planItem.dataset.riderSelected;
        delete planItem.dataset.hospitalConfirmation;
        delete planItem.dataset.riderFrom;

        // Hide/reset hospital checkbox
        const checkboxWrapper = block.querySelector('[dpr-quote-hospital="checkbox-wrapper"]');
        if (checkboxWrapper) {
          checkboxWrapper.style.display = 'none';

          const checkbox = checkboxWrapper.querySelector('[dpr-quote-hospital="check-trigger"]');
          if (checkbox) {
            checkbox.checked = false;
          }
        }
      });
    });

    console.log(`Reset ${planItems.length} plan items`);
  }

  /**
   * Update a quote's options (e.g. Hospital Accommodation) via PUT.
   * Returns the new ConfirmationNumber for the updated quote.
   * @param {string} confirmationNumber - The base quote confirmation number
   * @param {string} optionName - The option to toggle (e.g. 'Hospital Accommodation')
   * @param {boolean} selected - Whether the option should be selected
   * @returns {Promise<string>} New ConfirmationNumber for the updated quote
   */
  async function updateQuoteOption(confirmationNumber, optionName, selected) {
    const res = await fetch(`${rootApiURL}/quote/${confirmationNumber}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ OptionName: optionName, Selected: selected }])
    });

    if (!res.ok) {
      throw new Error(`Quote update failed: ${res.status}`);
    }

    const data = await res.json();

    if (!data.ConfirmationNumber) {
      throw new Error('No ConfirmationNumber in quote update response');
    }

    return data.ConfirmationNumber;
  }

  /**
   * Fetch application URL from API using confirmation number
   * @param {string} confirmationNumber - The quote confirmation number
   * @returns {Promise<string>} Application URL
   */
  async function getApplicationUrl(confirmationNumber) {
    // Build base URL
    let apiUrl = `${rootApiURL}/applicationUrl/${confirmationNumber}`;

    // Append lang parameter if page is French Canadian
    const htmlLang = document.documentElement.lang;
    if (htmlLang && htmlLang.toLowerCase() === 'fr-ca') {
      apiUrl += '?lang=fr';
    }

    const res = await fetch(apiUrl);

    if (!res.ok) {
      throw new Error(`Network error: ${res.status}`);
    }

    const raw = await res.text();
    let url;

    try {
      url = JSON.parse(raw).ApplicationUrl;
    } catch {
      url = raw;
    }

    if (!url || !url.startsWith('http')) {
      throw new Error('Invalid URL received');
    }

    return url;
  }

  /**
   * Decorate URLs with GTM auto-linker for cross-domain tracking
   * @param {string} url - The URL to decorate
   * @returns {string} Decorated URL or original if decoration fails
   */
  function decorateWithGtmAutoLinker(url) {
    try {
      if (typeof gtag === 'undefined') {
        return url;
      }

      const a = document.createElement('a');
      a.href = url;
      a.style.position = 'absolute';
      a.style.left = '-9999px';
      document.body.appendChild(a);

      a.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

      const decorated = a.href;
      a.remove();
      return decorated || url;
    } catch (err) {
      console.warn('Auto-linker decoration failed, using raw URL', err);
      return url;
    }
  }

  /**
   * Show/hide standalone Quebec-hide targets anywhere on the page.
   * Elements with [data-quebec-hide] are hidden in Quebec and revealed
   * (reverting to their stylesheet display) otherwise.
   * @param {boolean} isQuebec - Whether Province is 10 (Quebec)
   */
  function setQuebecHideVisibility(isQuebec) {
    document.querySelectorAll('[data-quebec-hide]').forEach(el => {
      el.style.display = isQuebec ? 'none' : '';
    });
  }

  /**
   * Show/hide plan buttons based on Province value
   * @param {HTMLElement} planItem - The plan container element
   * @param {boolean} isQuebec - Whether Province is 10 (Quebec)
   */
  function setPlanButtonVisibility(planItem, isQuebec) {
    const applyBtns = planItem.querySelectorAll('[dpr-results-apply="button"]');
    const quebecBtns = planItem.querySelectorAll('[dpr-results-quebec="call"]');

    if (isQuebec) {
      // Quebec: Show call button(s), hide apply button(s)
      quebecBtns.forEach(btn => { btn.style.display = 'block'; });
      applyBtns.forEach(btn => { btn.style.display = 'none'; });
    } else {
      // Other provinces: Show apply button(s), hide call button(s)
      applyBtns.forEach(btn => { btn.style.display = 'flex'; });
      quebecBtns.forEach(btn => { btn.style.display = 'none'; });
    }
  }

  /**
   * Handle hospital accommodation checkbox change
   * Updates the displayed price when checkbox is toggled
   * @param {HTMLElement} planItem - The plan card container
   * @param {HTMLElement} block - The specific dynamic block container
   * @param {Object} hospitalOption - The hospital option data
   * @param {boolean} isChecked - Whether checkbox is checked
   */
  function handleHospitalCheckboxChange(planItem, block, hospitalOption, isChecked) {
    const priceEl = block.querySelector('[dpr-results-price="price"]');

    if (!priceEl) {
      console.warn('Price element not found for hospital checkbox change');
      return;
    }

    // Get base premium from dataset
    const basePremium = parseFloat(planItem.dataset.basePremium);

    if (isNaN(basePremium)) {
      console.warn('Invalid base premium stored in dataset');
      return;
    }

    // Calculate new total
    let newTotal = basePremium;
    if (isChecked) {
      newTotal += parseFloat(hospitalOption.OptionPremium);
    }

    // Update price display (whole numbers only, no cents)
    const displayPrice = Math.round(newTotal);
    priceEl.textContent = displayPrice;

    console.log(`Hospital accommodation ${isChecked ? 'added' : 'removed'} for plan. New total: $${displayPrice}`);
  }

  // ============================================================
  // HOSPITAL RIDER MODAL
  // ============================================================
  //
  // Replaces the inline hospital checkbox with a per-card <dialog>.
  // Routing (decided in the Apply click handler in fillChart):
  //   HQ-required plans: Apply now -> HQ interstitial -> "Continue" (dpr-results-apply)
  //                      -> rider modal -> Continue to application
  //   GA / no-HQ plans:  Apply now (dpr-results-apply) -> rider modal -> Continue to application
  //   Plans with no 'Hospital Accommodation' in QuoteOptions never see the rider modal.
  //
  // Markup contract — one [dpr-rider="modal"] <dialog> inside each [data-results="dynamic-block"]:
  //   [dpr-rider="modal"]             the <dialog>
  //   [dpr-rider="back"]              back link: closes; reopens the HQ interstitial if we came from it
  //   [dpr-rider="total"]             total monthly premium text ("$224", live: base or base + rider)
  //   [dpr-rider="accordion-toggle"]  chevron: shows/hides [dpr-rider="details"]; gets .is-open
  //   [dpr-rider="details"]           collapsible description block (expanded from HQ, collapsed on GA)
  //   [dpr-rider="option-premium"]    rider premium text ("+$6")
  //   [dpr-rider="price-row"]         wrapper for "+$6 per month" (hidden once added)
  //   [dpr-rider="add"]               Add Coverage button (hidden once added)
  //   [dpr-rider="remove"]            Remove Coverage link (shown once added)
  //   [dpr-rider="exclusions-open"]   "view exclusions" link
  //   [dpr-rider="exclusions-close"]  "Back" inside the exclusions view
  //   [dpr-rider="view-main"]         main view wrapper
  //   [dpr-rider="view-exclusions"]   exclusions view wrapper (hidden by default)
  //   [dpr-rider="continue"]          Continue to application (do NOT also give it dpr-results-apply)
  //
  // State lives on the plan item's dataset: basePremium, hospitalOption, confirmation,
  // riderSelected ('true'|'false'), riderFrom ('hq'|'direct'), hospitalConfirmation (cached PUT result).

  const HOSPITAL_OPTION_NAME = 'Hospital Accommodation';

  /**
   * Show/hide an element. Webflow hides the initial-hidden pieces (remove link,
   * exclusions view) via class styles, so showing needs an explicit display value.
   * @param {HTMLElement} el
   * @param {boolean} visible
   * @param {string} display - display value to use when the stylesheet says none
   */
  function setRiderVisible(el, visible, display) {
    if (!visible) { el.style.display = 'none'; return; }
    el.style.display = '';
    if (getComputedStyle(el).display === 'none') el.style.display = display || 'block';
  }

  /**
   * Format a premium for display: whole dollars when there are no cents, otherwise 2 decimals.
   * @param {number|string} value
   * @returns {string} e.g. "$224" or "$161.40"
   */
  function formatPremium(value) {
    const n = parseFloat(value);
    if (isNaN(n)) return '';
    return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
  }

  /**
   * Read the stored hospital option for a plan item
   * @param {HTMLElement} planItem
   * @returns {Object|null}
   */
  function getStoredHospitalOption(planItem) {
    try {
      return planItem.dataset.hospitalOption ? JSON.parse(planItem.dataset.hospitalOption) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Find the HQ interstitial dialog in a block (the dialog that is not the rider modal
   * and carries an apply button).
   * @param {HTMLElement} block
   * @returns {HTMLDialogElement|null}
   */
  function findHqDialog(block) {
    return Array.from(block.querySelectorAll('dialog')).find(d =>
      d.getAttribute('dpr-rider') !== 'modal' && d.querySelector('[dpr-results-apply="button"]')
    ) || null;
  }

  /**
   * Apply the selected/unselected state to the rider modal UI and the live total.
   * @param {HTMLElement} planItem
   * @param {HTMLElement} block
   * @param {boolean} selected
   */
  function setRiderState(planItem, block, selected) {
    planItem.dataset.riderSelected = selected ? 'true' : 'false';

    const modal = block.querySelector('[dpr-rider="modal"]');
    if (!modal) return;

    const base = parseFloat(planItem.dataset.basePremium) || 0;
    const option = getStoredHospitalOption(planItem);
    const riderMissing = !!(option && option.fromApi === false);
    const riderPremium = option && !riderMissing ? (parseFloat(option.OptionPremium) || 0) : 0;
    const total = selected ? base + riderPremium : base;

    modal.querySelectorAll('[dpr-rider="total"]').forEach(el => { el.textContent = formatPremium(total); });
    modal.querySelectorAll('[dpr-rider="add"]').forEach(el => setRiderVisible(el, !selected && !riderMissing, 'inline-flex'));
    modal.querySelectorAll('[dpr-rider="price-row"]').forEach(el => setRiderVisible(el, !selected && !riderMissing, 'flex'));
    modal.querySelectorAll('[dpr-rider="missing"]').forEach(el => setRiderVisible(el, riderMissing, 'block'));
    modal.querySelectorAll('[dpr-rider="remove"]').forEach(el => setRiderVisible(el, selected, 'inline-flex'));
    modal.querySelectorAll('[dpr-rider="continue"]').forEach(el => {
      el.setAttribute('data-rider-selected', selected ? 'true' : 'false');
    });
    modal.classList.toggle('is-rider-added', selected);

    console.log(`Hospital rider ${selected ? 'added' : 'removed'} for ${planItem.getAttribute('dpr-results-plan')}. Total: ${formatPremium(total)}`);
  }

  /**
   * Show or hide the "not returned by the API" notice inside the rider modal. The notice
   * element is created on first use (after the price row) so the Webflow markup needs no change.
   * @param {HTMLElement} modal
   * @param {boolean} show
   * @param {string} planName
   */
  function setRiderMissingNotice(modal, show, planName) {
    let notice = modal.querySelector('[dpr-rider="missing"]');
    if (!notice && show) {
      notice = document.createElement('div');
      notice.setAttribute('dpr-rider', 'missing');
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'margin:12px 0 0;padding:10px 12px;border-radius:8px;background:#FDE2E2;color:#9B1C1C;font-size:13px;line-height:1.4;';
      const priceRow = modal.querySelector('[dpr-rider="price-row"]');
      if (priceRow && priceRow.parentElement) {
        priceRow.insertAdjacentElement('afterend', notice);
      } else {
        (modal.querySelector('[dpr-rider="view-main"]') || modal).appendChild(notice);
      }
    }
    if (!notice) return;
    notice.textContent = `Hospital Accommodation was not returned by the API for ${planName} (no "Hospital Accommodation" entry in QuoteOptions), so it can't be added here. Continue goes to the application without the rider. Check the quoteset response in the ?debug=api panel.`;
    setRiderVisible(notice, show, 'block');
  }

  /**
   * Switch the rider modal between its main view and the exclusions view
   * @param {HTMLElement} modal
   * @param {'main'|'exclusions'} view
   */
  function showRiderView(modal, view) {
    modal.querySelectorAll('[dpr-rider="view-main"]').forEach(el => setRiderVisible(el, view === 'main', 'flex'));
    modal.querySelectorAll('[dpr-rider="view-exclusions"]').forEach(el => setRiderVisible(el, view === 'exclusions', 'flex'));
  }

  /**
   * Expand or collapse the rider description accordion
   * @param {HTMLElement} modal
   * @param {boolean} open
   */
  function setRiderDetailsOpen(modal, open) {
    modal.querySelectorAll('[dpr-rider="details"]').forEach(el => setRiderVisible(el, open, 'flex'));
    modal.querySelectorAll('[dpr-rider="accordion-toggle"]').forEach(el => { el.classList.toggle('is-open', open); });
  }

  /**
   * Open the rider modal for a plan.
   * @param {HTMLElement} planItem
   * @param {HTMLElement} block
   * @param {'hq'|'direct'} from - 'hq' when arriving from the HQ interstitial
   * @returns {boolean} true if a modal was opened
   */
  function openRiderModal(planItem, block, from) {
    const modal = block.querySelector('[dpr-rider="modal"]');
    if (!modal || typeof modal.showModal !== 'function') return false;

    planItem.dataset.riderFrom = from;

    // Description starts expanded on every route (user can collapse it via the chevron)
    setRiderDetailsOpen(modal, true);
    showRiderView(modal, 'main');
    setRiderState(planItem, block, planItem.dataset.riderSelected === 'true');

    if (!modal.open) modal.showModal();
    return true;
  }

  /**
   * Populate and wire the rider modal for a plan (once per fillChart).
   * Clones the dialog to drop stale listeners, mirroring the apply-button pattern.
   * @param {HTMLElement} planItem
   * @param {HTMLElement} block
   * @param {Object} hospitalOption - The QuoteOptions entry for Hospital Accommodation
   */
  function setupRiderModal(planItem, block, hospitalOption) {
    const modal = block.querySelector('[dpr-rider="modal"]');
    if (!modal) return;

    const riderMissing = hospitalOption.fromApi === false;
    const riderPremium = riderMissing ? 0 : (parseFloat(hospitalOption.OptionPremium) || 0);
    modal.querySelectorAll('[dpr-rider="option-premium"]').forEach(el => {
      el.textContent = riderMissing ? 'n/a' : `+${formatPremium(riderPremium)}`;
    });
    setRiderMissingNotice(modal, riderMissing, planItem.getAttribute('dpr-results-plan'));

    // Fresh state for this quote (no persistence across quotes)
    planItem.dataset.riderSelected = 'false';
    delete planItem.dataset.hospitalConfirmation;
    delete planItem.dataset.riderFrom;
    showRiderView(modal, 'main');
    setRiderState(planItem, block, false);

    // No per-element listeners here: every control is handled by the document-level
    // delegated handler (installRiderDelegation) so cards cloned later by
    // plan-injector.js keep working.

    console.log(`Hospital rider modal ready for ${planItem.getAttribute('dpr-results-plan')}: ${formatPremium(riderPremium)}`);
  }

  /**
   * One document-level click handler (capture phase) for Apply buttons and every
   * rider-modal control. Runs before any per-element handler — including the ones
   * plan-injector.js attaches to cloned cards — and stops propagation so those
   * legacy handlers never fire. All state lives on the plan item's dataset, which
   * cloneNode copies, so injected clones behave exactly like the originals.
   */
  function handleRiderDelegatedClick(e) {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    // --- Apply buttons: card buttons and the HQ interstitial's Continue ---
    const applyBtn = target.closest('[dpr-results-apply="button"]');
    if (applyBtn) {
      const planItem = applyBtn.closest('[dpr-results-plan]');
      if (!planItem) return;
      if (applyBtn.closest('[dpr-rider="modal"]')) return; // never used inside the rider modal

      e.preventDefault();
      e.stopPropagation();

      const block = applyBtn.closest('[data-results="dynamic-block"]') || planItem;
      const riderModal = planItem.querySelector('[dpr-rider="modal"]');
      const option = getStoredHospitalOption(planItem);

      if (option && riderModal) {
        const hqDialog = applyBtn.closest('dialog');
        if (hqDialog) hqDialog.close();
        const modalBlock = riderModal.closest('[data-results="dynamic-block"]') || planItem;
        openRiderModal(planItem, modalBlock, hqDialog ? 'hq' : 'direct');
        return;
      }

      proceedToApplication(planItem, block, applyBtn);
      return;
    }

    // --- Rider modal controls ---
    const control = target.closest('[dpr-rider]');
    if (!control) return;
    const role = control.getAttribute('dpr-rider');
    if (role === 'modal') return;

    const modal = control.closest('[dpr-rider="modal"]');
    const planItem = modal && modal.closest('[dpr-results-plan]');
    if (!modal || !planItem) return;
    const block = modal.closest('[data-results="dynamic-block"]') || planItem;

    switch (role) {
      case 'add':
        e.preventDefault(); e.stopPropagation();
        setRiderState(planItem, block, true);
        break;
      case 'remove':
        e.preventDefault(); e.stopPropagation();
        setRiderState(planItem, block, false);
        break;
      case 'accordion-toggle':
        e.preventDefault(); e.stopPropagation();
        setRiderDetailsOpen(modal, !control.classList.contains('is-open'));
        break;
      case 'exclusions-open':
        e.preventDefault(); e.stopPropagation();
        showRiderView(modal, 'exclusions');
        break;
      case 'exclusions-close':
        e.preventDefault(); e.stopPropagation();
        showRiderView(modal, 'main');
        break;
      case 'back': {
        e.preventDefault(); e.stopPropagation();
        const exclusionsView = modal.querySelector('[dpr-rider="view-exclusions"]');
        if (exclusionsView && getComputedStyle(exclusionsView).display !== 'none') {
          showRiderView(modal, 'main');
          break;
        }
        modal.close();
        if (planItem.dataset.riderFrom === 'hq') {
          const hq = findHqDialog(block);
          if (hq && !hq.open) hq.showModal();
        }
        break;
      }
      case 'continue':
        e.preventDefault(); e.stopPropagation();
        proceedToApplication(planItem, block, control);
        break;
      default:
        break;
    }
  }

  function installRiderDelegation() {
    if (window.__dprRiderDelegationInstalled) return;
    window.__dprRiderDelegationInstalled = true;
    document.addEventListener('click', handleRiderDelegatedClick, true);
  }

  /**
   * Push the rider decision to the dataLayer once, at submission (not per toggle).
   * Only fires for plans where the rider was offered.
   * @param {HTMLElement} planItem
   * @param {boolean} riderSelected
   */
  function pushRiderTracking(planItem, riderSelected) {
    try {
      const option = getStoredHospitalOption(planItem);
      if (!option) return;

      const base = parseFloat(planItem.dataset.basePremium) || 0;
      const riderPremium = parseFloat(option.OptionPremium) || 0;

      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'hospital_rider_submit',
        plan_name: planItem.getAttribute('dpr-results-plan'),
        rider_selected: riderSelected,
        rider_premium: riderPremium,
        base_premium: base,
        total_premium: riderSelected ? base + riderPremium : base,
        rider_flow: planItem.dataset.riderFrom || 'checkbox',
        rider_offered_by_api: option.fromApi !== false
      });
    } catch (e) {
      console.warn('Rider tracking push failed:', e);
    }
  }

  /**
   * Final hand-off: apply the rider via PUT when selected (cached), fetch the
   * application URL and redirect. Shared by the Apply buttons and the rider modal's Continue.
   * @param {HTMLElement} planItem
   * @param {HTMLElement} block
   * @param {HTMLElement} btn - The button that was clicked (for loading/error text)
   */
  async function proceedToApplication(planItem, block, btn) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = loadingText();

    try {
      const baseConfirmation = btn.dataset.confirmation || planItem.dataset.confirmation;
      let confirmationToUse = baseConfirmation;

      // Rider selected via the modal, or via the legacy checkbox where the modal isn't present
      const legacyCheckbox = block.querySelector('[dpr-quote-hospital="check-trigger"]');
      const riderSelected = planItem.dataset.riderSelected === 'true'
        || (!!legacyCheckbox && legacyCheckbox.checked);

      if (riderSelected && getStoredHospitalOption(planItem)) {
        if (planItem.dataset.hospitalConfirmation) {
          confirmationToUse = planItem.dataset.hospitalConfirmation;
        } else {
          confirmationToUse = await updateQuoteOption(baseConfirmation, HOSPITAL_OPTION_NAME, true);
          planItem.dataset.hospitalConfirmation = confirmationToUse;
        }
      }

      pushRiderTracking(planItem, riderSelected);

      const url = await getApplicationUrl(confirmationToUse);
      const finalUrl = decorateWithGtmAutoLinker(url);

      // Short delay for GA hit to flush
      setTimeout(() => {
        window.location.assign(finalUrl);
      }, 200);
    } catch (err) {
      console.error('Error getting application URL:', err);
      btn.textContent = errorRetryText();
      btn.disabled = false;
    }
  }

  /**
   * Populate plan prices and wire up Apply Now buttons
   * @param {Object} resultsData - Full dpr_results_data structure
   */
  function fillChart(resultsData) {
    resetChart();

    // Get Province value to determine button visibility
    const localData = getLocalStorageData();
    const province = localData?.Province;
    const isQuebec = province == 10; // Use == to handle string/number comparison

    // Apply standalone Quebec hide/show targets (independent of plan cards)
    setQuebecHideVisibility(isQuebec);

    // Extract PlanQuotes from results
    const quotes = resultsData?.results?.PlanQuotes || [];

    if (!quotes || quotes.length === 0) {
      console.warn('No quote data available to populate chart');
      return;
    }

    console.log(`Populating ${quotes.length} plan quotes`);

    quotes.forEach(quote => {
      // Find matching plan item by PlanName
      const planItem = document.querySelector(`[dpr-results-plan="${quote.PlanName}"]`);

      if (!planItem) {
        console.warn(`No matching plan element found for: ${quote.PlanName}`);
        return;
      }

      // Find all dynamic blocks or fall back to planItem
      const dynamicBlocks = planItem.querySelectorAll('[data-results="dynamic-block"]');
      const blocksToProcess = dynamicBlocks.length > 0 ? Array.from(dynamicBlocks) : [planItem];

      blocksToProcess.forEach(block => {
        // Populate price
        const priceEl = block.querySelector('[dpr-results-price="price"]');
        if (priceEl) {
          const price = Math.round(parseFloat(quote.Premium));
          priceEl.textContent = price;
          priceEl.style.display = 'block';
        }

        // Check for hospital accommodation option
        const apiHospitalOption = quote.QuoteOptions?.find(
          option => option.OptionName === 'Hospital Accommodation'
        );

        const checkboxWrapper = block.querySelector('[dpr-quote-hospital="checkbox-wrapper"]');
        const riderModal = block.querySelector('[dpr-rider="modal"]');

        // The rider is offered on every plan that carries the modal markup. When the API
        // doesn't return the option for a plan, the modal still opens but in a "not returned
        // by the API" state: no premium is invented, the rider can't be added, and Continue
        // goes to the application without it. This makes a missing option visible during QA
        // instead of surfacing later inside the application.
        // Checked at plan level (not block level): a plan can have several dynamic blocks and
        // only the card block carries the modal; the stored option must survive every pass.
        const riderExcluded = riderExcludedPlans.includes(String(quote.PlanName).toUpperCase());
        const hospitalOption = riderExcluded ? null : (apiHospitalOption || (riderAllPlans && planItem.querySelector('[dpr-rider="modal"]')
          ? { OptionName: HOSPITAL_OPTION_NAME, OptionPremium: null, Selected: false, fromApi: false }
          : null));
        if (riderExcluded) console.log(`Hospital rider excluded for ${quote.PlanName}`);

        // Store quote data needed by the rider modal and the application hand-off
        planItem.dataset.confirmation = quote.ConfirmationNumber;
        planItem.dataset.basePremium = quote.Premium;
        if (hospitalOption) {
          planItem.dataset.hospitalOption = JSON.stringify(hospitalOption);
        } else {
          delete planItem.dataset.hospitalOption;
        }

        if (hospitalOption && riderModal) {
          // Rider modal present: wire it up and keep the legacy checkbox hidden
          setupRiderModal(planItem, block, hospitalOption);
          if (checkboxWrapper) checkboxWrapper.style.display = 'none';
        } else if (hospitalOption && checkboxWrapper) {
          // Legacy checkbox (blocks without the rider modal markup)

          // Show checkbox UI
          checkboxWrapper.style.display = 'block';

          // Populate text line
          const textLine = checkboxWrapper.querySelector('[dpr-quote-hospital="text-line"]');
          if (textLine) {
            const price = Math.round(parseFloat(hospitalOption.OptionPremium));
            textLine.textContent = `${hospitalAccommodationText}${price}`;
          }

          // Wire up checkbox handler
          const checkbox = checkboxWrapper.querySelector('[dpr-quote-hospital="check-trigger"]');
          if (checkbox) {
            // Reset checkbox state (no persistence)
            checkbox.checked = false;

            // Remove existing listeners (if any)
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);

            // Add change listener
            newCheckbox.addEventListener('change', (e) => {
              handleHospitalCheckboxChange(planItem, block, hospitalOption, e.target.checked);
            });
          }

          console.log(`Hospital accommodation available for ${quote.PlanName}: $${hospitalOption.OptionPremium}`);
        } else if (checkboxWrapper) {
          // Hide checkbox UI if hospital option not available
          checkboxWrapper.style.display = 'none';
        }

        // Wire up Apply Now button(s)
        const btns = block.querySelectorAll('[dpr-results-apply="button"]');
        btns.forEach(btn => {
          // Clone and replace to remove existing listeners
          const newBtn = btn.cloneNode(true);
          btn.parentNode.replaceChild(newBtn, btn);

          // Set confirmation number on the cloned element
          newBtn.dataset.confirmation = quote.ConfirmationNumber;

          // Click routing (rider modal vs. straight to application) is handled by the
          // document-level delegated handler — see handleRiderDelegatedClick.
        });

        // Set button visibility based on Province
        setPlanButtonVisibility(block, isQuebec);
      });
    });

    console.log('Chart population complete');
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  /**
   * Initialize plan comparison feature
   * Only runs if comparison UI elements are present on page
   */
  function initializeComparisonFeature() {
    // Check if comparison UI exists
    const compareButton = document.querySelector('[data-compare="compare-button"]');

    if (!compareButton) {
      console.log('Plan Card Display: Comparison feature not initialized (no UI elements found)');
      return;
    }

    console.log('Plan Card Display: Initializing comparison feature...');

    const checkboxes = document.querySelectorAll('[data-compare-trigger]');

    // Initialize comparison state
    updateCompareButtonState();

    // Handle plan selection/deselection
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        const planName = this.getAttribute('data-compare-trigger');

        if (this.checked) {
          addPlanToCompare(planName);
        } else {
          removePlanFromCompare(planName);
        }

        updateCheckboxState();
        updateCompareButtonState();
      });
    });

    // Handle compare button clicks
    compareButton.addEventListener('click', function() {
      if (isCompareActive) {
        clearComparison();
      } else {
        activateComparison();
      }
    });

    // Handle remove button clicks in comparison slots
    document.addEventListener('click', function(event) {
      if (event.target.closest('[data-compare="plan-remove"]')) {
        if (isCompareActive) return; // Don't allow removal during active comparison

        const wrapper = event.target.closest('[data-compare="plan-wrapper"]');
        const planName = wrapper.querySelector('[data-compare="plan-name"]').textContent;

        // Uncheck corresponding checkbox
        checkboxes.forEach(checkbox => {
          if (checkbox.getAttribute('data-compare-trigger') === planName) {
            checkbox.checked = false;
          }
        });

        removePlanFromCompare(planName);
        updateCheckboxState();
        updateCompareButtonState();
      }
    });

    console.log('Plan Card Display: Comparison feature initialized');
  }

  /**
   * Main initialization function
   */
  function initialize() {
    installRiderDelegation();
    console.log('Plan Card Display: Initializing...');

    // Prefill forms from localStorage
    prefillAllForms();

    // Apply initial filtering based on stored filter values
    // This ensures plans are filtered immediately, even before API call completes
    applyPlanVisibilityAndOrder();

    // Setup form change listeners
    setupFormChangeListeners();

    // Initialize comparison feature (if UI exists)
    initializeComparisonFeature();

    // Trigger API call on page load
    handlePageLoadApiCall();
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();

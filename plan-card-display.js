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

  // Apply button text
  const applyButtonText = document.currentScript.getAttribute("data-apply-button-text") || "Apply Now";

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
      CoverageTier: Number(localData.CoverageTier),
      InsuranceReason: localData.InsuranceReason ? Number(localData.InsuranceReason) : null,

      // Coverage options
      PreExisting: localData.PreExisting || null,
      PreExistingCoverage: localData.PreExistingCoverage ? Number(localData.PreExistingCoverage) : null,

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

        // Hide/reset button
        const btn = block.querySelector('[dpr-results-apply="button"]');
        if (btn) {
          btn.style.display = 'none';
          btn.disabled = false;
          btn.textContent = applyButtonText;
          delete btn.dataset.confirmation;
        }

        // Hide/reset Quebec call button
        const quebecBtn = block.querySelector('[dpr-results-quebec="call"]');
        if (quebecBtn) {
          quebecBtn.style.display = 'none';
        }

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
   * Fetch application URL from API using confirmation number
   * @param {string} confirmationNumber - The quote confirmation number
   * @returns {Promise<string>} Application URL
   */
  async function getApplicationUrl(confirmationNumber) {
    const res = await fetch(
      `${rootApiURL}/applicationUrl/${confirmationNumber}`
    );

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
   * Show/hide plan buttons based on Province value
   * @param {HTMLElement} planItem - The plan container element
   * @param {boolean} isQuebec - Whether Province is 10 (Quebec)
   */
  function setPlanButtonVisibility(planItem, isQuebec) {
    const applyBtn = planItem.querySelector('[dpr-results-apply="button"]');
    const quebecBtn = planItem.querySelector('[dpr-results-quebec="call"]');

    if (isQuebec) {
      // Quebec: Show call button, hide apply button
      if (quebecBtn) quebecBtn.style.display = 'block';
      if (applyBtn) applyBtn.style.display = 'none';
    } else {
      // Other provinces: Show apply button, hide call button
      if (applyBtn) applyBtn.style.display = 'flex';
      if (quebecBtn) quebecBtn.style.display = 'none';
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
        const hospitalOption = quote.QuoteOptions?.find(
          option => option.OptionName === 'Hospital Accommodation'
        );

        const checkboxWrapper = block.querySelector('[dpr-quote-hospital="checkbox-wrapper"]');

        if (hospitalOption && checkboxWrapper) {
          // Store hospital option data and base premium for calculations
          planItem.dataset.hospitalOption = JSON.stringify(hospitalOption);
          planItem.dataset.basePremium = quote.Premium; // Store original price

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

        // Wire up Apply Now button
        const btn = block.querySelector('[dpr-results-apply="button"]');
        if (btn) {
          // Clone and replace to remove existing listeners
          const newBtn = btn.cloneNode(true);
          btn.parentNode.replaceChild(newBtn, btn);

          // Set confirmation number on the cloned element
          newBtn.dataset.confirmation = quote.ConfirmationNumber;

          newBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            const originalText = newBtn.textContent;
            newBtn.disabled = true;
            newBtn.textContent = 'Loading...';

            try {
              const url = await getApplicationUrl(newBtn.dataset.confirmation);
              const finalUrl = decorateWithGtmAutoLinker(url);

              // Short delay for GA hit to flush
              setTimeout(() => {
                window.location.assign(finalUrl);
              }, 200);
            } catch (err) {
              console.error('Error getting application URL:', err);
              newBtn.textContent = 'Error – Try Again';
              newBtn.disabled = false;
            }
          });
        }

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
    console.log('Plan Card Display: Initializing...');

    // Prefill forms from localStorage
    prefillAllForms();

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

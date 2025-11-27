(function() {
  // Redirect URL for form submission
  const redirectUrl = document.currentScript.getAttribute("data-url") || "";

  // Fields to track in query parameters
  const TRACKED_FIELDS = [
    'CoverageType',
    'Dependents',
    'Age',
    'Province',
    'CoverageTier',
    'InsuranceReason',
    'PreExisting',
    'PreExistingCoverage'
  ];

  // Fields to save to localStorage (non-personal, persistent)
  const LOCAL_STORAGE_FIELDS = [
    'CoverageType',
    'Dependents',
    'Age',
    'Province',
    'CoverageTier',
    'InsuranceReason',
    'PreExisting',
    'PreExistingCoverage'
  ];

  // Fields to save to sessionStorage (personal, session-only)
  const SESSION_STORAGE_FIELDS = [
    'FirstName',
    'LastName',
    'PhoneNumber',
    'EmailAddress',
    'PrivacyPolicy',
    'MarketingPermission'
  ];

  const LOCAL_STORAGE_KEY = 'dpr_local_data';
  const SESSION_STORAGE_KEY = 'dpr_session_data';

  /**
   * Parse current URL query parameters into an object
   * @returns {Object} Key-value pairs of query parameters
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
   * Update URL query parameters using replaceState (no history entry)
   * @param {Object} params - Key-value pairs to set as query parameters
   */
  function updateQueryParams(params) {
    const url = new URL(window.location.href);

    // Clear existing tracked params
    TRACKED_FIELDS.forEach(field => {
      url.searchParams.delete(field);
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
   * Get the value of a form field by name
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
   * Set the value of a form field by name
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
   * Prefill form fields from URL query parameters
   * @param {HTMLFormElement} formEl - The form element
   */
  function prefillFormFromParams(formEl) {
    const params = getQueryParams();

    TRACKED_FIELDS.forEach(fieldName => {
      if (params[fieldName]) {
        setFieldValue(formEl, fieldName, params[fieldName]);
      }
    });
  }

  /**
   * Gather current values of all tracked fields and update URL
   * @param {HTMLFormElement} formEl - The form element
   */
  function syncParamsFromForm(formEl) {
    const params = {};

    TRACKED_FIELDS.forEach(fieldName => {
      const value = getFieldValue(formEl, fieldName);
      if (value) {
        params[fieldName] = value;
      }
    });

    updateQueryParams(params);
  }

  /**
   * Set up change listeners on tracked form fields
   * @param {HTMLFormElement} formEl - The form element
   */
  function setupChangeListeners(formEl) {
    TRACKED_FIELDS.forEach(fieldName => {
      const elements = formEl.elements[fieldName];

      if (!elements) return;

      // Handle radio buttons (NodeList)
      if (elements instanceof RadioNodeList) {
        for (const radio of elements) {
          radio.addEventListener('change', () => syncParamsFromForm(formEl));
        }
        return;
      }

      // Handle select, checkbox, text input
      const eventType = elements.type === 'text' ? 'input' : 'change';
      elements.addEventListener(eventType, () => syncParamsFromForm(formEl));
    });
  }

  /**
   * Save non-personal form data to localStorage
   * @param {HTMLFormElement} formEl - The form element
   */
  function saveToLocalStorage(formEl) {
    const data = {};

    LOCAL_STORAGE_FIELDS.forEach(fieldName => {
      const value = getFieldValue(formEl, fieldName);
      if (value !== null) {
        data[fieldName] = value;
      }
    });

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  }

  /**
   * Save personal form data to sessionStorage
   * @param {HTMLFormElement} formEl - The form element
   */
  function saveToSessionStorage(formEl) {
    const data = {};

    SESSION_STORAGE_FIELDS.forEach(fieldName => {
      const value = getFieldValue(formEl, fieldName);
      if (value !== null) {
        data[fieldName] = value;
      }
    });

    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Failed to save to sessionStorage:', e);
    }
  }

  /**
   * Handle form submission - save data and redirect
   * @param {HTMLFormElement} formEl - The form element
   */
  function setupFormSubmitHandler(formEl) {
    const submitBtn = formEl.querySelector('[data-dpr-quote="submitBtn"]');

    if (!submitBtn) {
      console.warn('Submit button with data-dpr-quote="submitBtn" not found');
      return;
    }

    submitBtn.addEventListener('click', (e) => {
      e.preventDefault();

      // Save non-personal data to localStorage (persistent)
      saveToLocalStorage(formEl);

      // Save personal data to sessionStorage (session-only)
      saveToSessionStorage(formEl);

      // Redirect to the configured URL
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        console.warn('No redirect URL configured');
      }
    });
  }

  // Initialize when Superform is ready
  window.SuperformAPI = window.SuperformAPI || [];
  window.SuperformAPI.push(({ getForm }) => {
    const dprQuoteForm = getForm('dprQuote');

    if (!dprQuoteForm) {
      console.warn('dprQuote form not found');
      return;
    }

    // Get the actual form element
    const formEl = dprQuoteForm.form;

    if (!formEl) {
      console.warn('Form element not found for dprQuote');
      return;
    }

    // Prefill form from URL params on load
    prefillFormFromParams(formEl);

    // Set up real-time sync from form to URL
    setupChangeListeners(formEl);

    // Set up form submission handler
    setupFormSubmitHandler(formEl);
  });
})();

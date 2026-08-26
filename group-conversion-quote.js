(function() {
  // ============================================================
  // GROUP CONVERSION QUOTE
  // ------------------------------------------------------------
  // Variant of dpr-quote.js for the GS+ transition flow.
  // The group-conversion results page redirects here when required
  // quote fields are missing, carrying any real values GS+ provided
  // as URL params (GS+ sends the full param set with a "Null"
  // sentinel for values it lacks; sentinels are stripped, never
  // prefilled). The form is prefilled from those params so the
  // member only fills the gaps — prefill dispatches real change
  // events, so Superform's own conditional step logic reacts as if
  // the member clicked. Select auto-advance (superform-auto-next.js)
  // is suppressed while hydrating via window._sfSuppressAutoNext.
  // firstName / hashedPlanMemberID are captured to sessionStorage
  // (covers GS+ deep-linking here directly; normally the results
  // page captured them already) and stripped from the address bar.
  // Everything else matches dpr-quote.js.
  // ============================================================

  // Redirect URL for form submission
  const redirectUrl = document.currentScript.getAttribute("data-url") || "";

  // Tracks whether the user clicked a "view all plans" element this page load
  let viewAll = false;

  // Member first name passed by GS+ (display-only, for [data-gc-first-name] spans)
  let gsFirstName = null;

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
   * Check if a value is the GS+ "no data" sentinel or otherwise empty.
   * GS+ sends the full param set with "Null" for values it doesn't
   * have; the exact casing is unconfirmed, so match case-insensitively.
   * @param {*} value - The value to check
   * @returns {boolean} True if the value carries no real data
   */
  function isNullSentinel(value) {
    if (value === null || value === undefined) return true;
    const s = String(value).trim().toLowerCase();
    return s === '' || s === 'null';
  }

  /**
   * Find a param value by case-insensitive key match.
   * GS+ specs disagree on param casing (hashedPlanMemberID vs
   * hashedPlanMemberId, CoverageType vs coverageTier), so all GS+
   * param lookups go through here.
   * @param {Object} params - Parsed query params
   * @param {string} name - Canonical param name
   * @returns {string|null} The param value or null
   */
  function findParamCaseInsensitive(params, name) {
    const key = Object.keys(params).find(
      k => k.toLowerCase() === name.toLowerCase()
    );
    return key !== undefined ? params[key] : null;
  }

  /**
   * Capture the GS+ params (hashedPlanMemberID, firstName) to
   * sessionStorage. Normally the results page captured them before
   * redirecting here; this covers GS+ deep-linking to the quote page
   * directly. On submit the results page reads them back from
   * sessionStorage via its existing fallbacks — they never travel on
   * the URL. firstName is display-only and never enters form fields.
   */
  // Longest name the greeting will render. Anything longer (bad data,
  // junk in the param) is cut so it can't blow the heading out of its
  // container.
  const FIRST_NAME_MAX_LENGTH = 40;

  /**
   * Trim and cap a first name for display.
   * @param {string|null} name - Raw name value
   * @returns {string|null} Cleaned name, or null when empty
   */
  function sanitizeFirstName(name) {
    if (!name) return null;
    const trimmed = String(name).trim();
    if (!trimmed) return null;
    return trimmed.length > FIRST_NAME_MAX_LENGTH
      ? trimmed.slice(0, FIRST_NAME_MAX_LENGTH).trimEnd() + '\u2026'
      : trimmed;
  }

  function captureGsPlusParams() {
    const params = getQueryParams();

    const pmid = findParamCaseInsensitive(params, 'hashedPlanMemberID');
    if (pmid && !isNullSentinel(pmid)) {
      try { sessionStorage.setItem('dpr_hashed_pmid', pmid); } catch (e) {}
    }

    const firstName = findParamCaseInsensitive(params, 'firstName');
    if (firstName && !isNullSentinel(firstName)) {
      gsFirstName = sanitizeFirstName(firstName);
      try { sessionStorage.setItem('dpr_gc_first_name', gsFirstName); } catch (e) {}
    } else {
      try { gsFirstName = sanitizeFirstName(sessionStorage.getItem('dpr_gc_first_name')); } catch (e) {}
    }
  }

  /**
   * Personalize [data-gc-first-name] spans. The span carries the comma
   * and space — headings are authored as
   * `Good News<span data-gc-first-name></span>!` and render
   * "Good News, Jane!" or plain "Good News!" when no name is available.
   * No-op if the page has no such spans.
   */
  function fillFirstNameSpans() {
    document.querySelectorAll('[data-gc-first-name]').forEach(el => {
      el.textContent = gsFirstName ? `, ${gsFirstName}` : '';
    });
  }

  /**
   * Clean the address bar after the GS+ params are captured: drop the
   * private params (firstName, hashedPlanMemberID — any casing) and any
   * param carrying the Null sentinel, and normalize tracked field keys
   * to their canonical casing (updateQueryParams only clears canonical
   * keys, so a lowercase GS+ variant would otherwise linger).
   */
  function stripAndNormalizeUrlParams() {
    const url = new URL(window.location.href);
    let changed = false;

    Array.from(url.searchParams.keys()).forEach(key => {
      const lower = key.toLowerCase();
      const value = url.searchParams.get(key);
      const canonical = TRACKED_FIELDS.find(f => f.toLowerCase() === lower);

      if (lower === 'hashedplanmemberid' || lower === 'firstname' || isNullSentinel(value)) {
        url.searchParams.delete(key);
        changed = true;
      } else if (canonical && canonical !== key) {
        url.searchParams.delete(key);
        url.searchParams.set(canonical, value);
        changed = true;
      }
    });

    if (changed) {
      window.history.replaceState({}, '', url.toString());
    }
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
   * Prefill form fields from URL query parameters.
   * Skips GS+ Null sentinels — a stripped Null is simply an unanswered
   * step the form asks about naturally. Select auto-advance is
   * suppressed while the prefill dispatches change events, so the
   * member lands on step 1 with everything preselected.
   * @param {HTMLFormElement} formEl - The form element
   */
  function prefillFormFromParams(formEl) {
    const params = getQueryParams();

    window._sfSuppressAutoNext = true;

    try {
      TRACKED_FIELDS.forEach(fieldName => {
        const value = findParamCaseInsensitive(params, fieldName);
        if (value && !isNullSentinel(value)) {
          setFieldValue(formEl, fieldName, value);
        }
      });
    } finally {
      window._sfSuppressAutoNext = false;
    }
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
    const submitBtns = formEl.querySelectorAll('[data-dpr-quote="submitBtn"]');

    if (!submitBtns.length) {
      console.warn('Submit button with data-dpr-quote="submitBtn" not found');
      return;
    }

    submitBtns.forEach(submitBtn => {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();

        // Save non-personal data to localStorage (persistent)
        saveToLocalStorage(formEl);

        // Save personal data to sessionStorage (session-only)
        saveToSessionStorage(formEl);

        // Redirect to the configured URL
        if (redirectUrl) {
          const finalUrl = viewAll
            ? redirectUrl + (redirectUrl.includes('?') ? '&' : '?') + 'plans=view-all'
            : redirectUrl;
          window.location.href = finalUrl;
        } else {
          console.warn('No redirect URL configured');
        }
      });
    });
  }

  /**
   * Set up click listeners on [data-dpr-redirect="all"] elements.
   * When any such element is clicked, the submit redirect will append plans=view-all.
   */
  function setupViewAllListeners() {
    document.querySelectorAll('[data-dpr-redirect="all"]').forEach(el => {
      el.addEventListener('click', () => {
        viewAll = true;
      });
    });
  }

  // Capture the GS+ params and clean the URL immediately (before
  // Superform init) so they are persisted even if Superform fails to load
  captureGsPlusParams();
  stripAndNormalizeUrlParams();

  // Personalize firstName spans once the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fillFirstNameSpans);
  } else {
    fillFirstNameSpans();
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

    // Set up view-all redirect listeners
    setupViewAllListeners();
  });
})();

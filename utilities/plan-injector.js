(function() {
  /*
   * ------------------------------------------------------------
   *  Plan Card Injector Utility
   * ------------------------------------------------------------
   *
   *  FEATURES:
   *    ✓ Clones plan cards from source container to target locations
   *    ✓ Preserves full interactivity (Apply buttons, hospital checkboxes)
   *    ✓ Re-wires all event handlers on cloned elements
   *    ✓ Coordinates with plan-card-display.js via CustomEvent
   *
   *  USAGE:
   *    Source container:
   *      <div dpr-plan-injector-source>
   *        <!-- Plan cards populated by plan-card-display.js -->
   *      </div>
   *
   *    Injection targets:
   *      <div dpr-plan-injector="LINK 1, LINK 2"></div>
   *      <div dpr-plan-injector="ZONE FUNDAMENTAL, ZONE 5"></div>
   *
   *  REQUIREMENTS:
   *    - plan-card-display.js must load first
   *    - Listens for 'plans-populated' CustomEvent
   *    - Same data-api-url attribute as plan-card-display.js
   *
   * ------------------------------------------------------------
   */

  // ============================================================
  // CONFIGURATION
  // ============================================================

  // Root API URL
  const rootApiURL = document.currentScript?.getAttribute("data-api-url") || "https://qagsd2cins.greenshield.ca";

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
      console.warn('[plan-injector] Failed to read from localStorage:', e);
      return null;
    }
  }

  // ============================================================
  // API FUNCTIONS
  // ============================================================

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
      console.warn('[plan-injector] Auto-linker decoration failed, using raw URL', err);
      return url;
    }
  }

  // ============================================================
  // EVENT HANDLER ATTACHMENT FUNCTIONS
  // ============================================================

  /**
   * Attach Apply button click handler to cloned button
   * @param {HTMLElement} button - The Apply button element
   * @param {string} confirmationNumber - Quote confirmation number
   */
  function attachApplyButtonHandler(button, confirmationNumber) {
    // Clone button to remove any existing listeners
    const newBtn = button.cloneNode(true);
    button.parentNode.replaceChild(newBtn, button);

    newBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const originalText = newBtn.textContent;
      newBtn.disabled = true;
      newBtn.textContent = 'Loading...';

      try {
        const url = await getApplicationUrl(confirmationNumber);
        const finalUrl = decorateWithGtmAutoLinker(url);

        // Short delay for GA hit to flush
        setTimeout(() => {
          window.location.assign(finalUrl);
        }, 200);
      } catch (err) {
        console.error('[plan-injector] Error getting application URL:', err);
        newBtn.textContent = 'Error – Try Again';
        newBtn.disabled = false;
      }
    });
  }

  /**
   * Attach hospital checkbox change handler to cloned checkbox
   * @param {HTMLElement} checkbox - The checkbox element
   * @param {HTMLElement} planItem - The plan card container
   * @param {Object} hospitalOption - Hospital option data from API
   */
  function attachHospitalCheckboxHandler(checkbox, planItem, hospitalOption) {
    // Clone checkbox to remove any existing listeners
    const newCheckbox = checkbox.cloneNode(true);
    checkbox.parentNode.replaceChild(newCheckbox, checkbox);

    newCheckbox.addEventListener('change', (e) => {
      const priceEl = planItem.querySelector('[dpr-results-price="price"]');

      if (!priceEl) {
        console.warn('[plan-injector] Price element not found for hospital checkbox');
        return;
      }

      // Get base premium from dataset
      const basePremium = parseFloat(planItem.dataset.basePremium);

      if (isNaN(basePremium)) {
        console.warn('[plan-injector] Invalid base premium in dataset');
        return;
      }

      // Calculate new total
      let newTotal = basePremium;
      if (e.target.checked) {
        newTotal += parseFloat(hospitalOption.OptionPremium);
      }

      // Update price display (whole numbers only, no cents)
      const displayPrice = Math.round(newTotal);
      priceEl.textContent = `$${displayPrice}`;
    });
  }

  // ============================================================
  // BUTTON VISIBILITY FUNCTIONS
  // ============================================================

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

  // ============================================================
  // CLONING & REWIRING FUNCTIONS
  // ============================================================

  /**
   * Re-wire all interactive elements on a cloned plan card
   * @param {HTMLElement} clonedCard - The cloned plan card element
   */
  function rewireInteractivity(clonedCard) {
    // Get Province to determine button visibility
    const localData = getLocalStorageData();
    const isQuebec = localData?.Province == 10;

    // Re-wire Apply button
    const applyBtn = clonedCard.querySelector('[dpr-results-apply="button"]');
    if (applyBtn && applyBtn.dataset.confirmation) {
      attachApplyButtonHandler(applyBtn, applyBtn.dataset.confirmation);
    }

    // Re-wire hospital checkbox
    const checkboxWrapper = clonedCard.querySelector('[dpr-quote-hospital="checkbox-wrapper"]');
    if (checkboxWrapper && checkboxWrapper.style.display !== 'none') {
      const checkbox = checkboxWrapper.querySelector('[dpr-quote-hospital="check-trigger"]');

      // Parse hospital option data from dataset
      let hospitalOption = null;
      try {
        hospitalOption = JSON.parse(clonedCard.dataset.hospitalOption || 'null');
      } catch (e) {
        console.warn('[plan-injector] Failed to parse hospital option data:', e);
      }

      if (checkbox && hospitalOption) {
        attachHospitalCheckboxHandler(checkbox, clonedCard, hospitalOption);
      }
    }

    // Clear tooltip initialization flags from cloned elements
    // This allows tooltip-system to re-initialize them
    const tooltipIcons = clonedCard.querySelectorAll('[data-tooltip="icon"]');
    tooltipIcons.forEach(icon => {
      delete icon.dataset.tooltipInitialized;
    });

    const accordionButtons = clonedCard.querySelectorAll('.gsi-tooltip-button');
    accordionButtons.forEach(button => {
      delete button.dataset.accordionInitialized;
    });

    // Re-initialize tooltips on cloned card using global TooltipSystem API
    // This follows the same direct re-wiring pattern as Apply buttons and hospital checkboxes
    if (window.TooltipSystem && window.TooltipSystem.initialize) {
      window.TooltipSystem.initialize(clonedCard);
      console.log('[plan-injector] Re-initialized tooltips on cloned card');
    }

    // Disable comparison checkbox (injected cards don't participate in comparison)
    const compareCheckbox = clonedCard.querySelector('[data-compare-trigger]');
    if (compareCheckbox) {
      compareCheckbox.disabled = true;
      compareCheckbox.style.opacity = '0.5';
    }

    // Set Quebec/non-Quebec button visibility
    setPlanButtonVisibility(clonedCard, isQuebec);
  }

  // ============================================================
  // INJECTION ORCHESTRATION
  // ============================================================

  /**
   * Inject specified plan cards into a target element
   * @param {HTMLElement} targetEl - The target element with dpr-plan-injector attribute
   * @param {HTMLElement} sourceContainer - The source container with plan cards
   */
  function injectPlansIntoTarget(targetEl, sourceContainer) {
    // Parse plan names from attribute
    const planNamesRaw = targetEl.getAttribute('dpr-plan-injector');

    if (!planNamesRaw) {
      console.warn('[plan-injector] Target has no dpr-plan-injector attribute');
      return;
    }

    // Clear existing content in target to prevent duplicates
    targetEl.innerHTML = '';

    // Split by comma, trim whitespace
    const planNames = planNamesRaw.split(',').map(name => name.trim());

    console.log(`[plan-injector] Injecting ${planNames.length} plan(s) into target`);

    planNames.forEach(planName => {
      // Find source plan card
      const sourcePlan = sourceContainer.querySelector(`[dpr-results-plan="${planName}"]`);

      if (!sourcePlan) {
        console.warn(`[plan-injector] Plan not found: ${planName}`);
        return;
      }

      // Deep clone the plan card (preserves all attributes and structure)
      const clonedPlan = sourcePlan.cloneNode(true);

      // Mark as injected to prevent plan-card-display.js from manipulating it
      clonedPlan.setAttribute('data-injected-plan', 'true');

      // Re-wire all interactive elements
      rewireInteractivity(clonedPlan);

      // Append to target
      targetEl.appendChild(clonedPlan);

      console.log(`[plan-injector] Injected plan: ${planName}`);
    });
  }

  /**
   * Process all injection targets on the page
   */
  function processAllInjections() {
    // Find source container
    const sourceContainer = document.querySelector('[dpr-plan-injector-source]');

    if (!sourceContainer) {
      console.warn('[plan-injector] Source container not found (dpr-plan-injector-source)');
      return;
    }

    // Find all injection targets (exclude source container)
    const targets = document.querySelectorAll('[dpr-plan-injector]:not([dpr-plan-injector-source])');

    if (targets.length === 0) {
      console.log('[plan-injector] No injection targets found');
      return;
    }

    console.log(`[plan-injector] Found ${targets.length} injection target(s)`);

    // Process each target
    targets.forEach(target => {
      injectPlansIntoTarget(target, sourceContainer);
    });

    console.log('[plan-injector] All injections complete');
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  /**
   * Initialize plan injector
   * Listens for 'plans-populated' event from plan-card-display.js
   */
  function initialize() {
    console.log('[plan-injector] Waiting for plans to be populated...');

    // Listen for plans-populated event from plan-card-display.js
    // Use { once: true } to prevent duplicate injections if event fires multiple times
    window.addEventListener('plans-populated', (event) => {
      console.log('[plan-injector] Plans populated, starting injection...', event.detail);
      processAllInjections();
    }, { once: true });
  }

  // Run initialization when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();

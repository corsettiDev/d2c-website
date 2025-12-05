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
   * @param {HTMLElement} block - The dynamic block containing this checkbox
   * @param {HTMLElement} planItem - The plan card container (for basePremium data)
   * @param {Object} hospitalOption - Hospital option data from API
   */
  function attachHospitalCheckboxHandler(checkbox, block, planItem, hospitalOption) {
    // Clone checkbox to remove any existing listeners
    const newCheckbox = checkbox.cloneNode(true);
    checkbox.parentNode.replaceChild(newCheckbox, checkbox);

    newCheckbox.addEventListener('change', (e) => {
      // Query price element from THIS block, not the whole card
      const priceEl = block.querySelector('[dpr-results-price="price"]');

      if (!priceEl) {
        console.warn('[plan-injector] Price element not found for hospital checkbox');
        return;
      }

      // Get base premium from planItem dataset (shared across all blocks)
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
  // TOOLTIP REWIRING FUNCTIONS
  // ============================================================

  /**
   * Re-wire tooltip components in a cloned card
   * Replicates the initialization logic from tooltip-system.js
   * @param {HTMLElement} clonedCard - The cloned plan card element
   */
  function rewireTooltips(clonedCard) {
    const tooltipComponents = clonedCard.querySelectorAll('[data-tooltip="component"]');

    tooltipComponents.forEach((component) => {
      const icon = component.querySelector('[data-tooltip="icon"]');
      const description = component.querySelector('[data-tooltip="description"]');
      const isStatic = component.getAttribute("data-tooltip-style") === "static";

      if (!icon || !description) return;

      // Close all other tooltips except this one
      const closeOthers = () => {
        // Query within the CLONED card only, not the entire page
        const allTooltipsInCard = clonedCard.querySelectorAll('[data-tooltip="description"]');
        allTooltipsInCard.forEach((otherDesc) => {
          if (otherDesc !== description) {
            otherDesc.style.display = "none";
          }
        });
      };

      // Clone icon to remove existing listeners
      const newIcon = icon.cloneNode(true);
      icon.parentNode.replaceChild(newIcon, icon);

      // Toggle this tooltip
      newIcon.addEventListener("click", (e) => {
        e.stopPropagation();

        const isOpen = description.style.display === "block";

        if (isOpen) {
          description.style.display = "none";
        } else {
          closeOthers();
          description.style.display = "block";
        }
      });

      // Close tooltip on outside click — ONLY for floating tooltips
      if (!isStatic) {
        document.addEventListener("click", (e) => {
          const clickedInside = component.contains(e.target);

          if (!clickedInside) {
            description.style.display = "none";
          }
        });
      }
    });

    console.log(`[plan-injector] Rewired ${tooltipComponents.length} tooltip component(s)`);
  }

  /**
   * Re-wire accordion tooltip components in a cloned card
   * Replicates the initialization logic from the inline accordion script
   * @param {HTMLElement} clonedCard - The cloned plan card element
   */
  function rewireAccordionTooltips(clonedCard) {
    const accordions = clonedCard.querySelectorAll(".gsi-faq_accordion-icon.cc-plans-cms-modal");

    // Helper function to open tooltip with animation
    function openTooltip(tooltip) {
      const isAlreadyOpen = tooltip.dataset.state === "open" || tooltip.dataset.state === "opening";
      if (isAlreadyOpen) return;

      tooltip.dataset.state = "opening";
      tooltip.style.overflow = "hidden";

      const hasMarginPadding = tooltip.querySelector(".gsi-modal-tooltip-padding.gsi-modal-margin-bottom");
      if (hasMarginPadding) {
        tooltip.style.marginBottom = "1rem";
      }

      tooltip.style.height = "auto";
      const targetHeight = tooltip.scrollHeight + "px";
      tooltip.style.height = "0px";
      tooltip.offsetHeight; // Force reflow
      tooltip.style.height = targetHeight;

      function onEnd(e) {
        if (e.propertyName !== "height") return;
        tooltip.removeEventListener("transitionend", onEnd);
        tooltip.style.height = "auto";
        tooltip.style.overflow = "";
        tooltip.dataset.state = "open";
      }

      tooltip.addEventListener("transitionend", onEnd);
    }

    // Helper function to close tooltip with animation
    function closeTooltip(tooltip) {
      const isOpen = tooltip.dataset.state === "open" || tooltip.dataset.state === "opening";
      if (!isOpen) return;

      tooltip.dataset.state = "closing";
      tooltip.style.overflow = "hidden";

      const hasMarginPadding = tooltip.querySelector(".gsi-modal-tooltip-padding.gsi-modal-margin-bottom");
      if (hasMarginPadding) {
        tooltip.style.marginBottom = "0";
      }

      const startHeight = tooltip.offsetHeight;
      tooltip.style.height = startHeight + "px";
      tooltip.offsetHeight; // Force reflow
      tooltip.style.height = "0px";

      function onEnd(e) {
        if (e.propertyName !== "height") return;
        tooltip.removeEventListener("transitionend", onEnd);
        tooltip.style.height = "0px";
        tooltip.dataset.state = "closed";
      }

      tooltip.addEventListener("transitionend", onEnd);
    }

    // Initialize each accordion
    accordions.forEach(function (accordion) {
      const wrappers = accordion.querySelectorAll(".tooltip-wrapper.gsi-tooltip");
      const tooltips = accordion.querySelectorAll(".gsi-modal-tooltip");

      wrappers.forEach(function (wrapper, index) {
        const button = wrapper.querySelector(".gsi-tooltip-button");
        const tooltip = tooltips[index];

        if (!button || !tooltip) return;

        // Set initial state
        tooltip.style.height = "0px";
        tooltip.style.marginBottom = "0";
        tooltip.dataset.state = "closed";

        // Clone button to remove existing listeners
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        // Attach click listener
        newButton.addEventListener("click", function (e) {
          e.stopPropagation();

          const isOpen = tooltip.dataset.state === "open" || tooltip.dataset.state === "opening";

          if (isOpen) {
            closeTooltip(tooltip);
            newButton.setAttribute("aria-expanded", "false");
          } else {
            openTooltip(tooltip);
            newButton.setAttribute("aria-expanded", "true");
          }
        });
      });
    });

    console.log(`[plan-injector] Rewired ${accordions.length} accordion tooltip(s)`);
  }

  // ============================================================
  // BUTTON VISIBILITY FUNCTIONS
  // ============================================================

  /**
   * Show/hide plan buttons based on Province value
   * @param {HTMLElement} block - The dynamic block or plan container element
   * @param {boolean} isQuebec - Whether Province is 10 (Quebec)
   */
  function setPlanButtonVisibility(block, isQuebec) {
    const applyBtn = block.querySelector('[dpr-results-apply="button"]');
    const quebecBtn = block.querySelector('[dpr-results-quebec="call"]');

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

    // Find all dynamic blocks or fall back to clonedCard
    const dynamicBlocks = clonedCard.querySelectorAll('[data-results="dynamic-block"]');
    const blocksToProcess = dynamicBlocks.length > 0 ? Array.from(dynamicBlocks) : [clonedCard];

    // Iterate over each block
    blocksToProcess.forEach(block => {
      // Re-wire Apply button (query WITHIN this block)
      const applyBtn = block.querySelector('[dpr-results-apply="button"]');
      if (applyBtn && applyBtn.dataset.confirmation) {
        attachApplyButtonHandler(applyBtn, applyBtn.dataset.confirmation);
      }

      // Re-wire hospital checkbox (query WITHIN this block)
      const checkboxWrapper = block.querySelector('[dpr-quote-hospital="checkbox-wrapper"]');
      if (checkboxWrapper && checkboxWrapper.style.display !== 'none') {
        const checkbox = checkboxWrapper.querySelector('[dpr-quote-hospital="check-trigger"]');

        // Parse hospital option data from dataset (stored on clonedCard, not block)
        let hospitalOption = null;
        try {
          hospitalOption = JSON.parse(clonedCard.dataset.hospitalOption || 'null');
        } catch (e) {
          console.warn('[plan-injector] Failed to parse hospital option data:', e);
        }

        if (checkbox && hospitalOption) {
          attachHospitalCheckboxHandler(checkbox, block, clonedCard, hospitalOption);
        }
      }

      // Set Quebec/non-Quebec button visibility (for THIS block)
      setPlanButtonVisibility(block, isQuebec);
    });

    // Disable comparison checkbox (only once per card, not per block)
    const compareCheckbox = clonedCard.querySelector('[data-compare-trigger]');
    if (compareCheckbox) {
      compareCheckbox.disabled = true;
      compareCheckbox.style.opacity = '0.5';
    }

    // Re-wire simple tooltips
    rewireTooltips(clonedCard);

    // Re-wire accordion tooltips
    rewireAccordionTooltips(clonedCard);
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

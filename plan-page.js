// Individual Plan Page Handler
(() => {
  console.log("Individual plan page script loaded");

  // ============================================================
  // GLOBAL CONFIGURATION
  // ============================================================

  // Root API URL
  const rootApiURL = document.currentScript.getAttribute("data-api-url") ||
    "https://qagsd2cins.greenshield.ca";

  // Hospital accommodation text prefix
  const hospitalAccommodationText = document.currentScript.getAttribute("data-hospital-text") ||
    "Add optional hospital accommodation for $";

  // ============================================================
  // STORAGE HELPER FUNCTIONS
  // ============================================================

  /**
   * Retrieve results data from sessionStorage
   * @returns {Object|null} Parsed results data or null
   */
  function getResultsData() {
    try {
      const raw = sessionStorage.getItem('dpr_results_data');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to read results data:', e);
      return null;
    }
  }

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

  // ============================================================
  // PLAN DATA RETRIEVAL
  // ============================================================

  /**
   * Get the current plan name from the page
   * @returns {string|null} Plan name or null if not found
   */
  function getCurrentPlanName() {
    const planElement = document.querySelector("[data-plan-page-name]");
    return planElement ? planElement.getAttribute("data-plan-page-name") : null;
  }

  /**
   * Get plan data for a specific plan name from dpr_results_data
   * @param {string} planName - The plan name to find
   * @returns {Object|null} Plan quote object or null if not found
   */
  function getPlanData(planName) {
    const resultsData = getResultsData();

    if (!resultsData) {
      console.warn('No results data found in sessionStorage');
      return null;
    }

    const planQuotes = resultsData.results?.PlanQuotes || [];

    if (planQuotes.length === 0) {
      console.warn('No plan quotes available in results data');
      return null;
    }

    const matchingPlan = planQuotes.find(plan => plan.PlanName === planName);

    if (!matchingPlan) {
      console.warn(`No matching plan found for: ${planName}`);
      return null;
    }

    return matchingPlan;
  }

  // ============================================================
  // PROVINCE CHECK (QUEBEC HANDLING)
  // ============================================================

  /**
   * Check if user is in Quebec province
   * @returns {boolean} True if Province is 10 (Quebec)
   */
  function isQuebec() {
    const localData = getLocalStorageData();
    const province = localData?.Province;
    return province == 10; // Use == to handle string/number comparison
  }

  /**
   * Show/hide apply button based on Quebec province
   * @param {boolean} isQuebecProvince - Whether user is in Quebec
   */
  function setPlanButtonVisibility(isQuebecProvince) {
    const applyBtnWrapper = document.querySelector('[data-plan-page="applyBtnWrapper"]');
    const applyBtn = document.querySelector('[data-plan-page="applyBtn"]');

    if (isQuebecProvince) {
      // Quebec: hide apply button
      if (applyBtnWrapper) applyBtnWrapper.style.display = 'none';
      if (applyBtn) applyBtn.style.display = 'none';

      // Show Quebec call button if HTML element exists
      const quebecBtn = document.querySelector('[data-plan-page="quebecCall"]');
      if (quebecBtn) quebecBtn.style.display = 'block';

      console.log('Quebec province detected - hiding apply button');
    } else {
      // Other provinces: show apply button
      if (applyBtnWrapper) applyBtnWrapper.classList.remove('hide');
      if (applyBtn) applyBtn.style.display = 'flex';

      const quebecBtn = document.querySelector('[data-plan-page="quebecCall"]');
      if (quebecBtn) quebecBtn.style.display = 'none';
    }
  }

  // ============================================================
  // APPLY BUTTON SETUP
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
      console.warn('Auto-linker decoration failed, using raw URL', err);
      return url;
    }
  }

  /**
   * Setup the apply button with API call functionality
   * @param {string} confirmationNumber - Quote confirmation number
   */
  function setupApplyButton(confirmationNumber) {
    const applyBtn = document.querySelector('[data-plan-page="applyBtn"]');
    if (!applyBtn) {
      console.warn("Apply button not found");
      return;
    }

    // Clone button to remove existing event listeners
    const newBtn = applyBtn.cloneNode(true);
    applyBtn.parentNode.replaceChild(newBtn, applyBtn);

    // Store confirmation number
    newBtn.dataset.confirmation = confirmationNumber;

    // Add click handler
    newBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      const originalText = newBtn.textContent;
      newBtn.disabled = true;
      newBtn.textContent = "Loading...";

      try {
        const url = await getApplicationUrl(confirmationNumber);
        const finalUrl = decorateWithGtmAutoLinker(url);

        // Short delay for GA hit to flush
        setTimeout(() => {
          window.location.assign(finalUrl);
        }, 200);
      } catch (error) {
        console.error("Error getting application URL:", error);
        newBtn.textContent = "Error – Try Again";
        newBtn.disabled = false;

        // Reset button text after a delay
        setTimeout(() => {
          newBtn.textContent = originalText;
        }, 3000);
      }
    });
  }

  // ============================================================
  // HOSPITAL ACCOMMODATION (OPTIONAL FEATURE)
  // ============================================================

  /**
   * Setup hospital accommodation checkbox if available
   * @param {Object} planData - The plan quote data
   * @param {HTMLElement} priceWrapper - The price display element
   */
  function setupHospitalAccommodation(planData, priceWrapper) {
    const checkboxWrapper = document.querySelector('[data-plan-page="hospitalCheckbox"]');

    // Gracefully skip if HTML elements don't exist
    if (!checkboxWrapper) {
      console.log('No hospital checkbox element found - skipping hospital accommodation feature');
      return;
    }

    // Check if this plan has hospital accommodation option
    const hospitalOption = planData.QuoteOptions?.find(
      option => option.OptionName === 'Hospital Accommodation'
    );

    if (!hospitalOption) {
      checkboxWrapper.style.display = 'none';
      return;
    }

    // Show checkbox UI
    checkboxWrapper.style.display = 'block';

    // Populate text
    const textLine = checkboxWrapper.querySelector('[data-plan-page="hospitalText"]');
    if (textLine) {
      const price = Math.round(parseFloat(hospitalOption.OptionPremium));
      textLine.textContent = `${hospitalAccommodationText}${price}`;
    }

    // Wire up checkbox
    const checkbox = checkboxWrapper.querySelector('[data-plan-page="hospitalToggle"]');
    if (checkbox) {
      checkbox.checked = false;

      // Remove existing listeners
      const newCheckbox = checkbox.cloneNode(true);
      checkbox.parentNode.replaceChild(newCheckbox, checkbox);

      // Store base premium for calculations
      const basePremium = parseFloat(planData.Premium);

      newCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        let newTotal = basePremium;

        if (isChecked) {
          newTotal += parseFloat(hospitalOption.OptionPremium);
        }

        const displayPrice = Math.round(newTotal);
        priceWrapper.textContent = `$${displayPrice}`;

        console.log(`Hospital accommodation ${isChecked ? 'added' : 'removed'}. New total: $${displayPrice}`);
      });
    }
  }

  // ============================================================
  // MAIN POPULATION FUNCTION
  // ============================================================

  /**
   * Main function to populate plan page data
   */
  function populatePlanPage() {
    console.log('Starting plan page population...');

    // Step 1: Get current plan name from page
    const currentPlanName = getCurrentPlanName();
    if (!currentPlanName) {
      console.warn("No plan name found on this page");
      return;
    }

    console.log(`Processing individual plan page for: ${currentPlanName}`);

    // Step 2: Get plan data from dpr_results_data
    const planData = getPlanData(currentPlanName);
    if (!planData) {
      console.error("No matching plan found in results data");
      return;
    }

    console.log("Found matching plan:", planData);

    // Step 3: Get DOM elements
    const quoteWrapper = document.querySelector('[data-plan-page="quoteWrapper"]');
    const priceWrapper = document.querySelector('[data-plan-page="priceWrapper"]');
    const applyBtnWrapper = document.querySelector('[data-plan-page="applyBtnWrapper"]');

    if (!priceWrapper) {
      console.error("Required plan page elements not found");
      return;
    }

    // Step 4: Show quote section
    if (quoteWrapper) {
      quoteWrapper.classList.remove("hide");
    }

    // Step 5: Set the price
    const price = Math.round(parseFloat(planData.Premium));
    priceWrapper.textContent = `$${price}`;

    // Step 6: Check Province and set button visibility
    const quebec = isQuebec();

    if (quebec) {
      console.log('Quebec province - apply button hidden');
      setPlanButtonVisibility(true);
    } else {
      // Show apply button wrapper
      if (applyBtnWrapper) {
        applyBtnWrapper.classList.remove("hide");
      }

      setPlanButtonVisibility(false);

      // Setup the apply button
      setupApplyButton(planData.ConfirmationNumber);
    }

    // Step 7: Setup hospital accommodation (if available in HTML)
    setupHospitalAccommodation(planData, priceWrapper);

    console.log(
      `Plan page populated successfully for ${currentPlanName} - $${price}`
    );
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", populatePlanPage);
  } else {
    // DOM is already ready
    populatePlanPage();
  }

  // Also try after a short delay to ensure other scripts have loaded
  setTimeout(populatePlanPage, 100);
})();

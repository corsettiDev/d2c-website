// Individual Plan Page Handler
(() => {
  console.log("Individual plan page script loaded");

  // Get the current plan name from the page
  function getCurrentPlanName() {
    const planElement = document.querySelector("[data-plan-page-name]");
    return planElement ? planElement.getAttribute("data-plan-page-name") : null;
  }

  // Setup the apply button with API call functionality
  function setupApplyButton(confirmationNumber) {
    const applyBtn = document.querySelector('[data-plan-page="applyBtn"]');
    if (!applyBtn) {
      console.warn("Apply button not found");
      return;
    }

    // Store confirmation number for later use
    applyBtn.dataset.confirmation = confirmationNumber;

    // Clone button to remove existing event listeners
    const newBtn = applyBtn.cloneNode(true);
    applyBtn.parentNode.replaceChild(newBtn, applyBtn);

    // Add click handler
    newBtn.addEventListener("click", async (e) => {
      e.preventDefault();

      const originalText = newBtn.textContent;
      newBtn.disabled = true;
      newBtn.textContent = "Loading...";

      try {
        const response = await fetch(
          `https://greenshield-prod.corsetti.dev/applicationUrl/${confirmationNumber}`,
        );

        if (!response.ok) {
          throw new Error(`Network error: ${response.status}`);
        }

        const rawData = await response.text();
        let applicationUrl;

        try {
          // Try to parse as JSON first
          applicationUrl = JSON.parse(rawData).ApplicationUrl;
        } catch {
          // If not JSON, use raw text as URL
          applicationUrl = rawData;
        }

        if (applicationUrl && applicationUrl.startsWith("http")) {
          window.location.href = applicationUrl;
        } else {
          throw new Error("Invalid URL received");
        }
      } catch (error) {
        console.error("Error getting application URL:", error);
        newBtn.textContent = "Error – Try Again";
        newBtn.disabled = false;
        showError("Unable to get application URL. Please try again.");

        // Reset button text after a delay
        setTimeout(() => {
          newBtn.textContent = originalText;
        }, 3000);
      }
    });
  }

  // Main function to populate plan page data
  function populatePlanPage() {
    // Check if QuoteHelpers is available
    if (
      !window.QuoteHelpers ||
      typeof window.QuoteHelpers.getPlanQuotes !== "function"
    ) {
      console.warn(
        "QuoteHelpers not available. Make sure the main quote script is loaded first.",
      );
      return;
    }

    const currentPlanName = getCurrentPlanName();
    if (!currentPlanName) {
      console.warn("No plan name found on this page");
      return;
    }

    console.log(`Processing individual plan page for: ${currentPlanName}`);

    // Get plan quotes from session storage
    const planQuotes = window.QuoteHelpers.getPlanQuotes();
    if (!planQuotes || planQuotes.length === 0) {
      console.log("No plan quotes available in session storage");
      return;
    }

    // Find matching plan
    const matchingPlan = planQuotes.find(
      (plan) => plan.PlanName === currentPlanName,
    );
    if (!matchingPlan) {
      console.warn(`No matching plan found for: ${currentPlanName}`);
      return;
    }

    console.log("Found matching plan:", matchingPlan);

    // Get DOM elements
    const quoteWrapper = document.querySelector(
      '[data-plan-page="quoteWrapper"]',
    );
    const priceWrapper = document.querySelector(
      '[data-plan-page="priceWrapper"]',
    );
    const applyBtnWrapper = document.querySelector(
      '[data-plan-page="applyBtnWrapper"]',
    );

    if (!quoteWrapper || !priceWrapper || !applyBtnWrapper) {
      console.error("Required plan page elements not found");
      return;
    }

    // Show quote and apply button sections
    quoteWrapper.classList.remove("hide");
    applyBtnWrapper.classList.remove("hide");

    // Set the price
    priceWrapper.textContent = `$${matchingPlan.Premium}`;

    // Setup the apply button
    setupApplyButton(matchingPlan.ConfirmationNumber);

    console.log(
      `Plan page populated successfully for ${currentPlanName} - $${matchingPlan.Premium}`,
    );
  }

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

console.log("get-quotes script loaded");
// shared-quote.js
(() => {
  const FORM_DATA_KEY = "quoteFormData";
  const RESPONSE_DATA_KEY = "quoteResponseData";

  // ❶ New helper: show the Quebec banner if Province === 10
  function toggleQuebecBanner() {
    const raw = sessionStorage.getItem(FORM_DATA_KEY);
    const banner = document.querySelector('[data-form-effect="quebecBanner"]');
    if (!banner) return;

    if (!raw) {
      // No form data at all → keep banner hidden
      banner.classList.add("hide");
      return;
    }

    try {
      const data = JSON.parse(raw);
      if (data.Province === "10") {
        banner.classList.remove("hide");
      } else {
        banner.classList.add("hide");
      }
    } catch (e) {
      // If parsing fails, hide banner
      banner.classList.add("hide");
      console.error("Could not parse quoteFormData for Quebec banner:", e);
    }
  }

  // Detect Plan-Explorer page
  function isPlanExplorer() {
    return window.location.pathname.includes("plancomparison");
  }

  // Build payload from FormData
  function buildPayload(formData) {
    // Attribution Data
    let attributionData = {};
    try {
      const rawAttribution = localStorage.getItem("visitor_attribution");
      attributionData = rawAttribution ? JSON.parse(rawAttribution) : {};
    } catch (e) {
      attributionData = {};
    }

    return {
      CoverageType: Number(formData.get("CoverageType")),
      Province: Number(formData.get("Province")),
      Age: Number(formData.get("Age")),
      Dependents: Number(formData.get("Dependents") || 0),
      LeftGroupHealthPlan: formData.has("LeftGroupHealthPlan"),
      CoverOption: Number(formData.get("CoverOption") || 0),
      Prescription: formData.has("Prescription"),
      EmailAddress: formData.get("EmailAddress") || null,
      PhoneNumber: formData.get("PhoneNumber") || null,
      PhoneExtension: formData.get("PhoneExtension") || null,
      MarketingPermission: formData.get("MarketingPermission") || false,
      // Additions for Jotform
      FirstName: formData.get("FirstName") || null,
      LastName: formData.get("LastName") || null,
      InsuranceReason: formData.has("InsuranceReason")
        ? Number(formData.get("InsuranceReason"))
        : null,
      // Tracking data from attributionData
      gclid: attributionData.gclid || null,
      fbclid: attributionData.fbclid || null,
      utm_source: attributionData.utm_source || null,
      utm_medium: attributionData.utm_medium || null,
      utm_term: attributionData.utm_term || null,
      utm_content: attributionData.utm_content || null,
      referrer: attributionData.referrer || null,
      ga_client_id: attributionData.ga_client_id || null,
      landing_page: attributionData.landing_page || null,
      user_agent: attributionData.user_agent || null,
      language: attributionData.language || null,
    };
  }

  // Call quote API - now returns the full response object
  async function fetchQuotes(payload) {
    try {
      const res = await fetch("https://qagsd2cins.greenshield.ca/quoteset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("API Error:", errorText);
        throw new Error(`Quote API failed with status: ${res.status}`);
      }

      const json = await res.json();
      // Return the entire response object instead of just PlanQuotes
      return json;
    } catch (error) {
      console.error("Fetch error:", error);
      throw error;
    }
  }

  // Helper function to get stored quote response
  function getStoredQuoteResponse() {
    const raw = sessionStorage.getItem(RESPONSE_DATA_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error("Error parsing stored quote response:", err);
      sessionStorage.removeItem(RESPONSE_DATA_KEY);
      return null;
    }
  }

  // Helper function to get QuoteSetId from stored response
  function getQuoteSetId() {
    const response = getStoredQuoteResponse();
    return response?.QuoteSetId || null;
  }

  // Helper function to get PlanQuotes from stored response
  function getPlanQuotes() {
    const response = getStoredQuoteResponse();
    return response?.PlanQuotes || [];
  }

  // Show user-facing error message
  function showError(message) {
    let errorElement = document.querySelector("[data-quote-error]");
    if (!errorElement) {
      errorElement = document.createElement("div");
      errorElement.setAttribute("data-quote-error", "");
      errorElement.className = "quote-error-message";

      const insertTarget =
        document.querySelector('[data-form="quoteset"]') ||
        document.querySelector('[data-quote-fill="chart-container"]');
      if (insertTarget) {
        insertTarget.parentNode.insertBefore(
          errorElement,
          insertTarget.nextSibling,
        );
      }
    }

    errorElement.textContent = message;
    errorElement.style.display = "block";

    setTimeout(() => {
      errorElement.style.display = "none";
    }, 5000);
  }

  // Reset the chart to hide all price data and buttons
  function resetChart() {
    const parentCells = Array.from(
      document.querySelectorAll('[data-quote-fill="parent-cell"]'),
    );

    parentCells.forEach((cell) => {
      cell
        .querySelector('[data-quote-fill="price-wrapper"]')
        ?.classList.add("hide");
      cell
        .querySelector('[data-quote-fill="hospital-stay"]')
        ?.classList.add("hide");

      const btn = cell.querySelector('[data-quote-fill="button"]');
      if (btn) {
        btn.classList.add("hide");
        btn.disabled = false;
        btn.textContent = "Apply Now";
        delete btn.dataset.confirmation;
      }
    });
  }

  // Fill the plan chart and attach the "Apply Now" button handler
  function fillChart(quoteResponse) {
    resetChart();

    // Extract PlanQuotes from the full response
    const quotes = quoteResponse?.PlanQuotes || [];

    const parentCells = Array.from(
      document.querySelectorAll('[data-quote-fill="parent-cell"]'),
    );

    if (!quotes || quotes.length === 0) {
      showError(
        "No quote data available. Please try submitting the form again.",
      );
      return;
    }

    if (parentCells.length === 0) {
      console.error("No plan cells found to populate");
      return;
    }

    quotes.forEach((quote) => {
      const cell = parentCells.find((c) => {
        const nameEl = c.querySelector('[data-quote-fill="plan-name"]');
        return nameEl?.textContent.trim() === quote.PlanName;
      });

      if (!cell) {
        console.warn(`No matching cell found for plan: ${quote.PlanName}`);
        return;
      }

      // Show price & hospital-stay
      const priceEl = cell.querySelector('[data-quote-fill="price"]');
      if (priceEl) {
        priceEl.textContent = `$${quote.Premium}`;
        cell
          .querySelector('[data-quote-fill="price-wrapper"]')
          ?.classList.remove("hide");
      }

      // NEW: Update the data-original-price attribute for hospital accommodation calculations
      const comparePlanElement = document.querySelector(
        `[data-compare-plan="${quote.PlanName}"]`,
      );
      if (comparePlanElement) {
        const hospitalPriceElement = comparePlanElement.querySelector(
          '[data-hospital="price-target"]',
        );
        if (hospitalPriceElement) {
          // Update the stored original price to the new base premium
          hospitalPriceElement.setAttribute(
            "data-original-price",
            quote.Premium,
          );

          // Reset the displayed price to base premium (unchecked state)
          hospitalPriceElement.textContent = `$${quote.Premium}`;

          // Reset the hospital checkbox to unchecked
          const hospitalCheckbox = comparePlanElement.querySelector(
            '[data-hospital="check-trigger"]',
          );
          if (hospitalCheckbox) {
            hospitalCheckbox.checked = false;
          }
        }
      }

      // Check if hospital accommodation option is available for this plan
      const hospitalOption =
        quote.QuoteOptions &&
        Array.isArray(quote.QuoteOptions) &&
        quote.QuoteOptions.find(
          (option) => option.OptionName === "Hospital Accommodation",
        );

      const hospitalStayElement = cell.querySelector(
        '[data-quote-fill="hospital-stay"]',
      );

      if (hospitalOption && hospitalStayElement) {
        // Show hospital stay option if it's available for this plan
        hospitalStayElement.classList.remove("hide");

        // Update the text line with dynamic pricing
        const textLineElement = hospitalStayElement.querySelector(
          '[data-hospital="text-line"]',
        );
        if (textLineElement && hospitalOption.OptionPremium) {
          textLineElement.textContent = `Add optional hospital accommodation for $${hospitalOption.OptionPremium}`;
        }
      } else if (hospitalStayElement) {
        // Hide hospital stay option if it's not available for this plan
        hospitalStayElement.classList.add("hide");
      }

      // Wire up the "Apply Now" button
      const btn = cell.querySelector('[data-quote-fill="button"]');
      if (btn) {
        btn.dataset.confirmation = quote.ConfirmationNumber;
        btn.classList.remove("hide");

        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          newBtn.disabled = true;
          newBtn.textContent = "Loading...";

          try {
            const res = await fetch(
              `https://qagsd2cins.greenshield.ca/applicationUrl/${newBtn.dataset.confirmation}`,
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

            if (url && url.startsWith("http")) {
              // Try to decorate, fallback to raw if GTM/gtag is blocked
              const finalUrl = decorateWithGtmAutoLinker(url);

              // Optional: short delay so GA hit can flush
              setTimeout(() => {
                window.location.assign(finalUrl);
              }, 200);
            } else {
              throw new Error("Invalid URL received");
            }
          } catch (err) {
            console.error(err);
            newBtn.textContent = "Error – Try Again";
            newBtn.disabled = false;
            if (typeof showError === "function") {
              showError("Unable to get application URL. Please try again.");
            }
          }
        });
      }
    });

    // After the chart is populated, show the banner if Province === 10
    toggleQuebecBanner();
  }
  // Helper function to decorate URLs with GTM auto-linker
  function decorateWithGtmAutoLinker(url) {
    try {
      if (typeof gtag === "undefined") {
        // gtag not available → skip decoration
        return url;
      }

      const a = document.createElement("a");
      a.href = url;
      a.style.position = "absolute";
      a.style.left = "-9999px";
      document.body.appendChild(a);

      // Trigger the same event GTM listens for
      a.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      const decorated = a.href;
      a.remove();
      return decorated || url;
    } catch (err) {
      console.warn("Auto-linker decoration failed, using raw URL", err);
      return url;
    }
  }

  // Save form data to sessionStorage and sync all forms on the page
  function saveFormData(form) {
    const formData = new FormData(form);
    const data = {};

    Array.from(form.elements).forEach((input) => {
      const name = input.name;
      if (!name) return;

      if (input.type === "checkbox" || input.type === "radio") {
        if (input.checked) {
          data[name] = input.type === "checkbox" ? true : input.value;
        }
      } else if (input.value) {
        data[name] = input.value;
      }
    });

    sessionStorage.setItem(FORM_DATA_KEY, JSON.stringify(data));

    toggleQuebecBanner();

    syncAllForms(form);
    return buildPayload(formData);
  }

  // Sync all other forms on the page with the latest data
  function syncAllForms(excludeForm = null) {
    const forms = document.querySelectorAll('[data-form="quoteset"]');
    const raw = sessionStorage.getItem(FORM_DATA_KEY);
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      forms.forEach((form) => {
        if (form === excludeForm) return;
        console.log("Syncing form with latest data");

        Array.from(form.elements).forEach((input) => {
          const name = input.name;
          if (!name || !(name in data)) return;

          if (input.type === "checkbox") {
            input.checked = !!data[name];
          } else if (input.type === "radio") {
            input.checked = input.value == data[name];
          } else {
            input.value = data[name] || "";
          }
        });
      });
    } catch (err) {
      console.error("Error syncing forms:", err);
    }
  }

  // Prefill form inputs from sessionStorage
  function prefillForm(form) {
    const raw = sessionStorage.getItem(FORM_DATA_KEY);
    if (!raw) {
      console.log("No form data found in sessionStorage to prefill");
      return;
    }

    try {
      console.log("Prefilling form with data:", raw);
      const data = JSON.parse(raw);

      Array.from(form.elements).forEach((input) => {
        const name = input.name;
        if (!name || !(name in data)) return;

        console.log(
          `Processing input: ${name}, type: ${input.type}, stored value:`,
          data[name],
        );

        if (input.type === "checkbox") {
          input.checked = !!data[name];
          console.log(`Set checkbox ${name} to ${input.checked}`);
        } else if (input.type === "radio") {
          input.checked = input.value == data[name];
          console.log(`Set radio ${name}[${input.value}] to ${input.checked}`);
        } else {
          input.value = data[name] || "";
          console.log(`Set input ${name} to ${input.value}`);
        }
      });
    } catch (err) {
      console.error("Error prefilling form:", err);
      sessionStorage.removeItem(FORM_DATA_KEY);
    }
  }

  // Core submit logic (save inputs, fetch, save response & render or redirect)
  async function handleSubmitLogic(form) {
    const submitBtn = form.querySelector('[data-form="submit-button"]');
    const originalBtnText = submitBtn ? submitBtn.value : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.value = "Processing...";
    }

    try {
      const payload = saveFormData(form);
      const quoteResponse = await fetchQuotes(payload);
      // Store the entire response object instead of just PlanQuotes
      sessionStorage.setItem(RESPONSE_DATA_KEY, JSON.stringify(quoteResponse));

      if (isPlanExplorer()) {
        fillChart(quoteResponse);

        // Scroll to chart
        const chartElement = document.querySelector(
          '[data-quote-fill="chart-container"]',
        );
        if (chartElement) {
          chartElement.scrollIntoView({ behavior: "smooth" });
        }

        // Close the specific modal this form belongs to
        let modalElement = form.closest('[data-form="modal"]');
        if (modalElement) {
          const closeBtn = modalElement.querySelector(
            '[data-form="modal-close"]',
          );
          if (closeBtn) {
            console.log("Closing modal for the submitted form");
            closeBtn.click();
          }
        }
      } else {
        window.location.href = "/personal/plancomparison";
        // window.location.href = "/personal-new/plancomparison";
      }
    } catch (err) {
      console.error("Error during quote fetch:", err);
      showError("Unable to retrieve quotes. Please try again later.");

      toggleQuebecBanner();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.value = originalBtnText;
      }
    }
  }

  // Check if session storage is available
  function isStorageAvailable() {
    try {
      const test = "test";
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch (e) {
      console.error("SessionStorage not available:", e);
      return false;
    }
  }

  // Bootstrap on DOM ready
  document.addEventListener("DOMContentLoaded", () => {
    if (!isStorageAvailable()) {
      console.warn(
        "SessionStorage is not available. Quote persistence will not work.",
      );
      return;
    }

    toggleQuebecBanner();

    // 1) Process all quote forms on the page
    const forms = document.querySelectorAll('[data-form="quoteset"]');
    console.log(`Found ${forms.length} quote forms on the page`);

    forms.forEach((form, index) => {
      console.log(`Processing form #${index + 1}`);

      prefillForm(form);

      // Clone and replace to remove existing listeners
      const newForm = form.cloneNode(true);
      form.parentNode.replaceChild(newForm, form);

      // Prefill the cloned form as well
      prefillForm(newForm);

      newForm.addEventListener("submit", (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        handleSubmitLogic(newForm);
        return false;
      });
    });

    // 2) On Plan-Explorer page: render saved response or fetch fresh, then show banner
    if (isPlanExplorer()) {
      const storedResponse = getStoredQuoteResponse();
      if (storedResponse) {
        fillChart(storedResponse);
        toggleQuebecBanner();
      } else {
        const rawPayload = sessionStorage.getItem(FORM_DATA_KEY);
        if (rawPayload) {
          try {
            const loadingIndicator = document.createElement("div");
            loadingIndicator.textContent = "Loading quotes...";
            loadingIndicator.className = "quote-loading-indicator";

            const chartContainer = document.querySelector(
              '[data-quote-fill="chart-container"]',
            );
            if (chartContainer) {
              chartContainer.appendChild(loadingIndicator);
            }

            fetchQuotes(JSON.parse(rawPayload))
              .then((quoteResponse) => {
                sessionStorage.setItem(
                  RESPONSE_DATA_KEY,
                  JSON.stringify(quoteResponse),
                );
                fillChart(quoteResponse);
                toggleQuebecBanner();
              })
              .catch((err) => {
                console.error(err);
                showError(
                  "Unable to load quotes. Please try submitting the form again.",
                );
              })
              .finally(() => {
                loadingIndicator.remove();
              });
          } catch (err) {
            console.error("Error with stored form data:", err);
            sessionStorage.removeItem(FORM_DATA_KEY);
          }
        }
      }
    }
  });

  // Export helper functions for external use if needed
  window.QuoteHelpers = {
    getQuoteSetId,
    getPlanQuotes,
    getStoredQuoteResponse,
  };
})();

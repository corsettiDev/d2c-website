(function() {
  /**
   * Initialize simple tooltips
   * @param {HTMLElement} root - Root element to search within (defaults to document)
   */
  const initialize = (root = document) => {
    const components = root.querySelectorAll('[data-tooltip="component"]');

    components.forEach((component) => {
      const icon = component.querySelector('[data-tooltip="icon"]');
      const description = component.querySelector(
        '[data-tooltip="description"]',
      );
      const isStatic =
        component.getAttribute("data-tooltip-style") === "static";

      // Skip if already initialized
      if (icon && icon.dataset.tooltipInitialized === "true") return;

      // Close all other tooltips except this one
      const closeOthers = () => {
        components.forEach((otherComp) => {
          if (otherComp !== component) {
            const otherDesc = otherComp.querySelector(
              '[data-tooltip="description"]',
            );
            otherDesc.style.display = "none";
          }
        });
      };

      // Toggle this tooltip
      icon.addEventListener("click", (e) => {
        e.stopPropagation();

        const isOpen = description.style.display === "block";

        if (isOpen) {
          description.style.display = "none";
        } else {
          closeOthers();
          description.style.display = "block";
        }
      });

      // Mark as initialized
      if (icon) {
        icon.dataset.tooltipInitialized = "true";
      }

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

    console.log(`[tooltip-system] Initialized ${components.length} simple tooltip(s)`);
  };

  /**
   * Initialize accordion tooltips
   * Handles expandable content sections with animations
   * @param {HTMLElement} root - Root element to search within (defaults to document)
   */
  const initializeAccordions = (root = document) => {
    const accordions = root.querySelectorAll(".gsi-faq_accordion-icon.cc-plans-cms-modal");

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

        // Skip if already initialized (check for data attribute)
        if (button.dataset.accordionInitialized === "true") return;

        // Set initial state
        tooltip.style.height = "0px";
        tooltip.style.marginBottom = "0";
        tooltip.dataset.state = "closed";

        // Mark as initialized
        button.dataset.accordionInitialized = "true";

        // Attach click listener
        button.addEventListener("click", function (e) {
          e.stopPropagation();

          const isOpen = tooltip.dataset.state === "open" || tooltip.dataset.state === "opening";

          if (isOpen) {
            closeTooltip(tooltip);
            button.setAttribute("aria-expanded", "false");
          } else {
            openTooltip(tooltip);
            button.setAttribute("aria-expanded", "true");
          }
        });
      });
    });

    console.log(`[tooltip-system] Initialized ${accordions.length} accordion tooltip(s)`);
  };

  /**
   * Initialize all tooltip types within a root element
   * @param {HTMLElement} root - Root element to search within (defaults to document)
   */
  const initializeAll = (root = document) => {
    initialize(root);
    initializeAccordions(root);
  };

  // Expose public API for dynamic content
  window.TooltipSystem = {
    initialize: initializeAll,
    reinitialize: initializeAll, // Alias for clarity
  };

  // Listen for dynamic content injection events
  window.addEventListener('plans-populated', (event) => {
    console.log('[tooltip-system] Plans populated event received, re-initializing tooltips');
    // Re-initialize all tooltips (will skip already-initialized ones)
    initializeAll();
  });

  // Wait for Webflow CMS content to be ready
  // Webflow.push() runs after CMS content is rendered
  if (window.Webflow && window.Webflow.push) {
    window.Webflow.push(() => initializeAll());
  } else if (document.readyState === 'loading') {
    // Fallback: wait for page load (includes all resources and CMS content)
    window.addEventListener('load', () => initializeAll());
  } else {
    // Page already loaded
    initializeAll();
  }
})();

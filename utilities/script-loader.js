(function() {
  /*
   * ------------------------------------------------------------
   *  Staging & Production Script Loader (Enhanced Version)
   * ------------------------------------------------------------
   *
   *  FEATURES:
   *    ✓ Automatically copies ALL data-* attributes to the new script
   *    ✓ Supports async/defer via attributes on the parent script
   *    ✓ Loads staging or production based on domain
   *    ✓ Fully self-contained IIFE (safe early returns)
   *
   *  USAGE:
   *    - data-prod="https://example.com/prod.js"     (required)
   *    - data-staging="http://localhost:8080/dev.js" (optional)
   *    - async / defer                                (optional)
   *
   *  LOGIC:
   *    - If on *.webflow.io → loads staging (if provided)
   *    - Otherwise → loads production
   *    - If staging URL is missing → falls back to production
   *
   * ------------------------------------------------------------
   */

  // Reference to the <script> containing this loader
  const parent = document.currentScript?.parentElement;

  if (!parent) {
    console.warn("Script loader: No parent element found.");
    return;
  }

  // Retrieve URLs
  const productionSrc = parent.getAttribute("data-prod");
  const stagingSrc = parent.getAttribute("data-staging") || productionSrc;

  // Safety: data-prod MUST exist
  if (!productionSrc) {
    console.error(
      "Script loader error: Missing required 'data-prod' attribute.",
    );
    return;
  }

  // Create new script
  const script = document.createElement("script");

  /*
   * ------------------------------------------------------------
   *  Copy ALL data-* attributes from the parent script
   * ------------------------------------------------------------
   */
  Array.from(parent.attributes).forEach((attr) => {
    if (attr.name.startsWith("data-")) {
      script.setAttribute(attr.name, attr.value);
    }
  });

  /*
   * ------------------------------------------------------------
   *  Support async / defer from parent tag
   * ------------------------------------------------------------
   */
  if (parent.hasAttribute("async")) script.async = true;
  if (parent.hasAttribute("defer")) script.defer = true;

  /*
   * ------------------------------------------------------------
   *  Domain-based environment switching
   * ------------------------------------------------------------
   */
  const hostname = window.location.hostname;
  const isStaging = hostname.includes("webflow.io");

  script.src = isStaging ? stagingSrc : productionSrc;

  /*
   * ------------------------------------------------------------
   *  Inject the resolved script into the page
   * ------------------------------------------------------------
   */
  document.body.appendChild(script);
})();

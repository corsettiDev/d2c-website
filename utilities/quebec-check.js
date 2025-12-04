(function() {
  /*
   * ------------------------------------------------------------
   *  Quebec Province Check Utility
   * ------------------------------------------------------------
   *
   *  FEATURES:
   *    ✓ Checks localStorage for dpr_local_data object
   *    ✓ Verifies if Province field equals "10" (Quebec)
   *    ✓ Safe error handling for localStorage access
   *    ✓ Exports global function: window.isQuebec()
   *    ✓ Dispatches 'quebec-ready' event when initialized
   *
   *  USAGE (Synchronous):
   *    if (window.isQuebec && window.isQuebec()) {
   *      // Show Quebec-specific content
   *    }
   *
   *  USAGE (Event-based - recommended for reliable timing):
   *    // Hybrid pattern handles race conditions
   *    if (window.isQuebec) {
   *      // Already loaded - use immediately
   *      applyLogic(window.isQuebec());
   *    } else {
   *      // Wait for ready event
   *      window.addEventListener('quebec-ready', function(event) {
   *        applyLogic(event.detail.isQuebec);
   *      }, { once: true });
   *    }
   *
   *  EVENTS:
   *    - 'quebec-ready': Dispatched when utility is initialized
   *      - event.detail.isQuebec: boolean result
   *
   *  RETURNS:
   *    - true: User is in Quebec (Province == 10)
   *    - false: User is not in Quebec or data not found
   *
   * ------------------------------------------------------------
   */

  /**
   * Check if the user's province is Quebec (Province == 10)
   * @returns {boolean} True if province is Quebec, false otherwise
   */
  function isQuebec() {
    try {
      // Attempt to retrieve dpr_local_data from localStorage
      const storedData = localStorage.getItem('dpr_local_data');

      // If no data exists, return false
      if (!storedData) {
        return false;
      }

      // Parse the JSON data
      const data = JSON.parse(storedData);

      // Check if Province field exists and equals 10 (loose equality)
      if (data && data.Province != null && data.Province == 10) {
        return true;
      }

      return false;

    } catch (error) {
      // Handle potential errors:
      // - localStorage disabled
      // - Invalid JSON
      // - Quota exceeded
      console.warn('Quebec check failed:', error);
      return false;
    }
  }

  // Export to global scope for use in page scripts
  window.isQuebec = isQuebec;

  // Dispatch event to notify listeners that quebec check is ready
  // Use setTimeout to ensure function is available before event fires
  setTimeout(function() {
    window.dispatchEvent(new CustomEvent('quebec-ready', {
      detail: { isQuebec: isQuebec() }
    }));
  }, 0);

})();

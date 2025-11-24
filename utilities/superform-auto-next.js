window.Webflow ||= [];
window.Webflow.push(() => {
  const containerSelector = '[sf="dprQuote"]';

  const attachAutoNext = (select) => {
    if (select.dataset._sfAutoNextBound) return;
    select.dataset._sfAutoNextBound = "true";

    select.addEventListener("change", () => {
      if (!select.value.trim()) return;

      // Find the Superform instance
      const stepEl = select.closest("[sf-step]");
      const formEl = select.closest("form[sf-form]");
      const sfInstance = formEl?._sf; // Superform stores instance here

      if (sfInstance && typeof sfInstance.goToNext === "function") {
        sfInstance.goToNext(stepEl); // advance the current step
      } else {
        // fallback to clicking next button if API is unavailable
        const nextBtn = stepEl?.querySelector(
          '[sf-goto="next"], [data-sf-goto="next"]',
        );
        if (nextBtn) nextBtn.click();
      }
    });
  };

  const observer = new MutationObserver(() => {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const selects = container.querySelectorAll("select[sf-auto-next]");
    selects.forEach(attachAutoNext);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Run once immediately in case elements already exist
  const container = document.querySelector(containerSelector);
  if (container) {
    container.querySelectorAll("select[sf-auto-next]").forEach(attachAutoNext);
  }
});

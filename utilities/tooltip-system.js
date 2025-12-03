(function() {
  document.addEventListener("DOMContentLoaded", () => {
    const components = document.querySelectorAll('[data-tooltip="component"]');

    components.forEach((component) => {
      const icon = component.querySelector('[data-tooltip="icon"]');
      const description = component.querySelector(
        '[data-tooltip="description"]',
      );
      const isStatic =
        component.getAttribute("data-tooltip-style") === "static";

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
  });
})();

(function () {
  var storageKey = "isolens-theme-mode";
  var themeScript = document.currentScript;
  var storedMode = window.localStorage.getItem(storageKey);
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  var mode = storedMode === "light" || storedMode === "dark"
    ? storedMode
    : prefersDark
      ? "dark"
      : "light";

  document.documentElement.dataset.theme = mode;

  if (themeScript && themeScript.src && !document.querySelector('link[data-isolens-favicon]')) {
    var favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/png";
    favicon.dataset.isolensFavicon = "true";
    favicon.href = themeScript.src.replace(/\/js\/[^/]+$/, "/img/favicon.png?v=3");
    document.head.appendChild(favicon);
  }

  function updateToggle(button) {
    var dark = document.documentElement.dataset.theme === "dark";
    button.textContent = dark ? "☼" : "☾";
    button.setAttribute("aria-label", dark ? "Use light theme" : "Use dark theme");
    button.setAttribute("title", dark ? "Use light theme" : "Use dark theme");
  }

  function addToggle() {
    var card = document.querySelector(".card-pf");
    if (!card || document.getElementById("isolens-theme-toggle")) return;

    var button = document.createElement("button");
    button.id = "isolens-theme-toggle";
    button.type = "button";
    button.addEventListener("click", function () {
      var nextMode = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nextMode;
      window.localStorage.setItem(storageKey, nextMode);
      updateToggle(button);
    });
    updateToggle(button);
    card.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addToggle);
  } else {
    addToggle();
  }
})();

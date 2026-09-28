(() => {
  let preference = "system";
  try { const stored = localStorage.getItem("mythical-dao:theme:v1"); if (stored === "light" || stored === "dark") preference = stored; } catch {}
  const theme = preference === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();

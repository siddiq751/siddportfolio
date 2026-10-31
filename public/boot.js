// Applies saved preferences before first paint (kept external so the CSP needs no inline scripts).
(function () {
  var root = document.documentElement;
  try {
    var motion = localStorage.getItem('dimension:motion');
    var world = localStorage.getItem('dimension:world');
    if (motion === 'reduced') root.setAttribute('data-motion', 'reduced');
    if (world === 'off') root.setAttribute('data-world', 'off');
    if (location.pathname !== '/') return;
    var reduce = motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var seen = sessionStorage.getItem('dimension:intro');
    root.setAttribute('data-intro', reduce ? 'none' : seen ? 'skip' : 'play');
    if (!reduce && !seen) sessionStorage.setItem('dimension:intro', '1');
  } catch {
    root.setAttribute('data-intro', 'skip');
  }
})();

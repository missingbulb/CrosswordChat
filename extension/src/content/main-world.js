// Runs in the page's MAIN world (see manifest). Sole purpose today: mark whether
// NYT's in-page game data object exists, as an informational probe signal
// (REQ-PAGE-009) and a breadcrumb for future fallbacks (docs/FEASIBILITY.md §3).
// Must stay tiny and side-effect-free beyond the marker attribute.

try {
  document.documentElement.dataset.ccGamedata = String(Boolean(window.gameData));
} catch { /* never break the host page */ }

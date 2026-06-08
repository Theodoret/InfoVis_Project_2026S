function refreshExplorer(explorer) {
  if (!explorer || !explorer.state || typeof explorer.loadData !== 'function') {
    return;
  }

  explorer.loadData(explorer.state.view).catch(error => {
    console.error('Failed to refresh dashboard explorer', error);
  });
}

function initializeHealthcareSwitcher() {
  const selects = Array.from(document.querySelectorAll('[data-healthcare-data-select]'));
  const panels = Array.from(document.querySelectorAll('[data-sector-panel="healthcare"]'));

  if (!selects.length || !panels.length) {
    return;
  }

  function getExplorer(panelId) {
    if (panelId === 'bmi-explorer') {
      return window.bmiExplorer;
    }

    const panel = document.getElementById(panelId);
    const slug = panel ? panel.dataset.indicatorExplorer : '';
    return slug && window.indicatorExplorers ? window.indicatorExplorers[slug] : null;
  }

  function showSelectedPanel(selectedId, shouldRefresh = true) {
    selects.forEach(select => {
      select.value = selectedId;
    });

    panels.forEach(panel => {
      panel.classList.toggle('is-active', panel.id === selectedId);
    });

    if (shouldRefresh) {
      window.requestAnimationFrame(() => refreshExplorer(getExplorer(selectedId)));
    }
  }

  selects.forEach(select => {
    select.addEventListener('change', () => showSelectedPanel(select.value, true));
  });

  showSelectedPanel(selects[0].value, false);
}

function initializeEducationMetricSwitcher() {
  const select = document.querySelector('#education-data-select');
  const root = document.querySelector('#education-explorer');

  if (!select || !root) {
    return;
  }

  function syncHiddenMetricControls() {
    const selectedValues = select.multiple
      ? Array.from(select.selectedOptions).map(option => option.value)
      : [select.value];

    root.querySelectorAll('[data-indicator-filter="metric"]').forEach(metricSelect => {
      metricSelect.multiple = select.multiple;
      Array.from(metricSelect.options).forEach(option => {
        option.selected = selectedValues.includes(option.value);
      });
    });
  }

  function copyMetricOptionsFromExplorer() {
    const source = root.querySelector('[data-indicator-filter="metric"]');
    if (!source || !source.options.length) {
      return false;
    }

    const selectedValues = select.multiple
      ? Array.from(select.selectedOptions).map(option => option.value)
      : [select.value];
    const sourceValues = new Set(Array.from(source.options).map(option => option.value));
    const resolvedValues = selectedValues.filter(value => sourceValues.has(value));
    const fallbackValues = resolvedValues.length ? resolvedValues : [source.value];

    select.innerHTML = '';
    Array.from(source.options).forEach(option => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.textContent;
      node.selected = fallbackValues.includes(option.value);
      select.appendChild(node);
    });
    syncHiddenMetricControls();
    if (typeof window.refreshStandardizationControls === 'function') {
      window.refreshStandardizationControls(root);
    }
    return true;
  }

  function syncMetric() {
    syncHiddenMetricControls();
    refreshExplorer(window.indicatorExplorers && window.indicatorExplorers.education);
  }

  select.addEventListener('change', syncMetric);

  if (!copyMetricOptionsFromExplorer()) {
    const source = root.querySelector('[data-indicator-filter="metric"]');
    if (source && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        if (copyMetricOptionsFromExplorer()) {
          observer.disconnect();
        }
      });
      observer.observe(source, { childList: true });
    }
  }
}

function initializeDashboardSwitchers() {
  initializeHealthcareSwitcher();
  initializeEducationMetricSwitcher();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDashboardSwitchers);
} else {
  initializeDashboardSwitchers();
}

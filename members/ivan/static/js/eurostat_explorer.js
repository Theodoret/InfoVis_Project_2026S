function createEurostatExplorer(config = {}) {
  const state = {
    view: config.initialView,
    options: null,
    defaults: null,
  };

  function datasetValue(element, key) {
    return element ? element.dataset[key] : undefined;
  }

  function getPanel(view = state.view) {
    return document.querySelector(`[${config.panelAttribute}="${view}"]`);
  }

  function getValues(view = state.view) {
    const values = { ...(state.defaults || {}) };
    const panel = getPanel(view);
    if (!panel) {
      return values;
    }

    panel.querySelectorAll(config.filterSelector).forEach(select => {
      values[datasetValue(select, config.filterDatasetKey)] = select.value;
    });

    return values;
  }

  function setSummary(view, title, value, count) {
    const summarySelector = config.views[view] && config.views[view].summarySelector;
    const summary = summarySelector ? document.querySelector(summarySelector) : null;
    if (!summary) {
      return;
    }

    const titleNode = summary.querySelector(config.summaryTitleSelector);
    const valueNode = summary.querySelector(config.summaryValueSelector);
    const countNode = summary.querySelector(config.summaryCountSelector);

    if (titleNode) titleNode.textContent = title || '—';
    if (valueNode) valueNode.textContent = config.valueFormatter(value);
    if (countNode) countNode.textContent = Number.isFinite(count) ? d3.format(',')(count) : '—';
  }

  function fillSelect(select, options, selectedValue) {
    select.innerHTML = '';
    for (const option of options) {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      node.selected = option.value === selectedValue;
      select.appendChild(node);
    }
  }

  async function loadData(view = state.view) {
    const params = new URLSearchParams({ ...getValues(view), view });
    const viewConfig = config.views[view] || {};
    const dataUrl = viewConfig.dataUrl || config.dataUrl;
    const response = await fetch(`${dataUrl}?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to load Eurostat data (${response.status})`);
    }

    const payload = await response.json();
    const records = Array.isArray(payload.records) ? payload.records : [];
    await config.renderers[view](records, {
      getValues,
      payload,
      setSummary,
      state,
      view,
    });
  }

  function setView(view) {
    state.view = view;

    document.querySelectorAll(config.tabSelector).forEach(tab => {
      const isActive = datasetValue(tab, config.tabDatasetKey) === view;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    document.querySelectorAll(config.panelSelector).forEach(panel => {
      panel.classList.toggle('is-active', datasetValue(panel, config.panelDatasetKey) === view);
    });

    loadData(view).catch(error => {
      console.error('Failed to update Eurostat explorer', error);
      config.renderEmpty(view, 'Failed to load data');
    });
  }

  function initializeFilters(options, defaults) {
    document.querySelectorAll(config.panelSelector).forEach(panel => {
      panel.querySelectorAll(config.filterSelector).forEach(select => {
        const key = datasetValue(select, config.filterDatasetKey);
        fillSelect(select, options[key] || [], defaults[key]);
        select.addEventListener('change', () => {
          const view = datasetValue(panel, config.panelDatasetKey);
          loadData(view).catch(error => {
            console.error('Failed to update Eurostat explorer', error);
            config.renderEmpty(view, 'Failed to load data');
          });
        });
      });
    });
  }

  async function initialize() {
    const response = await fetch(config.optionsUrl);
    if (!response.ok) {
      throw new Error(`Failed to load Eurostat options (${response.status})`);
    }

    const payload = await response.json();
    state.options = payload.options;
    state.defaults = payload.defaults;

    initializeFilters(state.options, state.defaults);

    document.querySelectorAll(config.tabSelector).forEach(tab => {
      tab.addEventListener('click', () => setView(datasetValue(tab, config.tabDatasetKey)));
    });

    setView(state.view);
  }

  return {
    initialize,
    loadData,
    setView,
    getValues,
    setSummary,
    state,
  };
}

window.createEurostatExplorer = createEurostatExplorer;

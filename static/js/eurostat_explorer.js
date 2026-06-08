function createEurostatExplorer(config = {}) {
  const root = config.rootSelector ? document.querySelector(config.rootSelector) : document;
  const state = {
    view: config.initialView,
    options: null,
    defaults: null,
    root,
  };

  function datasetValue(element, key) {
    return element ? element.dataset[key] : undefined;
  }

  function getPanel(view = state.view) {
    return root ? root.querySelector(`[${config.panelAttribute}="${view}"]`) : null;
  }

  function getValues(view = state.view) {
    const values = { ...(state.defaults || {}) };
    const panel = getPanel(view);
    if (!panel) {
      return values;
    }

    panel.querySelectorAll(config.filterSelector).forEach(select => {
      values[datasetValue(select, config.filterDatasetKey)] = controlValue(select);
    });

    if (config.extraFilterSelector) {
      root.querySelectorAll(config.extraFilterSelector).forEach(control => {
        values[datasetValue(control, config.extraFilterDatasetKey)] = controlValue(control);
      });
    }

    if (typeof config.transformValues === 'function') {
      return config.transformValues(values, { view, root, state });
    }

    return values;
  }

  function controlValue(control) {
    if (control && control.multiple) {
      return Array.from(control.selectedOptions)
        .map(option => option.value)
        .filter(Boolean)
        .join(',');
    }

    return control ? control.value : '';
  }

  function activeValueFormatter() {
    return state.valueFormatter || config.valueFormatter;
  }

  function dispatchExplorerEvent(name, detail = {}) {
    if (!root) {
      return;
    }

    root.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      detail: {
        explorer: api,
        ...detail,
      },
    }));
  }

  function addChangeListener(control, getView) {
    control.addEventListener('change', () => {
      const view = getView();
      loadData(view).catch(error => {
        console.error('Failed to update Eurostat explorer', error);
        config.renderEmpty(view, 'Failed to load data');
      });
    });
  }

  function setSummary(view, title, value, count) {
    const summarySelector = config.views[view] && config.views[view].summarySelector;
    const summary = root && summarySelector ? root.querySelector(summarySelector) : null;
    if (!summary) {
      return;
    }

    const titleNode = summary.querySelector(config.summaryTitleSelector);
    const valueNode = summary.querySelector(config.summaryValueSelector);
    const countNode = summary.querySelector(config.summaryCountSelector);

    if (titleNode) titleNode.textContent = title || '—';
    if (valueNode) valueNode.textContent = activeValueFormatter()(value);
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
    state.payload = payload;
    state.valueFormatter = typeof config.valueFormatterForPayload === 'function'
      ? config.valueFormatterForPayload(payload, state)
      : config.valueFormatter;
    const records = Array.isArray(payload.records) ? payload.records : [];
    await config.renderers[view](records, {
      getValues,
      payload,
      root,
      setSummary,
      state,
      view,
    });
  }

  function setView(view) {
    state.view = view;

    root.querySelectorAll(config.tabSelector).forEach(tab => {
      const isActive = datasetValue(tab, config.tabDatasetKey) === view;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    root.querySelectorAll(config.panelSelector).forEach(panel => {
      panel.classList.toggle('is-active', datasetValue(panel, config.panelDatasetKey) === view);
    });

    loadData(view).catch(error => {
      console.error('Failed to update Eurostat explorer', error);
      config.renderEmpty(view, 'Failed to load data');
    });
  }

  function initializeFilters(options, defaults) {
    root.querySelectorAll(config.panelSelector).forEach(panel => {
      panel.querySelectorAll(config.filterSelector).forEach(select => {
        const key = datasetValue(select, config.filterDatasetKey);
        fillSelect(select, options[key] || [], defaults[key]);
        addChangeListener(select, () => datasetValue(panel, config.panelDatasetKey));
      });
    });
  }

  function initializeExtraFilters() {
    if (!config.extraFilterSelector) {
      return;
    }

    root.querySelectorAll(config.extraFilterSelector).forEach(control => {
      addChangeListener(control, () => state.view);
    });
  }

  async function initialize() {
    if (!root) {
      return;
    }

    const response = await fetch(config.optionsUrl);
    if (!response.ok) {
      throw new Error(`Failed to load Eurostat options (${response.status})`);
    }

    const payload = await response.json();
    state.options = payload.options;
    state.defaults = payload.defaults;

    initializeFilters(state.options, state.defaults);
    initializeExtraFilters();

    root.querySelectorAll(config.tabSelector).forEach(tab => {
      tab.addEventListener('click', () => setView(datasetValue(tab, config.tabDatasetKey)));
    });

    dispatchExplorerEvent('eurostat:initialized', { options: state.options, defaults: state.defaults });
    setView(state.view);
  }

  const api = {
    initialize,
    loadData,
    setView,
    getValues,
    setSummary,
    state,
  };

  if (root) {
    root.__eurostatExplorer = api;
  }

  return api;
}

window.createEurostatExplorer = createEurostatExplorer;

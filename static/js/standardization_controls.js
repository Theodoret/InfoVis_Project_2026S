const STANDARDIZATION_STORAGE_PREFIX = 'infovis.standardization';
const COMBINABLE_FILTER_EXCLUSIONS = new Set([
  'country',
  'gdpMetric',
  'gdpScale',
  'correlationVariable',
]);
const DIRECTION_VALUES = new Set(['positive', 'negative']);

function formatStandardizedScore(value) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return d3.format('.2f')(value);
}

function isStandardizedPayload(payload) {
  return Boolean(payload && payload.standardization && payload.standardization.enabled);
}

function valueFormatterForPayload(payload, rawFormatter) {
  return isStandardizedPayload(payload) ? formatStandardizedScore : rawFormatter;
}

function storageKeyForToolbar(toolbar) {
  return `${STANDARDIZATION_STORAGE_PREFIX}.${toolbar.dataset.standardizationRoot || 'default'}`;
}

function loadToolbarState(toolbar) {
  try {
    return JSON.parse(localStorage.getItem(storageKeyForToolbar(toolbar)) || '{}');
  } catch {
    return {};
  }
}

function saveToolbarState(toolbar, updates = {}) {
  const state = {
    ...loadToolbarState(toolbar),
    ...updates,
  };

  toolbar.querySelectorAll('[data-standardize-filter]').forEach(control => {
    state[control.dataset.standardizeFilter] = control.value;
  });

  localStorage.setItem(storageKeyForToolbar(toolbar), JSON.stringify(state));
}

function applySavedToolbarState(toolbar) {
  const saved = loadToolbarState(toolbar);
  toolbar.querySelectorAll('[data-standardize-filter]').forEach(control => {
    const value = saved[control.dataset.standardizeFilter];
    if (value !== undefined) {
      control.value = value;
    }
  });
}

function filterKeyForSelect(select) {
  if (select.id === 'education-data-select') {
    return 'metric';
  }
  return select.dataset.bmiFilter || select.dataset.indicatorFilter || '';
}

function selectedOptionValues(select) {
  if (select.multiple) {
    return Array.from(select.selectedOptions || [])
      .map(option => option.value)
      .filter(Boolean);
  }
  return select.value ? [select.value] : [];
}

function setSelectedOptionValues(select, values, allowMultiple) {
  const selectedValues = new Set(values.filter(Boolean));
  select.multiple = Boolean(allowMultiple);
  Array.from(select.options || []).forEach(option => {
    option.selected = selectedValues.has(option.value);
  });

  if (!allowMultiple) {
    select.value = values[0] || select.value;
  }
}

function controlValue(control) {
  return control.multiple ? selectedOptionValues(control).join(',') : control.value;
}

function defaultDirectionForOption(toolbar, filterKey, optionValue) {
  const rootKey = toolbar.dataset.standardizationRoot || '';
  const summaryDataset = toolbar.dataset.summaryDataset || '';
  if ((rootKey === 'bmi' || summaryDataset === 'healthcare:bmi') && filterKey === 'bmi') {
    return ['BMI_GE30', 'BMI25-29', 'BMI_LT18P5'].includes(optionValue) ? 'negative' : 'positive';
  }
  if ((rootKey === 'unmet' || summaryDataset === 'healthcare:unmet') && filterKey === 'reason') {
    return 'negative';
  }
  return 'positive';
}

function getOptionDirection(toolbar, filterKey, optionValue) {
  const state = loadToolbarState(toolbar);
  const direction = state.directions
    && state.directions[filterKey]
    && state.directions[filterKey][optionValue];

  return DIRECTION_VALUES.has(direction)
    ? direction
    : defaultDirectionForOption(toolbar, filterKey, optionValue);
}

function setOptionDirection(toolbar, filterKey, optionValue, direction) {
  if (!DIRECTION_VALUES.has(direction)) {
    return;
  }

  const state = loadToolbarState(toolbar);
  const directions = {
    ...(state.directions || {}),
    [filterKey]: {
      ...((state.directions && state.directions[filterKey]) || {}),
      [optionValue]: direction,
    },
  };
  saveToolbarState(toolbar, { directions });
}

function dispatchDirectionChange(toolbar, detail = {}) {
  const section = toolbar.closest('.bmi-section') || toolbar;
  if (detail.filterKey && detail.optionValue && detail.direction) {
    section.querySelectorAll(`.checkbox-filter-dropdown[data-filter-key="${detail.filterKey}"]`).forEach(dropdown => {
      dropdown.querySelectorAll('.checkbox-filter-item').forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const direction = item.querySelector('.checkbox-direction-select');
        if (checkbox && direction && checkbox.value === detail.optionValue) {
          direction.value = detail.direction;
        }
      });
    });
  }

  section.dispatchEvent(new CustomEvent('standardization:directionsChanged', {
    bubbles: true,
    detail,
  }));

  const standardizeControl = toolbar.querySelector('[data-standardize-filter="standardize"]');
  if (standardizeControl) {
    standardizeControl.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }

  const explorer = section.__eurostatExplorer;
  if (explorer && typeof explorer.loadData === 'function' && explorer.state) {
    explorer.loadData(explorer.state.view).catch(error => {
      console.error('Failed to update standardized chart', error);
    });
  }
}

function getExplorerFilterDetails(section) {
  if (section.id === 'bmi-explorer') {
    return { selector: '[data-bmi-filter]', datasetKey: 'bmiFilter' };
  }

  return { selector: '[data-indicator-filter]', datasetKey: 'indicatorFilter' };
}

function findCombinableControls(toolbar) {
  const section = toolbar.closest('.bmi-section');
  if (!section) {
    return [];
  }

  const { selector, datasetKey } = getExplorerFilterDetails(section);
  const controls = Array.from(section.querySelectorAll(`.bmi-controls ${selector}`))
    .filter(select => !select.classList.contains('is-hidden'))
    .filter(select => !COMBINABLE_FILTER_EXCLUSIONS.has(select.dataset[datasetKey]));

  if (section.id === 'education-explorer') {
    const educationMetricSelect = document.getElementById('education-data-select');
    if (educationMetricSelect) {
      controls.push(educationMetricSelect);
    }
  }

  return controls;
}

function removeCheckboxDropdown(select) {
  const dropdown = select.nextElementSibling;
  if (dropdown && dropdown.classList.contains('checkbox-filter-dropdown')) {
    dropdown.remove();
  }
  select.classList.remove('checkbox-source-select');
  select.multiple = false;
  select.removeAttribute('size');
}

function checkboxDropdownSummary(select) {
  const selected = selectedOptionValues(select);
  if (!selected.length) {
    return 'Choose values';
  }

  if (selected.length === 1) {
    const option = Array.from(select.options).find(item => item.value === selected[0]);
    return option ? option.textContent : selected[0];
  }

  return `${selected.length} selected`;
}

function syncDropdownButton(dropdown, select) {
  const label = dropdown.querySelector('[data-checkbox-summary]');
  if (label) {
    label.textContent = checkboxDropdownSummary(select);
  }
}

function positionCheckboxDropdownMenu(dropdown) {
  const menu = dropdown.querySelector('.checkbox-filter-menu');
  if (!menu) {
    return;
  }

  dropdown.classList.remove('is-align-right');
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth - 16) {
    dropdown.classList.add('is-align-right');
  }
}

function selectedCheckboxValues(dropdown) {
  return Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked'))
    .map(input => input.value)
    .filter(Boolean);
}

function updateSourceSelectFromDropdown(dropdown, select, allowMultiple) {
  let values = selectedCheckboxValues(dropdown);
  if (!values.length && select.options.length) {
    values = [select.options[0].value];
  }

  setSelectedOptionValues(select, values, allowMultiple);
  syncDropdownButton(dropdown, select);
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function renderCheckboxDropdown(toolbar, select, allowMultiple) {
  const filterKey = filterKeyForSelect(select);
  if (!filterKey || !select.options.length) {
    return;
  }

  const selectedValues = selectedOptionValues(select);
  setSelectedOptionValues(select, selectedValues.length ? selectedValues : [select.value || select.options[0].value], allowMultiple);

  let dropdown = select.nextElementSibling;
  if (!dropdown || !dropdown.classList.contains('checkbox-filter-dropdown')) {
    dropdown = document.createElement('div');
    dropdown.className = 'checkbox-filter-dropdown';
    select.insertAdjacentElement('afterend', dropdown);
    dropdown.addEventListener('click', event => event.stopPropagation());
    dropdown.addEventListener('mousedown', event => event.stopPropagation());
  }

  select.classList.add('checkbox-source-select');
  dropdown.innerHTML = '';
  dropdown.dataset.filterKey = filterKey;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'checkbox-filter-button';
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span data-checkbox-summary></span>';
  dropdown.appendChild(button);

  const menu = document.createElement('div');
  menu.className = 'checkbox-filter-menu';
  dropdown.appendChild(menu);

  Array.from(select.options).forEach((option, index) => {
    const checkboxId = `${filterKey}-${option.value}-${index}`.replace(/[^a-zA-Z0-9_-]/g, '-');
    const item = document.createElement('div');
    item.className = 'checkbox-filter-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = checkboxId;
    checkbox.value = option.value;
    checkbox.checked = option.selected;
    checkbox.addEventListener('click', event => event.stopPropagation());
    checkbox.addEventListener('change', event => {
      event.stopPropagation();
      if (!allowMultiple && event.target.checked) {
        menu.querySelectorAll('input[type="checkbox"]').forEach(input => {
          input.checked = input === event.target;
        });
      }
      if (!allowMultiple && !event.target.checked) {
        event.target.checked = true;
      }
      updateSourceSelectFromDropdown(dropdown, select, allowMultiple);
    });

    const text = document.createElement('span');
    text.className = 'checkbox-filter-label';
    text.textContent = option.textContent;
    text.setAttribute('role', 'button');
    text.tabIndex = 0;
    text.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    text.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const direction = document.createElement('select');
    direction.className = 'checkbox-direction-select';
    direction.innerHTML = '<option value="positive">Positive</option><option value="negative">Negative</option>';
    direction.value = getOptionDirection(toolbar, filterKey, option.value);
    let lastDirection = direction.value;
    direction.addEventListener('click', event => event.stopPropagation());
    direction.addEventListener('mousedown', event => event.stopPropagation());
    const handleDirectionChange = event => {
      if (event) {
        event.stopPropagation();
      }
      if (direction.value === lastDirection) {
        return;
      }
      lastDirection = direction.value;
      setOptionDirection(toolbar, filterKey, option.value, direction.value);
      dispatchDirectionChange(toolbar, {
        filterKey,
        optionValue: option.value,
        direction: direction.value,
      });
    };
    direction.addEventListener('input', handleDirectionChange);
    direction.addEventListener('change', handleDirectionChange);

    item.appendChild(checkbox);
    item.appendChild(text);
    item.appendChild(direction);
    menu.appendChild(item);
  });

  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    const isOpen = dropdown.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) {
      requestAnimationFrame(() => positionCheckboxDropdownMenu(dropdown));
    }
  });

  syncDropdownButton(dropdown, select);
}

function closeOpenCheckboxDropdowns(event) {
  document.querySelectorAll('.checkbox-filter-dropdown.is-open').forEach(dropdown => {
    if (!dropdown.contains(event.target)) {
      dropdown.classList.remove('is-open');
      const button = dropdown.querySelector('.checkbox-filter-button');
      if (button) {
        button.setAttribute('aria-expanded', 'false');
      }
    }
  });
}

function applyStandardizationState(toolbar) {
  const standardize = toolbar.querySelector('[data-standardize-filter="standardize"]');
  const standardized = standardize && standardize.value === '1';

  findCombinableControls(toolbar).forEach(select => {
    if (standardized) {
      renderCheckboxDropdown(toolbar, select, true);
    } else {
      removeCheckboxDropdown(select);
    }

    const label = select.closest('label');
    if (label) {
      label.classList.toggle('is-combinable', Boolean(standardized));
    }
  });
}

function initializeStandardizationToolbar(toolbar) {
  applySavedToolbarState(toolbar);
  applyStandardizationState(toolbar);

  toolbar.querySelectorAll('[data-standardize-filter]').forEach(control => {
    control.addEventListener('change', () => {
      applyStandardizationState(toolbar);
      saveToolbarState(toolbar);
    });
  });

  const section = toolbar.closest('.bmi-section');
  if (section) {
    section.addEventListener('eurostat:initialized', () => applyStandardizationState(toolbar));
  }
}

function getStandardizationDirections(root) {
  const section = root && root.closest ? root.closest('.bmi-section') || root : root;
  const toolbar = section ? section.querySelector('[data-standardization-root]') : null;
  if (!toolbar) {
    return {};
  }

  const state = loadToolbarState(toolbar);
  const directions = { ...(state.directions || {}) };

  section.querySelectorAll('.checkbox-filter-dropdown').forEach(dropdown => {
    const filterKey = dropdown.dataset.filterKey;
    if (!filterKey) {
      return;
    }

    directions[filterKey] = { ...(directions[filterKey] || {}) };
    dropdown.querySelectorAll('.checkbox-filter-item').forEach(item => {
      const checkbox = item.querySelector('input[type="checkbox"]');
      const direction = item.querySelector('.checkbox-direction-select');
      if (checkbox && direction && !directions[filterKey][checkbox.value]) {
        directions[filterKey][checkbox.value] = direction.value;
      }
    });
  });

  return directions;
}

function initializeStandardizationControls() {
  document.querySelectorAll('[data-standardization-root]').forEach(initializeStandardizationToolbar);
  document.addEventListener('click', closeOpenCheckboxDropdowns);
}

function refreshStandardizationControls(root = document) {
  root.querySelectorAll('[data-standardization-root]').forEach(applyStandardizationState);
}

window.formatStandardizedScore = formatStandardizedScore;
window.isStandardizedPayload = isStandardizedPayload;
window.valueFormatterForPayload = valueFormatterForPayload;
window.getStandardizationDirections = getStandardizationDirections;
window.refreshStandardizationControls = refreshStandardizationControls;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStandardizationControls);
} else {
  initializeStandardizationControls();
}

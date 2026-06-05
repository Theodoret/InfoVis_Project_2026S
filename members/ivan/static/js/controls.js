function createRangeControl(options = {}) {
  const slider = document.querySelector(options.sliderSelector);
  const label = document.querySelector(options.labelSelector);
  const secondaryLabel = document.querySelector(options.secondaryLabelSelector);
  const getValue = options.getValue;
  const setValue = options.setValue;

  function updateLabels(value) {
    if (label) {
      label.textContent = value;
    }
    if (secondaryLabel) {
      secondaryLabel.textContent = value;
    }
  }

  function syncResolvedValue() {
    if (typeof getValue !== 'function') {
      return;
    }

    const resolvedValue = getValue();
    updateLabels(resolvedValue);
    if (slider && slider.value !== String(resolvedValue)) {
      slider.value = resolvedValue;
    }
  }

  if (!slider) {
    return {
      updateLabels,
      syncResolvedValue,
    };
  }

  updateLabels(slider.value);
  syncResolvedValue();

  slider.addEventListener('input', event => {
    const value = event.target.value;
    updateLabels(value);

    if (typeof setValue === 'function') {
      Promise.resolve(setValue(value))
        .then(syncResolvedValue)
        .catch(error => {
          console.error('Failed to update range control', error);
        });
    }
  });

  return {
    updateLabels,
    syncResolvedValue,
  };
}

function initializeControls() {
  if (!window.ivanGdpMap) {
    return;
  }

  window.ivanGdpYearControl = createRangeControl({
    sliderSelector: '#gdp-year-slider',
    labelSelector: '#gdp-year-label',
    secondaryLabelSelector: '#gdp-hover-year',
    getValue: window.ivanGdpMap.getYear,
    setValue: window.ivanGdpMap.setYear,
  });
}

window.createRangeControl = createRangeControl;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeControls);
} else {
  initializeControls();
}

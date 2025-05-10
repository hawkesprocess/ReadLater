document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const useAiParsingCheckbox = document.getElementById('useAiParsing');
  const darkModeCheckbox = document.getElementById('darkMode');
  const openaiApiKeyInput = document.getElementById('openaiApiKey');
  const openaiModelSelect = document.getElementById('openaiModel');
  const saveSettingsButton = document.getElementById('saveSettings');
  const toggleApiKeyButton = document.getElementById('toggleApiKey');
  const statusMessage = document.getElementById('statusMessage');
  
  // Load settings when page loads
  loadSettings();
  
  // Event listeners
  saveSettingsButton.addEventListener('click', saveSettings);
  toggleApiKeyButton.addEventListener('click', toggleApiKeyVisibility);
  useAiParsingCheckbox.addEventListener('change', toggleApiSettingsVisibility);
  
  // Function to load settings
  function loadSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, function(settings) {
      if (settings) {
        useAiParsingCheckbox.checked = settings.useAiParsing || false;
        darkModeCheckbox.checked = settings.darkMode || false;
        openaiApiKeyInput.value = settings.openaiApiKey || '';
        
        // Select the correct model option
        if (settings.openaiModel) {
          const options = openaiModelSelect.options;
          for (let i = 0; i < options.length; i++) {
            if (options[i].value === settings.openaiModel) {
              openaiModelSelect.selectedIndex = i;
              break;
            }
          }
        }
        
        // Initial visibility state for API settings
        toggleApiSettingsVisibility();
      }
    });
  }
  
  // Function to save settings
  function saveSettings() {
    const settings = {
      useAiParsing: useAiParsingCheckbox.checked,
      darkMode: darkModeCheckbox.checked,
      openaiApiKey: openaiApiKeyInput.value.trim(),
      openaiModel: openaiModelSelect.value
    };
    
    // Validate API key if AI parsing is enabled
    if (settings.useAiParsing && !settings.openaiApiKey) {
      showStatusMessage('Please enter an OpenAI API key to use AI-powered parsing.', true);
      return;
    }
    
    // Save settings
    chrome.runtime.sendMessage(
      { action: 'saveSettings', settings: settings },
      function(response) {
        if (response && response.success) {
          showStatusMessage('Settings saved successfully!');
        } else {
          showStatusMessage('Error saving settings.', true);
        }
      }
    );
  }
  
  // Function to toggle API key visibility
  function toggleApiKeyVisibility() {
    if (openaiApiKeyInput.type === 'password') {
      openaiApiKeyInput.type = 'text';
      toggleApiKeyButton.textContent = 'Hide';
    } else {
      openaiApiKeyInput.type = 'password';
      toggleApiKeyButton.textContent = 'Show';
    }
  }
  
  // Function to toggle API settings visibility based on AI parsing checkbox
  function toggleApiSettingsVisibility() {
    const apiSettings = document.getElementById('apiSettings');
    
    if (useAiParsingCheckbox.checked) {
      apiSettings.style.display = 'block';
    } else {
      apiSettings.style.display = 'none';
    }
  }
  
  // Function to show status message
  function showStatusMessage(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message ' + (isError ? 'error' : 'success');
    statusMessage.style.display = 'block';
    
    // Hide message after 3 seconds
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000);
  }
}); 
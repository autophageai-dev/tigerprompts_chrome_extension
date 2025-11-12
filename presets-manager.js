// Tiger Prompts - Presets Manager
// Handles storage and retrieval of presets

const PresetsManager = {
  
  // Get current selected preset
  async getSelectedPreset() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['selectedPreset'], (result) => {
        resolve(result.selectedPreset || 'none');
      });
    });
  },
  
  // Set selected preset
  async setSelectedPreset(presetId) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ selectedPreset: presetId }, () => {
        console.log('[Presets] Selected preset:', presetId);
        resolve();
      });
    });
  },
  
  // Get preset auto-detect setting
  async getAutoDetect() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['presetAutoDetect'], (result) => {
        resolve(result.presetAutoDetect !== false); // Default to true
      });
    });
  },
  
  // Set preset auto-detect
  async setAutoDetect(enabled) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ presetAutoDetect: enabled }, () => {
        console.log('[Presets] Auto-detect:', enabled);
        resolve();
      });
    });
  },
  
  // Get all user settings
  async getAllSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        ['selectedPreset', 'presetAutoDetect', 'enhanceMode', 'autoEnhance'],
        (result) => {
          resolve({
            selectedPreset: result.selectedPreset || 'none',
            presetAutoDetect: result.presetAutoDetect !== false,
            enhanceMode: result.enhanceMode || 'light',
            autoEnhance: result.autoEnhance !== false
          });
        }
      );
    });
  }
};

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PresetsManager;
}

// Welcome page script

document.addEventListener('DOMContentLoaded', () => {
  const getStartedBtn = document.getElementById('getStarted');
  const openExtensionsBtn = document.getElementById('openExtensions');
  const upgradeProBtn = document.getElementById('upgradeProBtn');
  const signInBtn = document.getElementById('signInBtn');
  
  if (getStartedBtn) {
    getStartedBtn.addEventListener('click', () => {
      // Close the welcome tab
      window.close();
      
      // If window.close() doesn't work (some browsers block it), show a message
      setTimeout(() => {
        if (!window.closed) {
          getStartedBtn.textContent = '✅ You can close this tab now!';
          getStartedBtn.style.background = 'linear-gradient(135deg, #00D26A 0%, #00F593 100%)';
        }
      }, 100);
    });
  }
  
  if (openExtensionsBtn) {
    openExtensionsBtn.addEventListener('click', () => {
      // Open extensions page in a new tab
      chrome.tabs.create({ url: 'chrome://extensions/' });
    });
  }
  
  if (upgradeProBtn) {
    upgradeProBtn.addEventListener('click', () => {
      // Open LLM selector, user will sign in from there and upgrade
      chrome.tabs.create({ url: chrome.runtime.getURL('llm-selector.html') });
    });
  }
  
  if (signInBtn) {
    signInBtn.addEventListener('click', () => {
      // Open dedicated auth page for sign in
      chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
    });
  }
  
  // Add subtle animation on load
  document.querySelector('.card').style.animation = 'fadeIn 0.5s ease';
  
  // Add CSS for fade-in animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(style);
});

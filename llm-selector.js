// Tiger Prompts - LLM Selector
console.log('[Tiger Prompts LLM Selector] Loading...');

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Tiger Prompts LLM Selector] DOM loaded');
  
  const platformCards = document.querySelectorAll('.platform-card');
  
  platformCards.forEach(card => {
    card.addEventListener('click', () => {
      const url = card.getAttribute('data-url');
      const platformName = card.querySelector('h3').textContent;
      
      console.log('[Tiger Prompts LLM Selector] Selected platform:', platformName);
      console.log('[Tiger Prompts LLM Selector] Opening URL:', url);
      
      // Add visual feedback
      card.style.transform = 'scale(0.95)';
      card.style.opacity = '0.7';
      
      // Open the platform in a new tab
      chrome.tabs.create({ url: url }, (tab) => {
        console.log('[Tiger Prompts LLM Selector] Platform opened in tab:', tab.id);
        
        // Close this tab after a short delay
        setTimeout(() => {
          chrome.tabs.getCurrent((currentTab) => {
            if (currentTab) {
              console.log('[Tiger Prompts LLM Selector] Closing selector tab:', currentTab.id);
              chrome.tabs.remove(currentTab.id);
            } else {
              // If we can't get current tab, just close the window
              window.close();
            }
          });
        }, 500); // 500ms delay for visual feedback
      });
    });
    
    // Add keyboard support
    card.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
    
    // Make cards focusable for keyboard navigation
    card.setAttribute('tabindex', '0');
  });
  
  console.log('[Tiger Prompts LLM Selector] Ready - ' + platformCards.length + ' platforms available');
});

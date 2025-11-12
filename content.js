// Tiger Prompts v2.0 - Content Script

// ========== FETCH INTERCEPTOR (Must run before page loads) ==========
// This code injects into the page context to intercept Claude's API calls
// DISABLED on Claude.ai due to CSP restrictions (auto-enhance already disabled there)

(function injectFetchInterceptor() {
  'use strict';
  
  // Skip Claude.ai entirely - CSP blocks inline scripts and auto-enhance is disabled anyway
  if (location.hostname.includes('claude.ai')) {
    console.log('[Tiger Prompts] ⏭️ Skipping fetch interceptor on Claude.ai (CSP restricted)');
    return;
  }
  
  // Only inject on other supported sites where auto-enhance works
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      console.log('[Tiger Prompts] 🎣 Fetch interceptor injected');
      
      // Store original fetch
      const originalFetch = window.fetch;
      
      // Override fetch globally
      window.fetch = async function(...args) {
        const [url, options] = args;
        
        // Log ALL POST requests to see what the AI is doing
        if (options?.method === 'POST' && url && typeof url === 'string') {
          console.log('[Tiger Prompts] 📡 POST request detected:', url);
        }
        
        // Check if this is an API completion request (more permissive)
        if (url && url.includes('/api/') && options?.method === 'POST' && options?.body) {
          console.log('[Tiger Prompts] 🎯 API POST detected:', url);
          
          try {
            // Extract the request body
            let body = options?.body;
            if (typeof body === 'string') {
              try {
                body = JSON.parse(body);
                console.log('[Tiger Prompts] 📦 Request body keys:', Object.keys(body));
              } catch (e) {
                console.log('[Tiger Prompts] 📦 Body is string (not JSON)');
              }
            }
            
            // Try to find the prompt in various places
            const prompt = body?.prompt || body?.text || body?.message || body?.content;
            
            if (prompt && typeof prompt === 'string' && prompt.trim().length > 5) {
              console.log('[Tiger Prompts] 📝 Found prompt:', prompt.substring(0, 100));
              console.log('[Tiger Prompts] 🚀 Intercepting to enhance!');
              
              // Send message to content script asking for enhancement
              window.postMessage({
                type: 'TIGER_INTERCEPT_PROMPT',
                prompt: prompt,
                url: url,
                bodyKeys: Object.keys(body)
              }, '*');
              
              // Return a pending promise that will be resolved by content script
              return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                  console.warn('[Tiger Prompts] ⏱️ Timeout waiting for enhancement, sending original');
                  resolve(originalFetch(...args));
                }, 10000); // 10 second timeout
                
                const handleResponse = (event) => {
                  if (event.data.type === 'TIGER_SEND_ENHANCED' && event.data.originalPrompt === prompt) {
                    window.removeEventListener('message', handleResponse);
                    clearTimeout(timeout);
                    
                    console.log('[Tiger Prompts] ✨ Got enhanced prompt!');
                    console.log('[Tiger Prompts] Original:', prompt.substring(0, 50));
                    console.log('[Tiger Prompts] Enhanced:', event.data.enhancedPrompt.substring(0, 50));
                    
                    // Replace prompt in body
                    if (body.prompt) body.prompt = event.data.enhancedPrompt;
                    else if (body.text) body.text = event.data.enhancedPrompt;
                    else if (body.message) body.message = event.data.enhancedPrompt;
                    else if (body.content) body.content = event.data.enhancedPrompt;
                    
                    // Make the real request with enhanced prompt
                    const enhancedOptions = {
                      ...options,
                      body: JSON.stringify(body)
                    };
                    
                    resolve(originalFetch(url, enhancedOptions));
                  }
                };\n                window.addEventListener('message', handleResponse);
              });
            }
          } catch (error) {
            console.error('[Tiger Prompts] ❌ Error intercepting:', error);
          }
        }
        
        // Not a completion request, let it through
        return originalFetch(...args);
      };
      
      console.log('[Tiger Prompts] ✅ Fetch override complete');
    })();
  `;
  
  // Inject the script into the page
  (document.head || document.documentElement).appendChild(script);
  script.remove();
  
  console.log('[Tiger Prompts] 💉 Injected fetch interceptor into page');
})();

// ========== MESSAGE HANDLER FOR INTERCEPTED PROMPTS ==========
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'TIGER_INTERCEPT_PROMPT') {
    console.log('[Tiger Prompts] 📨 Received intercepted prompt from page');
    console.log('[Tiger Prompts] URL:', event.data.url);
    console.log('[Tiger Prompts] Prompt:', event.data.prompt.substring(0, 100));
    
    // Get settings
    const settings = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
        resolve(res?.success ? res.settings : { autoEnhance: false, enhanceMode: 'light' });
      });
    });
    
    if (!settings.autoEnhance) {
      console.log('[Tiger Prompts] ⚠️ Auto-enhance disabled, sending original');
      window.postMessage({ 
        type: 'TIGER_SEND_ENHANCED', 
        originalPrompt: event.data.prompt,
        enhancedPrompt: event.data.prompt 
      }, '*');
      return;
    }
    
    console.log('[Tiger Prompts] 🐯 Auto-enhance ENABLED - enhancing...');
    
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'TP_ENHANCE',
        text: event.data.prompt,
        mode: settings.enhanceMode
      }, resolve);
    });
    
    if (result?.success) {
      console.log('[Tiger Prompts] ✅ Enhanced successfully!');
      console.log('[Tiger Prompts] Sending enhanced version back to page');
      window.postMessage({ 
        type: 'TIGER_SEND_ENHANCED', 
        originalPrompt: event.data.prompt,
        enhancedPrompt: result.output 
      }, '*');
    } else {
      console.error('[Tiger Prompts] ❌ Enhancement failed, sending original');
      window.postMessage({ 
        type: 'TIGER_SEND_ENHANCED', 
        originalPrompt: event.data.prompt,
        enhancedPrompt: event.data.prompt 
      }, '*');
    }
  }
});

(function() {
  'use strict';
  
  const SUPPORTED_SITES = ['chat.openai.com', 'chatgpt.com', 'claude.ai', 'gemini.google.com', 'poe.com', 'perplexity.ai', 'www.perplexity.ai', 'you.com'];
  const host = location.hostname;
  
  console.log('[Tiger Prompts] 🐯 Content script loaded on:', host);
  console.log('[Tiger Prompts] 🔍 Is supported site?', SUPPORTED_SITES.some(site => host.includes(site)));
  console.log('[Tiger Prompts] 📐 Window width:', window.innerWidth, 'px');
  
  if (!SUPPORTED_SITES.some(site => host.includes(site))) {
    console.log('[Tiger Prompts] ❌ Site not supported, exiting');
    return;
  }
  if (document.getElementById('tp-dock-root')) {
    console.log('[Tiger Prompts] ❌ Dock already exists, exiting');
    return;
  }
  
  console.log('[Tiger Prompts] ✅ Initializing Tiger Prompts...');
  
  // ========== AUTH STATE ==========
  let authState = {
    isAuthenticated: false,
    isPro: false,
    user: null
  };
  
  // ========== DEV TESTING MODE ==========
  // Expose global functions for testing auth states
  window.TigerPromptsDevMode = {
    // Enable Pro status for testing
    enablePro: async function() {
      console.log('[Tiger Prompts] 🧪 DEV MODE: Enabling Pro status');
      await chrome.storage.local.set({ 
        authToken: 'dev_test_token',
        userEmail: 'dev@test.com',
        isPro: true
      });
      authState.isAuthenticated = true;
      authState.isPro = true;
      authState.user = { email: 'dev@test.com' };
      updateUIForAuthState();
      console.log('[Tiger Prompts] ✅ Pro status enabled - all features unlocked');
      console.log('[Tiger Prompts] Current auth state:', authState);
    },
    
    // Enable Free account for testing
    enableFree: async function() {
      console.log('[Tiger Prompts] 🧪 DEV MODE: Enabling Free account');
      await chrome.storage.local.set({ 
        authToken: 'dev_test_token',
        userEmail: 'dev@test.com',
        isPro: false
      });
      authState.isAuthenticated = true;
      authState.isPro = false;
      authState.user = { email: 'dev@test.com' };
      updateUIForAuthState();
      console.log('[Tiger Prompts] ✅ Free account enabled - basic features only');
      console.log('[Tiger Prompts] Current auth state:', authState);
    },
    
    // Sign out for testing
    signOut: async function() {
      console.log('[Tiger Prompts] 🧪 DEV MODE: Signing out');
      await chrome.storage.local.remove(['authToken', 'userEmail', 'isPro']);
      authState.isAuthenticated = false;
      authState.isPro = false;
      authState.user = null;
      updateUIForAuthState();
      console.log('[Tiger Prompts] ✅ Signed out - all features locked');
      console.log('[Tiger Prompts] Current auth state:', authState);
    },
    
    // Show current state
    getState: function() {
      console.log('[Tiger Prompts] 📊 Current Auth State:', authState);
      return authState;
    },
    
    // Help
    help: function() {
      console.log(`
🐯 TIGER PROMPTS DEV MODE
========================

Test different auth tiers:

TigerPromptsDevMode.enablePro()   - Enable Pro (all features)
TigerPromptsDevMode.enableFree()  - Enable Free (basic features)
TigerPromptsDevMode.signOut()     - Sign out (all locked)
TigerPromptsDevMode.getState()    - Show current state
TigerPromptsDevMode.help()        - Show this help

Features by tier:
- No Account: Everything locked
- Free: Light/Heavy enhance + 5 presets
- Pro: Everything unlocked (Prompt Library, Save/Sync/Inject)
      `);
    }
  };
  
  // Log dev mode availability
  console.log('[Tiger Prompts] 🧪 Dev Mode available - type TigerPromptsDevMode.help() in console');
  
  // ========== CONFIGURATION CONSTANTS ==========
  
  const CONFIG = {
  VERSION: '2.0.0',
  SIDEBAR_WIDTH: 285,
  SIDEBAR_WIDTH_COLLAPSED: 40,
  SCAN_INTERVAL: 5000,
  CLEANUP_INTERVAL: 10000,
  SIDEBAR_CHECK_INTERVAL: 5000, // Reduced from 2000ms
  TOKEN_UPDATE_INTERVAL: 1000,
  MIN_INPUT_HEIGHT: 40,
  MIN_INPUT_WIDTH: 200,
  MAX_WRAPPED_INPUTS: 2,
  MOBILE_BREAKPOINT: 768,
  POSITION_UPDATE_INTERVAL: 100,
  MUTATION_DEBOUNCE: 1000
  };
  
  const Logger = {
  info: (msg, data) => console.log('[Tiger Prompts]', msg, data || ''),
  warn: (msg, data) => console.warn('[Tiger Prompts]', msg, data || ''),
  error: (msg, data) => console.error('[Tiger Prompts]', msg, data || '')
  };
  
  // ========== RESOURCE MANAGEMENT ==========
  
  const Resources = {
  intervals: [],
  observers: [],
  eventListeners: [],
  
  addInterval(id) {
    this.intervals.push(id);
    return id;
  },
  
  addObserver(observer) {
    this.observers.push(observer);
    return observer;
  },
  
  addEventListener(element, event, handler) {
    element.addEventListener(event, handler);
    this.eventListeners.push({ element, event, handler });
  },
  
  cleanup() {
    Logger.info('Cleaning up resources...');
    
    // Clear all intervals
    this.intervals.forEach(id => clearInterval(id));
    this.intervals = [];
    
    // Disconnect all observers
    this.observers.forEach(obs => obs.disconnect());
    this.observers = [];
    
    // Remove all event listeners
    this.eventListeners.forEach(({ element, event, handler }) => {
      try {
        element.removeEventListener(event, handler);
      } catch (e) {
        // Element might be gone
      }
    });
    this.eventListeners = [];
    
    Logger.info('Cleanup complete');
  }
  };
  
  // ========== INTERVAL MANAGEMENT ==========
  
  function startAllIntervals() {
  // Re-create all intervals
  Resources.addInterval(setInterval(updateTokenDisplay, CONFIG.TOKEN_UPDATE_INTERVAL));
  Resources.addInterval(setInterval(scanAndWrapInputs, CONFIG.SCAN_INTERVAL));
  Resources.addInterval(setInterval(cleanupIncorrectButtons, CONFIG.CLEANUP_INTERVAL));
  Resources.addInterval(setInterval(enforceSidebarVisibility, CONFIG.SIDEBAR_CHECK_INTERVAL));
  }
  
  // ========== PAGE VISIBILITY MANAGEMENT ==========
  
  let intervalsActive = true;
  let savedIntervals = [];
  
  document.addEventListener('visibilitychange', () => {
  if (document.hidden && intervalsActive) {
    Logger.info('Page hidden - pausing intervals');
    // Page is hidden, pause intervals to save resources
    savedIntervals = Resources.intervals.slice();
    Resources.intervals.forEach(id => clearInterval(id));
    Resources.intervals = [];
    intervalsActive = false;
  } else if (!document.hidden && !intervalsActive) {
    Logger.info('Page visible - resuming intervals');
    // Page is visible again, restart intervals
    startAllIntervals();
    intervalsActive = true;
  }
  });
  
  // ========== ENHANCEMENT RACE CONDITION PREVENTION ==========
  
  let enhancementInProgress = false;
  
  function canStartEnhancement() {
  if (enhancementInProgress) {
    showToast('⏳ Enhancement already in progress', 'warning');
    return false;
  }
  return true;
  }
  
  function startEnhancement() {
  enhancementInProgress = true;
  }
  
  function endEnhancement() {
  enhancementInProgress = false;
  }
  
  
  
  
  
  
  
  
  
  
  const TIGER_ICON = chrome.runtime.getURL('tiger.png');
  
  // ========== AUTH STATE MANAGEMENT ==========
  
  // Load auth state on init
  async function loadAuthState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['authToken', 'userEmail', 'isPro'], (result) => {
        authState.isAuthenticated = !!(result.authToken && result.userEmail);
        authState.isPro = result.isPro || false;
        authState.user = result.userEmail ? { email: result.userEmail } : null;
        
        console.log('[Tiger Prompts] 🔐 Auth state loaded:', authState);
        resolve(authState);
      });
    });
  }
  
  // Update UI based on auth state
  function updateUIForAuthState() {
    console.log('[Tiger Prompts] 🎨 Updating UI for auth state:', authState);
    
    // Wait for shadow DOM to be ready
    if (!shadow) {
      console.warn('[Tiger Prompts] Shadow DOM not ready yet');
      return;
    }
    
    // Update login button
    const loginBtn = shadow.querySelector('#loginBtn');
    const loginBtnText = shadow.querySelector('#loginBtnText');
    
    if (authState.isAuthenticated) {
      loginBtn?.classList.add('logged-in');
      if (loginBtnText) loginBtnText.textContent = 'Logout';
    } else {
      loginBtn?.classList.remove('logged-in');
      if (loginBtnText) loginBtnText.textContent = 'Sign In';
    }
    
    // Update mode buttons - disable if not authenticated
    const modeBtns = shadow.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      if (!authState.isAuthenticated) {
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        btn.style.pointerEvents = 'auto'; // Allow clicks to show toast
      } else {
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.pointerEvents = 'auto';
      }
    });
    
    // Update preset selector - disable if not authenticated
    const presetSelector = shadow.querySelector('#presetSelector');
    if (presetSelector) {
      if (!authState.isAuthenticated) {
        presetSelector.disabled = true;
        presetSelector.style.opacity = '0.5';
        presetSelector.style.cursor = 'not-allowed';
      } else {
        presetSelector.disabled = settings.enhanceMode === 'light';
        presetSelector.style.opacity = settings.enhanceMode === 'light' ? '0.5' : '1';
        presetSelector.style.cursor = settings.enhanceMode === 'light' ? 'not-allowed' : 'pointer';
      }
    }
    
    // Update auto-enhance toggle - disable if not authenticated
    const autoToggle = shadow.querySelector('#autoToggle');
    if (autoToggle) {
      if (!authState.isAuthenticated) {
        autoToggle.style.opacity = '0.5';
        autoToggle.style.cursor = 'not-allowed';
      } else {
        autoToggle.style.opacity = '1';
        autoToggle.style.cursor = 'pointer';
      }
    }
    
    // Update prompt library - show lock if not Pro
    const promptCategorySelector = shadow.querySelector('#promptCategorySelector');
    if (promptCategorySelector) {
      if (!authState.isAuthenticated || !authState.isPro) {
        promptCategorySelector.disabled = true;
        promptCategorySelector.style.opacity = '0.5';
        promptCategorySelector.style.cursor = 'not-allowed';
      } else {
        promptCategorySelector.disabled = false;
        promptCategorySelector.style.opacity = '1';
        promptCategorySelector.style.cursor = 'pointer';
      }
    }
    
    // Update save/sync/inject buttons - disable if not Pro
    const snapBtn = shadow.querySelector('#snapBtn');
    const syncBtn = shadow.querySelector('#syncBtn');
    const injectBtn = shadow.querySelector('#injectBtn');
    
    [snapBtn, syncBtn, injectBtn].forEach(btn => {
      if (btn) {
        if (!authState.isAuthenticated || !authState.isPro) {
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
        } else {
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
        }
      }
    });
    
    // Update Pro badge (inline with ENHANCE MODE)
    const proBadgeInline = shadow.querySelector('#proBadgeInline');
    if (proBadgeInline) {
      if (authState.isAuthenticated && authState.isPro) {
        proBadgeInline.style.display = 'block';
      } else {
        proBadgeInline.style.display = 'none';
      }
    }
    
    // Update My Prompts and Store buttons - unlock if Pro
    const myPromptsBtn = shadow.querySelector('#myPromptsBtn');
    const storeBtn = shadow.querySelector('#storeBtn');
    
    if (authState.isAuthenticated && authState.isPro) {
      // Unlock buttons for Pro users
      myPromptsBtn?.classList.remove('tp-pro-locked');
      storeBtn?.classList.remove('tp-pro-locked');
    } else {
      // Lock buttons for non-Pro users
      myPromptsBtn?.classList.add('tp-pro-locked');
      storeBtn?.classList.add('tp-pro-locked');
    }
    
    // Update user info section
    const userInfo = shadow.querySelector('#userInfo');
    const userEmail = shadow.querySelector('#userEmail');
    const planBadge = shadow.querySelector('#planBadge');
    
    if (authState.isAuthenticated && authState.user) {
      if (userInfo) userInfo.style.display = 'flex';
      if (userEmail) userEmail.textContent = authState.user.email || 'user@example.com';
      if (planBadge) {
        if (authState.isPro) {
          planBadge.textContent = 'Pro Plan';
          planBadge.className = 'plan-badge pro';
        } else {
          planBadge.textContent = 'Free Plan';
          planBadge.className = 'plan-badge free';
        }
      }
    } else {
      if (userInfo) userInfo.style.display = 'none';
    }
    
    // Update promo bar (show for FREE and NO-AUTH users, hide for PRO)
    const promoBar = shadow.querySelector('#promoBar');
    if (promoBar) {
      if (!authState.isPro) {
        // Show for both no-auth and free users
        promoBar.style.display = 'flex';
      } else {
        // Hide for pro users only
        promoBar.style.display = 'none';
      }
    }
  }
  
  // ========== SIDEBAR DOCK ==========
  
  const dock = document.createElement('div');
  dock.id = 'tp-dock-root';
  dock.style.cssText = 'display:block!important;position:fixed!important;top:0!important;right:0!important;bottom:0!important;height:100vh!important;width:285px!important;z-index:2147483647!important;pointer-events:auto!important;visibility:visible!important;opacity:1!important;transform:none!important;transition:width 0.3s ease!important;';
  dock.setAttribute('data-tp-dock', 'true');
  
  const shadow = dock.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(dock);
  
  // Disable auto-enhance by default on Claude.ai due to interceptor limitations
  const isClaudeAI = location.hostname.includes('claude.ai');
  let settings = { enhanceMode: 'light', autoEnhance: !isClaudeAI };
  let snapshots = [];
  let isCollapsed = false;
  let lastEnhancement = { original: '', enhanced: '' };
  
  chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, res => {
    Logger.info('📥 Loaded settings from storage:', res);
    
    if (res?.success) {
      settings = res.settings;
      
      // Force disable auto-enhance on Claude.ai
      if (isClaudeAI) {
        settings.autoEnhance = false;
        Logger.warn('⚠️ Auto-enhance disabled on Claude.ai (interceptor not fully supported)');
      }
      
      // Log the actual values
      Logger.info('⚙️ Settings loaded:', {
        enhanceMode: settings.enhanceMode,
        autoEnhance: settings.autoEnhance
      });
      
      if (settings.autoEnhance) {
        Logger.info('✅ Auto-enhance is ENABLED');
      } else {
        Logger.warn('⚠️ Auto-enhance is DISABLED');
      }
    }
    
    updateUI();
  });
  
  chrome.runtime.sendMessage({ type: 'GET_SNAPSHOTS' }, res => {
    if (res?.success) {
      snapshots = res.snapshots || [];
      renderSnapshots();
    }
  });
  
  const style = document.createElement('style');
  style.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    
    .dock {
      position: relative;
      height: 100vh;
      width: 100%;
      background: 
        radial-gradient(circle at 20% 80%, rgba(255, 122, 0, 0.03) 0%, transparent 50%),
        radial-gradient(circle at 80% 20%, rgba(108, 99, 255, 0.02) 0%, transparent 50%),
        repeating-linear-gradient(
          0deg,
          transparent,
          transparent 2px,
          rgba(255, 255, 255, 0.01) 2px,
          rgba(255, 255, 255, 0.01) 4px
        ),
        linear-gradient(180deg, #1E1E1E 0%, #141414 50%, #0f0f0f 100%);
      border-left: 3px solid #FF7A00;
      border-top-left-radius: 16px;
      border-bottom-left-radius: 16px;
      box-shadow: 
        -6px 0 30px rgba(0,0,0,0.5),
        inset 1px 0 0 rgba(255, 122, 0, 0.1),
        -2px 0 20px rgba(255, 122, 0, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: all 0.3s ease;
    }
    
    .dock.collapsed {
      width: 40px;
    }
    
    .dock.collapsed .content,
    .dock.collapsed .footer,
    .dock.collapsed .title,
    .dock.collapsed #promoBar,
    .dock.collapsed .pro-badge-inline {
      display: none;
    }
    
    .dock.collapsed .header {
      flex-direction: column;
      padding: 8px;
    }
    
    .header {
      background: 
        repeating-linear-gradient(
          -30deg,
          transparent 0px,
          transparent 15px,
          rgba(0,0,0,0.2) 15px,
          rgba(0,0,0,0.2) 18px,
          transparent 18px,
          transparent 25px,
          rgba(0,0,0,0.25) 25px,
          rgba(0,0,0,0.25) 30px
        ),
        linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 2px solid #FF7A00;
      border-top-left-radius: 16px;
      position: relative;
    }
    
    .logo {
      height: 36px;
      flex-shrink: 0;
      transition: all 0.3s ease;
    }
    
    .logo img {
      height: 100%;
      width: auto;
      object-fit: contain;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    }
    
    .logo-full {
      display: block;
    }
    
    .logo-icon {
      display: none;
    }
    
    .dock.collapsed .logo {
      height: 32px;
    }
    
    .dock.collapsed .logo-full {
      display: none;
    }
    
    .dock.collapsed .logo-icon {
      display: block;
    }
    
    .title {
      flex: 1;
      color: white;
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: none;
    }
    
    .login-btn {
      padding: 8px 14px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-radius: 8px;
      background: #1E1E1E;
      border: 2px solid #FF7A00;
      color: white;
    }
    
    .login-btn:hover {
      background: #2A2A2A;
      border-color: #FF9940;
      box-shadow: 0 0 8px rgba(255, 122, 0, 0.5);
      transform: translateY(-1px);
    }
    
    .login-btn:active {
      transform: translateY(0);
    }
    
    .login-btn.logged-in {
      background: #1E1E1E;
      border: 2px solid #FF7A00;
      color: white;
    }
    
    .login-btn.logged-in:hover {
      background: #2A2A2A;
      border-color: #FF9940;
      box-shadow: 0 0 8px rgba(255, 122, 0, 0.5);
    }
    
    .dock.collapsed .login-btn {
      display: none;
    }
    
    .collapse-btn {
      width: 32px;
      height: 32px;
      background: #1E1E1E;
      border: 2px solid #FF7A00;
      border-radius: 8px;
      color: white;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .collapse-btn:hover {
      background: #2A2A2A;
      border-color: #FF9940;
      box-shadow: 0 0 8px rgba(255, 122, 0, 0.5);
    }
    
    .content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
    
    .content::-webkit-scrollbar {
      width: 6px;
    }
    
    .content::-webkit-scrollbar-track {
      background: #1E1E1E;
    }
    
    .content::-webkit-scrollbar-thumb {
      background: #FF7A00;
      border-radius: 3px;
    }
    
    .section {
      padding: 12px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    
    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: #FF7A00;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    
    .section-title .icon {
      width: 16px;
      height: 16px;
    }
    
    .section-title .icon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      gap: 10px;
    }
    
    .setting-label {
      font-size: 12px;
      color: #FFFFFF;
      font-weight: 500;
    }
    
    .toggle {
      position: relative;
      width: 42px;
      height: 22px;
      background: #3A3A3A;
      border-radius: 11px;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    
    .toggle.disabled {
      opacity: 0.5;
      cursor: not-allowed;
      background: #2A2A2A;
    }
    
    .toggle.active {
      background: #FF7A00;
    }
    
    .toggle.disabled.active {
      background: #884400;
    }
    
    .toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
    
    .toggle.active::after {
      transform: translateX(20px);
    }
    
    .mode-selector {
      display: flex;
      gap: 6px;
      margin-top: 8px;
      background: rgba(0,0,0,0.3);
      padding: 4px;
      border-radius: 8px;
    }
    
    .mode-btn {
      flex: 1;
      padding: 8px 10px;
      background: transparent;
      border: 2px solid transparent;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      color: rgba(255,255,255,0.6);
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }
    
    .mode-btn:hover {
      background: rgba(255,255,255,0.05);
      color: #FFFFFF;
    }
    
    .mode-btn.active {
      background: 
        linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, transparent 50%),
        linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
      border-color: transparent;
      color: #FFFFFF;
      box-shadow: 
        0 4px 16px rgba(255, 122, 0, 0.5),
        0 0 20px rgba(255, 122, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    }
    
    .preset-selector {
      width: 100%;
      padding: 10px 12px;
      background: #1E1E1E;
      color: #FFFFFF;
      border: 1px solid rgba(255,122,0,0.3);
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      margin-top: 8px;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 6L11 1' stroke='%23FFFFFF' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 36px;
    }
    
    .preset-selector:hover {
      background: #252525;
      border-color: rgba(255,122,0,0.5);
      transform: translateY(-1px);
    }
    
    .preset-selector:focus {
      outline: none;
      border-color: #FF7A00;
      box-shadow: 0 0 0 2px rgba(255, 122, 0, 0.2);
      background: #252525;
    }
    
    .preset-selector option {
      background: #2A2A2A !important;
      color: #FFFFFF !important;
      padding: 10px;
      font-weight: 600;
    }
    
    .preset-selector option:checked,
    .preset-selector option:hover {
      background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%) !important;
      color: white !important;
    }
    
    .btn {
      width: 100%;
      padding: 10px 12px;
      background: 
        linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
        linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      box-shadow: 
        0 2px 8px rgba(255, 122, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.2),
        inset 0 -1px 0 rgba(0, 0, 0, 0.2);
      position: relative;
      overflow: hidden;
    }
    
    .btn.tp-pro-locked {
      background: 
        linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
        rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.5);
      box-shadow: none;
      cursor: not-allowed;
      opacity: 0.5;
    }
    
    .btn.tp-pro-locked:hover {
      transform: none;
      box-shadow: none;
    }
    
    .btn.tp-pro-locked::before {
      display: none;
    }
    
    .btn::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(255, 255, 255, 0.3) 0%, transparent 70%);
      opacity: 0;
      transition: opacity 0.3s;
    }
    
    .btn:hover::before {
      opacity: 1;
    }
    
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 
        0 6px 20px rgba(255, 122, 0, 0.5),
        0 0 30px rgba(255, 122, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.3),
        inset 0 -1px 0 rgba(0, 0, 0, 0.2);
    }
    
    .btn:active {
      transform: translateY(0);
      box-shadow: 
        0 2px 8px rgba(255, 122, 0, 0.3),
        inset 0 2px 4px rgba(0, 0, 0, 0.2);
    }
    
    .btn.secondary {
      background: 
        linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
        linear-gradient(135deg, #6C63FF 0%, #8B84FF 100%);
      box-shadow: 
        0 2px 8px rgba(108, 99, 255, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.2),
        inset 0 -1px 0 rgba(0, 0, 0, 0.2);
    }
    
    .btn.secondary:hover {
      box-shadow: 
        0 6px 20px rgba(108, 99, 255, 0.5),
        0 0 30px rgba(108, 99, 255, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.3),
        inset 0 -1px 0 rgba(0, 0, 0, 0.2);
    }
    
    .btn.save-btn {
      background: #000000;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      padding: 10px 16px;
    }
    
    .btn.save-btn:hover {
      background: #1a1a1a;
      border-color: rgba(255, 255, 255, 0.3);
      box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
    }
    
    .btn.inject-btn {
      background: #000000;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
      padding: 10px 16px;
    }
    
    .btn.inject-btn:hover {
      background: #1a1a1a;
      border-color: rgba(255, 255, 255, 0.3);
      box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
    }
    
    .btn.sync-btn {
      background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      padding: 8px 12px;
    }
    
    .btn.sync-btn:hover {
      box-shadow: 0 4px 16px rgba(255, 122, 0, 0.5);
    }
    
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }
    
    .llm-display {
      background: rgba(255, 122, 0, 0.1);
      padding: 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 122, 0, 0.2);
    }
    
    .llm-info {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .llm-icon {
      font-size: 32px;
      line-height: 1;
      flex-shrink: 0;
    }
    
    .llm-details {
      flex: 1;
      min-width: 0;
    }
    
    .llm-name {
      font-size: 14px;
      font-weight: 700;
      color: #FFFFFF;
      margin-bottom: 2px;
    }
    
    .llm-site {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.7);
    }
    
    .token-breakdown {
      margin-bottom: 10px;
    }
    
    .token-row-mini {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    
    .token-label-sm {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.7);
      font-weight: 500;
    }
    
    .token-value-sm {
      font-size: 11px;
      font-weight: 700;
      color: #FF7A00;
    }
    
    .token-progress {
      margin-top: 8px;
    }
    
    .token-progress-bar {
      width: 100%;
      height: 8px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }
    
    .token-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #00FF88 0%, #FFD700 50%, #FF6B6B 100%);
      border-radius: 4px;
      transition: width 0.3s ease, background 0.3s ease;
      position: relative;
    }
    
    .token-progress-fill.warning {
      background: linear-gradient(90deg, #FFD700 0%, #FF9940 100%);
    }
    
    .token-progress-fill.danger {
      background: linear-gradient(90deg, #FF6B6B 0%, #FF3B3B 100%);
      animation: pulse 2s ease-in-out infinite;
    }
    
    .token-progress-text {
      font-size: 9px;
      color: rgba(255, 255, 255, 0.8);
      text-align: center;
      margin-top: 4px;
      font-weight: 600;
    }
    
    .token-label {
      color: rgba(255,255,255,0.8);
    }
    
    .token-value {
      font-weight: 700;
      font-size: 13px;
      color: #FF7A00;
    }
    
    .snap-list {
      max-height: 240px;
      overflow-y: auto;
      margin-top: 8px;
    }
    
    .snap-item {
      background: rgba(255,255,255,0.05);
      padding: 10px;
      border-radius: 6px;
      margin-bottom: 6px;
      border-left: 2px solid #6C63FF;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .snap-item:hover {
      background: rgba(255,255,255,0.08);
      transform: translateX(-3px);
    }
    
    .snap-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    
    .snap-site {
      font-size: 10px;
      font-weight: 700;
      color: #6C63FF;
      text-transform: uppercase;
    }
    
    .snap-time {
      font-size: 9px;
      color: rgba(255,255,255,0.7);
    }
    
    .snap-preview {
      font-size: 11px;
      color: #FFFFFF;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .snap-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    
    .snap-btn {
      flex: 1;
      padding: 5px;
      background: #6C63FF;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .snap-btn:hover {
      opacity: 0.9;
    }
    
    .snap-btn.delete {
      background: #ff4444;
      flex: 0.3;
    }
    
    .empty-state {
      text-align: center;
      padding: 20px;
      color: rgba(255,255,255,0.6);
      font-size: 11px;
    }
    
    .footer {
      padding: 12px 16px;
      border-top: 1px solid rgba(255,255,255,0.05);
      background: rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .footer-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .footer-link:hover {
      background: rgba(255,255,255,0.1);
      border-color: #FF7A00;
      color: #FF7A00;
    }
    
    .footer-link.tip {
      background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
      border-color: #FF7A00;
      color: white;
    }
    
    .footer-link.tip:hover {
      box-shadow: 0 2px 8px rgba(255, 122, 0, 0.4);
    }
    
    .toast {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #FF7A00;
      color: white;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
      z-index: 1000;
    }
    
    .toast.show {
      opacity: 1;
    }
    
    .tooltip {
      position: fixed;
      background: #1E1E1E;
      color: #FFFFFF;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.4;
      max-width: 220px;
      border: 1px solid #FF7A00;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      z-index: 2147483647;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      font-family: system-ui, -apple-system, sans-serif;
    }
    
    .tooltip.show {
      opacity: 1;
    }
    
    .tooltip-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      background: rgba(255, 122, 0, 0.2);
      border: 1px solid rgba(255, 122, 0, 0.4);
      border-radius: 50%;
      color: #FF7A00;
      font-size: 10px;
      font-weight: 700;
      cursor: help;
      margin-left: 6px;
      transition: all 0.2s ease;
    }
    
    /* Dark tooltip when toggle is active */
    .setting-row.active .tooltip-trigger,
    .mode-btn.active .tooltip-trigger {
      background: rgba(0, 0, 0, 0.6);
      border-color: rgba(0, 0, 0, 0.8);
      color: rgba(255, 255, 255, 0.9);
    }
    
    /* ========== ANIMATIONS ========== */
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }
    
    @keyframes bounce {
      0%, 100% { transform: translateY(0) scale(1); }
      25% { transform: translateY(-10px) scale(1.1); }
      50% { transform: translateY(0) scale(1.05); }
      75% { transform: translateY(-5px) scale(1.05); }
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(20px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    /* ========== PROMPTS MODAL ========== */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      animation: fadeIn 0.2s ease;
    }
    
    .modal-overlay.show {
      display: flex;
    }
    
    .modal-content {
      background: linear-gradient(135deg, #1E1E1E 0%, #141414 100%);
      border-radius: 16px;
      width: 90%;
      min-width: 600px;
      max-width: 800px;
      height: 85vh;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 
        0 20px 60px rgba(0, 0, 0, 0.9),
        0 0 0 1px rgba(255, 122, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
      animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    .modal-header {
      background: 
        repeating-linear-gradient(
          -30deg,
          transparent 0px,
          transparent 15px,
          rgba(0,0,0,0.2) 15px,
          rgba(0,0,0,0.2) 18px,
          transparent 18px,
          transparent 25px,
          rgba(0,0,0,0.25) 25px,
          rgba(0,0,0,0.25) 30px
        ),
        linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
      padding: 32px 40px;
      border-bottom: 3px solid #FF7A00;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      box-shadow: 0 4px 16px rgba(255, 122, 0, 0.3);
    }
    
    .modal-title {
      font-size: 28px;
      font-weight: 900;
      color: white;
      text-transform: uppercase;
      letter-spacing: 3px;
      text-shadow: 
        0 0 20px rgba(255, 122, 0, 0.6),
        0 2px 8px rgba(0, 0, 0, 0.5),
        0 4px 16px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      gap: 16px;
      text-align: center;
    }
    
    .modal-title span:first-child {
      font-size: 32px;
      filter: drop-shadow(0 0 12px rgba(255, 122, 0, 0.8));
    }
    
    .modal-close {
      position: absolute;
      top: 28px;
      right: 32px;
      background: rgba(0, 0, 0, 0.4);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 10px;
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      color: white;
      font-size: 28px;
      line-height: 1;
      padding: 0;
      font-weight: 300;
      z-index: 10;
    }
    
    .modal-close:hover {
      background: rgba(255, 0, 0, 0.3);
      border-color: rgba(255, 0, 0, 0.6);
      transform: scale(1.15) rotate(90deg);
      box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
    }
    
    .modal-subheader {
      padding: 20px 32px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    
    .modal-subheader input {
      width: 100%;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.08);
      border: 2px solid rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      font-weight: 500;
      outline: none;
      transition: all 0.2s;
    }
    
    .modal-subheader input:focus {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 122, 0, 0.5);
      box-shadow: 0 0 0 3px rgba(255, 122, 0, 0.15);
    }
    
    .modal-subheader input::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }
    
    .modal-body {
      flex: 1;
      padding: 24px 32px;
      overflow-y: auto;
    }
    
    .modal-body::-webkit-scrollbar {
      width: 8px;
    }
    
    .modal-body::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
    }
    
    .modal-body::-webkit-scrollbar-thumb {
      background: rgba(255, 122, 0, 0.5);
      border-radius: 4px;
    }
    
    .modal-body::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 122, 0, 0.7);
    }
    
    .prompts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 16px;
    }
    
    .prompt-card {
      background: 
        linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%),
        rgba(30, 30, 30, 0.6);
      border: 2px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }
    
    .prompt-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 122, 0, 0.15), transparent);
      transition: left 0.5s ease;
    }
    
    .prompt-card::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 12px;
      padding: 2px;
      background: linear-gradient(135deg, rgba(255, 122, 0, 0) 0%, rgba(255, 122, 0, 0.2) 50%, rgba(255, 122, 0, 0) 100%);
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      opacity: 0;
      transition: opacity 0.3s;
    }
    
    .prompt-card:hover {
      background: 
        linear-gradient(135deg, rgba(255, 122, 0, 0.12) 0%, rgba(255, 122, 0, 0.06) 100%),
        rgba(30, 30, 30, 0.8);
      border-color: rgba(255, 122, 0, 0.6);
      transform: translateY(-4px) scale(1.02);
      box-shadow: 
        0 8px 32px rgba(255, 122, 0, 0.4),
        0 0 20px rgba(255, 122, 0, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }
    
    .prompt-card:hover::before {
      left: 100%;
    }
    
    .prompt-card:hover::after {
      opacity: 1;
    }
    
    .prompt-card:active {
      transform: translateY(-2px) scale(1.01);
    }
    
    .prompt-card-title {
      font-size: 16px;
      font-weight: 700;
      color: #FFFFFF;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .prompt-card-description {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.5;
      margin-bottom: 12px;
    }
    
    .prompt-card-preview {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.5);
      font-family: monospace;
      background: rgba(0, 0, 0, 0.3);
      padding: 8px;
      border-radius: 4px;
      border-left: 2px solid rgba(255, 122, 0, 0.5);
      max-height: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .modal-empty {
      text-align: center;
      padding: 60px 20px;
      color: rgba(255, 255, 255, 0.5);
    }
    
    .modal-empty-icon {
      font-size: 64px;
      margin-bottom: 16px;
      opacity: 0.3;
    }
  `;
  
  const html = document.createElement('div');
  html.className = 'dock';
  html.innerHTML = `
    <div class="header">
      <div class="logo">
        <img class="logo-full" src="${chrome.runtime.getURL('logo-white.png')}" alt="Tiger Prompts"/>
        <img class="logo-icon" src="${TIGER_ICON}" alt="Tiger"/>
      </div>
      <div class="title">Tiger Prompts</div>
      <button class="login-btn" id="loginBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span id="loginBtnText">Sign In</span>
      </button>
      <button class="collapse-btn" id="collapseBtn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
    
    <!-- Upgrade Banner for Free/No-Auth Users -->
    <div id="promoBar" style="display: none; background: linear-gradient(135deg, #6C63FF 0%, #8B84FF 100%); padding: 12px 16px; border-bottom: 2px solid #6C63FF; align-items: center; gap: 12px; cursor: pointer;">
      <div style="flex: 1;">
        <div style="font-size: 12px; font-weight: 700; color: white; margin-bottom: 4px;">⚡ Upgrade to Pro</div>
        <div style="font-size: 10px; color: rgba(255,255,255,0.9);">$1.99/month • Unlock all features</div>
      </div>
      <button id="upgradeBtn" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); border-radius: 8px; padding: 8px 16px; color: white; font-size: 11px; font-weight: 700; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(10px);">
        UPGRADE
      </button>
    </div>
    
    <div class="content">
      <div class="section">
        <div class="section-title" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="icon"><img src="${chrome.runtime.getURL('paw.png')}"/></span>
            <span>ENHANCE MODE</span>
          </div>
          <div class="pro-badge-inline" id="proBadgeInline" style="display: none; background: linear-gradient(135deg, #6C63FF 0%, #8B84FF 100%); color: white; font-size: 9px; font-weight: 800; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 8px rgba(108, 99, 255, 0.4);">
            ⚡ PRO
          </div>
        </div>
        <div class="mode-selector">
          <div class="mode-btn" data-mode="light">
            ✨ Light
            <span class="tooltip-trigger" data-tooltip="light">?</span>
          </div>
          <div class="mode-btn" data-mode="heavy">
            🔥 Heavy
            <span class="tooltip-trigger" data-tooltip="heavy">?</span>
          </div>
        </div>
        <div class="setting-row" style="margin-top: 12px;">
          <span class="setting-label">
            Auto-Enhance on Send
            <span class="tooltip-trigger" data-tooltip="autoenhance">?</span>
          </span>
          <div class="toggle" id="autoToggle"></div>
        </div>
        <div class="setting-row" style="margin-top: 12px;">
          <span class="setting-label">
            AI-Agent Mode
            <span class="tooltip-trigger" data-tooltip="agentmode">?</span>
          </span>
        </div>
        <select class="preset-selector" id="presetSelector">
          <option value="none">No Agent (Light/Heavy Only)</option>
          <option value="coding">💻 Coding</option>
          <option value="legal">⚖️ Legal Documents</option>
          <option value="marketing">🎯 Marketing Copy</option>
          <option value="creative">✍️ Creative Writing</option>
          <option value="business">📊 Business Documents</option>
        </select>
      </div>
      
      <div class="section" id="promptLibrarySection">
        <div class="section-title">
          <span class="icon"><img src="${chrome.runtime.getURL('paw.png')}"/></span>
          <span>Prompt Library</span>
          <span class="tooltip-trigger" data-tooltip="promptlibrary">?</span>
          <span style="font-size: 10px; color: #FF7A00; font-weight: 700; margin-left: auto;">🔒 PRO</span>
        </div>
        <div class="section-help" style="
          background: rgba(255, 122, 0, 0.1);
          border-left: 3px solid #FF7A00;
          padding: 10px 12px;
          border-radius: 6px;
          margin-bottom: 12px;
          font-size: 10.5px;
          line-height: 1.4;
          color: rgba(255, 255, 255, 0.9);
        ">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
            <span style="background: #FF7A00; color: white; width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px; flex-shrink: 0;">1</span>
            <span style="font-weight: 600;">Select a category below</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="background: #FF7A00; color: white; width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 10px; flex-shrink: 0;">2</span>
            <span style="font-weight: 600;">Click any prompt to insert it</span>
          </div>
        </div>
        <select class="preset-selector" id="promptCategorySelector">
          <option value="">Select Category</option>
          <option value="documents">📄 Documents (10)</option>
          <option value="legal">⚖️ Legal (10)</option>
          <option value="coding">💻 Coding (10)</option>
          <option value="marketing">🎯 Marketing (10)</option>
          <option value="creative">✍️ Creative (10)</option>
        </select>
        <div class="prompt-list" id="promptList" style="margin-top: 12px; max-height: 300px; overflow-y: auto;">
          <!-- Empty by default, populated when category selected -->
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px;">
          <button class="btn tp-pro-locked" id="myPromptsBtn" style="flex: 1;">
            <span>My Prompts</span>
          </button>
          <button class="btn tp-pro-locked" id="storeBtn" style="flex: 1;">
            <span>Store</span>
          </button>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">
          <span class="icon"><img src="${chrome.runtime.getURL('paw.png')}"/></span>
          <span>Chat Context</span>
          <span class="tooltip-trigger" data-tooltip="snapshots">?</span>
        </div>
        <button class="btn sync-btn" id="syncBtn" style="margin-bottom: 10px; width: 100%;">
          <span>🔄</span>
          <span>Sync Conversation</span>
        </button>
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          <button class="btn save-btn" id="snapBtn" style="flex: 1;">
            <span>💾</span>
            <span>Save</span>
          </button>
          <button class="btn inject-btn" id="injectBtn" style="flex: 1;">
            <span>📥</span>
            <span>Inject</span>
          </button>
        </div>
        <div class="snap-list" id="snapList">
          <div class="empty-state">No saved chats</div>
        </div>
      </div>
      
      <div class="section">
        <div class="section-title">
          <span class="icon"><img src="${chrome.runtime.getURL('paw.png')}"/></span>
          <span>Active LLM</span>
          <span class="tooltip-trigger" data-tooltip="llm">?</span>
        </div>
        <div class="llm-display">
          <div class="llm-info">
            <div class="llm-icon" id="llmIcon">🤖</div>
            <div class="llm-details">
              <div class="llm-name" id="llmName">Detecting...</div>
              <div class="llm-site" id="llmSite">Scanning page...</div>
            </div>
          </div>
          
          <div class="token-breakdown">
            <div class="token-row-mini">
              <span class="token-label-sm">Current Input:</span>
              <span class="token-value-sm" id="tokenInput">0</span>
            </div>
            <div class="token-row-mini" id="messageCountRow" style="display: none;">
              <span class="token-label-sm">Messages:</span>
              <span class="token-value-sm" id="messageCount">0</span>
            </div>
            <div class="token-row-mini">
              <span class="token-label-sm">Conversation:</span>
              <span class="token-value-sm" id="tokenTotal">0</span>
            </div>
            <div class="token-row-mini" id="tokenInputOutputRow" style="display: none;">
              <span class="token-label-sm">├─ Input:</span>
              <span class="token-value-sm" id="tokenInputTotal">0</span>
            </div>
            <div class="token-row-mini" id="tokenOutputRow" style="display: none;">
              <span class="token-label-sm">└─ Output:</span>
              <span class="token-value-sm" id="tokenOutputTotal">0</span>
            </div>
            <div class="token-row-mini" id="tokensRemainingRow" style="display: none;">
              <span class="token-label-sm">Remaining:</span>
              <span class="token-value-sm" id="tokensRemaining">200K</span>
            </div>
            <div class="token-row-mini">
              <span class="token-label-sm">Context Limit:</span>
              <span class="token-value-sm" id="tokenLimit">128K</span>
            </div>
            <!-- Cost tracking for Claude -->
            <div class="token-row-mini" id="costThisConvoRow" style="display: none; margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">
              <span class="token-label-sm">Conversation Cost:</span>
              <span class="token-value-sm" id="costThisConvo" style="color: #4ade80;">$0.000</span>
            </div>
            <div class="token-row-mini" id="costInputRow" style="display: none;">
              <span class="token-label-sm">├─ Input Cost:</span>
              <span class="token-value-sm" id="costInput" style="color: #60a5fa;">$0.000</span>
            </div>
            <div class="token-row-mini" id="costOutputRow" style="display: none;">
              <span class="token-label-sm">└─ Output Cost:</span>
              <span class="token-value-sm" id="costOutput" style="color: #fbbf24;">$0.000</span>
            </div>
          </div>
          
          <div class="token-progress">
            <div class="token-progress-bar">
              <div class="token-progress-fill" id="tokenProgressFill" style="width: 0%"></div>
            </div>
            <div class="token-progress-text" id="tokenProgressText">0%</div>
          </div>
        </div>
      </div>
      
      <div class="section" id="enhancement-notification">
        <!-- Dynamic enhancement results will appear here -->
      </div>
    </div>
    
    <div class="footer">
      <div style="font-size: 10px; color: #666; margin-bottom: 8px; text-align: center;">
        Tiger Prompts v${CONFIG.VERSION}
      </div>
      <a href="https://tigerprompts.com" target="_blank" class="footer-link">
        🌐 tigerprompts.com
      </a>
      <a href="https://buymeacoffee.com/tigerprompts" target="_blank" class="footer-link tip">
        ☕ Tip the Developer
      </a>
    </div>
    
    <div class="toast" id="toast"></div>
    
    <!-- Prompts Modal -->
    <div class="modal-overlay" id="promptsModal">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">
            <span id="modalCategoryIcon">📚</span>
            <span id="modalCategoryName">Prompts</span>
          </div>
          <button class="modal-close" id="modalClose">×</button>
        </div>
        <div class="modal-subheader">
          <input 
            type="text" 
            id="promptSearch" 
            placeholder="Search prompts..." 
            style="
              width: 100%;
              padding: 10px 14px;
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 8px;
              color: #fff;
              font-size: 14px;
              outline: none;
            "
          />
        </div>
        <div class="modal-instructions" style="
          background: linear-gradient(135deg, rgba(255, 122, 0, 0.15) 0%, rgba(255, 122, 0, 0.05) 100%);
          border: 2px solid rgba(255, 122, 0, 0.3);
          border-radius: 12px;
          padding: 16px 24px;
          margin: 20px 32px;
          display: flex;
          align-items: center;
          gap: 24px;
          box-shadow: 0 4px 16px rgba(255, 122, 0, 0.2);
        ">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <div style="
              background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 900;
              font-size: 16px;
              flex-shrink: 0;
              box-shadow: 0 0 20px rgba(255, 122, 0, 0.6), 0 4px 12px rgba(255, 122, 0, 0.4);
            ">1</div>
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 13px; color: #FF7A00; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Step One</div>
              <div style="font-size: 12px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">Click <strong>"📍 Select Input"</strong> to target the text field</div>
            </div>
          </div>
          <div style="color: rgba(255, 122, 0, 0.4); font-size: 24px; font-weight: 300;">→</div>
          <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <div style="
              background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 900;
              font-size: 16px;
              flex-shrink: 0;
              box-shadow: 0 0 20px rgba(255, 122, 0, 0.6), 0 4px 12px rgba(255, 122, 0, 0.4);
            ">2</div>
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 13px; color: #FF7A00; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Step Two</div>
              <div style="font-size: 12px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">Click any prompt below to <strong>"💉 Inject"</strong> it</div>
            </div>
          </div>
        </div>
        <div class="modal-body">
          <div class="prompts-grid" id="promptsGrid">
            <!-- Prompts will be inserted here -->
          </div>
        </div>
        <div class="modal-footer" id="modalFooter" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          border-top: 1px solid rgba(255,255,255,0.1);
        ">
          <button id="prevPage" style="
            padding: 8px 16px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
          ">← Previous</button>
          <span id="pageInfo" style="color: rgba(255,255,255,0.7); font-size: 14px;">Page 1 of 1</span>
          <button id="nextPage" style="
            padding: 8px 16px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
          ">Next →</button>
        </div>
      </div>
    </div>
    
    <!-- My Prompts Modal -->
    <div class="modal-overlay" id="myPromptsModal">
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-title">
            <span id="myPromptsIcon">⭐</span>
            <span>My Prompts</span>
          </div>
          <button class="modal-close" id="myPromptsClose">×</button>
        </div>
        <div class="modal-subheader">
          <input 
            type="text" 
            id="myPromptsSearch" 
            placeholder="Search my prompts..." 
            style="
              width: 100%;
              padding: 10px 14px;
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 8px;
              color: #fff;
              font-size: 14px;
              outline: none;
            "
          />
        </div>
        <div style="padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.1);">
          <button id="createPromptBtn" style="
            width: 100%;
            min-height: 120px;
            padding: 24px;
            background: 
              linear-gradient(180deg, rgba(255, 122, 0, 0.03) 0%, transparent 100%),
              rgba(255, 255, 255, 0.02);
            border: 2px dashed rgba(255, 122, 0, 0.4);
            border-radius: 12px;
            color: #fff;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
          ">
            <div style="
              width: 48px;
              height: 48px;
              background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 24px;
              box-shadow: 0 4px 12px rgba(255, 122, 0, 0.4);
            ">➕</div>
            <div style="
              font-weight: 600;
              font-size: 14px;
              color: rgba(255, 255, 255, 0.7);
              letter-spacing: 0.5px;
            ">Create New Prompt</div>
          </button>
        </div>
        <div class="modal-instructions" style="
          background: linear-gradient(135deg, rgba(255, 122, 0, 0.15) 0%, rgba(255, 122, 0, 0.05) 100%);
          border: 2px solid rgba(255, 122, 0, 0.3);
          border-radius: 12px;
          padding: 16px 24px;
          margin: 20px 32px;
          display: flex;
          align-items: center;
          gap: 24px;
          box-shadow: 0 4px 16px rgba(255, 122, 0, 0.2);
        ">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <div style="
              background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 900;
              font-size: 16px;
              flex-shrink: 0;
              box-shadow: 0 0 20px rgba(255, 122, 0, 0.6), 0 4px 12px rgba(255, 122, 0, 0.4);
            ">1</div>
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 13px; color: #FF7A00; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Step One</div>
              <div style="font-size: 12px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">Click <strong>"📍 Select Input"</strong> to target the text field</div>
            </div>
          </div>
          <div style="color: rgba(255, 122, 0, 0.4); font-size: 24px; font-weight: 300;">→</div>
          <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <div style="
              background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
              color: white;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 900;
              font-size: 16px;
              flex-shrink: 0;
              box-shadow: 0 0 20px rgba(255, 122, 0, 0.6), 0 4px 12px rgba(255, 122, 0, 0.4);
            ">2</div>
            <div style="flex: 1;">
              <div style="font-weight: 700; font-size: 13px; color: #FF7A00; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Step Two</div>
              <div style="font-size: 12px; color: rgba(255, 255, 255, 0.9); font-weight: 500;">Click any prompt below to <strong>"💉 Inject"</strong> it</div>
            </div>
          </div>
        </div>
        <div class="modal-body">
          <div class="prompts-grid" id="myPromptsGrid">
            <!-- My prompts will be inserted here -->
          </div>
        </div>
        <div class="modal-footer" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          border-top: 1px solid rgba(255,255,255,0.1);
        ">
          <button id="myPromptsPrev" style="
            padding: 8px 16px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
          ">← Previous</button>
          <span id="myPromptsPageInfo" style="color: rgba(255,255,255,0.7); font-size: 14px;">Page 1 of 1</span>
          <button id="myPromptsNext" style="
            padding: 8px 16px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            color: #fff;
            cursor: pointer;
            font-size: 14px;
          ">Next →</button>
        </div>
      </div>
    </div>
  `;
  
  shadow.appendChild(style);
  shadow.appendChild(html);
  
  const $ = (sel) => shadow.querySelector(sel);
  
  // Tooltip system
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'tooltip';
  shadow.appendChild(tooltipEl);
  
  const tooltipContent = {
    light: 'Quick polish for simple inquiries. Adds clarity and fixes grammar without major restructuring. AI-Agent Modes are DISABLED in Light mode for maximum speed.',
    heavy: 'Comprehensive enhancement for complex projects. Adds detailed markdown structure, clear sections, and comprehensive requirements. AI-Agent Modes work in Heavy mode only.',
    llm: 'Shows which AI you\'re using with accurate tracking. For Claude: conversation tracking unavailable (HTML not exposed). For ChatGPT: tracks tokens and conversation length. Progress bar warns when approaching context limits (green → yellow → red).',
    snapshots: 'Save clean chat history from most LLM sites. Note: Not supported on Claude.ai (HTML not exposed). Click "Inject Chat" to copy formatted context and paste into a new conversation to restore full context.',
    autoenhance: 'When enabled, your messages are automatically enhanced before sending. Just type and press Enter (or click Send) - Tiger Prompts will enhance it first, then send the improved version.',
    agentmode: 'Choose a specialized AI agent for your task. Toggle to Heavy for Agents.',
    promptlibrary: 'Access 50+ professional prompt templates. Select a category, browse prompts, and click any prompt to instantly inject it into your input field. Works even if you haven\'t clicked the input yet!'
  };
  
  shadow.querySelectorAll('.tooltip-trigger').forEach(trigger => {
    trigger.addEventListener('mouseenter', (e) => {
      const type = trigger.dataset.tooltip;
      const content = tooltipContent[type];
      if (!content) return;
      
      tooltipEl.textContent = content;
      tooltipEl.classList.add('show');
      
      const triggerRect = trigger.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      
      // Position to the LEFT of sidebar to avoid clipping
      tooltipEl.style.top = `${triggerRect.top}px`;
      tooltipEl.style.left = `${dockRect.left - 240}px`; // 240px = tooltip width + margin
    });
    
    trigger.addEventListener('mouseleave', () => {
      tooltipEl.classList.remove('show');
    });
  });
  
  // ========== ENHANCED NOTIFICATION SYSTEM ==========
  
  function showToast(msg, type = 'info') {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('error', 'success', 'loading', 'warning');
    
    if (type === 'error') {
      t.style.background = 'linear-gradient(135deg, #FF3B3B 0%, #FF6B6B 100%)';
      t.style.borderLeft = '4px solid #FF0000';
    } else if (type === 'success') {
      t.style.background = 'linear-gradient(135deg, #00D26A 0%, #00F593 100%)';
      t.style.borderLeft = '4px solid #00FF88';
    } else if (type === 'loading') {
      t.style.background = 'linear-gradient(135deg, #FF7A00 0%, #FF9940 100%)';
      t.style.borderLeft = '4px solid #FF7A00';
    } else if (type === 'warning') {
      t.style.background = 'linear-gradient(135deg, #FFA500 0%, #FFB733 100%)';
      t.style.borderLeft = '4px solid #FF8C00';
    } else {
      t.style.background = 'linear-gradient(135deg, #6C63FF 0%, #8B84FF 100%)';
      t.style.borderLeft = '4px solid #6C63FF';
    }
    
    t.classList.add('show');
    const duration = type === 'loading' ? 5000 : 3000;
    setTimeout(() => t.classList.remove('show'), duration);
  }
  
  // Tiger button loading animation
  function startTigerLoading(button) {
    const img = button.querySelector('img');
    if (!img) return;
    
    // Disable button
    button.setAttribute('disabled', 'true');
    button.style.cursor = 'not-allowed';
    button.style.opacity = '0.7';
    
    // Add spinning animation
    img.style.animation = 'spin 1s linear infinite';
    
    // Add glow effect to button
    button.style.setProperty('box-shadow', '0 0 30px rgba(255,122,0,1), 0 0 60px rgba(255,122,0,0.6)', 'important');
    button.style.setProperty('animation', 'pulse 1s ease-in-out infinite', 'important');
  }
  
  function stopTigerLoading(button) {
    const img = button.querySelector('img');
    if (!img) return;
    
    // Stop spinning
    img.style.animation = 'none';
    
    // Reset glow
    button.style.setProperty('box-shadow', '0 4px 16px rgba(255,122,0,0.7),0 0 0 3px rgba(255,122,0,0.3)', 'important');
    button.style.setProperty('animation', 'none', 'important');
  }
  
  // Tiger success animation
  function tigerSuccessAnimation(button) {
    const img = button.querySelector('img');
    if (!img) return;
    
    // Bounce animation
    button.style.animation = 'bounce 0.6s ease-out';
    
    // Green glow
    button.style.setProperty('box-shadow', '0 0 30px rgba(0,255,136,0.8), 0 0 60px rgba(0,255,136,0.4)', 'important');
    
    // Reset after animation
    setTimeout(() => {
      button.style.animation = 'none';
      button.style.setProperty('box-shadow', '0 4px 16px rgba(255,122,0,0.7),0 0 0 3px rgba(255,122,0,0.3)', 'important');
    }, 600);
  }
  
  // Show detailed explanation in sidebar
  function showSidebarNotification(data) {
    const notifSection = shadow.querySelector('#enhancement-notification');
    if (!notifSection) return;
    
    const modeEmoji = data.mode === 'light' ? '✨' : '🔥';
    const modeLabel = data.mode === 'light' ? 'Light Polish' : 'Heavy Enhancement';
    const delta = parseFloat(data.delta);
    const deltaColor = delta > 0 ? '#00FF88' : '#FF6B6B';
    const deltaSign = delta > 0 ? '+' : '';
    
    let explanationHTML = '';
    if (data.explanation && Array.isArray(data.explanation)) {
      explanationHTML = data.explanation.map(item => `<div style="font-size:11px;color:#CCC;margin:4px 0;line-height:1.5;">${item}</div>`).join('');
    }
    
    notifSection.innerHTML = `
      <div style="background:rgba(255,122,0,0.1);border-left:4px solid #FF7A00;padding:12px;border-radius:8px;margin-bottom:12px;animation:slideIn 0.3s ease-out;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="font-size:20px;">${modeEmoji}</span>
          <span style="font-weight:700;font-size:13px;color:#FFF;">${modeLabel}</span>
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          <div style="background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;text-align:center;">
            <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">PQS Before</div>
            <div style="font-size:16px;font-weight:700;color:#FF7A00;">${data.pqsBefore}</div>
          </div>
          <div style="background:rgba(0,0,0,0.3);padding:8px;border-radius:6px;text-align:center;">
            <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">PQS After</div>
            <div style="font-size:16px;font-weight:700;color:#00FF88;">${data.pqsAfter}</div>
          </div>
        </div>
        
        <div style="text-align:center;padding:6px;background:rgba(0,0,0,0.3);border-radius:6px;margin-bottom:10px;">
          <span style="font-size:11px;color:#AAA;">Improvement: </span>
          <span style="font-size:14px;font-weight:700;color:${deltaColor};">${deltaSign}${data.delta}</span>
        </div>
        
        <div style="font-size:10px;color:#888;margin-bottom:8px;">
          <span>Length: ${data.originalLength} → ${data.enhancedLength} chars</span>
        </div>
        
        <div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
          ${explanationHTML}
        </div>
        
        <button onclick="this.parentElement.parentElement.remove()" style="width:100%;margin-top:8px;padding:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:4px;color:#AAA;font-size:10px;cursor:pointer;transition:all 0.2s;">
          Dismiss
        </button>
      </div>
    `;
    
    // Auto-scroll to notification
    notifSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  function getActiveInput() {
    if (activeField) return activeField;
    
    const selectors = ['textarea', '[contenteditable="true"]', 'input[type="text"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  
  function getFieldValue(field) {
    return field.value !== undefined ? field.value : (field.innerText || field.textContent || '');
  }
  
  function setFieldValue(field, value) {
    if (field.value !== undefined) {
      // For textarea and input elements
      field.value = value;
      
      // Trigger multiple events to ensure the site recognizes the change
      field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      field.dispatchEvent(new Event('keyup', { bubbles: true, cancelable: true }));
      
      // Also trigger compositionend which some sites use
      field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, cancelable: true }));
    } else {
      // For contenteditable divs
      field.innerText = value;
      
      // Trigger multiple events for contenteditable
      field.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      field.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      field.dispatchEvent(new Event('keyup', { bubbles: true, cancelable: true }));
      
      // Set focus and move cursor to end
      field.focus();
      
      // Move cursor to end of content
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(field);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  
  // LLM Detection Configuration
  const LLM_CONFIG = {
    'chatgpt.com': { name: 'ChatGPT', icon: '💬', site: 'OpenAI', contextLimit: 128000, encoding: 'cl100k_base' },
    'chat.openai.com': { name: 'ChatGPT', icon: '💬', site: 'OpenAI', contextLimit: 128000, encoding: 'cl100k_base' },
    'claude.ai': { name: 'Claude', icon: '🤖', site: 'Anthropic', contextLimit: 200000, encoding: 'claude' },
    'gemini.google.com': { name: 'Gemini', icon: '🔷', site: 'Google', contextLimit: 1000000, encoding: 'gemini' },
    'poe.com': { name: 'Poe', icon: '🦜', site: 'Quora', contextLimit: 128000, encoding: 'cl100k_base' },
    'perplexity.ai': { name: 'Perplexity', icon: '🔮', site: 'Perplexity AI', contextLimit: 128000, encoding: 'cl100k_base' },
    'www.perplexity.ai': { name: 'Perplexity', icon: '🔮', site: 'Perplexity AI', contextLimit: 128000, encoding: 'cl100k_base' },
    'you.com': { name: 'You.com', icon: '🌐', site: 'You.com', contextLimit: 128000, encoding: 'cl100k_base' }
  };
  
  // Claude API Cost Constants (Sonnet 4.5)
  // https://www.anthropic.com/pricing
  const CLAUDE_COSTS = {
    INPUT_PER_MILLION: 3.00,    // $3.00 per 1M input tokens
    OUTPUT_PER_MILLION: 15.00   // $15.00 per 1M output tokens
  };
  
  // Conversation tracking
  let conversationTokens = {
    input: 0,
    output: 0,
    total: 0,
    messageCount: 0,
    messages: [],
    // Cost tracking (for Claude Sonnet)
    costInput: 0,      // Cost of input tokens
    costOutput: 0,     // Cost of output tokens
    costTotal: 0,      // Total cost of conversation
    // Warning flags
    warned80: false,
    warned90: false,
    warnedMsgLimit: false
  };
  
  // Token counting library
  let tokenEncoder = null;
  let tokenizerLoaded = false;
  
  // Load GPT tokenizer from CDN
  async function loadTokenizer() {
    if (tokenizerLoaded) return true;
    
    try {
      // Use the encode function from gpt-tokenizer
      // We'll implement a simple but accurate approximation based on OpenAI's rules
      tokenizerLoaded = true;
      Logger.info('✅ Token counter initialized (using OpenAI approximation)');
      return true;
    } catch (error) {
      Logger.error('Failed to load tokenizer:', error);
      return false;
    }
  }
  
  // Accurate token counting function (matches OpenAI's cl100k_base encoding)
  function countTokensAccurate(text) {
    if (!text) return 0;
    
    // OpenAI's tokenizer rules (simplified but accurate approximation):
    // - Average English word: ~1.3 tokens
    // - Each space: counted with adjacent word
    // - Special characters: usually 1 token each
    // - Numbers: ~1 token per number
    // - Code: ~1.5 tokens per word
    
    let tokenCount = 0;
    
    // Count words
    const words = text.match(/\b\w+\b/g) || [];
    tokenCount += words.length * 1.3;
    
    // Count special characters (punctuation, symbols)
    const specialChars = text.match(/[^\w\s]/g) || [];
    tokenCount += specialChars.length * 0.5;
    
    // Count newlines (each is typically 1 token)
    const newlines = (text.match(/\n/g) || []).length;
    tokenCount += newlines;
    
    // Code detection (if text has multiple code-like patterns)
    const codePatterns = (text.match(/[{}()\[\];=>]/g) || []).length;
    if (codePatterns > 10) {
      tokenCount *= 1.15; // Code uses ~15% more tokens
    }
    
    return Math.round(tokenCount);
  }
  
  function detectLLM() {
    const hostname = location.hostname;
    
    for (const [site, config] of Object.entries(LLM_CONFIG)) {
      if (hostname.includes(site)) {
        return config;
      }
    }
    
    // Fallback for unknown sites
    return { name: 'Unknown LLM', icon: '❓', site: hostname, contextLimit: 128000, encoding: 'unknown' };
  }
  
  function updateLLMDisplay() {
    const llmInfo = detectLLM();
    
    const llmIcon = $('#llmIcon');
    const llmName = $('#llmName');
    const llmSite = $('#llmSite');
    const tokenLimit = $('#tokenLimit');
    
    if (llmIcon) llmIcon.textContent = llmInfo.icon;
    if (llmName) llmName.textContent = llmInfo.name;
    if (llmSite) llmSite.textContent = llmInfo.site;
    
    // Format context limit
    if (tokenLimit) {
      const limitFormatted = llmInfo.contextLimit >= 1000000 
        ? `${(llmInfo.contextLimit / 1000000).toFixed(1)}M`
        : `${(llmInfo.contextLimit / 1000).toFixed(0)}K`;
      tokenLimit.textContent = limitFormatted;
    }
  }
  
  function updateTokenDisplay() {
    const field = getActiveInput();
    const text = field ? getFieldValue(field) : '';
    const inputTokens = countTokensAccurate(text);
    const llmInfo = detectLLM();
    const hostname = location.hostname;
    const isClaudeAI = hostname.includes('claude.ai');
    
    // Update current input tokens
    const tokenInput = $('#tokenInput');
    if (tokenInput) {
      tokenInput.textContent = inputTokens.toLocaleString();
    }
    
    // Show/hide message count based on LLM (especially useful for Claude)
    const messageCountRow = $('#messageCountRow');
    const messageCountEl = $('#messageCount');
    
    if (isClaudeAI) {
      // Show message count for Claude (important for rate limits)
      if (messageCountRow) messageCountRow.style.display = 'flex';
      if (messageCountEl) {
        messageCountEl.textContent = conversationTokens.messageCount || 0;
      }
      
      // Claude-specific message warnings (Free tier: ~5-10 messages, Pro: ~500/day)
      const msgCount = conversationTokens.messageCount || 0;
      if (msgCount >= 8 && !conversationTokens.warnedMsgLimit) {
        showToast('⚠️ Claude Free tier: Approaching message limit (~10 messages)', 'warning');
        conversationTokens.warnedMsgLimit = true;
      }
    } else {
      // Hide message count for other LLMs (not as critical)
      if (messageCountRow) messageCountRow.style.display = 'none';
    }
    
    // Calculate total tokens (conversation history + current input)
    const totalTokens = conversationTokens.total + inputTokens;
    
    // Update conversation total
    const tokenTotal = $('#tokenTotal');
    if (tokenTotal) {
      tokenTotal.textContent = totalTokens.toLocaleString();
    }
    
    // Show/hide detailed token breakdown for Claude
    const tokenInputOutputRow = $('#tokenInputOutputRow');
    const tokenOutputRow = $('#tokenOutputRow');
    const tokensRemainingRow = $('#tokensRemainingRow');
    const tokenInputTotal = $('#tokenInputTotal');
    const tokenOutputTotal = $('#tokenOutputTotal');
    const tokensRemaining = $('#tokensRemaining');
    
    if (isClaudeAI) {
      // Show detailed breakdown
      if (tokenInputOutputRow) tokenInputOutputRow.style.display = 'flex';
      if (tokenOutputRow) tokenOutputRow.style.display = 'flex';
      if (tokensRemainingRow) tokensRemainingRow.style.display = 'flex';
      
      // Update input/output counts (exclude current input)
      if (tokenInputTotal) {
        const totalInput = (conversationTokens.input || 0);
        tokenInputTotal.textContent = totalInput.toLocaleString();
      }
      if (tokenOutputTotal) {
        tokenOutputTotal.textContent = (conversationTokens.output || 0).toLocaleString();
      }
      
      // Calculate and show remaining tokens
      const remaining = Math.max(0, llmInfo.contextLimit - totalTokens);
      if (tokensRemaining) {
        const remainingFormatted = remaining >= 1000 
          ? `${(remaining / 1000).toFixed(1)}K`
          : remaining.toString();
        tokensRemaining.textContent = remainingFormatted;
        
        // Color code based on how much is remaining
        if (remaining < llmInfo.contextLimit * 0.1) {
          tokensRemaining.style.color = '#ef4444'; // red
        } else if (remaining < llmInfo.contextLimit * 0.3) {
          tokensRemaining.style.color = '#fbbf24'; // yellow
        } else {
          tokensRemaining.style.color = '#4ade80'; // green
        }
      }
      
      // Calculate and show costs
      const costThisConvoRow = $('#costThisConvoRow');
      const costInputRow = $('#costInputRow');
      const costOutputRow = $('#costOutputRow');
      const costThisConvo = $('#costThisConvo');
      const costInputEl = $('#costInput');
      const costOutputEl = $('#costOutput');
      
      // Calculate costs (conversation history only, not including current input yet)
      const inputCost = ((conversationTokens.input || 0) / 1000000) * CLAUDE_COSTS.INPUT_PER_MILLION;
      const outputCost = ((conversationTokens.output || 0) / 1000000) * CLAUDE_COSTS.OUTPUT_PER_MILLION;
      const totalCost = inputCost + outputCost;
      
      // Update cost displays
      if (costThisConvoRow) costThisConvoRow.style.display = 'flex';
      if (costInputRow) costInputRow.style.display = 'flex';
      if (costOutputRow) costOutputRow.style.display = 'flex';
      
      if (costThisConvo) {
        costThisConvo.textContent = `$${totalCost.toFixed(4)}`;
      }
      if (costInputEl) {
        costInputEl.textContent = `$${inputCost.toFixed(4)}`;
      }
      if (costOutputEl) {
        costOutputEl.textContent = `$${outputCost.toFixed(4)}`;
      }
      
      // Store costs in conversationTokens
      conversationTokens.costInput = inputCost;
      conversationTokens.costOutput = outputCost;
      conversationTokens.costTotal = totalCost;
      
    } else {
      // Hide Claude-specific details for other platforms
      if (tokenInputOutputRow) tokenInputOutputRow.style.display = 'none';
      if (tokenOutputRow) tokenOutputRow.style.display = 'none';
      if (tokensRemainingRow) tokensRemainingRow.style.display = 'none';
      if ($('#costThisConvoRow')) $('#costThisConvoRow').style.display = 'none';
      if ($('#costInputRow')) $('#costInputRow').style.display = 'none';
      if ($('#costOutputRow')) $('#costOutputRow').style.display = 'none';
    }
    
    // Update progress bar
    const percentage = Math.min((totalTokens / llmInfo.contextLimit) * 100, 100);
    
    const progressFill = $('#tokenProgressFill');
    const progressText = $('#tokenProgressText');
    
    if (progressFill) {
      progressFill.style.width = `${percentage}%`;
      
      // Color coding based on usage
      progressFill.classList.remove('warning', 'danger');
      if (percentage >= 90) {
        progressFill.classList.add('danger');
      } else if (percentage >= 70) {
        progressFill.classList.add('warning');
      }
    }
    
    if (progressText) {
      progressText.textContent = `${percentage.toFixed(1)}% of context`;
    }
    
    // Show warning toasts at thresholds
    if (percentage >= 90 && !conversationTokens.warned90) {
      if (isClaudeAI) {
        showToast('⚠️ Claude context at 90%! Claude\'s quality degrades near limits.', 'warning');
      } else {
        showToast('⚠️ Context usage at 90%! Consider starting a new chat.', 'warning');
      }
      conversationTokens.warned90 = true;
    } else if (percentage >= 80 && !conversationTokens.warned80) {
      showToast('📊 Context usage at 80%', 'info');
      conversationTokens.warned80 = true;
    }
  }
  
  // Track conversation tokens by observing LLM responses
  function trackConversationTokens() {
    const llmInfo = detectLLM();
    
    // Only track for supported sites
    if (!llmInfo.encoding || llmInfo.encoding === 'unknown') return;
    
    // DISABLED for Claude - unreliable HTML structure
    if (location.hostname.includes('claude.ai')) {
      Logger.info('⏭️ Conversation tracking disabled for Claude (HTML not exposed)');
      
      // Show "Not Available" in the UI
      const messageCountEl = document.querySelector('#messageCount');
      const tokenInputTotal = document.querySelector('#tokenInputTotal');
      const tokenOutputTotal = document.querySelector('#tokenOutputTotal');
      
      if (messageCountEl) messageCountEl.textContent = 'N/A';
      if (tokenInputTotal) tokenInputTotal.textContent = 'N/A';
      if (tokenOutputTotal) tokenOutputTotal.textContent = 'N/A';
      
      return; // Don't track Claude at all
    }
    
    // Observe the chat container for new messages
    const chatContainer = document.querySelector('[class*="conversation"], [class*="thread"], main');
    if (!chatContainer) return;
    
    let updateTimeout = null;
    
    // Function to update counts
    function updateCounts() {
      // Count all visible messages
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let messageCount = 0;
      
      const hostname = location.hostname;
      
      if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) {
        // ChatGPT specific tracking
        const messages = document.querySelectorAll('[data-message-author-role]');
        
        messages.forEach(msg => {
          const role = msg.getAttribute('data-message-author-role');
          const contentEl = msg.querySelector('.markdown, [class*="markdown"], [class*="message-content"]');
          
          if (contentEl) {
            messageCount++;
            const text = contentEl.innerText || contentEl.textContent || '';
            const tokens = countTokensAccurate(text);
            
            if (role === 'user') {
              totalInputTokens += tokens;
            } else if (role === 'assistant') {
              totalOutputTokens += tokens;
            }
          }
        });
        
        Logger.info('📊 ChatGPT conversation updated:', {
          messages: messageCount,
          input: totalInputTokens,
          output: totalOutputTokens,
          total: totalInputTokens + totalOutputTokens
        });
      }
      
      // Update conversation totals (exclude current input field)
      conversationTokens.input = totalInputTokens;
      conversationTokens.output = totalOutputTokens;
      conversationTokens.total = totalInputTokens + totalOutputTokens;
      conversationTokens.messageCount = messageCount;
      
      // Force UI update
      updateTokenDisplay();
    }
    
    // Debounced observer
    const observer = new MutationObserver(() => {
      // Debounce updates to avoid excessive recalculations
      if (updateTimeout) clearTimeout(updateTimeout);
      
      updateTimeout = setTimeout(() => {
        updateCounts();
      }, 500); // Wait 500ms after changes stop
    });
    
    observer.observe(chatContainer, {
      childList: true,
      subtree: true,
      characterData: true, // Also watch for text changes
      characterDataOldValue: false
    });
    
    Resources.addObserver(observer);
    
    // Manual periodic update to catch missed changes (every 2 seconds)
    const periodicUpdate = setInterval(() => {
      updateCounts();
    }, 2000);
    
    Resources.addInterval(periodicUpdate);
    
    Logger.info(`✅ Conversation token tracking initialized for ${llmInfo.name}`);
  }
  
  // Detect new chat and reset counters
  function detectNewChat() {
    let lastUrl = location.href;
    
    setInterval(() => {
      const currentUrl = location.href;
      
      // URL changed = new chat
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        
        // Reset conversation tracking
        conversationTokens = {
          input: 0,
          output: 0,
          total: 0,
          messageCount: 0,
          messages: [],
          costInput: 0,
          costOutput: 0,
          costTotal: 0,
          warned80: false,
          warned90: false,
          warnedMsgLimit: false
        };
        
        Logger.info('🔄 New chat detected - token counters reset');
        updateTokenDisplay();
      }
    }, 1000);
  }
  
  // Initialize token counter
  loadTokenizer().then(() => {
    trackConversationTokens();
    detectNewChat();
  });
  
  // Initial LLM detection
  updateLLMDisplay();
  
  function updateUI() {
    shadow.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === settings.enhanceMode);
    });
    
    // Disable and grey out auto-enhance toggle on Claude.ai
    const autoToggle = $('#autoToggle');
    const autoRow = autoToggle?.closest('.setting-row');
    
    if (isClaudeAI) {
      autoToggle.classList.remove('active');
      autoToggle.classList.add('disabled');
      autoToggle.style.pointerEvents = 'none';
      if (autoRow) autoRow.classList.remove('active');
    } else {
      autoToggle.classList.toggle('active', settings.autoEnhance);
      autoToggle.classList.remove('disabled');
      autoToggle.style.pointerEvents = 'auto';
      // Add active class to parent row for tooltip styling
      if (autoRow) autoRow.classList.toggle('active', settings.autoEnhance);
    }
  }
  
  function saveSettings() {
    chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  }
  
  // Collapse button
  $('#collapseBtn').addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    dock.style.width = isCollapsed ? '40px' : '285px';
    document.documentElement.classList.toggle('tp-collapsed', isCollapsed);
    $('.dock').classList.toggle('collapsed', isCollapsed);
    // Rotate the chevron: 180deg when collapsed (pointing left), 0deg when open (pointing right)
    const svg = $('#collapseBtn svg');
    if (svg) {
      svg.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
      svg.style.transition = 'transform 0.3s ease';
    }
  });
  
  // ========== FIREBASE AUTHENTICATION INTEGRATION ==========
  
  const TigerAuth = {
    // Get current user from background script
    async getCurrentUser() {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'AUTH_GET_USER' }, (response) => {
          if (response && response.user) {
            // Attach isPro to user object for easier access
            resolve({
              ...response.user,
              isPro: response.isPro || false
            });
          } else {
            resolve(null);
          }
        });
      });
    },
    
    // Check if user is authenticated
    async isAuthenticated() {
      const user = await this.getCurrentUser();
      return user !== null;
    },
    
    // Open auth page
    async login() {
      try {
        Logger.info('🔐 Opening sign-in page');
        
        // Send message to background to open auth page
        chrome.runtime.sendMessage({ 
          type: 'OPEN_AUTH_PAGE'
        }, (response) => {
          if (response && response.success) {
            showToast('🔐 Sign-in page opened', 'info');
          }
        });
        
        return { success: true };
      } catch (error) {
        Logger.error('❌ Failed to open auth page:', error);
        showToast('❌ Failed to open sign-in page', 'error');
        return { success: false, error };
      }
    },
    
    // Sign out
    async logout() {
      try {
        Logger.info('🔓 Signing out');
        
        return new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'AUTH_SIGNOUT' }, (response) => {
            if (response && response.success) {
              showToast('✅ Signed out', 'success');
              resolve({ success: true });
            } else {
              resolve({ success: false });
            }
          });
        });
      } catch (error) {
        Logger.error('❌ Sign out failed:', error);
        return { success: false, error };
      }
    }
  };
  
  // Login button handler
  $('#loginBtn').addEventListener('click', async () => {
    Logger.info('Login button clicked');
    
    // Check if already logged in
    const isLoggedIn = await TigerAuth.isAuthenticated();
    
    if (isLoggedIn) {
      // User is logged in - sign out directly
      const result = await TigerAuth.logout();
      if (result.success) {
        $('#loginBtn').classList.remove('logged-in');
        $('#loginBtnText').textContent = 'Sign In';
      }
    } else {
      // User not logged in - open auth page
      await TigerAuth.login();
    }
  });
  
  // Upgrade button handler (in promo bar)
  const upgradeBtn = $('#upgradeBtn');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', async () => {
      Logger.info('Upgrade button clicked');
      
      // Open upgrade/checkout flow
      chrome.runtime.sendMessage({ type: 'AUTH_CREATE_CHECKOUT' }, (response) => {
        if (response && response.success && response.url) {
          // Open checkout in new tab
          window.open(response.url, '_blank');
          showToast('🚀 Opening checkout...', 'info');
        } else {
          showToast('⚠️ Please sign in first to upgrade', 'warning');
          TigerAuth.login();
        }
      });
    });
  }
  
  // Check login state on load using chrome.storage.local
  chrome.storage.local.get(['authToken', 'userEmail'], (result) => {
    if (result.authToken && result.userEmail) {
      $('#loginBtn').classList.add('logged-in');
      $('#loginBtnText').textContent = 'Logout';
      Logger.info('✅ User is logged in:', result.userEmail);
    } else {
      $('#loginBtn').classList.remove('logged-in');
      $('#loginBtnText').textContent = 'Sign In';
      Logger.info('ℹ️ User not logged in');
    }
  });

  // Listen for auth state changes from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTH_STATE_CHANGED') {
      Logger.info('🔄 Auth state changed:', message);
      
      // Update local auth state
      authState.isAuthenticated = message.isAuthenticated || false;
      authState.isPro = message.isPro || false;
      authState.user = message.user || null;
      
      // Update UI for new auth state
      updateUIForAuthState();
      
      if (message.isAuthenticated && message.user) {
        // User signed in
        $('#loginBtn').classList.add('logged-in');
        $('#loginBtnText').textContent = 'Logout';
        showToast('✅ Signed in successfully', 'success');
      } else {
        // User signed out
        $('#loginBtn').classList.remove('logged-in');
        $('#loginBtnText').textContent = 'Sign In';
        showToast('✅ Signed out', 'success');
      }
      
      sendResponse({ received: true });
    }
  });
  
  // Initialize auth state on load
  loadAuthState().then(() => {
    updateUIForAuthState();
  });
  
  // ========== END AUTHENTICATION ==========
  
  // Listen for authentication messages (for OAuth callback)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTH_SUCCESS') {
      // Store auth data
      chrome.storage.sync.set({
        authToken: message.token,
        userEmail: message.email,
        userId: message.userId
      }, () => {
        $('#loginBtn').classList.add('logged-in');
        $('#loginBtnText').textContent = message.email.split('@')[0];
        showToast('✅ Signed in successfully!', 'success');
        Logger.info('✅ Authentication successful');
      });
      sendResponse({ success: true });
      return true;
    }
  });
  
  // Mode selector
  shadow.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      // AUTH GATE: Require account for mode selection
      if (!authState.isAuthenticated) {
        showToast('🔐 Sign in to use Tiger enhancement', 'warning');
        await TigerAuth.login();
        return;
      }
      
      settings.enhanceMode = btn.dataset.mode;
      updateUI();
      saveSettings();
      updatePresetVisibility();
    });
  });
  
  // Auto-enhance toggle
  $('#autoToggle').addEventListener('click', async () => {
    // AUTH GATE: Require account for auto-enhance
    if (!authState.isAuthenticated) {
      showToast('🔐 Sign in to use auto-enhance', 'warning');
      await TigerAuth.login();
      return;
    }
    
    // Prevent toggling on Claude.ai
    if (isClaudeAI) {
      showToast('⚠️ Auto-enhance not supported on Claude.ai', 'warning');
      return;
    }
    
    settings.autoEnhance = !settings.autoEnhance;
    updateUI();
    saveSettings();
  });
  
  // Preset selector - handle both change and reselect
  const presetHandler = async (e) => {
    // AUTH GATE: Require account for presets
    if (!authState.isAuthenticated) {
      e.target.value = 'none'; // Reset selection
      showToast('🔐 Sign in to use AI-Agent presets', 'warning');
      await TigerAuth.login();
      return;
    }
    
    const selectedPreset = e.target.value;
    await chrome.storage.sync.set({ selectedPreset });
    showToast(`✅ Preset: ${e.target.options[e.target.selectedIndex].text}`, 'success');
  };
  
  $('#presetSelector').addEventListener('change', presetHandler);
  // Also listen to click to handle reselecting the same option
  $('#presetSelector').addEventListener('click', (e) => {
    if (e.target.value && e.target.value !== 'none') {
      presetHandler(e);
    }
  });
  
  // Load preset settings
  chrome.storage.sync.get(['selectedPreset'], (result) => {
    const presetValue = result.selectedPreset || 'none';
    const selector = $('#presetSelector');
    if (selector) {
      selector.value = presetValue;
    }
  });
  
  // Update preset selector visibility based on mode
  function updatePresetVisibility() {
    const presetSelector = $('#presetSelector');
    if (settings.enhanceMode === 'light') {
      presetSelector.disabled = true;
      presetSelector.style.opacity = '0.5';
      presetSelector.style.cursor = 'not-allowed';
    } else {
      presetSelector.disabled = false;
      presetSelector.style.opacity = '1';
      presetSelector.style.cursor = 'pointer';
    }
  }
  
  // Initial preset visibility
  updatePresetVisibility();
  
  // ========== PROMPT LIBRARY WITH MODAL ==========
  
  // Modal control functions
  let currentPage = 1;
  let currentPrompts = [];
  let filteredPrompts = [];
  const PROMPTS_PER_PAGE = 6;
  
  function openPromptsModal(category, prompts) {
    console.log('[Tiger Prompts] 🚀 openPromptsModal called with category:', category, 'prompts:', prompts.length);
    
    const modal = $('#promptsModal');
    const grid = $('#promptsGrid');
    const categoryIcon = $('#modalCategoryIcon');
    const categoryName = $('#modalCategoryName');
    const searchInput = $('#promptSearch');
    const prevBtn = $('#prevPage');
    const nextBtn = $('#nextPage');
    const pageInfo = $('#pageInfo');
    
    console.log('[Tiger Prompts] 📦 Modal elements:', {
      modal: !!modal,
      grid: !!grid,
      categoryIcon: !!categoryIcon,
      categoryName: !!categoryName,
      searchInput: !!searchInput
    });
    
    if (!modal) {
      console.error('[Tiger Prompts] ❌ Modal element not found!');
      throw new Error('Modal element not found in shadow DOM');
    }
    
    if (!grid) {
      console.error('[Tiger Prompts] ❌ Grid element not found!');
      throw new Error('Grid element not found in shadow DOM');
    }
    
    // Set category info
    const categoryEmojis = {
      documents: '📄',
      legal: '⚖️',
      coding: '💻',
      marketing: '🎯',
      creative: '✍️',
      myprompts: '⭐'
    };
    
    const categoryNames = {
      documents: 'Business Documents',
      legal: 'Legal Prompts',
      coding: 'Coding Prompts',
      marketing: 'Marketing Prompts',
      creative: 'Creative Writing',
      myprompts: 'My Prompts'
    };
    
    categoryIcon.textContent = categoryEmojis[category] || '📚';
    categoryName.textContent = categoryNames[category] || 'Prompts';
    
    // Store prompts
    currentPrompts = prompts;
    filteredPrompts = prompts;
    currentPage = 1;
    
    // Clear search
    searchInput.value = '';
    
    // Render initial page
    renderPromptsPage();
    
    // Search handler
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      filteredPrompts = currentPrompts.filter(p => 
        p.title.toLowerCase().includes(searchTerm) ||
        p.description.toLowerCase().includes(searchTerm) ||
        p.prompt.toLowerCase().includes(searchTerm)
      );
      currentPage = 1;
      renderPromptsPage();
    });
    
    // Pagination handlers
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderPromptsPage();
      }
    });
    
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredPrompts.length / PROMPTS_PER_PAGE);
      if (currentPage < totalPages) {
        currentPage++;
        renderPromptsPage();
      }
    });
    
    // Show modal
    console.log('[Tiger Prompts] 👁️ Showing modal...');
    modal.classList.add('show');
    console.log('[Tiger Prompts] ✅ Modal classList after add:', modal.classList.toString());
    
    // Prevent body scroll
    document.body.style.overflow = 'hidden';
    console.log('[Tiger Prompts] ✅ Modal should now be visible');
  }
  
  function renderPromptsPage() {
    const grid = $('#promptsGrid');
    const prevBtn = $('#prevPage');
    const nextBtn = $('#nextPage');
    const pageInfo = $('#pageInfo');
    
    const totalPages = Math.ceil(filteredPrompts.length / PROMPTS_PER_PAGE);
    const startIdx = (currentPage - 1) * PROMPTS_PER_PAGE;
    const endIdx = startIdx + PROMPTS_PER_PAGE;
    const pagePrompts = filteredPrompts.slice(startIdx, endIdx);
    
    // Update pagination controls
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
    prevBtn.style.cursor = prevBtn.disabled ? 'not-allowed' : 'pointer';
    nextBtn.style.cursor = nextBtn.disabled ? 'not-allowed' : 'pointer';
    
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    
    // Render prompts
    if (pagePrompts.length === 0) {
      grid.innerHTML = `
        <div class="modal-empty">
          <div class="modal-empty-icon">📭</div>
          <div style="font-size: 16px; color: rgba(255,255,255,0.7); font-weight: 600;">No prompts found</div>
          <div style="font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 8px;">Try a different search term</div>
        </div>
      `;
    } else {
      grid.innerHTML = pagePrompts.map(prompt => `
        <div class="prompt-card" data-prompt-id="${prompt.id}">
          <div class="prompt-card-title">${prompt.title}</div>
          <div class="prompt-card-description">${prompt.description}</div>
          <div class="prompt-card-preview">${prompt.prompt.substring(0, 100)}...</div>
        </div>
      `).join('');
      
      // Add click handlers to cards
      grid.querySelectorAll('.prompt-card').forEach(card => {
        card.addEventListener('click', () => {
          const promptId = card.getAttribute('data-prompt-id');
          const prompt = filteredPrompts.find(p => p.id === promptId);
          
          if (prompt) {
            insertPrompt(prompt);
            closePromptsModal();
          }
        });
      });
    }
  }
  
  function closePromptsModal() {
    const modal = $('#promptsModal');
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
  
  function insertPrompt(prompt) {
    let field = getActiveInput();
    
    // If no active field, try to find and focus one
    if (!field) {
      const selectors = ['textarea', '[contenteditable="true"]', 'input[type="text"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) { // Check if visible
          field = el;
          field.focus();
          // Wait a tiny bit for focus to take effect
          setTimeout(() => {
            field.click(); // Some sites need the click event too
          }, 10);
          break;
        }
      }
    }
    
    if (field) {
      // Insert prompt into field
      if (field.value !== undefined) {
        // Standard input/textarea
        field.value = prompt.prompt;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Select all text after inserting
        setTimeout(() => {
          field.select();
          field.setSelectionRange(0, field.value.length);
        }, 50);
      } else {
        // ContentEditable
        field.innerText = prompt.prompt;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Select all text in contentEditable
        setTimeout(() => {
          const range = document.createRange();
          range.selectNodeContents(field);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }, 50);
      }
      field.focus();
      showToast(`✅ Inserted: ${prompt.title}`, 'success');
    } else {
      // Copy to clipboard as fallback
      navigator.clipboard.writeText(prompt.prompt);
      showToast(`📋 Copied: ${prompt.title} (no input found)`, 'warning');
    }
  }
  
  // Modal close handlers
  $('#modalClose').addEventListener('click', closePromptsModal);
  
  $('#promptsModal').addEventListener('click', (e) => {
    // Close if clicking overlay (not modal content)
    if (e.target.id === 'promptsModal') {
      closePromptsModal();
    }
  });
  
  // ESC key to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const promptsModal = $('#promptsModal');
      const myPromptsModal = $('#myPromptsModal');
      
      if (promptsModal && promptsModal.classList.contains('show')) {
        closePromptsModal();
      }
      if (myPromptsModal && myPromptsModal.classList.contains('show')) {
        closeMyPromptsModal();
      }
    }
  });
  
  // ========== MY PROMPTS MODAL ==========
  let myPromptsCurrentPage = 1;
  let myPromptsFiltered = [];
  let myPromptsAll = [];
  
  function openMyPromptsModal(prompts) {
    const modal = $('#myPromptsModal');
    const grid = $('#myPromptsGrid');
    const searchInput = $('#myPromptsSearch');
    const prevBtn = $('#myPromptsPrev');
    const nextBtn = $('#myPromptsNext');
    const pageInfo = $('#myPromptsPageInfo');
    
    myPromptsAll = prompts;
    myPromptsFiltered = prompts;
    myPromptsCurrentPage = 1;
    
    searchInput.value = '';
    
    renderMyPromptsPage();
    
    // Search handler
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      myPromptsFiltered = myPromptsAll.filter(p => 
        p.title.toLowerCase().includes(searchTerm) ||
        p.description.toLowerCase().includes(searchTerm) ||
        p.prompt.toLowerCase().includes(searchTerm)
      );
      myPromptsCurrentPage = 1;
      renderMyPromptsPage();
    });
    
    // Pagination
    prevBtn.addEventListener('click', () => {
      if (myPromptsCurrentPage > 1) {
        myPromptsCurrentPage--;
        renderMyPromptsPage();
      }
    });
    
    nextBtn.addEventListener('click', () => {
      const totalPages = Math.ceil(myPromptsFiltered.length / PROMPTS_PER_PAGE);
      if (myPromptsCurrentPage < totalPages) {
        myPromptsCurrentPage++;
        renderMyPromptsPage();
      }
    });
    
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  
  // ========== PROMPT DETAIL VIEW ==========
  function showPromptDetailView(prompt) {
    // CLOSE My Prompts modal (not minimize - actually close it)
    closeMyPromptsModal();
    
    // Create detail view overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.92);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999999;
      backdrop-filter: blur(10px);
      animation: fadeIn 0.3s ease;
    `;
    
    // Create detail modal - EXACT SAME SIZE as other modals
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: linear-gradient(135deg, #1E1E1E 0%, #141414 100%);
      border-radius: 16px;
      width: 90%;
      min-width: 600px;
      max-width: 800px;
      max-height: 85vh;
      overflow: hidden;
      box-shadow: 
        0 20px 60px rgba(0, 0, 0, 0.9),
        0 0 0 2px rgba(255, 122, 0, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.05);
      animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      flex-direction: column;
    `;
    
    modal.innerHTML = `
      <div style="
        padding: 24px 32px;
        border-bottom: 1px solid rgba(255, 122, 0, 0.2);
        background: linear-gradient(135deg, rgba(255, 122, 0, 0.05) 0%, transparent 100%);
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <h2 style="
            font-size: 24px;
            font-weight: 700;
            color: #FF7A00;
            margin: 0;
            text-shadow: 0 2px 8px rgba(255, 122, 0, 0.3);
          ">${prompt.title}</h2>
          <button id="detailClose" style="
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            font-size: 20px;
            width: 32px;
            height: 32px;
            cursor: pointer;
            transition: all 0.2s;
          ">×</button>
        </div>
        <p style="
          font-size: 14px;
          color: rgba(255, 255, 255, 0.7);
          margin: 0;
          line-height: 1.6;
        ">${prompt.description}</p>
      </div>
      
      <div style="
        flex: 1;
        overflow-y: auto;
        padding: 32px;
      ">
        <div style="margin-bottom: 24px;">
          <div style="
            font-size: 12px;
            font-weight: 700;
            color: #FF7A00;
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
          ">Prompt Text</div>
          <div style="
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 122, 0, 0.2);
            border-radius: 10px;
            padding: 20px;
            color: rgba(255, 255, 255, 0.9);
            font-size: 14px;
            line-height: 1.8;
            font-family: 'Monaco', 'Menlo', monospace;
            white-space: pre-wrap;
            word-break: break-word;
            max-height: 400px;
            overflow-y: auto;
          ">${prompt.prompt}</div>
        </div>
      </div>
      
      <div style="
        padding: 20px 32px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(0, 0, 0, 0.3);
        display: flex;
        gap: 12px;
      ">
        <button id="selectInputBtn" style="
          flex: 1;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid rgba(255, 122, 0, 0.4);
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <span>📍</span>
          <span>Select Input</span>
        </button>
        <button id="detailInject" style="
          flex: 1;
          padding: 14px 16px;
          background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 16px rgba(255, 122, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <span>📥</span>
          <span>Inject</span>
        </button>
        <button id="detailCopy" style="
          padding: 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        ">
          <span>📋</span>
        </button>
        <button id="detailDelete" style="
          padding: 14px;
          background: rgba(255, 0, 0, 0.1);
          border: 1px solid rgba(255, 0, 0, 0.3);
          border-radius: 10px;
          color: #ff4444;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        ">
          <span>🗑️</span>
        </button>
      </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Track selected input
    let selectedInput = null;
    
    // Button handlers
    const closeBtn = modal.querySelector('#detailClose');
    const selectInputBtn = modal.querySelector('#selectInputBtn');
    const injectBtn = modal.querySelector('#detailInject');
    const copyBtn = modal.querySelector('#detailCopy');
    const deleteBtn = modal.querySelector('#detailDelete');
    
    const closeDetail = () => {
      // Remove any highlight
      if (selectedInput) {
        selectedInput.style.boxShadow = '';
        selectedInput.style.outline = '';
      }
      document.body.removeChild(overlay);
    };
    
    closeBtn.addEventListener('click', closeDetail);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDetail();
    });
    
    // SELECT INPUT button - finds and highlights the chat input
    selectInputBtn.addEventListener('click', () => {
      // Clear previous selection
      if (selectedInput) {
        selectedInput.style.boxShadow = '';
        selectedInput.style.outline = '';
      }
      
      // Find chat input (same logic as existing scanner)
      const selectors = [
        'textarea[placeholder*="message" i]',
        'textarea[placeholder*="chat" i]',
        'textarea[placeholder*="ask" i]',
        'textarea[placeholder*="type" i]',
        '[contenteditable="true"]',
        'textarea'
      ];
      
      let found = false;
      for (const selector of selectors) {
        const inputs = document.querySelectorAll(selector);
        for (const input of inputs) {
          // Skip if inside extension
          if (input.closest('[data-tp-dock]') || input.closest('#tp-dock-root')) continue;
          
          // Check if visible
          const rect = input.getBoundingClientRect();
          if (rect.width > 100 && rect.height > 20 && input.offsetParent !== null) {
            selectedInput = input;
            found = true;
            
            // Highlight with orange glow
            input.style.boxShadow = '0 0 0 3px rgba(255, 122, 0, 0.6), 0 0 20px rgba(255, 122, 0, 0.4)';
            input.style.outline = 'none';
            input.focus();
            
            showToast('✅ Input selected! Click "Inject" to insert prompt', 'success');
            break;
          }
        }
        if (found) break;
      }
      
      if (!found) {
        showToast('❌ No input found. Click the chat input field first.', 'warning');
      }
    });
    
    // INJECT button - inserts prompt into selected input
    injectBtn.addEventListener('click', () => {
      if (!selectedInput) {
        showToast('⚠️ Click "Select Input" first!', 'warning');
        return;
      }
      
      // Insert the prompt
      if (selectedInput.tagName === 'TEXTAREA' || selectedInput.tagName === 'INPUT') {
        selectedInput.value = prompt.prompt;
        selectedInput.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (selectedInput.contentEditable === 'true') {
        selectedInput.textContent = prompt.prompt;
        selectedInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      selectedInput.focus();
      showToast('✅ Prompt injected!', 'success');
      closeDetail();
    });
    
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(prompt.prompt);
      showToast('📋 Copied to clipboard!', 'success');
    });
    
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Delete "${prompt.title}"?`)) {
        deleteMyPrompt(prompt.id);
        closeDetail();
      }
    });
    
    // Hover effects
    selectInputBtn.addEventListener('mouseenter', () => {
      selectInputBtn.style.background = 'rgba(255, 122, 0, 0.1)';
      selectInputBtn.style.borderColor = 'rgba(255, 122, 0, 0.6)';
      selectInputBtn.style.transform = 'translateY(-1px)';
    });
    selectInputBtn.addEventListener('mouseleave', () => {
      selectInputBtn.style.background = 'rgba(255, 255, 255, 0.05)';
      selectInputBtn.style.borderColor = 'rgba(255, 122, 0, 0.4)';
      selectInputBtn.style.transform = 'translateY(0)';
    });
    
    injectBtn.addEventListener('mouseenter', () => {
      injectBtn.style.transform = 'translateY(-2px)';
      injectBtn.style.boxShadow = '0 6px 20px rgba(255, 122, 0, 0.6)';
    });
    injectBtn.addEventListener('mouseleave', () => {
      injectBtn.style.transform = 'translateY(0)';
      injectBtn.style.boxShadow = '0 4px 16px rgba(255, 122, 0, 0.4)';
    });
    
    copyBtn.addEventListener('mouseenter', () => {
      copyBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      copyBtn.style.transform = 'translateY(-1px)';
    });
    copyBtn.addEventListener('mouseleave', () => {
      copyBtn.style.background = 'rgba(255, 255, 255, 0.05)';
      copyBtn.style.transform = 'translateY(0)';
    });
    
    deleteBtn.addEventListener('mouseenter', () => {
      deleteBtn.style.background = 'rgba(255, 0, 0, 0.2)';
      deleteBtn.style.borderColor = 'rgba(255, 0, 0, 0.5)';
    });
    deleteBtn.addEventListener('mouseleave', () => {
      deleteBtn.style.background = 'rgba(255, 0, 0, 0.1)';
      deleteBtn.style.borderColor = 'rgba(255, 0, 0, 0.3)';
    });
    
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    });
  }
  
  function renderMyPromptsPage() {
    const grid = $('#myPromptsGrid');
    const prevBtn = $('#myPromptsPrev');
    const nextBtn = $('#myPromptsNext');
    const pageInfo = $('#myPromptsPageInfo');
    
    const totalPages = Math.ceil(myPromptsFiltered.length / PROMPTS_PER_PAGE);
    const startIdx = (myPromptsCurrentPage - 1) * PROMPTS_PER_PAGE;
    const endIdx = startIdx + PROMPTS_PER_PAGE;
    const pagePrompts = myPromptsFiltered.slice(startIdx, endIdx);
    
    prevBtn.disabled = myPromptsCurrentPage === 1;
    nextBtn.disabled = myPromptsCurrentPage === totalPages || totalPages === 0;
    prevBtn.style.opacity = prevBtn.disabled ? '0.3' : '1';
    nextBtn.style.opacity = nextBtn.disabled ? '0.3' : '1';
    prevBtn.style.cursor = prevBtn.disabled ? 'not-allowed' : 'pointer';
    nextBtn.style.cursor = nextBtn.disabled ? 'not-allowed' : 'pointer';
    
    pageInfo.textContent = `Page ${myPromptsCurrentPage} of ${totalPages || 1}`;
    
    if (pagePrompts.length === 0) {
      grid.innerHTML = `
        <div class="modal-empty" style="text-align: center !important; padding: 80px 20px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div style="font-size: 18px; color: rgba(255,255,255,0.7); font-weight: 600; margin-bottom: 8px; text-align: center; width: 100%;">No custom prompts yet</div>
          <div style="font-size: 14px; color: rgba(255,255,255,0.5); text-align: center; width: 100%;">Click "Create New Prompt" to get started</div>
        </div>
      `;
    } else {
      grid.innerHTML = pagePrompts.map(prompt => `
        <div class="prompt-card" data-prompt-id="${prompt.id}">
          <div class="prompt-card-title">${prompt.title}</div>
          <div class="prompt-card-description">${prompt.description}</div>
          <div class="prompt-card-preview">${prompt.prompt.substring(0, 100)}...</div>
          <button class="delete-prompt-btn" data-prompt-id="${prompt.id}" style="
            position: absolute;
            top: 8px;
            right: 8px;
            background: rgba(255,0,0,0.1);
            border: 1px solid rgba(255,0,0,0.3);
            border-radius: 4px;
            color: #ff4444;
            font-size: 18px;
            width: 28px;
            height: 28px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          ">×</button>
        </div>
      `).join('');
      
      grid.querySelectorAll('.prompt-card').forEach(card => {
        card.addEventListener('click', (e) => {
          // Don't trigger if clicking delete button
          if (e.target.classList.contains('delete-prompt-btn')) return;
          
          const promptId = card.getAttribute('data-prompt-id');
          const prompt = myPromptsFiltered.find(p => p.id === promptId);
          
          if (prompt) {
            showPromptDetailView(prompt);
          }
        });
      });
      
      // Delete button handlers
      grid.querySelectorAll('.delete-prompt-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const promptId = btn.getAttribute('data-prompt-id');
          deleteMyPrompt(promptId);
        });
      });
    }
  }
  
  function closeMyPromptsModal() {
    const modal = $('#myPromptsModal');
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
  
  function deleteMyPrompt(promptId) {
    if (!confirm('Are you sure you want to delete this prompt?')) return;
    
    chrome.storage.local.get(['myPrompts'], (result) => {
      const prompts = result.myPrompts || [];
      const filtered = prompts.filter(p => p.id !== promptId);
      
      chrome.storage.local.set({ myPrompts: filtered }, () => {
        myPromptsAll = filtered;
        myPromptsFiltered = filtered;
        renderMyPromptsPage();
        showToast('✅ Prompt deleted', 'success');
      });
    });
  }
  
  // My Prompts modal close handlers
  $('#myPromptsClose').addEventListener('click', closeMyPromptsModal);
  
  $('#myPromptsModal').addEventListener('click', (e) => {
    if (e.target.id === 'myPromptsModal') {
      closeMyPromptsModal();
    }
  });
  
  // Create New Prompt button
  const createPromptBtn = $('#createPromptBtn');
  
  // Add hover effects
  createPromptBtn.addEventListener('mouseenter', () => {
    createPromptBtn.style.background = 'linear-gradient(180deg, rgba(255, 122, 0, 0.08) 0%, rgba(255, 122, 0, 0.02) 100%), rgba(255, 255, 255, 0.05)';
    createPromptBtn.style.borderColor = 'rgba(255, 122, 0, 0.6)';
    createPromptBtn.style.transform = 'translateY(-2px)';
    createPromptBtn.style.boxShadow = '0 8px 24px rgba(255, 122, 0, 0.25)';
  });
  
  createPromptBtn.addEventListener('mouseleave', () => {
    createPromptBtn.style.background = 'linear-gradient(180deg, rgba(255, 122, 0, 0.03) 0%, transparent 100%), rgba(255, 255, 255, 0.02)';
    createPromptBtn.style.borderColor = 'rgba(255, 122, 0, 0.4)';
    createPromptBtn.style.transform = 'translateY(0)';
    createPromptBtn.style.boxShadow = 'none';
  });
  
  createPromptBtn.addEventListener('click', () => {
    // Step 1: Type Your Prompt
    showCustomPrompt('Type Your Prompt', 'Enter your prompt text...', (promptText) => {
      if (!promptText) return;
      
      // Step 2: Title Your Prompt
      showCustomPrompt('Title Your Prompt', 'Give your prompt a title...', (title) => {
        if (!title) return;
        
        // Step 3: Add Use Case
        showCustomPrompt('Add Use Case For Your Prompt', 'Describe when to use this prompt...', (description) => {
          if (!description) return;
          
          const newPrompt = {
            id: Date.now().toString(),
            title,
            description,
            prompt: promptText
          };
          
          chrome.storage.local.get(['myPrompts'], (result) => {
            const prompts = result.myPrompts || [];
            prompts.push(newPrompt);
            
            chrome.storage.local.set({ myPrompts: prompts }, () => {
              myPromptsAll = prompts;
              myPromptsFiltered = prompts;
              renderMyPromptsPage();
              showToast('✅ Prompt created!', 'success');
            });
          });
        });
      });
    });
  });
  
  // Custom prompt dialog with centered, styled input
  let promptDialogDepth = 0; // Track nesting level for z-index
  
  function showCustomPrompt(title, placeholder, callback) {
    // Hide My Prompts modal temporarily
    const myPromptsModal = $('#myPromptsModal');
    if (myPromptsModal) {
      myPromptsModal.style.opacity = '0';
      myPromptsModal.style.pointerEvents = 'none';
    }
    
    promptDialogDepth++;
    const currentDepth = promptDialogDepth;
    const baseZIndex = 99999999; // Higher than My Prompts modal
    const dialogZIndex = baseZIndex + (currentDepth * 10);
    
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: ${dialogZIndex};
      backdrop-filter: blur(10px);
      animation: fadeIn 0.2s ease;
    `;
    
    // Create modal content - SAME SIZE as other modals
    const modal = document.createElement('div');
    modal.style.cssText = `
      background: linear-gradient(135deg, #1E1E1E 0%, #141414 100%);
      border-radius: 16px;
      padding: 40px;
      width: 90%;
      min-width: 600px;
      max-width: 800px;
      box-shadow: 
        0 20px 60px rgba(0, 0, 0, 0.9),
        0 0 0 2px rgba(255, 122, 0, 0.4);
      border: 2px solid rgba(255, 122, 0, 0.5);
      animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    `;
    
    modal.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
        ${currentDepth > 1 ? `
          <button id="customPromptBack" style="
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: white;
            font-size: 14px;
            padding: 8px 12px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 6px;
          ">
            <span>←</span>
            <span>Back</span>
          </button>
        ` : '<div></div>'}
        <h3 style="
          font-size: 20px;
          font-weight: 700;
          color: #FF7A00;
          text-align: center;
          text-shadow: 0 2px 8px rgba(255, 122, 0, 0.3);
          flex: 1;
        ">${title}</h3>
        <div></div>
      </div>
      <textarea id="customPromptInput" placeholder="${placeholder}" style="
        width: 100%;
        min-height: 120px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 2px solid rgba(255, 122, 0, 0.3);
        border-radius: 10px;
        color: white;
        font-size: 14px;
        font-family: inherit;
        resize: vertical;
        margin-bottom: 20px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
      "></textarea>
      <div style="display: flex; gap: 12px;">
        <button id="customPromptCancel" style="
          flex: 1;
          padding: 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        ">Cancel</button>
        <button id="customPromptSubmit" style="
          flex: 1;
          padding: 12px;
          background: linear-gradient(135deg, #FF7A00 0%, #FF9940 100%);
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 12px rgba(255, 122, 0, 0.4);
        ">Continue</button>
      </div>
      <div id="successCheck" style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #00D26A 0%, #00F593 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 48px;
        opacity: 0;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        pointer-events: none;
        box-shadow: 0 8px 32px rgba(0, 210, 106, 0.6);
      ">✓</div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    const input = document.getElementById('customPromptInput');
    const submitBtn = document.getElementById('customPromptSubmit');
    const cancelBtn = document.getElementById('customPromptCancel');
    const backBtn = document.getElementById('customPromptBack');
    
    // Back button handler
    if (backBtn) {
      backBtn.addEventListener('click', handleCancel);
      backBtn.addEventListener('mouseenter', () => {
        backBtn.style.background = 'rgba(255, 255, 255, 0.1)';
      });
      backBtn.addEventListener('mouseleave', () => {
        backBtn.style.background = 'rgba(255, 255, 255, 0.05)';
      });
    }
    
    // Focus input
    setTimeout(() => input.focus(), 100);
    
    // Add glow effect on focus
    input.addEventListener('focus', () => {
      input.style.borderColor = '#FF7A00';
      input.style.boxShadow = '0 0 0 3px rgba(255, 122, 0, 0.2), 0 0 20px rgba(255, 122, 0, 0.3), inset 0 2px 4px rgba(0, 0, 0, 0.3)';
      input.style.background = 'rgba(255, 255, 255, 0.08)';
    });
    
    input.addEventListener('blur', () => {
      input.style.borderColor = 'rgba(255, 122, 0, 0.3)';
      input.style.boxShadow = 'inset 0 2px 4px rgba(0, 0, 0, 0.3)';
      input.style.background = 'rgba(255, 255, 255, 0.05)';
    });
    
    // Handle submit
    const handleSubmit = () => {
      const value = input.value.trim();
      
      // Show success animation
      const successCheck = document.getElementById('successCheck');
      if (successCheck) {
        successCheck.style.transform = 'translate(-50%, -50%) scale(1)';
        successCheck.style.opacity = '1';
        
        setTimeout(() => {
          successCheck.style.transform = 'translate(-50%, -50%) scale(0)';
          successCheck.style.opacity = '0';
        }, 600);
      }
      
      setTimeout(() => {
        document.body.removeChild(overlay);
        promptDialogDepth = Math.max(0, promptDialogDepth - 1);
        
        // Restore My Prompts modal if no more dialogs
        if (promptDialogDepth === 0) {
          const myPromptsModal = $('#myPromptsModal');
          if (myPromptsModal) {
            myPromptsModal.style.opacity = '1';
            myPromptsModal.style.pointerEvents = 'auto';
          }
        }
        
        callback(value);
      }, 400);
    };
    
    // Handle cancel
    const handleCancel = () => {
      document.body.removeChild(overlay);
      promptDialogDepth = Math.max(0, promptDialogDepth - 1);
      
      // Restore My Prompts modal if no more dialogs
      if (promptDialogDepth === 0) {
        const myPromptsModal = $('#myPromptsModal');
        if (myPromptsModal) {
          myPromptsModal.style.opacity = '1';
          myPromptsModal.style.pointerEvents = 'auto';
        }
      }
      
      callback(null);
    };
    
    submitBtn.addEventListener('click', handleSubmit);
    cancelBtn.addEventListener('click', handleCancel);
    
    // Escape key to cancel (NO Enter key to avoid triggering ChatGPT)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        handleCancel();
      }
    });
    
    // Hover effects
    submitBtn.addEventListener('mouseenter', () => {
      submitBtn.style.transform = 'translateY(-2px)';
      submitBtn.style.boxShadow = '0 6px 16px rgba(255, 122, 0, 0.6)';
    });
    submitBtn.addEventListener('mouseleave', () => {
      submitBtn.style.transform = 'translateY(0)';
      submitBtn.style.boxShadow = '0 4px 12px rgba(255, 122, 0, 0.4)';
    });
    
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'rgba(255, 255, 255, 0.05)';
    });
  }
  
  // Prompt category selector - OPENS MODAL
  let isProcessing = false; // Prevent cascade from resetting dropdown
  
  $('#promptCategorySelector').addEventListener('change', async (e) => {
    if (isProcessing) return;
    
    const category = e.target.value;
    
    // Empty selection - just return
    if (!category) {
      return;
    }
    
    isProcessing = true;
    
    // Auth gate - requires PRO account
    const isAuth = await TigerAuth.isAuthenticated();
    if (!isAuth) {
      setTimeout(() => { e.target.value = ''; isProcessing = false; }, 100);
      showToast('🔐 Sign in to access Prompt Library', 'warning');
      await TigerAuth.login();
      return;
    }
    
    // Check Pro status
    const user = await TigerAuth.getCurrentUser();
    const isPro = user?.isPro || false;
    
    if (!isPro) {
      setTimeout(() => { e.target.value = ''; isProcessing = false; }, 100);
      showToast('⭐ Upgrade to Pro ($1.99/mo) to access Prompt Library', 'warning');
      return;
    }
    
    // Check if PROMPT_LIBRARY is loaded (check window scope)
    console.log('[Tiger Prompts] 🔍 Checking for PROMPT_LIBRARY...');
    console.log('[Tiger Prompts] window.PROMPT_LIBRARY exists?', typeof window.PROMPT_LIBRARY !== 'undefined');
    console.log('[Tiger Prompts] PROMPT_LIBRARY exists?', typeof PROMPT_LIBRARY !== 'undefined');
    
    const library = window.PROMPT_LIBRARY || (typeof PROMPT_LIBRARY !== 'undefined' ? PROMPT_LIBRARY : null);
    
    if (!library) {
      console.error('[Tiger Prompts] ❌ PROMPT_LIBRARY not loaded in any scope!');
      showToast('⚠️ Prompt library loading... Please try again', 'warning');
      
      // Try to wait and check again
      setTimeout(() => {
        const retryLibrary = window.PROMPT_LIBRARY || (typeof PROMPT_LIBRARY !== 'undefined' ? PROMPT_LIBRARY : null);
        if (retryLibrary) {
          console.log('[Tiger Prompts] ✅ PROMPT_LIBRARY now available, retrying...');
          isProcessing = false;
          e.target.dispatchEvent(new Event('change'));
        } else {
          showToast('❌ Prompt library failed to load. Please refresh', 'error');
          setTimeout(() => { e.target.value = ''; isProcessing = false; }, 100);
        }
      }, 1000);
      return;
    }
    
    console.log('[Tiger Prompts] 📚 PROMPT_LIBRARY is available');
    console.log('[Tiger Prompts] 📂 Available categories:', Object.keys(library));
    
    // Get prompts for category
    const prompts = library[category] || [];
    
    console.log('[Tiger Prompts] 📚 Loading prompts for category:', category);
    console.log('[Tiger Prompts] 📝 Found prompts:', prompts.length);
    
    if (prompts.length === 0) {
      showToast('⚠️ No prompts found in this category', 'warning');
      console.warn('[Tiger Prompts] ⚠️ No prompts in category:', category);
      console.log('[Tiger Prompts] Available categories:', Object.keys(library));
      setTimeout(() => { e.target.value = ''; isProcessing = false; }, 100);
      return;
    }
    
    // Open modal with prompts
    try {
      openPromptsModal(category, prompts);
      console.log('[Tiger Prompts] ✅ Opened modal with', prompts.length, 'prompts');
    } catch (error) {
      console.error('[Tiger Prompts] ❌ Failed to open modal:', error);
      showToast('❌ Failed to open prompts modal', 'error');
    }
    
    // Reset dropdown to allow re-selection of same category
    setTimeout(() => { e.target.value = ''; }, 100);
    
    isProcessing = false;
  });
  
  // My Prompts button - opens My Prompts modal
  $('#myPromptsBtn').addEventListener('click', async () => {
    // Auth gate - requires PRO account
    const isAuth = await TigerAuth.isAuthenticated();
    if (!isAuth) {
      showToast('🔐 Sign in to access My Prompts', 'warning');
      await TigerAuth.login();
      return;
    }
    
    // Check Pro status
    const user = await TigerAuth.getCurrentUser();
    const isPro = user?.isPro || false;
    
    if (!isPro) {
      showToast('⭐ Upgrade to Pro ($1.99/mo) to access My Prompts', 'warning');
      return;
    }
    
    // Load user's saved prompts from storage
    chrome.storage.local.get(['myPrompts'], (result) => {
      const myPrompts = result.myPrompts || [];
      openMyPromptsModal(myPrompts);
    });
  });
  
  // Store button - Pro-locked
  $('#storeBtn').addEventListener('click', async () => {
    // Auth gate - requires PRO account
    const isAuth = await TigerAuth.isAuthenticated();
    if (!isAuth) {
      showToast('🔐 Sign in to access Store', 'warning');
      await TigerAuth.login();
      return;
    }
    
    // Check Pro status
    const user = await TigerAuth.getCurrentUser();
    const isPro = user?.isPro || false;
    
    if (!isPro) {
      showToast('⭐ Upgrade to Pro ($1.99/mo) to access Store', 'warning');
      return;
    }
    
    // Open store for Pro users
    window.open('https://tigerprompts.com/pages/shop', '_blank');
  });
  
  // Initialize button states based on Pro status
  (async () => {
    const user = await TigerAuth.getCurrentUser();
    const isPro = user?.isPro || false;
    
    if (isPro) {
      // Unlock buttons for Pro users
      $('#myPromptsBtn')?.classList.remove('tp-pro-locked');
      $('#storeBtn')?.classList.remove('tp-pro-locked');
    }
  })();
  
  // Snapshot button
  // ========== INTELLIGENT CHAT SCRAPER ==========
  
  function scrapeCleanMessages() {
    const site = location.hostname;
    let messages = [];
    
    console.log('[Tiger Prompts] Scraping messages from:', site);
    
    // Site-specific scrapers with smart filtering
    if (site.includes('claude.ai')) {
      messages = scrapeClaudeMessages();
    } else if (site.includes('openai.com') || site.includes('chatgpt.com')) {
      messages = scrapeChatGPTMessages();
    } else if (site.includes('gemini.google.com')) {
      messages = scrapeGeminiMessages();
    } else if (site.includes('poe.com')) {
      messages = scrapePoeMessages();
    } else if (site.includes('perplexity.ai')) {
      messages = scrapePerplexityMessages();
    } else {
      messages = scrapeGenericMessages();
    }
    
    // Clean and validate messages
    messages = messages
      .filter(m => m.content && m.content.trim().length > 0)
      .map(m => ({
        role: normalizeRole(m.role),
        content: cleanMessageContent(m.content)
      }));
    
    Logger.info('Scraped', messages.length, 'clean messages');
    return messages;
  }
  
  // Claude.ai scraper - Multi-strategy approach for robustness
  function scrapeClaudeMessages() {
    console.log('[Tiger Prompts] 🔍 Scraping Claude messages with multi-strategy approach...');
    const messages = [];
    
    // Strategy 1: Try to find user and assistant message containers
    try {
      const userMessages = document.querySelectorAll('[data-is-human-message="true"], [class*="font-user"]');
      const assistantMessages = document.querySelectorAll('[data-is-human-message="false"], [class*="font-claude"]');
      
      if (userMessages.length > 0 || assistantMessages.length > 0) {
        console.log('[Tiger Prompts] ✅ Strategy 1: Found messages via data attributes/classes');
        
        // Interleave messages (assuming they alternate)
        const maxLength = Math.max(userMessages.length, assistantMessages.length);
        for (let i = 0; i < maxLength; i++) {
          if (userMessages[i]) {
            const content = cleanMessageContent(userMessages[i].innerText || userMessages[i].textContent);
            if (content) messages.push({ role: 'user', content });
          }
          if (assistantMessages[i]) {
            const content = cleanMessageContent(assistantMessages[i].innerText || assistantMessages[i].textContent);
            if (content) messages.push({ role: 'assistant', content });
          }
        }
        
        if (messages.length > 0) {
          console.log(`[Tiger Prompts] ✅ Scraped ${messages.length} Claude messages`);
          return messages;
        }
      }
    } catch (e) {
      console.log('[Tiger Prompts] ⚠️ Strategy 1 failed:', e.message);
    }
    
    // Strategy 2: Find message blocks by structure (main > div children)
    try {
      const main = document.querySelector('main');
      if (main) {
        const potentialMessages = Array.from(main.children).filter(el => {
          const text = (el.innerText || '').trim();
          // Message-like: 20-10000 chars, not too many child divs
          return text.length > 20 && text.length < 10000 && el.querySelectorAll('div').length < 50;
        });
        
        if (potentialMessages.length > 0) {
          console.log(`[Tiger Prompts] ✅ Strategy 2: Found ${potentialMessages.length} potential messages via structure`);
          
          potentialMessages.forEach((el, idx) => {
            const content = cleanMessageContent(el.innerText || el.textContent);
            if (content) {
              // Alternate between user and assistant
              messages.push({
                role: idx % 2 === 0 ? 'user' : 'assistant',
                content
              });
            }
          });
          
          if (messages.length > 0) {
            console.log(`[Tiger Prompts] ✅ Scraped ${messages.length} Claude messages`);
            return messages;
          }
        }
      }
    } catch (e) {
      console.log('[Tiger Prompts] ⚠️ Strategy 2 failed:', e.message);
    }
    
    // Strategy 3: Aggressive text-based detection
    try {
      const allDivs = document.querySelectorAll('main div, [role="main"] div');
      const messageCandidates = [];
      
      allDivs.forEach(div => {
        const text = (div.innerText || '').trim();
        // Look for substantial text blocks without many nested divs
        if (text.length > 30 && text.length < 8000) {
          const childDivs = div.querySelectorAll('div');
          const hasMinimalNesting = childDivs.length < 10;
          
          if (hasMinimalNesting) {
            // Check if it's not already captured
            const isDuplicate = messageCandidates.some(m => m.text === text);
            if (!isDuplicate) {
              messageCandidates.push({ element: div, text });
            }
          }
        }
      });
      
      if (messageCandidates.length > 0) {
        console.log(`[Tiger Prompts] ✅ Strategy 3: Found ${messageCandidates.length} message candidates via text analysis`);
        
        messageCandidates.forEach((candidate, idx) => {
          const content = cleanMessageContent(candidate.text);
          if (content) {
            messages.push({
              role: idx % 2 === 0 ? 'user' : 'assistant',
              content
            });
          }
        });
        
        if (messages.length > 0) {
          console.log(`[Tiger Prompts] ✅ Scraped ${messages.length} Claude messages`);
          return messages;
        }
      }
    } catch (e) {
      console.log('[Tiger Prompts] ⚠️ Strategy 3 failed:', e.message);
    }
    
    console.log('[Tiger Prompts] ❌ All strategies failed - no messages found');
    return [];
  }
  
  // ChatGPT scraper
  function scrapeChatGPTMessages() {
    const messages = [];
    
    // ChatGPT uses data-message-author-role
    document.querySelectorAll('[data-message-author-role]').forEach(el => {
      const role = el.getAttribute('data-message-author-role');
      
      // Find the markdown content, avoiding buttons
      const contentEl = el.querySelector('.markdown, [class*="markdown"]');
      if (contentEl) {
        // Clone the element to manipulate
        const clone = contentEl.cloneNode(true);
        
        // Remove buttons and UI elements
        clone.querySelectorAll('button, [class*="copy"], [class*="edit"]').forEach(btn => btn.remove());
        
        const content = clone.innerText || clone.textContent;
        messages.push({ role, content });
      }
    });
    
    return messages;
  }
  
  // Gemini scraper
  function scrapeGeminiMessages() {
    const messages = [];
    
    // Gemini uses message-content class
    document.querySelectorAll('.conversation-container message-content, [class*="message"]').forEach(el => {
      // Determine role from parent or sibling
      const isUser = el.closest('[data-test-id*="user"]') !== null || 
                     el.classList.contains('user-message') ||
                     el.querySelector('[alt*="User"]') !== null;
      
      const role = isUser ? 'user' : 'assistant';
      
      // Get content, avoiding buttons
      const clone = el.cloneNode(true);
      clone.querySelectorAll('button, [aria-label]').forEach(btn => btn.remove());
      
      const content = clone.innerText || clone.textContent;
      if (content.trim()) {
        messages.push({ role, content });
      }
    });
    
    return messages;
  }
  
  // Poe scraper
  function scrapePoeMessages() {
    const messages = [];
    
    document.querySelectorAll('[class*="Message_row"]').forEach(el => {
      const isUser = el.querySelector('[class*="Message_humanMessageBubble"]') !== null;
      const role = isUser ? 'user' : 'assistant';
      
      const contentEl = el.querySelector('[class*="Message_botMessageBubble"], [class*="Message_humanMessageBubble"]');
      if (contentEl) {
        const clone = contentEl.cloneNode(true);
        clone.querySelectorAll('button').forEach(btn => btn.remove());
        messages.push({ role, content: clone.innerText });
      }
    });
    
    return messages;
  }
  
  // Perplexity scraper
  function scrapePerplexityMessages() {
    const messages = [];
    
    document.querySelectorAll('[class*="prose"]').forEach(el => {
      // Check parent for role indicators
      const container = el.closest('[class*="answer"], [class*="query"]');
      const isUser = container?.className.includes('query');
      const role = isUser ? 'user' : 'assistant';
      
      const clone = el.cloneNode(true);
      clone.querySelectorAll('button, a[class*="citation"]').forEach(btn => btn.remove());
      
      const content = clone.innerText || clone.textContent;
      if (content.trim()) {
        messages.push({ role, content });
      }
    });
    
    return messages;
  }
  
  // Generic fallback scraper
  function scrapeGenericMessages() {
    const messages = [];
    const selectors = [
      '[data-message-author-role]',
      '.message',
      '[class*="message"]',
      '[class*="chat"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 2) { // Need at least a conversation
        elements.forEach(el => {
          const clone = el.cloneNode(true);
          
          // Remove common UI elements
          clone.querySelectorAll('button, [class*="copy"], [class*="timestamp"], [class*="time"], [class*="icon"], svg').forEach(ui => ui.remove());
          
          const content = clone.innerText || clone.textContent;
          if (content.trim().length > 10) { // Ignore very short snippets
            messages.push({ role: 'unknown', content });
          }
        });
        break;
      }
    }
    
    return messages;
  }
  
  // Clean message content
  function cleanMessageContent(content) {
    if (!content) return '';
    
    // Remove common UI text patterns
    let cleaned = content
      // Remove timestamps (multiple formats)
      .replace(/\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?/gi, '')
      .replace(/(Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+at\s+\d{1,2}:\d{2}/gi, '')
      .replace(/\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago/gi, '')
      .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '') // Date formats like 11/10/2024
      .replace(/\d{4}-\d{2}-\d{2}/g, '') // ISO dates like 2024-11-10
      
      // Remove button text and UI elements
      .replace(/\b(Copy code|Copy|Edit|Delete|Regenerate|Share|Continue|Stop|Retry|Read aloud|Show more|Show less|View code)\b/gi, '')
      .replace(/👍|👎|📋|✏️|🗑️|↻|⟲|🔊|▶️|⏸️|⏹️/g, '')
      .replace(/\b(like|dislike)d?\b/gi, '')
      
      // Remove status text
      .replace(/\b(Typing|Thinking|Generating|Processing|Loading)\.{3,}/gi, '')
      .replace(/●{3,}|\.{4,}/g, '') // Loading indicators
      
      // Remove role labels at start
      .replace(/^(User|Assistant|Claude|ChatGPT|Gemini|AI|Human|You)[\s:]+/i, '')
      
      // Remove reaction indicators
      .replace(/\[\d+\sreaction(s)?\]/gi, '')
      
      // Remove "Code:" or "Python:" prefixes from code blocks
      .replace(/^(Code|Python|JavaScript|Java|C\+\+|Ruby|Go|Rust|SQL):?\s*/gmi, '')
      
      // Remove multiple spaces
      .replace(/\s{2,}/g, ' ')
      
      // Clean up whitespace - allow max 2 newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    return cleaned;
  }
  
  // Normalize role names
  function normalizeRole(role) {
    if (!role) return 'unknown';
    role = role.toLowerCase();
    
    if (role.includes('user') || role.includes('human')) return 'user';
    if (role.includes('assistant') || role.includes('bot') || role.includes('ai')) return 'assistant';
    
    return role;
  }
  
  
  // Auto-sync conversation on load
  let cachedMessages = [];
  
  function syncConversation() {
    const messages = scrapeCleanMessages();
    cachedMessages = messages;
    Logger.info(`🔄 Synced ${messages.length} messages from conversation`);
    return messages;
  }
  
  // Initial sync on page load
  setTimeout(() => {
    syncConversation();
    Logger.info('✅ Initial conversation sync complete');
  }, 2000);
  
  // Sync button handler - forces a re-scan of the conversation
  $('#syncBtn').addEventListener('click', async () => {
    Logger.info('Sync Conversation clicked');
    
    // Check auth
    const isAuth = await TigerAuth.isAuthenticated();
    if (!isAuth) {
      showToast('🔐 Sign in to save conversations', 'warning');
      await TigerAuth.login();
      return;
    }
    
    // Check Pro status
    const user = await TigerAuth.getCurrentUser();
    const isPro = user?.isPro || false;
    
    if (!isPro) {
      showToast('⭐ Upgrade to Pro ($1.99/mo) to save conversations', 'warning');
      // TODO: Open upgrade page
      return;
    }
    
    const messages = syncConversation();
    
    if (messages.length === 0) {
      showToast('⚠️ No messages found to sync', 'warning');
    } else {
      showToast(`🔄 Synced ${messages.length} messages`, 'success');
    }
  });
  
  // Save snapshot button handler
  $('#snapBtn').addEventListener('click', async () => {
    Logger.info('Save Chat Context clicked');
    
    // Check auth
    const isAuth = await TigerAuth.isAuthenticated();
    if (!isAuth) {
      showToast('🔐 Sign in to save conversations', 'warning');
      await TigerAuth.login();
      return;
    }
    
    // Check Pro status
    const user = await TigerAuth.getCurrentUser();
    const isPro = user?.isPro || false;
    
    if (!isPro) {
      showToast('⭐ Upgrade to Pro ($1.99/mo) to save conversations', 'warning');
      // TODO: Open upgrade page
      return;
    }
    
    const messages = scrapeCleanMessages();
    
    if (messages.length === 0) {
      showToast('❌ No messages found on this page', 'error');
      return;
    }
    
    const site = location.hostname.split('.')[0];
    const timestamp = new Date().toISOString();
    const preview = messages[0]?.content?.slice(0, 100) || 'Chat context';
    const tokenCount = countTokensAccurate(messages.map(m => m.content).join(' '));
    
    const snapshot = {
      id: Date.now().toString(),
      site,
      timestamp,
      preview,
      messages,
      tokenCount,
      messageCount: messages.length
    };
    
    chrome.runtime.sendMessage({
      type: 'TP_SAVE_SNAPSHOT',
      snapshot
    }, res => {
      if (res?.success) {
        snapshots.unshift(snapshot);
        renderSnapshots();
        showToast(`💾 Saved ${messages.length} messages (${tokenCount.toLocaleString()} tokens)`, 'success');
      } else {
        showToast('❌ Failed to save: ' + (res?.error || 'Unknown error'), 'error');
      }
    });
  });
  
  // Inject chat button handler - injects the most recent saved chat
  $('#injectBtn').addEventListener('click', async () => {
    Logger.info('Inject Chat clicked');
    
    // Check auth
    const isAuth = await TigerAuth.isAuthenticated();
    if (!isAuth) {
      showToast('🔐 Sign in to inject saved chats', 'warning');
      await TigerAuth.login();
      return;
    }
    
    // Check Pro status
    const user = await TigerAuth.getCurrentUser();
    const isPro = user?.isPro || false;
    
    if (!isPro) {
      showToast('⭐ Upgrade to Pro ($1.99/mo) to inject saved chats', 'warning');
      // TODO: Open upgrade page
      return;
    }
    
    if (snapshots.length === 0) {
      showToast('❌ No saved chats to inject', 'error');
      return;
    }
    
    const snap = snapshots[0]; // Most recent
    const contextText = formatContextForPriming(snap);
    
    // Always copy to clipboard first
    try {
      await navigator.clipboard.writeText(contextText);
      Logger.info('✅ Copied to clipboard');
    } catch (err) {
      Logger.error('Failed to copy to clipboard:', err);
      showToast('❌ Failed to copy to clipboard', 'error');
      return;
    }
    
    // Try to inject into active field
    const field = getActiveInput();
    
    if (field) {
      try {
        if (field.value !== undefined) {
          field.value = contextText;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          field.innerText = contextText;
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        field.focus();
        showToast(`📥 Chat injected! (${snap.messageCount} messages)`, 'success');
        Logger.info('✅ Context injected into input field');
      } catch (err) {
        Logger.error('Failed to inject into field:', err);
        showToast(`📋 Copied to clipboard (${snap.messageCount} messages)`, 'success');
      }
    } else {
      showToast(`📋 Copied to clipboard (${snap.messageCount} messages)`, 'success');
      Logger.info('No input field found, clipboard only');
    }
  });
  
  function renderSnapshots() {
    const list = $('#snapList');
    if (snapshots.length === 0) {
      list.innerHTML = '<div class="empty-state">No saved chats</div>';
      return;
    }
    
    list.innerHTML = snapshots.map(snap => {
      const date = new Date(snap.timestamp);
      const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const msgCount = snap.messageCount || snap.messages?.length || 0;
      const tokens = snap.tokenCount || 0;
      
      return `
        <div class="snap-item">
          <div class="snap-header">
            <span class="snap-site">${snap.site}</span>
            <span class="snap-time">${timeStr}</span>
          </div>
          <div class="snap-preview">${snap.preview || 'Chat context'}</div>
          <div style="font-size:9px;color:#888;margin-top:4px;">
            ${msgCount} messages • ${tokens.toLocaleString()} tokens
          </div>
          <div class="snap-actions">
            <button class="snap-btn export-md" data-id="${snap.id}" title="Export as Markdown">📄 .md</button>
            <button class="snap-btn export-json" data-id="${snap.id}" title="Export as JSON">📊 .json</button>
            <button class="snap-btn export-txt" data-id="${snap.id}" title="Export as Text">📥 .txt</button>
            <button class="snap-btn delete" data-id="${snap.id}">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
    
    // Export as Markdown
    list.querySelectorAll('.export-md').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const snap = snapshots.find(s => s.id === btn.dataset.id);
        if (snap) {
          const markdown = formatContextAsMarkdown(snap);
          downloadFile(markdown, `tiger-chat-${snap.site}-${getTimestamp(snap)}.md`, 'text/markdown');
          showToast(`📄 Exported ${snap.messageCount} messages as Markdown`, 'success');
        }
      });
    });
    
    // Export as JSON
    list.querySelectorAll('.export-json').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const snap = snapshots.find(s => s.id === btn.dataset.id);
        if (snap) {
          const json = formatContextAsJSON(snap);
          downloadFile(json, `tiger-chat-${snap.site}-${getTimestamp(snap)}.json`, 'application/json');
          showToast(`📊 Exported ${snap.messageCount} messages as JSON`, 'success');
        }
      });
    });
    
    // Export as plain text (formatted markdown for injection)
    list.querySelectorAll('.export-txt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const snap = snapshots.find(s => s.id === btn.dataset.id);
        if (snap) {
          const contextText = formatContextForPriming(snap);
          downloadFile(contextText, `tiger-chat-${snap.site}-${getTimestamp(snap)}.txt`, 'text/plain');
          showToast(`📥 Exported ${snap.messageCount} messages`, 'success');
        }
      });
    });
    
    list.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        chrome.runtime.sendMessage({ type: 'DELETE_SNAPSHOT', id: btn.dataset.id }, res => {
          if (res?.success) {
            snapshots = snapshots.filter(s => s.id !== btn.dataset.id);
            renderSnapshots();
            showToast('🗑️ Deleted', 'success');
          } else {
            showToast('❌ Failed to delete', 'error');
          }
        });
      });
    });
  }
  
  // Format snapshot as readable context for priming new chats
  function formatContextForPriming(snap) {
    const date = new Date(snap.timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
    
    const tokenInfo = snap.tokenCount ? ` | **Tokens:** ${snap.tokenCount.toLocaleString()}` : '';
    
    // Beautiful markdown header
    const header = `# 💬 Previous Conversation Context

**Platform:** ${snap.site} | **Date:** ${date} | **Messages:** ${snap.messageCount}${tokenInfo}

---

`;
    
    // Format each message with clean markdown
    const conversation = snap.messages.map((msg, idx) => {
      const roleEmoji = msg.role === 'user' ? '👤' : '🤖';
      const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
      const messageNum = idx + 1;
      
      return `### ${roleEmoji} Message ${messageNum} (${roleLabel})

${msg.content}

---
`;
    }).join('\n');
    
    // Footer with instruction
    const footer = `
*Context restored from ${snap.site} • Continue this conversation naturally*`;
    
    return header + conversation + footer;
  }

  // Export as JSON format
  function formatContextAsJSON(snap) {
    return JSON.stringify({
      metadata: {
        platform: snap.site,
        timestamp: snap.timestamp,
        messageCount: snap.messageCount,
        tokenCount: snap.tokenCount || null,
        exportedAt: new Date().toISOString()
      },
      messages: snap.messages.map((msg, idx) => ({
        index: idx + 1,
        role: msg.role,
        content: msg.content
      }))
    }, null, 2);
  }

  // Export as clean markdown file
  function formatContextAsMarkdown(snap) {
    const date = new Date(snap.timestamp).toLocaleString();
    
    let md = `# Conversation Export\n\n`;
    md += `**Platform:** ${snap.site}\n`;
    md += `**Date:** ${date}\n`;
    md += `**Messages:** ${snap.messageCount}\n`;
    if (snap.tokenCount) md += `**Tokens:** ${snap.tokenCount.toLocaleString()}\n`;
    md += `\n---\n\n`;
    
    snap.messages.forEach((msg, idx) => {
      const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
      md += `## ${roleLabel} (Message ${idx + 1})\n\n`;
      md += `${msg.content}\n\n`;
      md += `---\n\n`;
    });
    
    md += `\n*Exported by Tiger Prompts v2.0*\n`;
    
    return md;
  }

  // Helper: Download file
  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Helper: Get formatted timestamp for filenames
  function getTimestamp(snap) {
    const date = new Date(snap.timestamp);
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `${dateStr}-${timeStr}`;
  }

  
  Resources.addInterval(setInterval(updateTokenDisplay, CONFIG.TOKEN_UPDATE_INTERVAL));
  
  // ========== AUTO-ENHANCE ON SEND ==========
  
  // Track if we're in the middle of auto-enhancing to prevent loops
  let autoEnhanceInProgress = false;
  let ourProgrammaticClick = false; // Flag to mark clicks we initiate
  
  // Site-specific send button selectors
  const SEND_BUTTON_SELECTORS = {
    'chatgpt.com': 'button[data-testid="send-button"], button[data-testid="fruitjuice-send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]',
    'chat.openai.com': 'button[data-testid="send-button"], button[data-testid="fruitjuice-send-button"], button[aria-label="Send prompt"], button[aria-label="Send message"]',
    'claude.ai': 'button[aria-label="Send Message"], button[aria-label="Send message"]',
    'gemini.google.com': 'button[aria-label="Send message"]',
    'perplexity.ai': 'button[aria-label="Submit"], button[type="submit"]',
    'www.perplexity.ai': 'button[aria-label="Submit"], button[type="submit"]'
  };
  
  function getSendButton() {
    const hostname = location.hostname;
    
    // Try site-specific selectors first
    for (const [site, selector] of Object.entries(SEND_BUTTON_SELECTORS)) {
      if (hostname.includes(site)) {
        // Try each selector in the comma-separated list
        const selectors = selector.split(',').map(s => s.trim());
        for (const sel of selectors) {
          const btn = document.querySelector(sel);
          if (btn && btn.offsetParent !== null) { // Check if visible
            Logger.info(`✅ Found send button using selector: ${sel}`);
            return btn;
          }
        }
      }
    }
    
    // Fallback: look for any button with send-related text or icons
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = btn.textContent.toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const dataTestId = (btn.getAttribute('data-testid') || '').toLowerCase();
      
      if (
        text.includes('send') || 
        ariaLabel.includes('send') || 
        dataTestId.includes('send') ||
        btn.querySelector('svg[data-icon="paper-plane"]') ||
        btn.querySelector('svg[data-icon="send"]')
      ) {
        if (btn.offsetParent !== null) { // Check if visible
          Logger.info(`✅ Found send button via fallback search`);
          return btn;
        }
      }
    }
    
    Logger.warn('❌ No send button found on page');
    return null;
  }
  
  // Try to find send button with retries (for timing issues)
  async function getSendButtonWithRetry(maxAttempts = 5, delayMs = 200) {
    for (let i = 0; i < maxAttempts; i++) {
      const btn = getSendButton();
      if (btn && !btn.disabled) {
        Logger.info(`✅ Found enabled send button on attempt ${i + 1}`);
        return btn;
      }
      
      if (i < maxAttempts - 1) {
        Logger.info(`⏳ Send button not ready (attempt ${i + 1}/${maxAttempts}), waiting ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    Logger.warn('❌ Could not find enabled send button after retries');
    return null;
  }
  
  // Intercept Enter key in input fields
  document.addEventListener('keydown', async (e) => {
    // Check if Enter was pressed (not Shift+Enter which is new line)
    if (e.key === 'Enter' && !e.shiftKey) {
      Logger.info('🔑 Enter pressed');
      
      // Only intercept if auto-enhance is enabled
      if (!settings.autoEnhance) {
        Logger.info('⚠️ Auto-enhance is DISABLED in settings');
        return;
      }
      
      Logger.info('✅ Auto-enhance is ENABLED');
      
      // Check if already enhancing - prevents loops
      if (autoEnhanceInProgress) {
        Logger.info('⏳ Enhancement already in progress, ignoring Enter');
        return;
      }
      
      // Check if we're in a chat input
      let input = document.activeElement;
      Logger.info('🎯 Active element:', input);
      Logger.info('📋 Wrapped inputs count:', wrappedInputs.size);
      
      // CRITICAL FIX: On Claude.ai, activeElement becomes <body> when Enter is pressed
      // Use the last focused input (activeField) instead
      if (input === document.body || input.tagName === 'BODY') {
        Logger.warn('⚠️ Active element is BODY - using last focused input instead');
        input = activeField;
        Logger.info('🔄 Using activeField:', input);
      }
      
      Logger.info('🔍 Is active element in wrapped inputs?', wrappedInputs.has(input));
      
      if (!input || !wrappedInputs.has(input)) {
        // Last resort: if we have exactly 1 wrapped input and it has content, use it
        if (wrappedInputs.size === 1) {
          const singleInput = Array.from(wrappedInputs)[0];
          const text = getFieldValue(singleInput);
          if (text && text.trim()) {
            Logger.info('✅ Using the only wrapped input with content');
            
            // NEW STRATEGY: Save text and clear input IMMEDIATELY
            // This prevents Claude from sending the original text
            const savedText = text;
            Logger.info('💾 Saved text, clearing input to prevent send');
            setFieldValue(singleInput, '');
            
            // Stop the event (though Claude might have already seen it)
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Wait a moment for Claude to realize input is empty
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Now restore text and enhance
            setFieldValue(singleInput, savedText);
            await performAutoEnhanceAndSend(singleInput);
            return;
          }
        }
        
        Logger.warn('❌ Could not find wrapped input - message already sent');
        return;
      }
      
      const text = getFieldValue(input);
      if (!text || !text.trim()) {
        Logger.info('⚠️ Input is empty, not enhancing');
        return;
      }
      
      Logger.info('🚀 Auto-enhance on Enter detected');
      
      // NEW STRATEGY: Save text and clear input IMMEDIATELY
      const savedText = text;
      Logger.info('💾 Saved text, clearing input to prevent send');
      setFieldValue(input, '');
      
      // Stop the event
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      // Wait for Claude to see empty input
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Restore text and enhance
      setFieldValue(input, savedText);
      await performAutoEnhanceAndSend(input);
    }
  }, true); // Capture phase to intercept BEFORE site handlers
  
  // Intercept Send button clicks
  document.addEventListener('click', async (e) => {
    // Skip if this is our own programmatic click
    if (ourProgrammaticClick) {
      Logger.info('🤖 Our programmatic click - bypassing interception');
      return; // Let it through without any preventDefault
    }
    
    // Only intercept if auto-enhance is enabled
    if (!settings.autoEnhance) {
      // Only log if clicking on a button (reduce console spam)
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        Logger.info('⚠️ Click on button but auto-enhance is DISABLED');
      }
      return;
    }
    
    // Check if already enhancing - this prevents infinite loops
    if (autoEnhanceInProgress) {
      Logger.info('⏳ Enhancement already in progress, allowing click through');
      return;
    }
    
    // Check if this is a send button
    const sendBtn = getSendButton();
    if (!sendBtn) {
      // Only log if clicking on a button (reduce console spam)
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        Logger.info('🔍 Click on button, but no send button found');
      }
      return;
    }
    
    // Check if the click target is the send button or inside it
    const isClickOnSendButton = sendBtn.contains(e.target) || e.target === sendBtn;
    if (!isClickOnSendButton) return;
    
    Logger.info('🖱️ Send button clicked!');
    Logger.info('✅ Click handler: Auto-enhance is ENABLED');
    
    // Get the active input
    const input = getActiveInput();
    Logger.info('📝 Active input found:', input);
    if (!input) {
      Logger.warn('❌ No active input found');
      return;
    }
    
    const text = getFieldValue(input);
    Logger.info('📄 Input text length:', text?.length || 0);
    if (!text || !text.trim()) {
      Logger.info('⚠️ Input is empty, letting click through');
      return;
    }
    
    Logger.info('🚀 Auto-enhance on Send button detected - preventing default and enhancing');
    
    // Prevent the default send
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    await performAutoEnhanceAndSend(input, sendBtn);
  }, true); // Capture phase to intercept before site handlers
  
  async function performAutoEnhanceAndSend(input, sendButton = null) {
    autoEnhanceInProgress = true;
    
    const originalText = getFieldValue(input);
    Logger.info('Auto-enhancing before send:', { length: originalText.length, mode: settings.enhanceMode });
    
    // Find the tiger button associated with this input to animate it
    const tigerButton = findTigerButtonForInput(input);
    
    if (tigerButton) {
      startTigerLoading(tigerButton);
      Logger.info('🎬 Started tiger button animation for auto-enhance');
    }
    
    // Show user-friendly notification
    showToast('🐯 Auto-enhancing your message...', 'loading');
    
    // Enhance the text
    const result = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'TP_ENHANCE',
        text: originalText,
        mode: settings.enhanceMode
      }, resolve);
    });
    
    if (result?.success) {
      // Stop loading animation and show success
      if (tigerButton) {
        stopTigerLoading(tigerButton);
        tigerSuccessAnimation(tigerButton);
        Logger.info('✅ Tiger button success animation triggered');
      }
      
      Logger.info('📝 Enhanced text:', { 
        original: originalText.substring(0, 50) + '...', 
        enhanced: result.output.substring(0, 50) + '...',
        originalLength: originalText.length,
        enhancedLength: result.output.length
      });
      
      // Replace text with enhanced version
      setFieldValue(input, result.output);
      
      Logger.info('Auto-enhancement successful, preparing to send');
      
      // Show brief success message
      const modeEmoji = settings.enhanceMode === 'light' ? '✨' : '🔥';
      showToast(`${modeEmoji} Enhanced & sending...`, 'success');
      
      // CRITICAL: Wait longer for the input to be fully updated in the DOM
      // and for the site's internal state to recognize the new text
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Focus the input to ensure it's active
      input.focus();
      
      // Trigger input events to ensure the site recognizes the text change
      input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      
      // Wait a bit more for events to propagate
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Now trigger the actual send - use retry logic to wait for button to be ready
      const actualSendButton = sendButton || await getSendButtonWithRetry();
      
      if (actualSendButton) {
        Logger.info('✅ Clicking actual send button (programmatically)');
        
        // Make sure send button is enabled
        actualSendButton.disabled = false;
        actualSendButton.removeAttribute('disabled');
        
        // Set flag to mark this as our click
        ourProgrammaticClick = true;
        
        // Click it
        actualSendButton.click();
        
        // Unset flag after a delay
        setTimeout(() => {
          ourProgrammaticClick = false;
        }, 500);
        
        Logger.info('✅ Send button clicked, message should be sending');
        
        // Force counter update after message appears
        setTimeout(() => {
          trackConversationTokens();
        }, 2000);
      } else {
        Logger.error('❌ No send button found - cannot send message');
        showToast('✅ Enhanced! Please click Send to submit.', 'success');
      }
      
    } else {
      // Stop loading animation on error
      if (tigerButton) {
        stopTigerLoading(tigerButton);
        // Re-enable button
        tigerButton.removeAttribute('disabled');
        tigerButton.style.cursor = 'pointer';
        tigerButton.style.opacity = '1';
      }
      
      // Enhancement failed, send original
      Logger.error('Auto-enhancement failed:', result?.error);
      showToast('⚠️ Enhancement failed, sending original...', 'warning');
      
      // Restore original text and send
      setFieldValue(input, originalText);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const actualSendButton = sendButton || await getSendButtonWithRetry();
      if (actualSendButton) {
        // Mark as our programmatic click
        ourProgrammaticClick = true;
        actualSendButton.click();
        setTimeout(() => {
          ourProgrammaticClick = false;
        }, 500);
      } else {
        showToast('⚠️ Please click Send to submit', 'warning');
      }
    }
    
    // Reset flag after a delay to prevent race conditions
    setTimeout(() => {
      autoEnhanceInProgress = false;
    }, 1000);
  }
  
  // Helper function to find the tiger button associated with an input
  function findTigerButtonForInput(input) {
    // Try stored reference first
    if (input && input._tigerButton) {
      return input._tigerButton;
    }
    
    // Fallback: Tiger buttons are appended to body with fixed positioning
    // We need to find the one that was created for this specific input
    // We can identify it by checking which inputs are wrapped
    const allTigerButtons = document.querySelectorAll('.tp-enhance-btn');
    
    // Since we only wrap up to 2 inputs, and buttons are in the same order,
    // we can find the button by matching against wrappedInputs
    const wrappedInputsArray = Array.from(wrappedInputs);
    const inputIndex = wrappedInputsArray.indexOf(input);
    
    if (inputIndex >= 0 && inputIndex < allTigerButtons.length) {
      return allTigerButtons[inputIndex];
    }
    
    return null;
  }
  
  Logger.info('🤖 Auto-enhance on send configured');
  
  // ========== KEYBOARD SHORTCUT: CTRL+E / CMD+E TO ENHANCE ==========
  
  document.addEventListener('keydown', async (e) => {
    // Ctrl+E (Windows/Linux) or Cmd+E (Mac) to enhance current input
    if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
      e.preventDefault();
      e.stopPropagation();
      
      Logger.info('🎹 Keyboard shortcut triggered: Ctrl/Cmd+E');
      
      const input = getActiveInput();
      if (!input) {
        showToast('⚠️ No input field focused', 'warning');
        return;
      }
      
      const text = getFieldValue(input);
      if (!text || !text.trim()) {
        showToast('⚠️ Input is empty', 'warning');
        return;
      }
      
      // Check for race condition
      if (!canStartEnhancement()) {
        return;
      }
      
      startEnhancement();
      showToast('🐯 Enhancing with keyboard shortcut...', 'loading');
      Logger.info('Enhancing via keyboard:', { mode: settings.enhanceMode, length: text.length });
      
      chrome.runtime.sendMessage({ 
        type: 'TP_ENHANCE', 
        text: text, 
        mode: settings.enhanceMode 
      }, res => {
        endEnhancement();
        
        if (res?.success) {
          setFieldValue(input, res.output);
          
          const modeEmoji = settings.enhanceMode === 'light' ? '✨' : '🔥';
          const modeLabel = settings.enhanceMode === 'light' ? 'Light' : 'Heavy';
          showToast(`${modeEmoji} Enhanced with ${modeLabel} mode! (Ctrl+E)`, 'success');
          
          Logger.info('Keyboard enhancement complete');
        } else {
          showToast('❌ Enhancement failed: ' + (res?.error || 'Unknown error'), 'error');
          Logger.error('Keyboard enhancement failed:', res?.error);
        }
      });
    }
  });
  
  Logger.info('⌨️ Keyboard shortcut registered: Ctrl+E / Cmd+E for quick enhancement');
  
  // ========== INPUT WRAPPER OVERLAY (OPTION C) ==========
  
  let wrappedInputs = new Set();
  let activeField = null;
  
  function wrapInput(input) {
    // STRICT DUPLICATE DETECTION
    if (wrappedInputs.has(input)) {
      console.log('[Tiger Prompts] ⏭️ Input already wrapped - skipping');
      return;
    }
    
    // Check for data attribute marker
    if (input.dataset.tpEnhanced === 'true') {
      console.log('[Tiger Prompts] ⏭️ Input already marked as enhanced - skipping');
      return;
    }
    
    // Check if input already has a tiger button
    if (input._tigerButton && document.body.contains(input._tigerButton)) {
      console.log('[Tiger Prompts] ⏭️ Input already has tiger button - skipping');
      return;
    }
    
    // SAFETY: Limit to max 2 wrapped inputs to prevent duplication
    // (some sites might have 2 chat inputs, but never more)
    if (wrappedInputs.size >= 2) {
      console.warn('[Tiger Prompts] Already wrapped 2 inputs - skipping additional inputs to prevent duplication');
      return;
    }
    
    console.log('[Tiger Prompts] ✅ Wrapping input:', input);
    
    // Mark input as enhanced
    input.dataset.tpEnhanced = 'true';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'tp-input-wrapper';
    wrapper.style.cssText = 'position:relative!important;display:block!important;border:2px solid transparent!important;border-radius:8px!important;transition:all 0.3s ease!important;z-index:1!important;isolation:isolate!important;';
    
    const parent = input.parentNode;
    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    
    // ========== SIMPLIFIED HARD-LOCKED POSITIONING ==========
    // Button positioned RELATIVE to wrapper, not body - much more reliable
    
    const enhanceBtn = document.createElement('div');
    enhanceBtn.className = 'tp-enhance-btn';
    enhanceBtn.setAttribute('data-tp-button', 'true');
    // HARD LOCK: absolute position within wrapper = always top-right corner
    enhanceBtn.style.cssText = `
      position: absolute !important;
      top: 8px !important;
      right: 8px !important;
      width: 44px !important;
      height: 44px !important;
      background: linear-gradient(135deg, #FF7A00, #FF9940) !important;
      border-radius: 50% !important;
      box-shadow: 0 4px 16px rgba(255,122,0,0.7), 0 0 0 3px rgba(255,122,0,0.3) !important;
      cursor: pointer !important;
      z-index: 999999 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: all 0.2s !important;
      border: 3px solid rgba(255,255,255,0.5) !important;
      opacity: 0 !important;
      pointer-events: none !important;
    `;
    enhanceBtn.innerHTML = `<img src="${TIGER_ICON}" style="width:28px!important;height:28px!important;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))!important;pointer-events:none!important;"/>`;
    
    // Append to wrapper - stays locked to input position
    wrapper.appendChild(enhanceBtn);
    
    // Store reference for auto-enhance lookup
    input._tigerButton = enhanceBtn;
    
    Logger.info('✅ Tiger button created - HARD LOCKED to top-right corner');
    
    // Keep button visible on hover
    enhanceBtn.addEventListener('mouseenter', () => {
      isButtonVisible = true; // Prevent blur from hiding it
    });
    
    enhanceBtn.addEventListener('mouseleave', () => {
      if (!menuIsOpen && document.activeElement !== input) {
        isButtonVisible = false;
        enhanceBtn.style.setProperty('opacity', '0', 'important');
        enhanceBtn.style.setProperty('pointer-events', 'none', 'important');
      }
    });
    
    // ========== ENHANCEMENT MENU ==========
    const enhanceMenu = document.createElement('div');
    enhanceMenu.className = 'tp-enhance-menu';
    enhanceMenu.setAttribute('data-tp-menu', 'true');
    // FIXED POSITION - append to body, position relative to viewport
    enhanceMenu.style.cssText = `
      position: fixed;
      background: #1E1E1E;
      border: 3px solid #FF7A00;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,122,0,0.3);
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      min-width: 160px;
      z-index: 999999;
      font-family: "Inter", system-ui;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
    `;
    
    enhanceMenu.innerHTML = `
      <div data-mode="light" style="padding:12px 16px;background:rgba(255,255,255,0.05);border-radius:8px;color:#FFF;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:10px;border-left:4px solid #FF7A00;transition:all 0.2s;">
        <span style="font-size:18px;">✨</span><span>Light Enhance</span>
      </div>
      <div data-mode="heavy" style="padding:12px 16px;background:rgba(255,255,255,0.05);border-radius:8px;color:#FFF;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:10px;border-left:4px solid #6C63FF;transition:all 0.2s;">
        <span style="font-size:18px;">🔥</span><span>Heavy Enhance</span>
      </div>
    `;
    
    document.body.appendChild(enhanceMenu);
    Logger.info('Menu created and appended to BODY (not wrapper!)');
    
    // Store reference to button and menu for positioning
    enhanceBtn._menu = enhanceMenu;
    
    wrappedInputs.add(input);
    
    let menuIsOpen = false;
    let isButtonVisible = false;
    
    // Also show button when clicking anywhere on the wrapper
    wrapper.addEventListener('click', () => {
      if (!isButtonVisible) {
        Logger.info('Wrapper clicked - showing tiger button');
        enhanceBtn.style.setProperty('opacity', '1', 'important');
        enhanceBtn.style.setProperty('pointer-events', 'auto', 'important');
        isButtonVisible = true;
        wrapper.style.borderColor = '#FF7A00';
        wrapper.style.boxShadow = '0 0 0 3px rgba(255, 122, 0, 0.2), 0 0 20px rgba(255, 122, 0, 0.3)';
      }
    });
    
    // Show button on focus - make it FULLY visible
    input.addEventListener('focus', () => {
      Logger.info('Input focused - showing tiger button');
      wrapper.style.borderColor = '#FF7A00';
      wrapper.style.boxShadow = '0 0 0 3px rgba(255, 122, 0, 0.2), 0 0 20px rgba(255, 122, 0, 0.3)';
      
      // Log button visibility
      Logger.info('🐯 Tiger button now visible at top-right corner');
      
      // Use setProperty with 'important' to override the initial !important flag
      enhanceBtn.style.setProperty('opacity', '1', 'important');
      enhanceBtn.style.setProperty('pointer-events', 'auto', 'important');
      isButtonVisible = true;
      
      activeField = input;
    });
    
    // DON'T auto-hide on blur - only explicit close
    input.addEventListener('blur', (e) => {
      setTimeout(() => {
        // Only hide button if menu is not open and not hovering button
        if (!menuIsOpen && !enhanceBtn.contains(e.relatedTarget)) {
          Logger.info('Input blurred - hiding tiger button');
          enhanceBtn.style.setProperty('opacity', '0', 'important');
          enhanceBtn.style.setProperty('pointer-events', 'none', 'important');
          isButtonVisible = false;
          wrapper.style.borderColor = 'transparent';
          wrapper.style.boxShadow = 'none';
        }
      }, 500); // Increased from 200ms to 500ms to prevent flickering
    });
    
    // Keep button visible if menu is open
    let menuCloseTimeout = null;
    
    // SIMPLIFIED MENU SHOW FUNCTION
    function showMenu() {
      console.log('[Tiger Prompts] 🔥 SHOWING MENU');
      
      // Calculate position based on button location
      const btnRect = enhanceBtn.getBoundingClientRect();
      
      // Position menu below and aligned to right edge of button
      enhanceMenu.style.top = (btnRect.bottom + 8) + 'px';
      enhanceMenu.style.left = (btnRect.right - 160) + 'px'; // 160px = min-width of menu
      
      // Make visible
      enhanceMenu.style.opacity = '1';
      enhanceMenu.style.pointerEvents = 'auto';
      
      menuIsOpen = true;
      
      console.log('[Tiger Prompts] ✅ Menu visible at:', {
        top: enhanceMenu.style.top,
        left: enhanceMenu.style.left,
        opacity: enhanceMenu.style.opacity
      });
    }
    
    // NUCLEAR MENU HIDE FUNCTION  
    function hideMenu() {
      console.log('[Tiger Prompts] 🔥 HIDING MENU - NUCLEAR METHOD');
      
      // NUCLEAR OPTION: Just fade it out, don't move it
      enhanceMenu.style.opacity = '0';
      enhanceMenu.style.pointerEvents = 'none';
      
      menuIsOpen = false;
      
      console.log('[Tiger Prompts] ✅ Menu hidden');
    }
    
    // Button click - toggle menu
    enhanceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      console.log('[Tiger Prompts] Tiger button clicked - menuIsOpen:', menuIsOpen);
      
      if (menuIsOpen) {
        hideMenu();
      } else {
        showMenu();
      }
    });
    
    // Hover effect on button - makes it pulse
    enhanceBtn.addEventListener('mouseenter', () => {
      enhanceBtn.style.transform = 'scale(1.15)';
      enhanceBtn.style.boxShadow = '0 6px 20px rgba(255,122,0,0.9),0 0 0 4px rgba(255,122,0,0.4)!important';
    });
    enhanceBtn.addEventListener('mouseleave', () => {
      enhanceBtn.style.transform = 'scale(1)';
      enhanceBtn.style.boxShadow = '0 4px 16px rgba(255,122,0,0.7),0 0 0 3px rgba(255,122,0,0.3)!important';
    });
    
    // Menu item clicks
    enhanceMenu.querySelectorAll('[data-mode]').forEach(item => {
      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(255,122,0,0.25)';
        item.style.transform = 'translateX(-2px)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'rgba(255,255,255,0.05)';
        item.style.transform = 'translateX(0)';
      });
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        // AUTH GATE: Require account to use tiger enhancement
        const isAuth = await TigerAuth.isAuthenticated();
        if (!isAuth) {
          hideMenu();
          showToast('🔐 Sign in to use Tiger enhancement', 'warning');
          await TigerAuth.login();
          return;
        }
        
        // Check for race condition
        if (!canStartEnhancement()) {
          return;
        }
        
        const mode = item.getAttribute('data-mode');
        hideMenu();
        Logger.info('Enhancement mode selected:', mode);
        
        // Get current text from the actual input element
        let text = '';
        if (input.value !== undefined) {
          text = input.value;
        } else if (input.innerText) {
          text = input.innerText;
        } else if (input.textContent) {
          text = input.textContent;
        }
        
        if (!text || !text.trim()) {
          showToast('❌ Input is empty', 'error');
          return;
        }
        
        lastEnhancement.original = text;
        
        // Start enhancement process
        startEnhancement();
        
        // Start loading animation on tiger button
        startTigerLoading(enhanceBtn);
        showToast('🐯 Enhancing your prompt...', 'loading');
        
        chrome.runtime.sendMessage({ type: 'TP_ENHANCE', text, mode }, res => {
          // Stop loading animation
          stopTigerLoading(enhanceBtn);
          endEnhancement();
          
          if (res?.success) {
            lastEnhancement.enhanced = res.output;
            
            // Set enhanced text back to input
            if (input.value !== undefined) {
              input.value = res.output;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              input.innerText = res.output;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            // Success animation on tiger button
            tigerSuccessAnimation(enhanceBtn);
            
            // Show detailed success notification
            const modeEmoji = mode === 'light' ? '✨' : '🔥';
            const modeLabel = mode === 'light' ? 'Light' : 'Heavy';
            showToast(`${modeEmoji} Enhanced with ${modeLabel} mode!`, 'success');
            
            // Show detailed explanation in sidebar
            showSidebarNotification({
              mode: mode,
              pqsBefore: res.pqsBefore,
              pqsAfter: res.pqsAfter,
              delta: res.delta,
              explanation: res.explanation,
              originalLength: text.length,
              enhancedLength: res.output.length
            });
            
            console.log('[Tiger Prompts] Enhancement success:', res);
          } else {
            showToast('❌ Enhancement failed: ' + (res?.error || 'Unknown error'), 'error');
            console.error('[Tiger Prompts] Enhancement failed:', res);
          }
        });
      });
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!enhanceMenu.contains(e.target) && !enhanceBtn.contains(e.target)) {
        if (menuIsOpen) {
          hideMenu();
        }
      }
    });
    
    // ========== NUCLEAR VISIBILITY ENFORCER ==========
    // Watch the button for ANY external modifications and revert them
    const buttonProtector = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          // Check if someone is trying to hide our button
          const display = enhanceBtn.style.display;
          const visibility = enhanceBtn.style.visibility;
          
          if (isButtonVisible) {
            // Force it to stay visible if it should be visible
            if (display === 'none' || visibility === 'hidden') {
              console.warn('[Tiger Prompts] Button tampering detected - reverting');
              enhanceBtn.style.setProperty('display', 'flex', 'important');
              enhanceBtn.style.setProperty('visibility', 'visible', 'important');
              enhanceBtn.style.setProperty('opacity', '1', 'important');
              enhanceBtn.style.setProperty('pointer-events', 'auto', 'important');
            }
          }
        }
      });
    });
    
    buttonProtector.observe(enhanceBtn, {
      attributes: true,
      attributeFilter: ['style']
    });
    
    // ========== MENU VISIBILITY ENFORCER ==========
    // Watch the menu for tampering when it should be visible
    const menuProtector = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          if (menuIsOpen) {
            // Ensure menu stays visible when it should be open
            const display = enhanceMenu.style.display;
            const opacity = parseFloat(enhanceMenu.style.opacity);
            
            if (display === 'none' || opacity === 0) {
              console.warn('[Tiger Prompts] Menu tampering detected - reverting');
              enhanceMenu.style.setProperty('display', 'flex', 'important');
              enhanceMenu.style.setProperty('opacity', '1', 'important');
              enhanceMenu.style.setProperty('pointer-events', 'auto', 'important');
            }
          }
        }
      });
    });
    
    menuProtector.observe(enhanceMenu, {
      attributes: true,
      attributeFilter: ['style']
    });
    
    Logger.info('Button and menu protection active');
  }
  
  function scanAndWrapInputs() {
    const selectors = [
      'textarea',
      '[contenteditable="true"]'
    ];
    
    Logger.info('🔍 Scanning for inputs...');
    
    selectors.forEach(selector => {
      const inputs = document.querySelectorAll(selector);
      Logger.info(`📝 Found ${inputs.length} ${selector} element(s)`);
      
      inputs.forEach((input, idx) => {
        Logger.info(`--- Checking input #${idx + 1} ---`);
        
        // Skip if already wrapped
        if (wrappedInputs.has(input)) {
          Logger.info('❌ Already wrapped, skipping');
          return;
        }
        
        // Skip if not visible
        if (input.offsetParent === null) {
          Logger.info('❌ Not visible (display:none or hidden), skipping');
          return;
        }
        
        // Skip inputs inside our own extension
        if (input.closest('[data-tp-dock]') || input.closest('#tp-dock-root')) {
          Logger.info('❌ Inside Tiger Prompts extension, skipping');
          return;
        }
        
        // Skip prompt creation modal inputs
        if (input.id === 'customPromptInput' || input.closest('[style*="z-index: 99999999"]')) {
          Logger.info('❌ Inside prompt creation modal, skipping');
          return;
        }
        
        const rect = input.getBoundingClientRect();
        Logger.info(`📏 Size: ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}px`);
        
        // Site-specific minimum size (Claude starts small, then expands)
        const hostname = location.hostname;
        let minHeight = 30;
        let minWidth = 150;
        
        if (hostname.includes('claude.ai')) {
          minHeight = 20; // Claude's empty input is ~22px
          minWidth = 100;
          Logger.info(`🤖 Claude.ai: Using relaxed minimum (${minWidth}x${minHeight}px)`);
        } else if (hostname.includes('perplexity.ai')) {
          minHeight = 20; // Perplexity also has small initial input
          minWidth = 100;
          Logger.info(`🔮 Perplexity: Using relaxed minimum (${minWidth}x${minHeight}px)`);
        }
        
        // Skip if too small
        if (rect.height < minHeight || rect.width < minWidth) {
          Logger.info(`❌ Too small (min: ${minWidth}x${minHeight}px), skipping`);
          return;
        }
        
        // Skip inputs that are clearly not chat inputs (basic filtering only)
        const skipPatterns = ['search', 'filter', 'email', 'password', 'username'];
        const inputId = (input.id || '').toLowerCase();
        const inputPlaceholder = (input.placeholder || '').toLowerCase();
        const inputAriaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
        const combinedText = inputId + inputPlaceholder + inputAriaLabel;
        
        Logger.info(`🔤 Text check: "${combinedText.substring(0, 50)}..."`);
        
        const matchedPattern = skipPatterns.find(pattern => combinedText.includes(pattern));
        if (matchedPattern) {
          Logger.info(`❌ Matches skip pattern: "${matchedPattern}", skipping`);
          return;
        }
        
        // Site-specific detection
        let shouldWrap = false;
        let reason = '';
        
        if (hostname.includes('claude.ai')) {
          // Claude: contenteditable div - wrap if it passed size checks above
          const isContentEditable = input.matches('[contenteditable="true"]');
          shouldWrap = isContentEditable; // Already passed size check, so wrap it
          reason = `contenteditable=${isContentEditable}, passed size check`;
          Logger.info(`🤖 Claude.ai: ${shouldWrap ? '✅ WRAP' : '❌ SKIP'} (${reason})`);
        } else if (hostname.includes('openai.com') || hostname.includes('chatgpt.com')) {
          // ChatGPT: textarea or contenteditable - wrap everything that passes basic checks
          shouldWrap = true;
          reason = 'ChatGPT - wrap all visible inputs';
          Logger.info(`💬 ChatGPT: ✅ WRAP (${reason})`);
        } else if (hostname.includes('gemini.google.com')) {
          // Gemini: contenteditable
          const isContentEditable = input.matches('[contenteditable="true"]');
          const heightOk = rect.height >= 40;
          shouldWrap = isContentEditable && heightOk;
          reason = `contenteditable=${isContentEditable}, height>40=${heightOk}`;
          Logger.info(`🔷 Gemini: ${shouldWrap ? '✅ WRAP' : '❌ SKIP'} (${reason})`);
        } else if (hostname.includes('perplexity.ai')) {
          // Perplexity: textarea or contenteditable with relaxed height requirement
          const isTextarea = input.matches('textarea');
          const isContentEditable = input.matches('[contenteditable="true"]');
          const heightOk = rect.height >= 30; // Relaxed from 50
          shouldWrap = isTextarea || (isContentEditable && heightOk);
          reason = `textarea=${isTextarea}, contenteditable=${isContentEditable}, height>30=${heightOk}`;
          Logger.info(`🔮 Perplexity: ${shouldWrap ? '✅ WRAP' : '❌ SKIP'} (${reason})`);
        } else {
          // Generic: wrap textarea, or large contenteditable
          const isTextarea = input.matches('textarea');
          const isLargeContentEditable = input.matches('[contenteditable="true"]') && rect.height > 50;
          shouldWrap = isTextarea || isLargeContentEditable;
          reason = `textarea=${isTextarea}, largeContentEditable=${isLargeContentEditable}`;
          Logger.info(`🌐 Generic: ${shouldWrap ? '✅ WRAP' : '❌ SKIP'} (${reason})`);
        }
        
        if (shouldWrap) {
          Logger.info(`🎉 WRAPPING INPUT!`);
          wrapInput(input);
        }
      });
    });
  }
  
  // Initial scan
  setTimeout(scanAndWrapInputs, 1000);
  
  // Rescan less frequently - every 5 seconds instead of 3
  // (reduces chance of wrapping wrong inputs)
  Resources.addInterval(setInterval(scanAndWrapInputs, CONFIG.SCAN_INTERVAL));
  
  // CLAUDE.AI FIX: Add MutationObserver to detect when Claude adds/changes inputs
  if (location.hostname.includes('claude.ai')) {
    Logger.info('🤖 Setting up Claude.ai-specific input detection');
    
    const observer = new MutationObserver((mutations) => {
      let needsRescan = false;
      
      mutations.forEach(mutation => {
        // Check if contenteditable was added/changed
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            if (node.matches && node.matches('[contenteditable="true"]')) {
              needsRescan = true;
            }
            if (node.querySelectorAll) {
              const editables = node.querySelectorAll('[contenteditable="true"]');
              if (editables.length > 0) {
                needsRescan = true;
              }
            }
          }
        });
        
        // Check attribute changes
        if (mutation.type === 'attributes' && mutation.attributeName === 'contenteditable') {
          needsRescan = true;
        }
      });
      
      if (needsRescan) {
        Logger.info('🤖 Claude.ai: Detected input change, rescanning...');
        setTimeout(scanAndWrapInputs, 500);
      }
    });
    
    // Observe the main content area
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['contenteditable']
    });
    
    Resources.addCleanup(() => observer.disconnect());
  }
  
  // Cleanup function - removes tiger buttons from non-chat inputs
  function cleanupIncorrectButtons() {
    document.querySelectorAll('.tp-enhance-btn').forEach(btn => {
      // Check if button is attached to a tiny input
      const wrapper = btn.closest('.tp-input-wrapper');
      if (wrapper) {
        const input = wrapper.querySelector('textarea, input, [contenteditable]');
        if (input) {
          const rect = input.getBoundingClientRect();
          
          // Remove if input is too small
          if (rect.height < 40 || rect.width < 200) {
            Logger.info('Cleaning up button from small input');
            btn.remove();
            if (wrapper.parentElement) {
              const parent = wrapper.parentElement;
              parent.insertBefore(input, wrapper);
              wrapper.remove();
            }
            wrappedInputs.delete(input);
          }
        }
      }
    });
  }
  
  // Run cleanup every 10 seconds
  Resources.addInterval(setInterval(cleanupIncorrectButtons, CONFIG.CLEANUP_INTERVAL));
  
  // Observe DOM changes (but debounce to avoid spam)
  let domMutationTimeout = null;
  const observer = new MutationObserver(() => {
    if (domMutationTimeout) clearTimeout(domMutationTimeout);
    domMutationTimeout = setTimeout(scanAndWrapInputs, CONFIG.MUTATION_DEBOUNCE);
  });
  
  Resources.addObserver(observer);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // ========== NUCLEAR OPTION: VISIBILITY PROTECTION ==========
  
  // Force sidebar visible on any attempt to hide
  // ========== SMART SIDEBAR VISIBILITY ENFORCEMENT ==========
  
  let isUserCollapsed = false;
  let lastEnforcementTime = 0;
  const ENFORCEMENT_COOLDOWN = 2000; // 2 seconds between enforcements
  
  function getScreenWidth() {
    return window.innerWidth || document.documentElement.clientWidth;
  }
  
  function shouldSidebarBeVisible() {
    // Respect mobile breakpoint - don't fight CSS media queries
    if (getScreenWidth() < 1100) {
      return false;
    }
    return true;
  }
  
  function enforceSidebarVisibility() {
    if (!dock) return;
    
    // Don't enforce on mobile screens
    if (!shouldSidebarBeVisible()) {
      Logger.info('Screen < 1100px - sidebar hidden by design');
      return;
    }
    
    // Cooldown to prevent infinite loops
    const now = Date.now();
    if (now - lastEnforcementTime < ENFORCEMENT_COOLDOWN) {
      return;
    }
    
    const currentDisplay = window.getComputedStyle(dock).display;
    const currentVisibility = window.getComputedStyle(dock).visibility;
    const currentOpacity = window.getComputedStyle(dock).opacity;
    
    // Only enforce if sidebar is being hidden externally (not by user collapse)
    if (currentDisplay === 'none' || currentVisibility === 'hidden' || parseFloat(currentOpacity) === 0) {
      console.warn('[Tiger Prompts] Sidebar hidden by external force - restoring');
      
      const width = isUserCollapsed ? '40px' : '285px';
      dock.style.cssText = `display:block!important;position:fixed!important;top:0!important;right:0!important;bottom:0!important;height:100vh!important;width:${width}!important;z-index:2147483647!important;pointer-events:auto!important;visibility:visible!important;opacity:1!important;transform:none!important;transition:width 0.3s ease!important;`;
      
      lastEnforcementTime = now;
    }
  }
  
  // Check less aggressively - every 2 seconds instead of 500ms
  Resources.addInterval(setInterval(enforceSidebarVisibility, CONFIG.SIDEBAR_CHECK_INTERVAL));
  
  // Debounced mutation observer - prevents infinite loops
  let mutationTimeout = null;
  const visibilityObserver = new MutationObserver((mutations) => {
    // Debounce to prevent feedback loops
    if (mutationTimeout) clearTimeout(mutationTimeout);
    
    mutationTimeout = setTimeout(() => {
      const hasStyleChange = mutations.some(m => 
        m.target === dock && 
        m.type === 'attributes' && 
        m.attributeName === 'style'
      );
      
      if (hasStyleChange) {
        enforceSidebarVisibility();
      }
    }, 300); // 300ms debounce
  });
  
  Resources.addObserver(visibilityObserver);
  visibilityObserver.observe(dock, {
    attributes: true,
    attributeFilter: ['style', 'class']
  });
  
  // Handle window resize - re-evaluate visibility
  window.addEventListener('resize', () => {
    if (shouldSidebarBeVisible()) {
      enforceSidebarVisibility();
    }
  });
  
  // Initial visibility check after page loads
  setTimeout(() => {
    Logger.info('Running initial visibility check');
    if (shouldSidebarBeVisible()) {
      Logger.info('Screen size OK - enforcing visibility');
      enforceSidebarVisibility();
    } else {
      Logger.info('Screen too small - sidebar will remain hidden per CSS media query');
    }
  }, 1000);
  
  // Logo click handler for manual toggle
  const logoElement = shadow.querySelector('.logo');
  if (logoElement) {
    logoElement.style.cursor = 'pointer';
    logoElement.addEventListener('click', () => {
      isCollapsed = !isCollapsed;
      isUserCollapsed = isCollapsed; // Track user-initiated collapse
      dock.style.width = isCollapsed ? '40px' : '285px';
      document.documentElement.classList.toggle('tp-collapsed', isCollapsed);
      $('.dock').classList.toggle('collapsed', isCollapsed);
      Logger.info('Sidebar manually', isCollapsed ? 'collapsed' : 'expanded');
    });
  }
  
  Logger.info('Loaded');
  
  // Announce initial state
  setTimeout(() => {
    const screenWidth = window.innerWidth;
    const isVisible = screenWidth >= 1100;
    console.log('[Tiger Prompts] Initial State:', {
      version: CONFIG.VERSION,
      screenWidth: screenWidth + 'px',
      sidebarVisible: isVisible,
      reason: isVisible ? 'Screen size OK' : 'Screen too small (< 1100px)'
    });
    
    // If hidden by screen size, show a one-time notification
    if (!isVisible) {
      console.warn('[Tiger Prompts] Sidebar hidden: Screen width ' + screenWidth + 'px is below 1100px threshold');
    }
  }, 2000);
})();

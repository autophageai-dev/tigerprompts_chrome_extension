// Tiger Prompts Extension - Background Service Worker v2.0.0
// Handles API communication and enhancement logic

console.log('[Tiger Prompts BG] 🚀 Service worker initializing...');

// ========== FIREBASE AUTH CONFIGURATION ==========

const FIREBASE_CONFIG = {
  apiKey: '', // Replace with your actual Firebase API key
  projectId: 'tiger-prompts',
  functionsUrl: 'https://us-central1-tiger-prompts.cloudfunctions.net'
};

// Validate API key on startup
if (FIREBASE_CONFIG.apiKey === '') {
  console.error('❌ [Tiger Prompts] FIREBASE API KEY NOT SET! Replace placeholder in background.js line 10');
  console.error('❌ [Tiger Prompts] Get your key from: Firebase Console > Project Settings > Web API Key');
}

const AUTH_ENDPOINTS = {
  signUp: `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`,
  signIn: `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`,
  verify: `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_CONFIG.apiKey}`,
  refresh: `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
  resetPassword: `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${FIREBASE_CONFIG.apiKey}`
};

// Auth state
let currentUser = null;
let authToken = null;
let refreshToken = null;
let isPro = false;

// Initialize Firebase Auth on startup
initializeFirebaseAuth();

// ========== CONFIGURATION ==========

const WORKER_CONFIG = {
  endpoint: 'https://tigerprompts-proxy.autophageai.workers.dev',
  defaultModel: 'gpt-3.5-turbo',  // Faster than gpt-4o-mini, same quality
  maxTokens: 800,
  maxSnapshots: 50,
  enhancementTimeout: 10000
};

const LLM_PROMPTS = {
  light: `You are an expert prompt engineer specializing in gentle refinement.

Your task: Take the user's prompt and polish it with MINIMAL changes. Keep their voice and intent completely intact.

CRITICAL - Respect the input:
⚠️ If the message is very short (1-10 words) like "yes", "thanks", "got it", or a simple question, DO NOT MODIFY IT AT ALL
⚠️ If the message contains URLs or links, DO NOT alter them in any way
⚠️ Preserve all pronouns (I, you, we, they, etc.) exactly as written
⚠️ Don't elaborate on brief responses or turn statements into questions

What to do ONLY when needed:
✅ Fix obvious grammar errors
✅ Clarify genuinely unclear phrases (only if ambiguous)
✅ Make vague terms more specific IF it doesn't change the meaning

What NEVER to do:
❌ Don't expand short responses into long paragraphs
❌ Don't ask questions on the user's behalf
❌ Don't restructure or reformat the prompt
❌ Don't add headers, sections, or bullet points
❌ Don't change the user's tone or style
❌ Don't autocorrect URLs or technical terms
❌ Don't add extra context to brief messages

Output: Return the prompt with minimal or NO changes. When in doubt, leave it alone.`,
  
  heavy: `You are a prompt architect specializing in clear, structured directives.

Your task: Transform the user's prompt into a well-organized request that gets better results.

Use this simple structure:

## What You Need
[Restate the goal clearly and define the expert role needed]

## Key Requirements
- [3-5 bullet points max of critical must-haves]
- [Be specific and actionable]

## Desired Output
[Describe what the final deliverable should look like]

Keep it tight and focused. Don't over-explain. Preserve the user's intent while adding clarity and structure. Aim for 200-400 words total.`,
  
  // ========== PRESET TEMPLATES ==========
  // Presets only apply in HEAVY mode. Light mode always uses basic polish for speed.
  presets: {
    coding: {
      id: 'coding',
      name: 'Coding',
      icon: '💻',
      systemPrompt: `You are a senior software engineer. Transform the user's coding request into a clear technical directive.

## What You Need
[Restate the coding goal and define what kind of code/solution is needed]

## Technical Requirements
- Write production-ready, well-documented code
- Include error handling and follow best practices
- Use clear variable/function names
- [Add 2-3 specific requirements based on the request]

## Desired Output
[Describe the deliverable: complete code, explanation, architecture, etc.]

Keep it focused. Aim for 150-300 words. Be specific about languages/frameworks if relevant.`,
      postContext: ``
    },
    
    legal: {
      id: 'legal',
      name: 'Legal Documents',
      icon: '⚖️',
      systemPrompt: `You are an expert legal document specialist. Transform the user's request into a clear legal directive.

## What You Need
[Restate the legal document goal and type needed]

## Key Requirements
- Use precise, unambiguous legal language
- Include necessary standard clauses
- Specify jurisdiction and compliance needs
- [Add 2-3 specific requirements for this document]

## Desired Output
[Describe the document structure and what it should contain]

Keep it focused. Aim for 150-300 words. Include placeholder text for party names/dates.`,
      postContext: ``
    },
    
    marketing: {
      id: 'marketing',
      name: 'Marketing Copy',
      icon: '🎯',
      systemPrompt: `You are a senior copywriter. Transform the user's marketing request into a clear creative brief.

## What You Need
[Restate the marketing goal and content type needed]

## Key Requirements
- Focus on benefits and target audience pain points
- Include compelling call-to-action
- Match the brand voice/tone
- [Add 2-3 specific requirements for this content]

## Desired Output
[Describe the deliverable: ad copy, landing page, email, etc.]

Keep it focused. Aim for 150-300 words. Specify channel and format.`,
      postContext: ``
    },
    
    creative: {
      id: 'creative',
      name: 'Creative Writing',
      icon: '✍️',
      systemPrompt: `You are an accomplished creative writer. Transform the user's request into a clear creative brief.

## What You Need
[Restate the creative writing goal and format needed]

## Key Requirements
- Define setting, characters, and conflict
- Establish tone and narrative voice
- Use vivid, sensory descriptions
- [Add 2-3 specific creative requirements]

## Desired Output
[Describe the deliverable: story, scene, dialogue, poem, etc.]

Keep it focused. Aim for 150-300 words. Specify genre if applicable.`,
      postContext: ``
    },
    
    business: {
      id: 'business',
      name: 'Business Documents',
      icon: '📊',
      systemPrompt: `You are a senior business professional. Transform the user's request into a clear business document brief.

## What You Need
[Restate the business document goal and type needed]

## Key Requirements
- Use professional, action-oriented language
- Include data/metrics to support points
- Make recommendations clear and actionable
- [Add 2-3 specific business requirements]

## Desired Output
[Describe the deliverable: proposal, report, memo, plan, etc.]

Keep it focused. Aim for 150-300 words. Specify audience and document type.`,
      postContext: ``
    }
  }
};

// ========== LOGGING UTILITY ==========

const Logger = {
  info: (msg, data) => console.log(`[Tiger Prompts] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[Tiger Prompts] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[Tiger Prompts] ${msg}`, data || '')
};

// ========== MESSAGE ROUTER ==========

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    'enhancePrompt': handleEnhancementLegacy,
    'TP_ENHANCE': handleEnhancement,
    'SAVE_SNAPSHOT': handleSaveSnapshot,
    'TP_SAVE_SNAPSHOT': handleSaveSnapshot,
    'DELETE_SNAPSHOT': handleDeleteSnapshot,
    'GET_SNAPSHOTS': handleGetSnapshots,
    'GET_SETTINGS': handleGetSettings,
    'SAVE_SETTINGS': handleSaveSettings,
    'popup-switch': handlePopupSwitch,
    'openSettings': handleOpenSettings,
    'testConnection': handleTestConnection,
    // Firebase Auth handlers
    'AUTH_SIGNIN': handleAuthSignIn,
    'AUTH_SIGNUP': handleAuthSignUp,
    'AUTH_SIGNOUT': handleAuthSignOut,
    'AUTH_GET_USER': handleAuthGetUser,
    'AUTH_RESET_PASSWORD': handleAuthResetPassword,
    'AUTH_CREATE_CHECKOUT': handleAuthCreateCheckout,
    'AUTH_CREATE_PORTAL': handleAuthCreatePortal,
    'OPEN_AUTH_PAGE': handleOpenAuthPage
  };
  
  const action = msg?.action || msg?.type;
  const handler = handlers[action];
  
  if (handler) {
    // Handle async functions properly
    const result = handler(msg, sender, sendResponse);
    
    // If handler returns a promise (async function), keep channel open
    if (result instanceof Promise) {
      result.catch(error => {
        Logger.error('Async handler error:', { action, error: error.message });
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep message channel open for async
    }
    
    // Synchronous handler
    return true;
  }
  
  return false;
});

// ========== HANDLER FUNCTIONS ==========

async function handleEnhancementLegacy(msg, sender, sendResponse) {
  const { prompt, mode, model } = msg;
  
  try {
    const settings = await chrome.storage.sync.get(['selectedModel', 'apiKey']);
    const selectedModel = model || settings.selectedModel || WORKER_CONFIG.defaultModel;
    
    Logger.info('Enhancing prompt (legacy):', {
      mode,
      model: selectedModel,
      promptLength: prompt.length
    });
    
    const systemPrompt = mode === 'light' ? LLM_PROMPTS.light : LLM_PROMPTS.heavy;
    const enhanced = await callOpenAI(systemPrompt, prompt, selectedModel);
    
    const pqsBefore = calculatePQS(prompt);
    const pqsAfter = calculatePQS(enhanced);
    const explanation = generateExplanation(prompt, enhanced, mode, pqsBefore, pqsAfter);
    
    sendResponse({
      success: true,
      enhanced: enhanced,
      pqsBefore: pqsBefore.toFixed(2),
      pqsAfter: pqsAfter.toFixed(2),
      delta: (pqsAfter - pqsBefore).toFixed(2),
      explanation: explanation,
      mode: mode,
      model: selectedModel
    });
    
    trackUsage(mode, selectedModel);
    
  } catch (error) {
    Logger.error('Enhancement error (legacy):', error);
    sendResponse({
      success: false,
      error: error.message || 'Enhancement failed'
    });
  }
}

async function handleEnhancement(msg, sender, sendResponse) {
  try {
    Logger.info('Enhancement requested:', { mode: msg.mode, textLength: msg.text?.length });
    
    // Get user settings including preset selection
    const settings = await chrome.storage.sync.get(['selectedModel', 'selectedPreset']);
    
    const model = msg.model || settings.selectedModel || WORKER_CONFIG.defaultModel;
    let selectedPreset = msg.preset || settings.selectedPreset || 'none';
    
    // Determine system prompt based on mode and preset
    let systemPrompt;
    let postContext = '';
    let presetName = null;
    
    // LIGHT MODE: Always use basic light polish, ignore presets for speed
    if (msg.mode === 'light') {
      systemPrompt = LLM_PROMPTS.light;
      Logger.info('Using LIGHT mode - presets disabled for speed');
    }
    // HEAVY MODE: Use presets if available
    else if (msg.mode === 'heavy' && selectedPreset && selectedPreset !== 'none' && LLM_PROMPTS.presets[selectedPreset]) {
      const preset = LLM_PROMPTS.presets[selectedPreset];
      presetName = preset.name;
      systemPrompt = preset.systemPrompt;
      postContext = preset.postContext || '';
      Logger.info('Using HEAVY mode with preset:', presetName);
    }
    // HEAVY MODE: No preset
    else {
      systemPrompt = LLM_PROMPTS.heavy;
      Logger.info('Using HEAVY mode - no preset');
    }
    
    // PRE-ENHANCEMENT: Call OpenAI to rewrite/enhance the prompt
    let enhanced = await callOpenAI(systemPrompt, msg.text || '', model);
    
    // POST-ENHANCEMENT: Add context if available (only in heavy mode with preset)
    if (postContext) {
      enhanced += postContext;
      Logger.info('Applied post-context');
    }
    
    // Calculate PQS scores
    const pqsBefore = calculatePQS(msg.text);
    const pqsAfter = calculatePQS(enhanced);
    const explanation = generateExplanation(msg.text, enhanced, msg.mode, pqsBefore, pqsAfter, presetName);
    
    Logger.info('Enhancement complete:', {
      pqsBefore: pqsBefore.toFixed(2),
      pqsAfter: pqsAfter.toFixed(2),
      delta: (pqsAfter - pqsBefore).toFixed(2),
      model: model,
      preset: presetName || 'none'
    });
    
    sendResponse({
      success: true,
      output: enhanced,
      pqsBefore: pqsBefore.toFixed(2),
      pqsAfter: pqsAfter.toFixed(2),
      delta: (pqsAfter - pqsBefore).toFixed(2),
      explanation: explanation,
      mode: msg.mode,
      model: model,
      preset: presetName
    });
    
    trackUsage(msg.mode, model, selectedPreset);
    
  } catch (error) {
    Logger.error('Enhancement error:', error);
    sendResponse({ success: false, error: error.message || 'Enhancement failed' });
  }
  
  return true; // Keep message channel open for async response
}

function handleSaveSnapshot(msg, sender, sendResponse) {
  chrome.storage.local.get({ tp_snaps: [] }, st => {
    const list = st.tp_snaps || [];
    
    const snapshot = msg.snapshot || {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      site: msg.site || 'unknown',
      preview: msg.preview || msg.snippet || 'Chat context',
      messages: msg.messages || [],
      tokenCount: msg.tokenCount || 0,
      messageCount: msg.messages?.length || 0
    };
    
    list.unshift(snapshot);
    
    if (list.length > WORKER_CONFIG.maxSnapshots) {
      list.length = WORKER_CONFIG.maxSnapshots;
    }
    
    chrome.storage.local.set({ tp_snaps: list }, () => {
      Logger.info('Snapshot saved:', snapshot.id);
      sendResponse({ success: true, snapshot });
    });
  });
}

function handleDeleteSnapshot(msg, sender, sendResponse) {
  chrome.storage.local.get({ tp_snaps: [] }, st => {
    const list = st.tp_snaps || [];
    const filtered = list.filter(snap => snap.id !== msg.id);
    
    chrome.storage.local.set({ tp_snaps: filtered }, () => {
      Logger.info('Snapshot deleted:', msg.id);
      sendResponse({ success: true });
    });
  });
}

function handleGetSnapshots(msg, sender, sendResponse) {
  chrome.storage.local.get({ tp_snaps: [] }, st => {
    sendResponse({ success: true, snapshots: st.tp_snaps || [] });
  });
}

function handleGetSettings(msg, sender, sendResponse) {
  chrome.storage.sync.get(['enhanceMode', 'autoEnhance'], settings => {
    // Default to light mode and auto-enhance enabled if not set
    const defaultSettings = {
      enhanceMode: settings.enhanceMode || 'light',
      autoEnhance: settings.autoEnhance !== undefined ? settings.autoEnhance : true
    };
    sendResponse({ success: true, settings: defaultSettings });
  });
}

function handleSaveSettings(msg, sender, sendResponse) {
  chrome.storage.sync.set(msg.settings || {}, () => {
    Logger.info('Settings saved');
    sendResponse({ success: true });
  });
}

function handlePopupSwitch(msg, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab) return;
    
    if (msg.tab === 'optimizer') {
      chrome.tabs.sendMessage(tab.id, { action: 'open-token-optimizer' });
    } else if (msg.tab === 'snapshots') {
      chrome.tabs.sendMessage(tab.id, { action: 'snapshot-chat', openManager: true });
    } else if (msg.tab === 'enhance') {
      chrome.tabs.sendMessage(tab.id, { action: 'show-enhance-hint' });
    }
  });
}

function handleOpenSettings(msg, sender, sendResponse) {
  chrome.runtime.openOptionsPage();
  sendResponse({ success: true });
}

async function handleTestConnection(msg, sender, sendResponse) {
  try {
    const testPrompt = 'Say "connection successful" in a friendly way.';
    const result = await callOpenAI('You are a helpful assistant.', testPrompt, 'gpt-4o-mini');
    
    sendResponse({
      success: true,
      message: 'API connection successful!',
      response: result
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// ========== API FUNCTIONS ==========

async function callOpenAI(systemPrompt, userPrompt, model = 'gpt-4o-mini') {
  try {
    const response = await fetch(WORKER_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
        model: model,
        maxTokens: WORKER_CONFIG.maxTokens
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid API response format');
    }
    
    return data.choices[0].message.content.trim();
    
  } catch (error) {
    Logger.error('API call failed:', error);
    throw new Error(`OpenAI API Error: ${error.message}`);
  }
}

// ========== STREAMING API ==========

async function callOpenAIStreamed(systemPrompt, userPrompt, model, port) {
  try {
    const response = await fetch(WORKER_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemPrompt: systemPrompt,
        userPrompt: userPrompt,
        model: model,
        maxTokens: WORKER_CONFIG.maxTokens,
        stream: true  // Enable streaming
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API request failed: ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          
          if (data === '[DONE]') {
            continue;
          }
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            
            if (content) {
              fullText += content;
              // Send chunk to content script via port
              port.postMessage({
                type: 'STREAM_CHUNK',
                chunk: content,
                fullText: fullText
              });
            }
          } catch (e) {
            // Skip invalid JSON
            console.warn('Failed to parse chunk:', e);
          }
        }
      }
    }
    
    // Send completion signal
    port.postMessage({
      type: 'STREAM_COMPLETE',
      fullText: fullText
    });
    
    return fullText;
    
  } catch (error) {
    Logger.error('Streaming API call failed:', error);
    port.postMessage({
      type: 'STREAM_ERROR',
      error: error.message
    });
    throw error;
  }
}

// ========== PQS CALCULATION ==========

function calculatePQS(text) {
  if (!text || text.trim().length === 0) return 0;
  
  let score = 50;
  
  // Length scoring
  const length = text.trim().length;
  if (length > 500) score += 15;
  else if (length > 200) score += 10;
  else if (length > 100) score += 5;
  else if (length < 30) score -= 15;
  
  // Structure scoring
  if (/^#+\s/m.test(text)) score += 8;
  if (/^[-*]\s/m.test(text)) score += 5;
  if (/^\d+\.\s/m.test(text)) score += 5;
  
  // Clarity indicators
  if (text.includes('specifically') || text.includes('exactly') || text.includes('must')) score += 5;
  if (text.includes('?') && text.split('?').length > 2) score += 3;
  
  // Vagueness penalties
  if (/\b(something|anything|somehow|maybe|kinda|sorta)\b/gi.test(text)) score -= 8;
  if (text.split(' ').length < 5) score -= 10;
  
  // Context indicators
  if (/\b(context|background|goal|purpose|objective|requirement)\b/i.test(text)) score += 7;
  
  // Example indicators
  if (/\b(example|for instance|such as|like)\b/i.test(text)) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

// ========== EXPLANATION GENERATOR ==========

function generateExplanation(original, enhanced, mode, pqsBefore, pqsAfter, preset) {
  const delta = pqsAfter - pqsBefore;
  
  let explanation = '';
  
  if (mode === 'light') {
    explanation = 'Applied light polish: improved clarity and grammar while maintaining your original voice and intent.';
  } else {
    explanation = preset 
      ? `Applied ${preset} preset with comprehensive heavy structuring: added detailed sections, technical requirements, and clear formatting.`
      : 'Applied heavy structuring: reorganized into clear sections with detailed requirements and quality criteria.';
  }
  
  if (delta > 20) {
    explanation += ' Significantly improved prompt structure and specificity.';
  } else if (delta > 10) {
    explanation += ' Notable improvements to clarity and detail.';
  } else if (delta > 0) {
    explanation += ' Refined for better results.';
  }
  
  return explanation;
}

// ========== USAGE TRACKING ==========

function trackUsage(mode, model, preset) {
  chrome.storage.local.get({ tp_stats: {} }, data => {
    const stats = data.tp_stats || {};
    
    if (!stats[mode]) stats[mode] = 0;
    stats[mode]++;
    
    if (preset && preset !== 'none') {
      if (!stats.presets) stats.presets = {};
      if (!stats.presets[preset]) stats.presets[preset] = 0;
      stats.presets[preset]++;
    }
    
    chrome.storage.local.set({ tp_stats: stats });
  });
}

// ========== INSTALLATION HANDLER ==========

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set explicit defaults on first install
    chrome.storage.sync.set({
      enhanceMode: 'light',
      autoEnhance: true
    }, () => {
      Logger.info('✅ Default settings initialized: light mode + auto-enhance ON');
      
      // Open welcome page after a slight delay to ensure extension is ready
      setTimeout(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
        Logger.info('🎉 Welcome page opened');
      }, 500);
    });
  }
});

// ========== PORT CONNECTION HANDLER (STREAMING) ==========

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'enhance-stream') {
    Logger.info('Stream port connected');
    
    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'ENHANCE_PROMPT_STREAMED') {
        const { prompt, mode, model, preset } = msg;
        
        try {
          Logger.info('Starting streamed enhancement:', {
            mode,
            model,
            preset,
            promptLength: prompt.length
          });
          
          // Get selected preset if in heavy mode
          let selectedPreset = 'none';
          if (mode === 'heavy' && preset && preset !== 'none') {
            selectedPreset = preset;
          }
          
          // Build system prompt
          let systemPrompt = mode === 'light' ? LLM_PROMPTS.light : LLM_PROMPTS.heavy;
          
          // Apply preset if selected
          if (mode === 'heavy' && selectedPreset !== 'none' && LLM_PROMPTS.presets[selectedPreset]) {
            systemPrompt = LLM_PROMPTS.presets[selectedPreset].systemPrompt;
          }
          
          // Calculate PQS before
          const pqsBefore = calculatePQS(prompt);
          
          port.postMessage({
            type: 'STREAM_START',
            pqsBefore: pqsBefore
          });
          
          // Call streaming API
          const enhanced = await callOpenAIStreamed(systemPrompt, prompt, model, port);
          
          // Calculate PQS after
          const pqsAfter = calculatePQS(enhanced);
          
          // Generate explanation
          const explanation = generateExplanation(
            prompt,
            enhanced,
            mode,
            pqsBefore,
            pqsAfter,
            selectedPreset !== 'none' ? selectedPreset : null
          );
          
          // Track usage
          trackUsage(mode, model, selectedPreset);
          
          // Send final result with metadata
          port.postMessage({
            type: 'STREAM_COMPLETE',
            fullText: enhanced,
            pqsBefore: pqsBefore,
            pqsAfter: pqsAfter,
            explanation: explanation
          });
          
        } catch (error) {
          Logger.error('Streamed enhancement error:', error);
          port.postMessage({
            type: 'STREAM_ERROR',
            error: error.message || 'Enhancement failed'
          });
        }
      }
    });
    
    port.onDisconnect.addListener(() => {
      Logger.info('Stream port disconnected');
    });
  }
});

// ========== FIREBASE AUTH FUNCTIONS ==========

async function initializeFirebaseAuth() {
  try {
    const stored = await chrome.storage.local.get([
      'authToken',
      'refreshToken',
      'userEmail',
      'userId',
      'isPro',
      'tokenExpiry'
    ]);

    if (stored.authToken && stored.refreshToken) {
      authToken = stored.authToken;
      refreshToken = stored.refreshToken;
      currentUser = {
        email: stored.userEmail,
        uid: stored.userId
      };
      isPro = stored.isPro || false;

      // Check if token needs refresh
      const now = Date.now();
      const expiry = stored.tokenExpiry || 0;

      if (now >= expiry - 300000) { // Refresh if < 5 min left
        Logger.info('Token expiring soon, refreshing...');
        await refreshIdToken();
      } else {
        // Verify token is still valid
        const valid = await verifyAuthToken();
        if (!valid) {
          await handleAuthSignOut();
          return;
        }
      }

      // CRITICAL FIX: Check subscription status from Firebase
      Logger.info('Checking Pro status from Firebase...');
      await checkSubscriptionStatus();

      Logger.info('Firebase Auth initialized from storage:', stored.userEmail, 'isPro:', isPro);
      
      // CRITICAL FIX: Notify content scripts of auth state
      notifyAuthStateChanged();
    }
  } catch (error) {
    Logger.error('Firebase Auth initialization error:', error);
  }
}

// CRITICAL FIX: Periodic Pro status check (every 5 minutes)
setInterval(async () => {
  if (authToken) {
    Logger.info('Periodic Pro status check...');
    await checkSubscriptionStatus();
  }
}, 5 * 60 * 1000); // 5 minutes

async function handleAuthSignIn(msg, sender, sendResponse) {
  try {
    const { email, password } = msg;
    
    console.log('[Firebase Auth] Attempting sign in for:', email);
    console.log('[Firebase Auth] Using endpoint:', AUTH_ENDPOINTS.signIn);

    const response = await fetch(AUTH_ENDPOINTS.signIn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    });

    const data = await response.json();
    
    console.log('[Firebase Auth] Response status:', response.status);
    console.log('[Firebase Auth] Response data:', data);

    if (!response.ok) {
      const errorMsg = formatFirebaseError(data.error?.message || 'Sign in failed');
      console.error('[Firebase Auth] Sign in failed:', errorMsg, data);
      sendResponse({ success: false, error: errorMsg });
      return;
    }

    // Store auth data
    await storeAuthData(data);

    // Check subscription status
    await checkSubscriptionStatus();

    Logger.info('User signed in:', email);

    sendResponse({ success: true, user: currentUser, isPro: isPro });
  } catch (error) {
    console.error('[Firebase Auth] Sign in exception:', error);
    Logger.error('Sign in error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleAuthSignUp(msg, sender, sendResponse) {
  try {
    const { email, password } = msg;

    const response = await fetch(AUTH_ENDPOINTS.signUp, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = formatFirebaseError(data.error?.message || 'Sign up failed');
      sendResponse({ success: false, error: errorMsg });
      return;
    }

    // Store auth data
    await storeAuthData(data);

    Logger.info('User signed up:', email);

    sendResponse({ success: true, user: currentUser, isPro: false });
  } catch (error) {
    Logger.error('Sign up error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleAuthSignOut(msg, sender, sendResponse) {
  authToken = null;
  refreshToken = null;
  currentUser = null;
  isPro = false;

  await chrome.storage.local.remove([
    'authToken',
    'refreshToken',
    'userEmail',
    'userId',
    'isPro',
    'tokenExpiry',
    'lastProCheck'
  ]);

  Logger.info('User signed out');

  // Notify all tabs
  notifyAuthStateChanged();

  if (sendResponse) {
    sendResponse({ success: true });
  }
}

async function handleAuthGetUser(msg, sender, sendResponse) {
  sendResponse({
    user: currentUser,
    isPro: isPro,
    isAuthenticated: authToken !== null
  });
}

async function handleAuthResetPassword(msg, sender, sendResponse) {
  try {
    const { email } = msg;

    const response = await fetch(AUTH_ENDPOINTS.resetPassword, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email: email
      })
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = formatFirebaseError(data.error?.message || 'Failed to send reset email');
      sendResponse({ success: false, error: errorMsg });
      return;
    }

    sendResponse({ success: true });
  } catch (error) {
    Logger.error('Password reset error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleAuthCreateCheckout(msg, sender, sendResponse) {
  if (!authToken) {
    sendResponse({ success: false, error: 'Must be signed in to upgrade' });
    return true;
  }

  try {
    // Cloud Run endpoint
    const response = await fetch('https://createcheckoutsession-bv7k3ekjqa-uc.a.run.app', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        successUrl: chrome.runtime.getURL('welcome.html?checkout=success'),
        cancelUrl: chrome.runtime.getURL('welcome.html?checkout=cancel')
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.message || 'Failed to create checkout session');
    }

    // Cloud Run returns direct response
    sendResponse({ success: true, url: result.url || result.sessionUrl });
  } catch (error) {
    Logger.error('Checkout session error:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // Keep channel open for async response
}

async function handleAuthCreatePortal(msg, sender, sendResponse) {
  if (!authToken) {
    sendResponse({ success: false, error: 'Must be signed in' });
    return;
  }

  try {
    // Cloud Run endpoint
    const response = await fetch('https://createportalsession-bv7k3ekjqa-uc.a.run.app', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        returnUrl: chrome.runtime.getURL('welcome.html?portal=return')
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.message || 'Failed to create portal session');
    }

    // Cloud Run returns direct response
    sendResponse({ success: true, url: result.url || result.portalUrl });
  } catch (error) {
    Logger.error('Portal session error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

function handleOpenAuthPage(msg, sender, sendResponse) {
  chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') }, (tab) => {
    if (tab) {
      Logger.info('Auth page opened in tab:', tab.id);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Failed to open auth page' });
    }
  });
  return true; // Keep channel open for async response
}

async function storeAuthData(data) {
  authToken = data.idToken;
  refreshToken = data.refreshToken;
  currentUser = {
    email: data.email,
    uid: data.localId
  };

  // Calculate token expiry (tokens typically last 1 hour)
  const expiresIn = parseInt(data.expiresIn || '3600') * 1000;
  const tokenExpiry = Date.now() + expiresIn;

  await chrome.storage.local.set({
    authToken: authToken,
    refreshToken: refreshToken,
    userEmail: currentUser.email,
    userId: currentUser.uid,
    tokenExpiry: tokenExpiry,
    isPro: isPro
  });

  // Notify all tabs
  notifyAuthStateChanged();
}

async function refreshIdToken() {
  if (!refreshToken) {
    Logger.warn('No refresh token available');
    return false;
  }

  try {
    const response = await fetch(AUTH_ENDPOINTS.refresh, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.description || 'Token refresh failed');
    }

    // Update stored token
    authToken = data.id_token;
    refreshToken = data.refresh_token;

    const expiresIn = parseInt(data.expires_in || '3600') * 1000;
    const tokenExpiry = Date.now() + expiresIn;

    await chrome.storage.local.set({
      authToken: authToken,
      refreshToken: refreshToken,
      tokenExpiry: tokenExpiry
    });

    Logger.info('Token refreshed successfully');
    return true;
  } catch (error) {
    Logger.error('Token refresh error:', error);
    await handleAuthSignOut();
    return false;
  }
}

async function verifyAuthToken() {
  if (!authToken) return false;

  try {
    const response = await fetch(AUTH_ENDPOINTS.verify, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken: authToken
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.users && data.users[0];
    }

    return false;
  } catch (error) {
    Logger.error('Token verification error:', error);
    return false;
  }
}

async function checkSubscriptionStatus() {
  if (!authToken) {
    isPro = false;
    return false;
  }

  try {
    const response = await fetch('https://getsubscriptionstatus-bv7k3ekjqa-uc.a.run.app', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      isPro = data.isPro === true || data.status === 'active';

      await chrome.storage.local.set({
        isPro: isPro,
        lastProCheck: Date.now()
      });

      Logger.info('Subscription status:', isPro ? 'PRO' : 'FREE');
      
      // Notify all tabs
      notifyAuthStateChanged();
      
      return isPro;
    } else {
      Logger.warn('Failed to check subscription status');
      return false;
    }
  } catch (error) {
    Logger.error('Subscription check error:', error);
    return false;
  }
}

function notifyAuthStateChanged() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'AUTH_STATE_CHANGED',
        user: currentUser,
        isPro: isPro,
        isAuthenticated: authToken !== null
      }).catch(() => {}); // Ignore errors from inactive tabs
    });
  });
}

function formatFirebaseError(error) {
  const errorMap = {
    'EMAIL_EXISTS': 'This email is already registered',
    'EMAIL_NOT_FOUND': 'Email not found',
    'INVALID_PASSWORD': 'Invalid password',
    'INVALID_EMAIL': 'Invalid email address',
    'WEAK_PASSWORD': 'Password should be at least 6 characters',
    'USER_DISABLED': 'This account has been disabled',
    'TOO_MANY_ATTEMPTS_TRY_LATER': 'Too many attempts. Please try again later',
    'OPERATION_NOT_ALLOWED': 'Operation not allowed',
    'INVALID_LOGIN_CREDENTIALS': 'Invalid email or password'
  };

  for (const [key, message] of Object.entries(errorMap)) {
    if (error.includes(key)) {
      return message;
    }
  }

  return error || 'An error occurred';
}

// ========== SERVICE WORKER READY ==========
console.log("[Tiger Prompts BG] ✅ Service worker fully loaded and ready");


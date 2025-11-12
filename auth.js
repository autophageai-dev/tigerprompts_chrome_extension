// Tiger Prompts - Auth Page Script

console.log('[Auth Page] Script loading...');

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Auth Page] DOM loaded, initializing...');
  
  // DOM elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const signinSection = document.getElementById('signinSection');
  const signupSection = document.getElementById('signupSection');
  const signinForm = document.getElementById('signinForm');
  const signupForm = document.getElementById('signupForm');
  const errorMessage = document.getElementById('errorMessage');
  const successMessage = document.getElementById('successMessage');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  const upgradeBtn = document.getElementById('upgradeBtn');

  console.log('[Auth Page] Elements found:', {
    tabButtons: tabButtons.length,
    signinSection: !!signinSection,
    signupSection: !!signupSection,
    signinForm: !!signinForm,
    signupForm: !!signupForm,
    errorMessage: !!errorMessage,
    successMessage: !!successMessage,
    forgotPasswordBtn: !!forgotPasswordBtn,
    upgradeBtn: !!upgradeBtn
  });

  if (!signinForm || !signupForm) {
    console.error('[Auth Page] ❌ Critical elements missing!');
    return;
  }

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      console.log('[Auth Page] Tab clicked:', btn.dataset.tab);
      const tab = btn.dataset.tab;
      
      // Update active tab
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Show correct section
      if (tab === 'signin') {
        signinSection.classList.add('active');
        signupSection.classList.remove('active');
      } else {
        signupSection.classList.add('active');
        signinSection.classList.remove('active');
      }
      
      // Clear messages
      hideMessages();
    });
  });

  // Sign In form
  signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();

    const email = document.getElementById('signinEmail').value.trim();
    const password = document.getElementById('signinPassword').value;

    console.log('[Auth Page] Sign in attempt for:', email);

    if (!email || !password) {
      showError('Please fill in all fields');
      return;
    }

    const signinBtn = document.getElementById('signinBtn');
    signinBtn.disabled = true;
    signinBtn.textContent = 'Signing In...';

    try {
      console.log('[Auth Page] Sending AUTH_SIGNIN message to background...');
      
      const response = await chrome.runtime.sendMessage({
        type: 'AUTH_SIGNIN',
        email,
        password
      });

      console.log('[Auth Page] Received response:', response);

      if (response && response.success) {
        showSuccess('✅ Sign in successful! Redirecting...');
        
        // Redirect after short delay
        setTimeout(() => {
          // Close this tab and open LLM selector
          chrome.tabs.getCurrent((tab) => {
            chrome.tabs.create({ url: chrome.runtime.getURL('llm-selector.html') });
            if (tab) {
              chrome.tabs.remove(tab.id);
            }
          });
        }, 1000);
      } else {
        console.error('[Auth Page] Sign in failed:', response);
        showError(response?.error || 'Sign in failed. Please try again.');
        signinBtn.disabled = false;
        signinBtn.textContent = 'Sign In';
      }
    } catch (error) {
      console.error('[Auth Page] Exception during sign in:', error);
      showError('An error occurred. Please try again.');
      signinBtn.disabled = false;
      signinBtn.textContent = 'Sign In';
    }
  });

  // Sign Up form
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();

    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;

    if (!email || !password || !passwordConfirm) {
      showError('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }

    if (password !== passwordConfirm) {
      showError('Passwords do not match');
      return;
    }

    const signupBtn = document.getElementById('signupBtn');
    signupBtn.disabled = true;
    signupBtn.textContent = 'Creating Account...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTH_SIGNUP',
        email,
        password
      });

      if (response && response.success) {
        showSuccess('✅ Account created! Redirecting...');
        
        // Redirect after short delay
        setTimeout(() => {
          // Close this tab and open LLM selector
          chrome.tabs.getCurrent((tab) => {
            chrome.tabs.create({ url: chrome.runtime.getURL('llm-selector.html') });
            if (tab) {
              chrome.tabs.remove(tab.id);
            }
          });
        }, 1000);
      } else {
        showError(response?.error || 'Sign up failed. Please try again.');
        signupBtn.disabled = false;
        signupBtn.textContent = 'Create Account';
      }
    } catch (error) {
      console.error('Sign up error:', error);
      showError('An error occurred. Please try again.');
      signupBtn.disabled = false;
      signupBtn.textContent = 'Create Account';
    }
  });

  // Forgot password
  forgotPasswordBtn.addEventListener('click', async () => {
    hideMessages();

    const email = document.getElementById('signinEmail').value.trim();

    if (!email) {
      showError('Please enter your email address first');
      return;
    }

    forgotPasswordBtn.disabled = true;
    const originalText = forgotPasswordBtn.textContent;
    forgotPasswordBtn.textContent = 'Sending...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTH_RESET_PASSWORD',
        email
      });

      if (response && response.success) {
        showSuccess('✅ Password reset email sent! Check your inbox.');
      } else {
        showError(response?.error || 'Failed to send reset email');
      }
    } catch (error) {
      console.error('Password reset error:', error);
      showError('An error occurred. Please try again.');
    } finally {
      forgotPasswordBtn.disabled = false;
      forgotPasswordBtn.textContent = originalText;
    }
  });

  // Upgrade to Pro
  upgradeBtn.addEventListener('click', async () => {
    upgradeBtn.disabled = true;
    upgradeBtn.textContent = 'Loading...';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTH_CREATE_CHECKOUT'
      });

      if (response && response.success && response.url) {
        // Open checkout in new tab
        chrome.tabs.create({ url: response.url });
        
        showSuccess('✅ Opening checkout...');
      } else {
        showError(response?.error || 'Please sign in first to upgrade to Pro');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      showError('An error occurred. Please try again.');
    } finally {
      upgradeBtn.disabled = false;
      upgradeBtn.textContent = 'Upgrade to Pro';
    }
  });

  // Helper functions
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    successMessage.classList.remove('show');
  }

  function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.classList.add('show');
    errorMessage.classList.remove('show');
  }

  function hideMessages() {
    errorMessage.classList.remove('show');
    successMessage.classList.remove('show');
  }

  // Check if user is already signed in
  chrome.storage.local.get(['authToken', 'userEmail'], (result) => {
    if (result.authToken && result.userEmail) {
      // Already signed in, redirect to LLM selector
      showSuccess('You are already signed in!');
      setTimeout(() => {
        chrome.tabs.getCurrent((tab) => {
          chrome.tabs.create({ url: chrome.runtime.getURL('llm-selector.html') });
          if (tab) {
            chrome.tabs.remove(tab.id);
          }
        });
      }, 1000);
    }
  });

  // Password visibility toggle
  document.querySelectorAll('.password-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-target');
      const input = document.getElementById(targetId);
      
      if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈'; // closed eye
      } else {
        input.type = 'password';
        button.textContent = '👁️'; // open eye
      }
    });
  });

  // OAuth Handlers
  document.getElementById('googleSignIn')?.addEventListener('click', async () => {
    hideMessages();
    const googleBtn = document.getElementById('googleSignIn');
    googleBtn.disabled = true;
    googleBtn.innerHTML = '<span>Loading...</span>';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTH_GOOGLE'
      });

      if (response && response.success) {
        showSuccess('✅ Redirecting to Google sign in...');
        // Background script will handle OAuth flow
      } else {
        showError(response?.error || 'Google sign in failed. Please try again.');
        googleBtn.disabled = false;
        googleBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9.003 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.96v2.332C2.44 15.983 5.485 18 9.003 18z" fill="#34A853"/>
            <path d="M3.964 10.712c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.96H.957C.347 6.175 0 7.55 0 9.002c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9.003 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.464.891 11.426 0 9.002 0 5.485 0 2.44 2.017.96 4.958L3.967 7.29c.708-2.127 2.692-3.71 5.036-3.71z" fill="#EA4335"/>
          </svg>
          <span>Continue with Google</span>
        `;
      }
    } catch (error) {
      console.error('Google sign in error:', error);
      showError('An error occurred. Please try again.');
      googleBtn.disabled = false;
    }
  });

  document.getElementById('facebookSignIn')?.addEventListener('click', async () => {
    hideMessages();
    const fbBtn = document.getElementById('facebookSignIn');
    fbBtn.disabled = true;
    fbBtn.innerHTML = '<span>Loading...</span>';

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'AUTH_FACEBOOK'
      });

      if (response && response.success) {
        showSuccess('✅ Redirecting to Facebook sign in...');
        // Background script will handle OAuth flow
      } else {
        showError(response?.error || 'Facebook sign in failed. Please try again.');
        fbBtn.disabled = false;
        fbBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
          <span>Continue with Facebook</span>
        `;
      }
    } catch (error) {
      console.error('Facebook sign in error:', error);
      showError('An error occurred. Please try again.');
      fbBtn.disabled = false;
    }
  });
});

// Tiger Prompts - Popup Script

document.addEventListener('DOMContentLoaded', () => {
  // Open ChatGPT
  document.getElementById('openChatGPT').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://chat.openai.com' });
    window.close();
  });

  // Open Claude
  document.getElementById('openClaude').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://claude.ai' });
    window.close();
  });

  // Open Gemini
  document.getElementById('openGemini').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://gemini.google.com' });
    window.close();
  });
});

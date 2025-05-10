// Content script for Read Later extension

// Initialize content script
console.log("Read Later content script initialized");

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    const content = {
      title: document.title,
      content: document.documentElement.outerHTML,
      textContent: document.body.innerText.substring(0, 1000),
      url: window.location.href
    };
    sendResponse(content);
  }
  
  if (request.action === "getReaderView") {
    const article = parseArticle();
    sendResponse(article);
  }
  
  if (request.action === "showNotification") {
    showNotification(request.message);
    sendResponse({ success: true });
  }
  
  return true; // Required for async sendResponse
});

// Function to show a notification overlay
function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.backgroundColor = '#4285f4';
  notification.style.color = 'white';
  notification.style.padding = '12px 20px';
  notification.style.borderRadius = '4px';
  notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
  notification.style.zIndex = '9999';
  notification.style.fontFamily = 'Arial, sans-serif';
  notification.style.fontSize = '14px';
  notification.style.transition = 'opacity 0.3s ease-in-out';
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 3000);
}

// Parse article content for reader view
function parseArticle() {
  let title = document.title;
  
  let mainContent = document.querySelector('article');
  
  if (!mainContent) {
    const possibleContent = document.querySelector('.content, .article, .post, main, #content, #main');
    if (possibleContent) {
      mainContent = possibleContent;
    } else {
      const body = document.body.cloneNode(true);
      ['header', 'footer', 'nav', 'aside', '.sidebar', '.ads', '.advertisement'].forEach(selector => {
        const elements = body.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
      mainContent = body;
    }
  }
  
  const content = mainContent.innerHTML;
  
  let mainImage = "";
  const images = document.querySelectorAll('img');
  if (images.length > 0) {
    for (const img of images) {
      if (img.width > 300 && img.height > 200) {
        mainImage = img.src;
        break;
      }
    }
    if (!mainImage && images.length > 0) {
      mainImage = images[0].src;
    }
  }
  
  return {
    title,
    content,
    mainImage,
    url: window.location.href,
    date: new Date().toISOString()
  };
} 
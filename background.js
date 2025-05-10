// Initialize extension data on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['readLater', 'settings'], (result) => {
    if (!result.readLater) {
      chrome.storage.local.set({ readLater: [] });
    }
    
    if (!result.settings) {
      chrome.storage.local.set({
        settings: {
          useAiParsing: false,
          darkMode: false,
          openaiApiKey: '',
          openaiModel: 'gpt-4o'
        }
      });
    }
  });
  
  chrome.contextMenus.create({
    id: "saveToReadLater",
    title: "Save to Read Later",
    contexts: ["page", "link"]
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'savePage') {
    savePage(request.tab, request.tags || []);
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'saveSettings') {
    saveSettings(request.settings, sendResponse);
    return true;
  } else if (request.action === 'getSettings') {
    getSettings(sendResponse);
    return true;
  }
});

function saveSettings(settings, sendResponse) {
  chrome.storage.local.set({ settings }, () => {
    if (sendResponse) {
      sendResponse({ success: true });
    }
  });
}

function getSettings(sendResponse) {
  chrome.storage.local.get(['settings'], (result) => {
    sendResponse(result.settings || {
      useAiParsing: false,
      darkMode: false,
      openaiApiKey: '',
      openaiModel: 'gpt-4o'
    });
  });
}

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: "list.html" });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "saveToReadLater") {
    if (info.linkUrl) {
      saveUrl(info.linkUrl, tab.title || "Unknown Title", []);
    } else {
      savePage(tab);
    }
  }
});

function savePage(tab, tags = []) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tab || tabs[0];
    
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings || { useAiParsing: false };
      
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        function: getPageContent
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          saveUrl(currentTab.url, currentTab.title, tags);
          return;
        }
        
        const result = results[0];
        if (result && result.result) {
          const { title, content, textContent, metaDescription, images } = result.result;
          
          if (settings.useAiParsing && settings.openaiApiKey) {
            processWithAI(currentTab, title, content, textContent, metaDescription, images, tags, settings);
          } else {
            saveUrl(currentTab.url, title, tags, content, textContent, metaDescription);
          }
        }
      });
    });
  });
}

async function processWithAI(tab, title, content, textContent, metaDescription, images, tags, settings) {
  try {
    const prompt = `
You are analyzing a web page to extract its main content for a "Read Later" app. 
The goal is to identify the main article content vs navigation, ads, etc.

URL: ${tab.url}
Title: ${title}
Meta Description: ${metaDescription || "None provided"}

Here's information about the page:
1. Text content excerpt (first 500 chars): 
${textContent.substring(0, 500)}...

2. The page contains ${images ? images.length : 0} images.

Your task:
1. Determine if this is an article page with main content (vs a homepage, category page, etc.)
2. Identify the most specific CSS selector that would target ONLY the main content
3. Identify which images are part of the main content vs decorative/ads/navigation
4. List elements that should definitely be removed (navigation, ads, popups, etc.)

Format your response STRICTLY as JSON with these fields:
{
  "mainContent": true/false,
  "contentSelector": "the most specific CSS selector for main content",
  "keepImageSelectors": ["array of CSS selectors for images to keep as part of the content"],
  "removeSelectors": ["array of CSS selectors for elements to remove"]
}

IMPORTANT: 
- Use specific, valid CSS selectors (classes, IDs, attributes)
- For content selector, prefer article, main, .content, #content, etc.
- For images, use selectors that would ONLY match content images
- Include classes that likely indicate non-content (e.g. .ad, .nav, .popup)
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openaiApiKey}`
      },
      body: JSON.stringify({
        model: settings.openaiModel || 'gpt-4o',
        messages: [
          { role: "system", content: "You are an AI assistant that analyzes web page content and returns ONLY valid JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("OpenAI API error:", response.status, errorData);
      throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    
    if (data.choices && data.choices.length > 0) {
      let aiSuggestions;
      try {
        const content = data.choices[0].message.content;
        aiSuggestions = JSON.parse(content);
      } catch (e) {
        console.error("Error parsing AI response:", e);
        aiSuggestions = null;
      }
      
      if (aiSuggestions) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: refineContentWithAI,
          args: [aiSuggestions]
        }, (results) => {
          if (results && results[0] && results[0].result) {
            const refinedContent = results[0].result;
            saveUrl(tab.url, title, tags, refinedContent.content, textContent, metaDescription);
          } else {
            saveUrl(tab.url, title, tags, content, textContent, metaDescription);
          }
        });
      } else {
        saveUrl(tab.url, title, tags, content, textContent, metaDescription);
      }
    } else {
      saveUrl(tab.url, title, tags, content, textContent, metaDescription);
    }
  } catch (error) {
    console.error("Error processing with AI:", error);
    saveUrl(tab.url, title, tags, content, textContent, metaDescription);
  }
}

function refineContentWithAI(aiSuggestions) {
  try {
    const docClone = document.cloneNode(true);
    const docBody = docClone.body;
    
    let mainContent = docBody;
    if (aiSuggestions.contentSelector && aiSuggestions.mainContent) {
      try {
        const selectedContent = docBody.querySelector(aiSuggestions.contentSelector);
        if (selectedContent) {
          mainContent = selectedContent;
        }
      } catch (e) {
        console.error("Error with content selector:", e);
      }
    }
    
    function removeElements(selector) {
      try {
        const elements = mainContent.querySelectorAll(selector);
        for (let i = 0; i < elements.length; i++) {
          if (elements[i] && elements[i].parentNode) {
            elements[i].parentNode.removeChild(elements[i]);
          }
        }
      } catch (e) {
        console.log('Invalid selector: ', selector);
      }
    }
    
    if (aiSuggestions.removeSelectors && Array.isArray(aiSuggestions.removeSelectors)) {
      aiSuggestions.removeSelectors.forEach(selector => {
        try {
          removeElements(selector);
        } catch (e) {
          console.log('Invalid selector: ', selector);
        }
      });
    }
    
    if (aiSuggestions.keepImageSelectors && Array.isArray(aiSuggestions.keepImageSelectors) && 
        aiSuggestions.keepImageSelectors.length > 0) {
      
      aiSuggestions.keepImageSelectors.forEach(selector => {
        try {
          const imagesToKeep = mainContent.querySelectorAll(selector);
          imagesToKeep.forEach(img => {
            img.setAttribute('data-keep', 'true');
          });
        } catch (e) {
          console.log('Invalid image selector: ', selector);
        }
      });
      
      const allImages = mainContent.querySelectorAll('img:not([data-keep="true"])');
      for (let i = 0; i < allImages.length; i++) {
        if (allImages[i] && allImages[i].parentNode) {
          allImages[i].parentNode.removeChild(allImages[i]);
        }
      }
      
      const keptImages = mainContent.querySelectorAll('[data-keep="true"]');
      keptImages.forEach(img => {
        img.removeAttribute('data-keep');
      });
    }
    
    removeElements('script, style, iframe, form, button');
    
    const commonNonContentSelectors = [
      'nav', 'header', 'footer', 'aside', 
      '[class*="nav"]', '[id*="nav"]', 
      '[class*="header"]', '[id*="header"]',
      '[class*="footer"]', '[id*="footer"]',
      '[class*="sidebar"]', '[id*="sidebar"]'
    ];
    
    if (!aiSuggestions.contentSelector || !aiSuggestions.mainContent) {
      commonNonContentSelectors.forEach(selector => {
        try {
          removeElements(selector);
        } catch (e) {
          // Skip invalid selectors
        }
      });
    }
    
    return {
      content: mainContent.outerHTML
    };
  } catch (e) {
    console.error("Error refining content with AI:", e);
    return { content: document.body.outerHTML };
  }
}

function getPageContent() {
  const docClone = document.cloneNode(true);
  const docBody = docClone.body;
  const title = document.title;
  
  let metaDescription = "";
  const metaDescEl = document.querySelector('meta[name="description"]');
  if (metaDescEl) {
    metaDescription = metaDescEl.getAttribute("content");
  }
  
  const images = Array.from(document.querySelectorAll('img')).map(img => {
    return {
      src: img.src,
      alt: img.alt || '',
      width: img.width,
      height: img.height,
      className: img.className,
      id: img.id
    };
  }).filter(img => img.src && (img.width > 100 || img.height > 100));
  
  function removeElements(elements) {
    if (!elements) return;
    
    for (let i = 0; i < elements.length; i++) {
      if (elements[i] && elements[i].parentNode) {
        elements[i].parentNode.removeChild(elements[i]);
      }
    }
  }
  
  try {
    removeElements(docBody.querySelectorAll('nav, header, footer, aside'));
    
    const commonPatterns = [
      '[class*="nav"]', '[id*="nav"]', '[class*="menu"]', '[id*="menu"]',
      '[role="navigation"]', '.navigation', '#navigation', '.navbar', '#navbar',
      '[class*="search"]', '[id*="search"]', '[type="search"]', 
      '[class*="search-form"]', '[id*="search-form"]',
      '[class*="share"]', '[id*="share"]', '[class*="social"]', '[id*="social"]',
      '[class*="comment"]', '[id*="comment"]', '[class*="disqus"]', '[id*="disqus"]',
      '[class*="ad-"]', '[id*="ad-"]', '[class*="ads"]', '[id*="ads"]',
      '[class*="banner"]', '[id*="banner"]', '[class*="promo"]', '[id*="promo"]',
      '[class*="related"]', '[id*="related"]', '[class*="recommended"]', 
      '[id*="recommended"]', '[class*="popular"]', '[id*="popular"]',
      '[class*="footer"]', '[id*="footer"]', '[class*="copyright"]', 
      '[id*="copyright"]', '.site-info', '#site-info',
      '[class*="sidebar"]', '[id*="sidebar"]', '[class*="widget"]', '[id*="widget"]',
      '[class*="newsletter"]', '[id*="newsletter"]', '[class*="subscribe"]', 
      '[id*="subscribe"]',
      '[class*="header"]', '[id*="header"]', '.site-header', '#site-header',
      '.page-header', '#page-header'
    ];
    
    commonPatterns.forEach(pattern => {
      try {
        removeElements(docBody.querySelectorAll(pattern));
      } catch (e) {
        console.log('Invalid selector: ', pattern);
      }
    });
    
    removeElements(docBody.querySelectorAll('[hidden], [style*="display: none"], [style*="display:none"], [style*="visibility: hidden"], [style*="visibility:hidden"]'));
    
    let mainContent = null;
    
    const article = docBody.querySelector('article');
    const main = docBody.querySelector('main');
    const contentDiv = docBody.querySelector('[id*="content"], [class*="content"], .post, #post, .article, #article');
    
    if (article) {
      mainContent = article;
    } else if (main) {
      mainContent = main;
    } else if (contentDiv) {
      mainContent = contentDiv;
    }
    
    let content = "";
    let textContent = "";
    
    if (mainContent) {
      removeElements(mainContent.querySelectorAll('script, style, iframe, form, button'));
      content = mainContent.outerHTML;
      textContent = mainContent.innerText.substring(0, 1000);
    } else {
      removeElements(docBody.querySelectorAll('script, style, iframe, form, button'));
      content = docBody.outerHTML;
      textContent = document.body.innerText.substring(0, 1000);
    }
    
    return { title, content, textContent, metaDescription, images };
  } catch (e) {
    console.error("Error parsing content:", e);
    
    return {
      title: document.title,
      content: document.documentElement.outerHTML,
      textContent: document.body.innerText.substring(0, 1000),
      metaDescription,
      images
    };
  }
}

function saveUrl(url, title, tags = [], content = "", textContent = "", metaDescription = "") {
  chrome.storage.local.get(['readLater'], (result) => {
    const readLater = result.readLater || [];
    const existingIndex = readLater.findIndex(item => item.url === url);
    
    const item = {
      id: existingIndex >= 0 ? readLater[existingIndex].id : Date.now(),
      url,
      title,
      tags,
      content,
      textContent,
      metaDescription,
      date: new Date().toISOString(),
      isRead: false
    };
    
    if (existingIndex >= 0) {
      if (tags.length > 0) {
        const existingItem = readLater[existingIndex];
        const combinedTags = Array.from(new Set([...existingItem.tags || [], ...tags]));
        item.tags = combinedTags;
      }
      readLater[existingIndex] = item;
    } else {
      readLater.push(item);
    }
    
    chrome.storage.local.set({ readLater }, () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'showNotification',
            message: 'Page saved successfully'
          });
        }
      });
    });
  });
}
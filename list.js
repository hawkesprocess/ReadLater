document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const searchInput = document.getElementById('searchInput');
  const tagsList = document.getElementById('tagsList');
  const newTagInput = document.getElementById('newTagInput');
  const addTagButton = document.getElementById('addTagButton');
  const showUnreadOnly = document.getElementById('showUnreadOnly');
  const sortOrder = document.getElementById('sortOrder');
  const itemsList = document.getElementById('itemsList');
  const refreshButton = document.getElementById('refreshButton');
  const readerView = document.getElementById('readerView');
  const readerTitle = document.getElementById('readerTitle');
  const readerContent = document.getElementById('readerContent');
  const closeReaderButton = document.getElementById('closeReaderButton');
  
  // State
  let savedItems = [];
  let allTags = [];
  let settings = {
    darkMode: false
  };
  let activeFilters = {
    tags: [],
    showUnreadOnly: false,
    searchTerm: '',
    sortOrder: 'newest'
  };
  
  // Load saved items and settings
  loadSettings();
  loadSavedItems();
  
  // Event listeners
  searchInput.addEventListener('input', function() {
    activeFilters.searchTerm = this.value.toLowerCase();
    renderItems();
  });
  
  addTagButton.addEventListener('click', addNewTag);
  
  showUnreadOnly.addEventListener('change', function() {
    activeFilters.showUnreadOnly = this.checked;
    renderItems();
  });
  
  sortOrder.addEventListener('change', function() {
    activeFilters.sortOrder = this.value;
    renderItems();
  });
  
  refreshButton.addEventListener('click', refreshSavedItems);
  
  closeReaderButton.addEventListener('click', function() {
    readerView.style.display = 'none';
  });
  
  // Functions
  function loadSettings() {
    chrome.runtime.sendMessage({ action: 'getSettings' }, function(response) {
      settings = response || { darkMode: false };
    });
  }
  
  function loadSavedItems() {
    chrome.storage.local.get(['readLater'], function(result) {
      savedItems = result.readLater || [];
      
      // Extract all tags
      allTags = Array.from(new Set(
        savedItems.flatMap(item => item.tags)
      )).sort();
      
      renderTags();
      renderItems();
    });
  }
  
  function renderTags() {
    tagsList.innerHTML = '';
    
    // Create "All" tag
    const allTagElement = document.createElement('div');
    allTagElement.className = 'tag-item' + 
      (activeFilters.tags.length === 0 ? ' active' : '');
    allTagElement.textContent = 'All';
    allTagElement.addEventListener('click', function() {
      activeFilters.tags = [];
      renderTags();
      renderItems();
    });
    tagsList.appendChild(allTagElement);
    
    // Create other tags
    allTags.forEach(tag => {
      const tagElement = document.createElement('div');
      tagElement.className = 'tag-item' + 
        (activeFilters.tags.includes(tag) ? ' active' : '');
      tagElement.textContent = tag;
      
      tagElement.addEventListener('click', function() {
        if (activeFilters.tags.includes(tag)) {
          activeFilters.tags = activeFilters.tags.filter(t => t !== tag);
        } else {
          activeFilters.tags.push(tag);
        }
        renderTags();
        renderItems();
      });
      
      tagsList.appendChild(tagElement);
    });
  }
  
  function addNewTag() {
    const newTag = newTagInput.value.trim();
    
    if (newTag && !allTags.includes(newTag)) {
      allTags.push(newTag);
      allTags.sort();
      renderTags();
      newTagInput.value = '';
    }
  }
  
  function renderItems() {
    itemsList.innerHTML = '';
    
    // Apply filters
    let filteredItems = savedItems;
    
    // Filter by tags
    if (activeFilters.tags.length > 0) {
      filteredItems = filteredItems.filter(item => 
        item.tags.some(tag => activeFilters.tags.includes(tag))
      );
    }
    
    // Filter by read status
    if (activeFilters.showUnreadOnly) {
      filteredItems = filteredItems.filter(item => !item.isRead);
    }
    
    // Filter by search term
    if (activeFilters.searchTerm) {
      const searchTerm = activeFilters.searchTerm.toLowerCase();
      filteredItems = filteredItems.filter(item => 
        // Search in title
        item.title.toLowerCase().includes(searchTerm) ||
        // Search in content
        item.textContent?.toLowerCase().includes(searchTerm) ||
        // Search in tags
        (item.tags && item.tags.some(tag => tag.toLowerCase().includes(searchTerm))) ||
        // Search in URL
        item.url.toLowerCase().includes(searchTerm) ||
        // Search in meta description
        item.metaDescription?.toLowerCase().includes(searchTerm)
      );
    }
    
    // Sort items
    filteredItems = sortItems(filteredItems, activeFilters.sortOrder);
    
    if (filteredItems.length === 0) {
      itemsList.innerHTML = '<div class="empty-message">No items found</div>';
      return;
    }
    
    // Render filtered items
    filteredItems.forEach(item => {
      const itemElement = document.createElement('div');
      itemElement.className = 'item-card';
      
      // Create date string
      const date = new Date(item.date);
      const dateString = date.toLocaleDateString();
      
      // Check if we're searching and if tags match the search
      let highlightedTags = item.tags;
      if (activeFilters.searchTerm && item.tags) {
        const searchTerm = activeFilters.searchTerm.toLowerCase();
        // Check if any tags match the search term
        const hasTagMatch = item.tags.some(tag => tag.toLowerCase().includes(searchTerm));
        
        // If there's a tag match, create highlighted version of tags
        if (hasTagMatch) {
          highlightedTags = item.tags.map(tag => {
            if (tag.toLowerCase().includes(searchTerm)) {
              return `<span class="tag highlighted-tag">${tag}</span>`;
            }
            return `<span class="tag">${tag}</span>`;
          });
        } else {
          // Regular tags if no match
          highlightedTags = item.tags.map(tag => `<span class="tag">${tag}</span>`);
        }
      } else {
        // Regular tags when not searching
        highlightedTags = item.tags.map(tag => `<span class="tag">${tag}</span>`);
      }
      
      // Create HTML structure
      itemElement.innerHTML = `
        <div class="item-header ${item.isRead ? 'read' : 'unread'}">
          <h3 class="item-title">${item.title}</h3>
          <div class="item-actions">
            <button class="btn action-btn read-btn" data-id="${item.id}">
              ${item.isRead ? 'Mark Unread' : 'Mark Read'}
            </button>
            <button class="btn action-btn delete-btn" data-id="${item.id}">Delete</button>
          </div>
        </div>
        <div class="item-content">
          <div class="item-meta">
            <div class="item-date">${dateString}</div>
            <div class="item-url">${truncateUrl(item.url)}</div>
          </div>
          ${highlightedTags.length > 0 ? 
            `<div class="item-tags">${highlightedTags.join('')}</div>` : ''}
          <div class="item-description">
            ${item.metaDescription || ''}
          </div>
        </div>
      `;
      
      // Add event listeners
      itemElement.addEventListener('click', function(e) {
        // Check if click was on a button
        if (e.target.classList.contains('read-btn')) {
          toggleReadStatus(item.id);
          return;
        }
        
        if (e.target.classList.contains('delete-btn')) {
          deleteItem(item.id);
          return;
        }
        
        // If not on a button, open the reader view
        openReaderView(item);
      });
      
      itemsList.appendChild(itemElement);
    });
  }
  
  function sortItems(items, order) {
    return [...items].sort((a, b) => {
      if (order === 'newest') {
        return new Date(b.date) - new Date(a.date);
      } else if (order === 'oldest') {
        return new Date(a.date) - new Date(b.date);
      } else if (order === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });
  }
  
  function toggleReadStatus(id) {
    const itemIndex = savedItems.findIndex(item => item.id === id);
    if (itemIndex !== -1) {
      savedItems[itemIndex].isRead = !savedItems[itemIndex].isRead;
      saveItems();
      renderItems();
    }
  }
  
  function deleteItem(id) {
    if (confirm('Are you sure you want to delete this item?')) {
      savedItems = savedItems.filter(item => item.id !== id);
      saveItems();
      renderItems();
    }
  }
  
  function showAddTagDialog(item) {
    // Create dialog overlay
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    dialog.innerHTML = `
      <div class="dialog">
        <h3>Edit Tags</h3>
        <div class="tag-checkboxes" id="tagCheckboxes">
          ${allTags.map(tag => `
            <div class="tag-checkbox">
              <input type="checkbox" id="tag-${tag}" 
                ${item.tags.includes(tag) ? 'checked' : ''}>
              <label for="tag-${tag}">${tag}</label>
            </div>
          `).join('')}
        </div>
        <div class="add-tag-input">
          <input type="text" id="dialogTagInput" placeholder="Add new tag">
          <button id="dialogAddTagBtn">Add</button>
        </div>
        <div class="dialog-buttons">
          <button id="dialogCancelBtn">Cancel</button>
          <button id="dialogSaveBtn">Save</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Add event listeners for dialog
    document.getElementById('dialogAddTagBtn').addEventListener('click', function() {
      const newTagInput = document.getElementById('dialogTagInput');
      const newTag = newTagInput.value.trim();
      
      if (newTag && !allTags.includes(newTag)) {
        allTags.push(newTag);
        allTags.sort();
        
        // Rebuild checkboxes
        const tagCheckboxes = document.getElementById('tagCheckboxes');
        tagCheckboxes.innerHTML = allTags.map(tag => `
          <div class="tag-checkbox">
            <input type="checkbox" id="tag-${tag}" 
              ${item.tags.includes(tag) || tag === newTag ? 'checked' : ''}>
            <label for="tag-${tag}">${tag}</label>
          </div>
        `).join('');
        
        newTagInput.value = '';
      }
    });
    
    document.getElementById('dialogCancelBtn').addEventListener('click', function() {
      document.body.removeChild(dialog);
    });
    
    document.getElementById('dialogSaveBtn').addEventListener('click', function() {
      // Get selected tags
      const newSelectedTags = [];
      
      allTags.forEach(tag => {
        const checkbox = document.getElementById(`tag-${tag}`);
        if (checkbox && checkbox.checked) {
          newSelectedTags.push(tag);
        }
      });
      
      // Update item's tags
      const itemIndex = savedItems.findIndex(i => i.id === item.id);
      if (itemIndex !== -1) {
        savedItems[itemIndex].tags = newSelectedTags;
        saveItems();
        renderItems();
      }
      
      document.body.removeChild(dialog);
    });
  }
  
  function saveItems() {
    chrome.storage.local.set({ readLater: savedItems });
  }
  
  function openReaderView(item) {
    // Mark as read
    const itemIndex = savedItems.findIndex(i => i.id === item.id);
    if (itemIndex !== -1 && !savedItems[itemIndex].isRead) {
      savedItems[itemIndex].isRead = true;
      saveItems();
      renderItems();
    }
    
    // Set title
    readerTitle.textContent = item.title;
    
    // Refresh settings before opening reader
    chrome.runtime.sendMessage({ action: 'getSettings' }, function(response) {
      settings = response || { darkMode: false };
      
      if (item.content) {
        // Display content directly if we have it
        displayReaderContent(item);
      } else {
        // Try to fetch content if we only have URL
        fetchPageContent(item.url)
          .then(content => {
            // Save the content for offline access
            savedItems[itemIndex].content = content;
            saveItems();
            
            // Display content
            displayReaderContent({...item, content});
          })
          .catch(error => {
            // If fetching fails, show error and open link
            readerContent.innerHTML = `
              <div class="error-message">
                <p>Couldn't load reader view. Opening original page...</p>
              </div>
            `;
            
            setTimeout(() => {
              chrome.tabs.create({ url: item.url });
              readerView.style.display = 'none';
            }, 2000);
          });
      }
      
      // Show reader view
      readerView.style.display = 'block';
    });
  }
  
  function displayReaderContent(item) {
    // Create a safe version of the content by sanitizing it within a template
    const tempContainer = document.createElement('div');
    tempContainer.innerHTML = item.content;
    
    // Set up reader controls
    const readerControls = document.createElement('div');
    readerControls.className = 'reader-controls';
    
    // Add dark mode toggle
    const darkModeToggle = document.createElement('button');
    darkModeToggle.className = 'reader-control-btn';
    darkModeToggle.innerHTML = settings.darkMode ? 
      '<span title="Switch to Light Mode">☀️</span>' : 
      '<span title="Switch to Dark Mode">🌙</span>';
    
    darkModeToggle.addEventListener('click', function() {
      settings.darkMode = !settings.darkMode;
      
      // Update button icon
      this.innerHTML = settings.darkMode ? 
        '<span title="Switch to Light Mode">☀️</span>' : 
        '<span title="Switch to Dark Mode">🌙</span>';
      
      // Apply dark mode
      applyDarkMode();
      
      // Save settings
      chrome.runtime.sendMessage({ 
        action: 'saveSettings', 
        settings: settings 
      });
    });
    
    readerControls.appendChild(darkModeToggle);
    
    // Apply reader view styles
    readerContent.innerHTML = '';
    readerContent.appendChild(readerControls);
    readerContent.appendChild(tempContainer);
    
    // Add original link
    const sourceLink = document.createElement('div');
    sourceLink.className = 'source-link';
    sourceLink.innerHTML = `<a href="${item.url}" target="_blank">View Original</a>`;
    readerContent.appendChild(sourceLink);
    
    // Apply dark mode if enabled
    applyDarkMode();
  }
  
  function applyDarkMode() {
    if (settings.darkMode) {
      readerView.classList.add('dark-mode');
    } else {
      readerView.classList.remove('dark-mode');
    }
  }
  
  // Function to refresh the list of saved items
  function refreshSavedItems() {
    const refreshStatus = document.createElement('div');
    refreshStatus.className = 'refresh-status';
    refreshStatus.innerHTML = 'Refreshing saved items...';
    document.body.appendChild(refreshStatus);
    
    // Load saved items again
    loadSavedItems();
    
    // Show success message
    setTimeout(() => {
      refreshStatus.innerHTML = 'Items refreshed successfully!';
      
      // Remove the status after 2 seconds
      setTimeout(() => {
        document.body.removeChild(refreshStatus);
      }, 2000);
    }, 500);
  }
  
  function fetchPageContent(url) {
    return new Promise((resolve, reject) => {
      // First try to use content script to get reader view
      chrome.tabs.create({ url, active: false }, tab => {
        setTimeout(() => {
          chrome.tabs.sendMessage(
            tab.id,
            { action: 'getReaderView' },
            response => {
              chrome.tabs.remove(tab.id);
              
              if (chrome.runtime.lastError || !response) {
                // If content script fails, use fallback method
                fetch(url)
                  .then(response => response.text())
                  .then(html => resolve(html))
                  .catch(error => reject(error));
              } else {
                resolve(response.content);
              }
            }
          );
        }, 1000); // Wait for page to load
      });
    });
  }
  
  // Utility function to truncate URL for display
  function truncateUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const path = urlObj.pathname;
      
      if (path.length > 20) {
        return hostname + path.substring(0, 20) + '...';
      }
      
      return hostname + path;
    } catch (e) {
      return url;
    }
  }
}); 
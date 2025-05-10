document.addEventListener('DOMContentLoaded', function() {
  // Elements
  const saveButton = document.getElementById('saveButton');
  const viewListButton = document.getElementById('viewListButton');
  const statusMessage = document.getElementById('statusMessage');
  const itemsList = document.getElementById('itemsList');
  
  // State
  let allTags = [];
  
  // Load recent items and tags
  loadRecentItemsAndTags();
  
  // Event listeners
  saveButton.addEventListener('click', saveCurrentPage);
  viewListButton.addEventListener('click', openSavedItemsList);
  
  // Automatically trigger save when popup is opened via Alt+R
  // This happens after items are loaded so we can show existing tags
  setTimeout(() => {
    saveCurrentPage();
  }, 200);
  
  // Function to save current page
  function saveCurrentPage() {
    // First show the add tags dialog
    showAddTagsDialog(tags => {
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const currentTab = tabs[0];
        
        // Call the background script to save the page with tags
        chrome.runtime.sendMessage(
          { 
            action: 'savePage', 
            tab: currentTab,
            tags: tags
          },
          function(response) {
            showStatusMessage('Page saved successfully!');
            loadRecentItemsAndTags(); // Refresh the list
          }
        );
      });
    });
  }
  
  // Function to show add tags dialog before saving
  function showAddTagsDialog(callback) {
    // Create dialog overlay
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    dialog.style.position = 'fixed';
    dialog.style.top = '0';
    dialog.style.left = '0';
    dialog.style.width = '100%';
    dialog.style.height = '100%';
    dialog.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    dialog.style.display = 'flex';
    dialog.style.justifyContent = 'center';
    dialog.style.alignItems = 'center';
    dialog.style.zIndex = '2000';
    
    // Create dialog content
    const dialogContent = document.createElement('div');
    dialogContent.style.backgroundColor = 'white';
    dialogContent.style.borderRadius = '8px';
    dialogContent.style.padding = '1.5rem';
    dialogContent.style.width = '90%';
    dialogContent.style.maxWidth = '400px';
    dialogContent.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
    
    // Dialog title
    const title = document.createElement('h3');
    title.textContent = 'Add Tags Before Saving';
    title.style.marginBottom = '1rem';
    
    // Current URL and title display
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs.length > 0) {
        const currentTab = tabs[0];
        const urlInfo = document.createElement('div');
        urlInfo.className = 'url-info';
        urlInfo.innerHTML = `
          <div class="current-title">${currentTab.title}</div>
          <div class="current-url">${truncateUrl(currentTab.url)}</div>
        `;
        urlInfo.style.marginBottom = '1rem';
        urlInfo.style.padding = '0.5rem';
        urlInfo.style.backgroundColor = '#f5f5f5';
        urlInfo.style.borderRadius = '4px';
        urlInfo.style.fontSize = '0.9rem';
        
        dialogContent.insertBefore(urlInfo, dialogContent.firstChild);
      }
    });
    
    // Create tag selection area
    const tagSelection = document.createElement('div');
    tagSelection.style.maxHeight = '150px';
    tagSelection.style.overflowY = 'auto';
    tagSelection.style.marginBottom = '1rem';
    tagSelection.style.padding = '0.5rem';
    tagSelection.style.border = '1px solid #eee';
    tagSelection.style.borderRadius = '4px';
    
    // Add existing tags as checkboxes
    if (allTags.length > 0) {
      allTags.forEach(tag => {
        const tagOption = document.createElement('div');
        tagOption.style.marginBottom = '0.5rem';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `tag-option-${tag}`;
        checkbox.value = tag;
        
        const label = document.createElement('label');
        label.htmlFor = `tag-option-${tag}`;
        label.textContent = tag;
        label.style.marginLeft = '0.5rem';
        
        tagOption.appendChild(checkbox);
        tagOption.appendChild(label);
        tagSelection.appendChild(tagOption);
      });
    } else {
      const noTagsMessage = document.createElement('div');
      noTagsMessage.textContent = 'No tags created yet. Add your first tag below.';
      noTagsMessage.style.color = '#777';
      noTagsMessage.style.fontStyle = 'italic';
      tagSelection.appendChild(noTagsMessage);
    }
    
    // Create new tag input
    const newTagContainer = document.createElement('div');
    newTagContainer.style.display = 'flex';
    newTagContainer.style.gap = '0.5rem';
    newTagContainer.style.marginBottom = '1rem';
    
    const newTagInput = document.createElement('input');
    newTagInput.type = 'text';
    newTagInput.placeholder = 'Add new tag';
    newTagInput.style.flexGrow = '1';
    newTagInput.style.padding = '0.5rem';
    newTagInput.style.border = '1px solid #ddd';
    newTagInput.style.borderRadius = '4px';
    
    const addTagBtn = document.createElement('button');
    addTagBtn.textContent = 'Add';
    addTagBtn.style.padding = '0.5rem';
    addTagBtn.style.backgroundColor = '#f0f0f0';
    addTagBtn.style.border = '1px solid #ddd';
    addTagBtn.style.borderRadius = '4px';
    addTagBtn.style.cursor = 'pointer';
    
    newTagContainer.appendChild(newTagInput);
    newTagContainer.appendChild(addTagBtn);
    
    // Add button functionality
    addTagBtn.addEventListener('click', function() {
      const newTag = newTagInput.value.trim();
      
      if (newTag && !allTags.includes(newTag)) {
        allTags.push(newTag);
        
        // Add new tag to selection
        const tagOption = document.createElement('div');
        tagOption.style.marginBottom = '0.5rem';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `tag-option-${newTag}`;
        checkbox.value = newTag;
        checkbox.checked = true; // Check the new tag by default
        
        const label = document.createElement('label');
        label.htmlFor = `tag-option-${newTag}`;
        label.textContent = newTag;
        label.style.marginLeft = '0.5rem';
        
        tagOption.appendChild(checkbox);
        tagOption.appendChild(label);
        tagSelection.appendChild(tagOption);
        
        newTagInput.value = '';
      }
    });
    
    // Create action buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    buttonContainer.style.gap = '0.5rem';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '0.5rem 1rem';
    cancelBtn.style.backgroundColor = '#f0f0f0';
    cancelBtn.style.border = '1px solid #ddd';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.padding = '0.5rem 1rem';
    saveBtn.style.backgroundColor = '#4285f4';
    saveBtn.style.color = 'white';
    saveBtn.style.border = '1px solid #3367d6';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    
    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(saveBtn);
    
    // Add elements to dialog
    dialogContent.appendChild(title);
    dialogContent.appendChild(tagSelection);
    dialogContent.appendChild(newTagContainer);
    dialogContent.appendChild(buttonContainer);
    dialog.appendChild(dialogContent);
    
    // Add dialog to document
    document.body.appendChild(dialog);
    
    // Focus the new tag input
    setTimeout(() => {
      newTagInput.focus();
    }, 100);
    
    // Add event listeners
    cancelBtn.addEventListener('click', function() {
      document.body.removeChild(dialog);
    });
    
    saveBtn.addEventListener('click', function() {
      // Get selected tags
      const selectedTags = [];
      
      // Get checked checkboxes
      const checkboxes = tagSelection.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
          selectedTags.push(checkbox.value);
        }
      });
      
      // Remove dialog
      document.body.removeChild(dialog);
      
      // Call callback with selected tags
      callback(selectedTags);
    });
    
    // Handle Enter key in the new tag input
    newTagInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        // Trigger the Add button click
        addTagBtn.click();
      }
    });
  }
  
  // Function to show a status message
  function showStatusMessage(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.className = 'status-message ' + (isError ? 'error' : 'success');
    statusMessage.style.display = 'block';
    
    // Hide message after 3 seconds
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000);
  }
  
  // Function to open the saved items list
  function openSavedItemsList() {
    chrome.tabs.create({ url: 'list.html' });
  }
  
  // Function to load recent items and all existing tags
  function loadRecentItemsAndTags() {
    chrome.storage.local.get(['readLater'], function(result) {
      const readLater = result.readLater || [];
      
      // Extract all tags
      allTags = Array.from(new Set(
        readLater.flatMap(item => item.tags || [])
      )).sort();
      
      // Clear the list
      itemsList.innerHTML = '';
      
      if (readLater.length === 0) {
        itemsList.innerHTML = '<div class="empty-message">No items saved yet</div>';
        return;
      }
      
      // Sort by date (newest first) and get the most recent 5 items
      const recentItems = readLater
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
      
      // Add items to the list
      recentItems.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'item';
        
        // Create tag HTML if item has tags
        let tagsHtml = '';
        if (item.tags && item.tags.length > 0) {
          tagsHtml = `
            <div class="item-tags">
              ${item.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
          `;
        }
        
        itemElement.innerHTML = `
          <div class="item-title">${item.title}</div>
          ${tagsHtml}
          <div class="item-url">${truncateUrl(item.url)}</div>
        `;
        
        // Open the item when clicked
        itemElement.addEventListener('click', function() {
          chrome.tabs.create({ url: item.url });
        });
        
        itemsList.appendChild(itemElement);
      });
    });
  }
  
  // Utility function to truncate URL for display
  function truncateUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname + (urlObj.pathname.length > 1 ? urlObj.pathname : '');
    } catch (e) {
      return url;
    }
  }
}); 
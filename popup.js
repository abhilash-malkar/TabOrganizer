// DOM elements
const saveSessionButton = document.getElementById('save-session');
const sessionList = document.getElementById('session-list');

// Save session
saveSessionButton.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const session = tabs.map(tab => ({ url: tab.url, title: tab.title }));
  
  chrome.storage.local.get({ sessions: [] }, (result) => {
    const sessions = result.sessions;
    sessions.push({ name: `Session ${sessions.length + 1}`, tabs: session });
    chrome.storage.local.set({ sessions }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving session:', chrome.runtime.lastError);
      } else {
        renderSessionsKeepingState();
      }
    });
  });
});

// Function to render sessions while keeping the expanded state
function renderSessionsKeepingState() {
  // Store the current state of expanded sessions
  const expandedSessions = Array.from(document.querySelectorAll('.collapse.show')).map(el => el.id);
  
  // Render sessions
  renderSessions();
  
  // After rendering, expand the sessions that were expanded before
  expandedSessions.forEach(id => {
    const collapseElement = document.getElementById(id);
    if (collapseElement) {
      new bootstrap.Collapse(collapseElement, { toggle: false }).show();
    }
  });
}

// Update the renderSessions function
function renderSessions() {
  sessionList.innerHTML = ''; // Clear the list

  chrome.storage.local.get({ sessions: [] }, (result) => {
    const sessions = result.sessions;

    sessions.forEach((session, sessionIndex) => {
      // Ensure session.tabs exists and is an array
      if (!Array.isArray(session.tabs)) {
        session.tabs = [];
      }

      // Main session row
      const row = document.createElement('tr');
      row.innerHTML = `
        <td data-bs-toggle="collapse" data-bs-target="#collapse-session-${sessionIndex}">
          <input type="text" class="form-control session-name" value="${session.name || `Session ${sessionIndex + 1}`}" data-session-index="${sessionIndex}">
        </td>
        <td>
          <button class="btn btn-sm" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-session-${sessionIndex}">
            <!--View Tabs (${session.tabs.length})-->
            <!--<i class="fa-solid fa-angles-down"></i>-->
            ${session.tabs.length} Tabs
          </button>
          <button id="open-session-${sessionIndex}" class="btn btn-outline-dark btn-sm"><i class="fa-solid fa-up-right-from-square"></i></button>
          <button id="delete-session-${sessionIndex}" class="btn btn-outline-danger btn-sm"><i class="fa-solid fa-trash-can"></i></button>
        </td>
      `;
      sessionList.appendChild(row);

      // Expandable row for session tabs (Bootstrap Collapse)
      const collapseRow = document.createElement('tr');
      collapseRow.innerHTML = `
        <td colspan="2">
          <div class="collapse" id="collapse-session-${sessionIndex}" data-session-index="${sessionIndex}">
            <div class="mb-2">
              <button id="bulk-delete-${sessionIndex}" class="btn btn-danger btn-sm"><i class="fa-solid fa-trash-can"></i></button>
              <button id="bulk-move-${sessionIndex}" class="btn btn-primary btn-sm"><i class="fa-solid fa-copy"></i></button>
            </div>
            <ul class="list-group" id="tab-list-${sessionIndex}"></ul>
          </div>
        </td>
      `;
      sessionList.appendChild(collapseRow);

      // Render individual tabs for this session
      renderTabs(session, sessionIndex);

      // Add event listeners for bulk action buttons
      document.getElementById(`bulk-delete-${sessionIndex}`).addEventListener('click', () => bulkDelete(sessionIndex));
      document.getElementById(`bulk-move-${sessionIndex}`).addEventListener('click', () => bulkMove(sessionIndex));

      // Open all tabs in the session
      document.getElementById(`open-session-${sessionIndex}`).addEventListener('click', () => {
        openAllTabs(sessionIndex);
      });

      // Delete the entire session
      document.getElementById(`delete-session-${sessionIndex}`).addEventListener('click', (e) => {
        e.preventDefault(); // Prevent default action
        showDeleteSessionModal(sessionIndex);
      });
    });

    // Add event listeners for session renaming
    document.querySelectorAll('.session-name').forEach(input => {
      input.addEventListener('change', (e) => {
        const sessionIndex = e.target.dataset.sessionIndex;
        const newName = e.target.value;
        renameSession(sessionIndex, newName);
      });
    });
  });
}

// New function to render tabs for a session
function renderTabs(session, sessionIndex) {
  const tabList = document.getElementById(`tab-list-${sessionIndex}`);
  tabList.innerHTML = ''; // Clear existing tabs

  session.tabs.forEach((tab, tabIndex) => {
    const tabItem = document.createElement('li');
    tabItem.classList.add('list-group-item');
    var title = tab.title || 'Untitled';
    var url = tab.url || '#';
    tabItem.innerHTML = `
    <div style="display: flex; flex-direction: row; flex-wrap: nowrap; justify-content: space-between; align-items: center;">
      <div>
        <input type="checkbox" class="tab-checkbox" data-session-index="${sessionIndex}" data-tab-index="${tabIndex}">
        <span title="${title}">${tabIndex + 1}. ${title.length <= 30 ? title : title.substring(0, 30).trim() + "..."}</span>
      </div>
      <div class="dropdown">
        <span style="cursor: pointer;padding: 0px 5px;"  type="button" id="dropdownMenuButton-${sessionIndex}-${tabIndex}" data-bs-toggle="dropdown" aria-expanded="false">
          <i class="fas fa-ellipsis-v"></i>
        </span>
        <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton-${sessionIndex}-${tabIndex}">
          <li><a class="dropdown-item" href="${url}" target="_blank">Open</a></li>
          <li><button class="dropdown-item move-tab" data-session-index="${sessionIndex}" data-tab-index="${tabIndex}">Move/Copy</button></li>
          <li><button class="dropdown-item delete-tab" data-session-index="${sessionIndex}" data-tab-index="${tabIndex}">Delete</button></li>
        </ul>
      </div>
    </div>
    `;
    tabList.appendChild(tabItem);
  });

  // Add event listeners for move/copy and delete tab buttons
  tabList.querySelectorAll('.move-tab').forEach(button => {
    button.addEventListener('click', (e) => {
      const sessionIndex = e.target.dataset.sessionIndex;
      const tabIndex = e.target.dataset.tabIndex;
      showMoveTabModal(sessionIndex, tabIndex);
    });
  });

  tabList.querySelectorAll('.delete-tab').forEach(button => {
    button.addEventListener('click', (e) => {
      const sessionIndex = e.target.dataset.sessionIndex;
      const tabIndex = e.target.dataset.tabIndex;
      showDeleteTabModal(sessionIndex, tabIndex);
    });
  });
}

// Update the bulkDelete function
function bulkDelete(sessionIndex) {
  const selectedTabs = getSelectedTabs(sessionIndex);
  if (selectedTabs.length === 0) {
    alert('No tabs selected');
    return;
  }
  
  if (confirm(`Are you sure you want to delete ${selectedTabs.length} selected tab(s)?`)) {
    chrome.storage.local.get({ sessions: [] }, (result) => {
      let sessions = result.sessions;
      selectedTabs.sort((a, b) => b.tabIndex - a.tabIndex).forEach(tab => {
        sessions[sessionIndex].tabs.splice(tab.tabIndex, 1);
      });
      
      // Remove session if no tabs left
      if (sessions[sessionIndex].tabs.length === 0) {
        sessions.splice(sessionIndex, 1);
      }

      chrome.storage.local.set({ sessions }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error deleting tabs:', chrome.runtime.lastError);
        } else {
          renderSessionsKeepingState();
        }
      });
    });
  }
}

// Update the deleteTab function
function deleteTab(sessionIndex, tabIndex) {
  chrome.storage.local.get({ sessions: [] }, (result) => {
    let sessions = result.sessions;
    if (sessions[sessionIndex] && Array.isArray(sessions[sessionIndex].tabs)) {
      sessions[sessionIndex].tabs.splice(tabIndex, 1);
      
      // Remove session if no tabs left
      if (sessions[sessionIndex].tabs.length === 0) {
        sessions.splice(sessionIndex, 1);
      }

      chrome.storage.local.set({ sessions }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error deleting tab:', chrome.runtime.lastError);
        } else {
          renderSessionsKeepingState();
        }
      });
    } else {
      console.error('Invalid session or tab index');
      renderSessionsKeepingState();
    }
  });
}

// Function to rename a session
function renameSession(index, newName) {
  chrome.storage.local.get({ sessions: [] }, (result) => {
    const sessions = result.sessions;
    if (sessions[index]) {
      sessions[index].name = newName;
      chrome.storage.local.set({ sessions }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error renaming session:', chrome.runtime.lastError);
        } else {
          renderSessionsKeepingState();
        }
      });
    } else {
      console.error('Invalid session index');
    }
  });
}

// Function to show the move/copy tab modal
function showMoveTabModal(sourceSessionIndex, tabIndex, selectedTabs = null) {
  const modal = new bootstrap.Modal(document.getElementById('moveTabModal'));
  const select = document.getElementById('targetSessionSelect');
  select.innerHTML = '';

  chrome.storage.local.get({ sessions: [] }, (result) => {
    const sessions = result.sessions;
    sessions.forEach((session, index) => {
      if (index != sourceSessionIndex) {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = session.name || `Session ${index + 1}`;
        select.appendChild(option);
      }
    });
  });

  document.getElementById('confirmMoveTab').onclick = () => {
    const targetSessionIndex = select.value;
    const isCopy = document.getElementById('copyTabCheckbox').checked;
    if (selectedTabs) {
      selectedTabs.forEach(tab => {
        moveOrCopyTab(sourceSessionIndex, tab.tabIndex, targetSessionIndex, isCopy);
      });
    } else {
      moveOrCopyTab(sourceSessionIndex, tabIndex, targetSessionIndex, isCopy);
    }
    modal.hide();
  };

  modal.show();
}

// Update the moveOrCopyTab function
function moveOrCopyTab(sourceSessionIndex, tabIndex, targetSessionIndex, isCopy) {
  chrome.storage.local.get({ sessions: [] }, (result) => {
    let sessions = result.sessions;
    if (sessions[sourceSessionIndex] && Array.isArray(sessions[sourceSessionIndex].tabs) &&
        sessions[targetSessionIndex] && Array.isArray(sessions[targetSessionIndex].tabs)) {
      const tab = sessions[sourceSessionIndex].tabs[tabIndex];

      sessions[targetSessionIndex].tabs.push(tab);
      if (!isCopy) {
        sessions[sourceSessionIndex].tabs.splice(tabIndex, 1);

        // Remove source session if no tabs left
        if (sessions[sourceSessionIndex].tabs.length === 0) {
          sessions.splice(sourceSessionIndex, 1);
        }
      }

      chrome.storage.local.set({ sessions }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error moving/copying tab:', chrome.runtime.lastError);
        } else {
          renderSessionsKeepingState();
        }
      });
    } else {
      console.error('Invalid source or target session');
      renderSessionsKeepingState();
    }
  });
}

// Function to open all tabs in a session
function openAllTabs(sessionIndex) {
  chrome.storage.local.get({ sessions: [] }, (result) => {
    const sessions = result.sessions;
    if (sessions[sessionIndex] && Array.isArray(sessions[sessionIndex].tabs)) {
      sessions[sessionIndex].tabs.forEach(tab => {
        chrome.tabs.create({ url: tab.url });
      });
    } else {
      console.error('Invalid session index');
    }
  });
}

// Update the bulkMove function
function bulkMove(sessionIndex) {
  const selectedTabs = getSelectedTabs(sessionIndex);
  if (selectedTabs.length === 0) {
    alert('No tabs selected');
    return;
  }
  
  showMoveTabModal(sessionIndex, null, selectedTabs);
}

// Function to get selected tabs
function getSelectedTabs(sessionIndex) {
  const checkboxes = document.querySelectorAll(`#tab-list-${sessionIndex} .tab-checkbox:checked`);
  return Array.from(checkboxes).map(checkbox => ({
    tabIndex: parseInt(checkbox.dataset.tabIndex)
  }));
}

// Add this function to show the delete tab modal
function showDeleteTabModal(sessionIndex, tabIndex) {
  const modal = new bootstrap.Modal(document.getElementById('deleteTabModal'));
  document.getElementById('confirmDeleteTab').onclick = () => {
    deleteTab(sessionIndex, tabIndex);
    modal.hide();
  };
  modal.show();
}

// Add this function to show the delete session modal
function showDeleteSessionModal(sessionIndex) {
  const modal = new bootstrap.Modal(document.getElementById('deleteSessionModal'));
  document.getElementById('confirmDeleteSession').onclick = () => {
    deleteSession(sessionIndex);
    modal.hide();
  };
  modal.show();
}

// Add this function to delete a session
function deleteSession(sessionIndex) {
  chrome.storage.local.get({ sessions: [] }, (result) => {
    let sessions = result.sessions;
    if (sessions[sessionIndex]) {
      sessions.splice(sessionIndex, 1);
      chrome.storage.local.set({ sessions }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error deleting session:', chrome.runtime.lastError);
        } else {
          renderSessionsKeepingState();
        }
      });
    } else {
      console.error('Invalid session index');
      renderSessionsKeepingState();
    }
  });
}

// Initialize the UI by rendering saved sessions
document.addEventListener('DOMContentLoaded', renderSessionsKeepingState);

/**
 * 待办清单 App — 主逻辑
 * 功能：CRUD、分类筛选、优先级、截止日期、本地持久化
 */

(function () {
  'use strict';

  // ============================================
  // State
  // ============================================
  const STORAGE_KEY = 'todo_app_tasks';
  let tasks = [];
  let currentCategory = 'all';
  let editingId = null;
  let selectedCategory = 'work';
  let deleteTargetId = null;

  // ============================================
  // DOM References
  // ============================================
  const $ = (sel) => document.querySelector(sel);
  const taskList = $('#taskList');
  const emptyState = $('#emptyState');
  const taskCount = $('#taskCount');
  const modalOverlay = $('#modalOverlay');
  const modalTitle = $('#modalTitle');
  const taskInput = $('#taskInput');
  const prioritySelect = $('#prioritySelect');
  const dueDateInput = $('#dueDateInput');
  const categorySelector = $('#categorySelector');
  const deleteOverlay = $('#deleteOverlay');

  // ============================================
  // Persistence
  // ============================================
  function loadTasks() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      tasks = data ? JSON.parse(data) : [];
    } catch (e) {
      tasks = [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  // ============================================
  // Helpers
  // ============================================
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return '今天';
    if (date.getTime() === tomorrow.getTime()) return '明天';

    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  }

  function isOverdue(dateStr) {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  }

  function getFilteredTasks() {
    if (currentCategory === 'all') return tasks;
    return tasks.filter((t) => t.category === currentCategory);
  }

  function getPendingCount() {
    return tasks.filter((t) => !t.completed).length;
  }

  // ============================================
  // Render
  // ============================================
  function render() {
    const filtered = getFilteredTasks();
    const pending = getPendingCount();

    // Update count badge
    taskCount.textContent = `${pending} 项待办`;

    // Show/hide empty state
    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      taskList.innerHTML = '';
      return;
    }

    emptyState.style.display = 'none';

    // Sort: incomplete first, then by priority (high > medium > low), then by creation
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...filtered].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.createdAt - a.createdAt;
    });

    taskList.innerHTML = sorted.map((task) => createTaskHTML(task)).join('');
    attachTaskListeners();
  }

  function createTaskHTML(task) {
    const checkedClass = task.completed ? 'checked' : '';
    const itemClass = task.completed ? 'completed' : '';
    const priorityClass = `priority-${task.priority}`;
    const catClass = `cat-${task.category}`;
    const catLabel = { work: '工作', personal: '个人', shopping: '购物' }[task.category] || '';
    const dueText = formatDate(task.dueDate);
    const overdueClass = task.dueDate && isOverdue(task.dueDate) && !task.completed ? 'overdue' : '';

    return `
      <li class="task-item ${itemClass}" data-id="${task.id}">
        <div class="task-check ${checkedClass}" data-action="toggle"></div>
        <div class="task-body">
          <div class="task-text">${escapeHtml(task.text)}</div>
          <div class="task-meta">
            <span class="task-priority ${priorityClass}" title="${task.priority}级"></span>
            <span class="task-category ${catClass}">${catLabel}</span>
            ${dueText ? `<span class="task-due ${overdueClass}">📅 ${dueText}${isOverdue(task.dueDate) ? ' (已过期)' : ''}</span>` : ''}
          </div>
        </div>
        <button class="task-delete-btn" data-action="delete" aria-label="删除任务">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M9 6V4h6v2"></path>
          </svg>
        </button>
      </li>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // Event Handlers
  // ============================================
  function attachTaskListeners() {
    taskList.querySelectorAll('.task-check').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('.task-item').dataset.id;
        toggleTask(id);
      });
    });

    taskList.querySelectorAll('.task-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.closest('.task-item').dataset.id;
        openDeleteConfirm(id);
      });
    });
  }

  function toggleTask(id) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      saveTasks();
      render();
    }
  }

  function openAddModal() {
    editingId = null;
    modalTitle.textContent = '新建任务';
    taskInput.value = '';
    prioritySelect.value = 'medium';
    dueDateInput.value = '';
    selectedCategory = 'work';
    updateCategoryButtons();
    openModal(modalOverlay);
    setTimeout(() => taskInput.focus(), 350);
  }

  function openEditModal(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    editingId = id;
    modalTitle.textContent = '编辑任务';
    taskInput.value = task.text;
    prioritySelect.value = task.priority;
    dueDateInput.value = task.dueDate || '';
    selectedCategory = task.category;
    updateCategoryButtons();
    openModal(modalOverlay);
  }

  function openModal(overlay) {
    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
  }

  function closeModal(overlay) {
    overlay.classList.remove('show');
    setTimeout(() => {
      overlay.style.display = 'none';
      editingId = null;
    }, 300);
  }

  function openDeleteConfirm(id) {
    deleteTargetId = id;
    deleteOverlay.style.display = 'flex';
    requestAnimationFrame(() => {
      deleteOverlay.classList.add('show');
    });
  }

  function closeDeleteModal() {
    deleteOverlay.classList.remove('show');
    setTimeout(() => {
      deleteOverlay.style.display = 'none';
      deleteTargetId = null;
    }, 300);
  }

  function deleteTask(id) {
    const el = taskList.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.add('removing');
      setTimeout(() => {
        tasks = tasks.filter((t) => t.id !== id);
        saveTasks();
        render();
        closeDeleteModal();
      }, 250);
    } else {
      tasks = tasks.filter((t) => t.id !== id);
      saveTasks();
      render();
      closeDeleteModal();
    }
  }

  function saveTask() {
    const text = taskInput.value.trim();
    if (!text) {
      taskInput.focus();
      taskInput.style.borderColor = 'var(--danger)';
      setTimeout(() => {
        taskInput.style.borderColor = '';
      }, 1500);
      return;
    }

    if (editingId) {
      const task = tasks.find((t) => t.id === editingId);
      if (task) {
        task.text = text;
        task.category = selectedCategory;
        task.priority = prioritySelect.value;
        task.dueDate = dueDateInput.value || null;
      }
    } else {
      tasks.push({
        id: generateId(),
        text,
        category: selectedCategory,
        priority: prioritySelect.value,
        dueDate: dueDateInput.value || null,
        completed: false,
        createdAt: Date.now(),
      });
    }

    saveTasks();
    closeModal(modalOverlay);
    render();
  }

  function updateCategoryButtons() {
    categorySelector.querySelectorAll('.cat-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.cat === selectedCategory);
    });
  }

  // ============================================
  // Tab switching
  // ============================================
  function setupTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        currentCategory = tab.dataset.category;
        render();
      });
    });
  }

  // ============================================
  // Category selector buttons
  // ============================================
  function setupCategorySelector() {
    categorySelector.querySelectorAll('.cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedCategory = btn.dataset.cat;
        updateCategoryButtons();
      });
    });
  }

  // ============================================
  // Swipe-to-delete (touch)
  // ============================================
  function setupSwipeToDelete() {
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let activeItem = null;

    taskList.addEventListener('touchstart', (e) => {
      const item = e.target.closest('.task-item');
      if (!item || e.target.closest('[data-action]')) return;
      activeItem = item;
      startX = e.touches[0].clientX;
      isDragging = true;
    }, { passive: true });

    taskList.addEventListener('touchmove', (e) => {
      if (!isDragging || !activeItem) return;
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      if (diff < -10) {
        activeItem.style.transition = 'none';
        activeItem.style.transform = `translateX(${diff}px)`;
      }
    }, { passive: true });

    taskList.addEventListener('touchend', () => {
      if (!isDragging || !activeItem) return;
      isDragging = false;
      const diff = currentX - startX;

      if (diff < -80) {
        activeItem.classList.add('swiped');
      } else {
        activeItem.style.transition = 'transform 0.2s ease';
        activeItem.style.transform = '';
        activeItem.classList.remove('swiped');
      }

      activeItem = null;
      startX = 0;
      currentX = 0;
    });
  }

  // ============================================
  // Service Worker Registration
  // ============================================
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/todo-app/sw.js')
        .then((reg) => console.log('SW registered:', reg.scope))
        .catch((err) => console.log('SW registration failed:', err));
    }
  }

  // ============================================
  // iOS Install Prompt (Add to Home Screen)
  // ============================================
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  // ============================================
  // Init
  // ============================================
  function init() {
    loadTasks();
    setupTabs();
    setupCategorySelector();
    setupSwipeToDelete();

    // FAB button
    $('#fabBtn').addEventListener('click', openAddModal);

    // Modal close buttons
    $('#modalClose').addEventListener('click', () => closeModal(modalOverlay));
    $('#btnCancel').addEventListener('click', () => closeModal(modalOverlay));
    $('#btnDeleteCancel').addEventListener('click', closeDeleteModal);

    // Save button
    $('#btnSave').addEventListener('click', saveTask);

    // Delete confirm
    $('#btnDeleteConfirm').addEventListener('click', () => {
      if (deleteTargetId) deleteTask(deleteTargetId);
    });

    // Overlay click to close
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal(modalOverlay);
    });
    deleteOverlay.addEventListener('click', (e) => {
      if (e.target === deleteOverlay) closeDeleteModal();
    });

    // Enter key to save
    taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveTask();
    });

    // Long press to edit
    let longPressTimer;
    taskList.addEventListener('touchstart', (e) => {
      const item = e.target.closest('.task-item');
      if (!item || e.target.closest('[data-action]')) return;
      longPressTimer = setTimeout(() => {
        const id = item.dataset.id;
        openEditModal(id);
      }, 500);
    });
    taskList.addEventListener('touchend', () => clearTimeout(longPressTimer));
    taskList.addEventListener('touchmove', () => clearTimeout(longPressTimer));

    // Register service worker
    registerSW();

    // Initial render
    render();
  }

  // Start the app
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

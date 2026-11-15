/* DDL Board —— 零构建前端，直接调用 Rust/Tauri 命令。 */

const invoke = window.__TAURI__?.core?.invoke;
const $ = (id) => document.getElementById(id);
const COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'gray'];
const COLOR_NAMES = { blue: '蓝色', green: '绿色', orange: '橙色', purple: '紫色', teal: '青色', gray: '灰色' };
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

const state = {
  tasks: [],
  settings: { theme: 'system', todoColor: 'blue', doneColor: 'green' },
  viewDate: new Date(),
  editingId: null,
  deletingId: null,
  saving: false,
  deleting: false,
};
let toastTimer = null;

function errorText(error) {
  if (typeof error === 'string') return error;
  return error?.message || String(error);
}

function requireInvoke() {
  if (!invoke) throw new Error('未检测到 Tauri 运行环境，请从 DDL Board 程序启动。');
  return invoke;
}

function pad(number) {
  return String(number).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayKey() {
  return dateKey(new Date());
}

function isOverdue(task) {
  if (task.isDone) return false;
  if (task.dueTime) {
    return new Date(`${task.dueDate}T${task.dueTime}:00`).getTime() < Date.now();
  }
  return task.dueDate < todayKey();
}

function showToast(message, type = 'info', duration = 2600) {
  clearTimeout(toastTimer);
  const toast = $('toast');
  toast.textContent = message;
  toast.className = `toast show${type === 'error' ? ' error' : ''}`;
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, duration);
}

function setStatus(message, type = 'ready') {
  $('status-text').textContent = message;
  $('status-dot').className = `status-dot ${type}`;
}

function tasksForDate(key) {
  return state.tasks
    .filter((task) => task.dueDate === key)
    .sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      const timeOrder = (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');
      return timeOrder || a.createdAt.localeCompare(b.createdAt);
    });
}

function render() {
  const year = state.viewDate.getFullYear();
  const month = state.viewDate.getMonth();
  $('month-label').textContent = `${year}年${month + 1}月`;

  const monthTasks = state.tasks.filter((task) => {
    const [taskYear, taskMonth] = task.dueDate.split('-').map(Number);
    return taskYear === year && taskMonth === month + 1;
  });
  const pending = monthTasks.filter((task) => !task.isDone).length;
  $('month-summary').textContent = monthTasks.length
    ? `本月 ${monthTasks.length} 项 · 未完成 ${pending} 项`
    : '本月暂无 DDL';
  $('empty-state').hidden = monthTasks.length > 0;

  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  const grid = $('calendar-grid');
  grid.replaceChildren();

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    grid.appendChild(renderDay(date, month));
  }
}

function renderDay(date, visibleMonth) {
  const key = dateKey(date);
  const cell = document.createElement('div');
  cell.className = 'day-cell';
  if (date.getMonth() !== visibleMonth) cell.classList.add('other-month');
  if (key === todayKey()) cell.classList.add('today');

  const head = document.createElement('div');
  head.className = 'day-head';
  const number = document.createElement('span');
  number.className = 'day-number';
  number.textContent = date.getDate();
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add-task';
  add.textContent = '＋';
  add.title = `在 ${key} 新建 DDL`;
  add.setAttribute('aria-label', `在 ${key} 新建 DDL`);
  add.addEventListener('click', () => openTaskDialog(null, key));
  head.append(number, add);
  cell.appendChild(head);

  const list = document.createElement('div');
  list.className = 'task-list';
  tasksForDate(key).forEach((task) => list.appendChild(renderTask(task)));
  cell.appendChild(list);
  return cell;
}

function renderTask(task) {
  const item = document.createElement('div');
  item.className = 'task-item';
  if (task.isDone) item.classList.add('is-done');
  if (isOverdue(task)) item.classList.add('is-overdue');
  item.title = `${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : '（全天）'}${isOverdue(task) ? ' · 已逾期' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.isDone;
  checkbox.title = task.isDone ? '取消完成' : '标记完成';
  checkbox.setAttribute('aria-label', `${checkbox.title}：${task.title}`);
  checkbox.addEventListener('change', () => toggleDone(task.id, checkbox.checked));

  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'task-title';
  title.textContent = task.title;
  title.title = '点击编辑';
  title.addEventListener('click', () => openTaskDialog(task.id));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'delete-task';
  remove.textContent = '×';
  remove.title = '删除';
  remove.setAttribute('aria-label', `删除：${task.title}`);
  remove.addEventListener('click', () => openDeleteDialog(task.id));

  item.appendChild(checkbox);
  if (task.dueTime) {
    const time = document.createElement('span');
    time.className = 'task-time';
    time.textContent = task.dueTime;
    item.appendChild(time);
  }
  item.append(title, remove);
  return item;
}

function openTaskDialog(id = null, defaultDate = todayKey()) {
  const task = id ? state.tasks.find((item) => item.id === id) : null;
  state.editingId = task?.id || null;
  $('task-dialog-title').textContent = task ? '编辑 DDL' : '新建 DDL';
  $('task-title').value = task?.title || '';
  $('task-date').value = task?.dueDate || defaultDate;
  $('task-time').value = task?.dueTime || '';
  $('edit-delete-btn').hidden = !task;
  $('form-error').hidden = true;
  $('save-task-btn').textContent = task ? '保存修改' : '创建';
  $('task-dialog').showModal();
  requestAnimationFrame(() => {
    $('task-title').focus();
    if (task) $('task-title').select();
  });
}

async function saveTask(event) {
  event.preventDefault();
  if (state.saving || !$('task-form').reportValidity()) return;
  const id = state.editingId;
  const input = {
    title: $('task-title').value,
    dueDate: $('task-date').value,
    dueTime: $('task-time').value || null,
  };
  state.saving = true;
  $('save-task-btn').disabled = true;
  $('form-error').hidden = true;

  try {
    const saved = id
      ? await requireInvoke()('update_task', { id, input })
      : await requireInvoke()('create_task', { input });
    if (id) {
      const index = state.tasks.findIndex((task) => task.id === id);
      state.tasks[index] = saved;
    } else {
      state.tasks.push(saved);
    }
    const [year, month] = saved.dueDate.split('-').map(Number);
    state.viewDate = new Date(year, month - 1, 1);
    $('task-dialog').close();
    render();
    refreshStorageInfo();
    showToast(id ? '修改已保存' : 'DDL 已创建');
  } catch (error) {
    $('form-error').textContent = `${id ? '保存' : '创建'}失败：${errorText(error)}`;
    $('form-error').hidden = false;
  } finally {
    state.saving = false;
    $('save-task-btn').disabled = false;
  }
}

async function toggleDone(id, isDone) {
  try {
    const updated = await requireInvoke()('set_task_done', { id, isDone });
    const index = state.tasks.findIndex((task) => task.id === id);
    state.tasks[index] = updated;
    render();
  } catch (error) {
    render();
    showToast(`更新失败：${errorText(error)}`, 'error', 4000);
  }
}

function openDeleteDialog(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  state.deletingId = id;
  $('delete-task-title').textContent = task.title;
  $('confirm-dialog').showModal();
}

async function deleteTask(event) {
  event.preventDefault();
  if (state.deleting || !state.deletingId) return;
  state.deleting = true;
  $('confirm-delete-btn').disabled = true;
  try {
    const id = state.deletingId;
    await requireInvoke()('delete_task', { id });
    state.tasks = state.tasks.filter((task) => task.id !== id);
    $('confirm-dialog').close();
    render();
    refreshStorageInfo();
    showToast('DDL 已删除');
  } catch (error) {
    showToast(`删除失败：${errorText(error)}`, 'error', 4000);
  } finally {
    state.deleting = false;
    $('confirm-delete-btn').disabled = false;
  }
}

function applySettings() {
  const settings = state.settings;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  COLORS.forEach((color) => {
    document.body.classList.remove(`tone-todo-${color}`, `tone-done-${color}`);
  });
  document.body.classList.add(`tone-todo-${settings.todoColor}`, `tone-done-${settings.doneColor}`);

  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    const selected = button.dataset.themeChoice === settings.theme;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('.swatches').forEach((group) => {
    group.querySelectorAll('.swatch').forEach((button) => {
      const selected = settings[group.dataset.group] === button.dataset.color;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  });
}

function buildSwatches() {
  document.querySelectorAll('.swatches').forEach((group) => {
    COLORS.forEach((color) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `swatch tone-${color}`;
      button.dataset.color = color;
      button.title = COLOR_NAMES[color];
      button.setAttribute('aria-label', COLOR_NAMES[color]);
      button.addEventListener('click', () => saveAppearance({ [group.dataset.group]: color }));
      group.appendChild(button);
    });
  });
}

async function saveAppearance(patch) {
  const previous = { ...state.settings };
  state.settings = { ...state.settings, ...patch };
  applySettings();
  try {
    state.settings = await requireInvoke()('save_settings', { settings: state.settings });
    applySettings();
  } catch (error) {
    state.settings = previous;
    applySettings();
    showToast(`保存外观失败：${errorText(error)}`, 'error', 4000);
  }
}

function toggleAppearance(force) {
  const panel = $('appearance-panel');
  const shouldOpen = typeof force === 'boolean' ? force : panel.hidden;
  panel.hidden = !shouldOpen;
  $('appearance-btn').setAttribute('aria-expanded', String(shouldOpen));
}

async function refreshStorageInfo() {
  try {
    const info = await requireInvoke()('get_storage_info');
    $('storage-path').textContent = `数据目录：${info.dataDir}`;
    $('storage-path').title = info.dataDir;
    setStatus(`本地已保存 · 共 ${info.taskCount} 条 DDL`);
  } catch (error) {
    setStatus('无法读取数据目录', 'error');
  }
}

function bindEvents() {
  $('prev-month').addEventListener('click', () => {
    state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() - 1, 1);
    render();
  });
  $('next-month').addEventListener('click', () => {
    state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + 1, 1);
    render();
  });
  $('today-btn').addEventListener('click', () => {
    state.viewDate = new Date();
    render();
  });
  $('new-task-btn').addEventListener('click', () => openTaskDialog());
  $('task-form').addEventListener('submit', saveTask);
  $('confirm-form').addEventListener('submit', deleteTask);
  $('close-task-dialog').addEventListener('click', () => $('task-dialog').close());
  $('cancel-task-btn').addEventListener('click', () => $('task-dialog').close());
  $('cancel-delete-btn').addEventListener('click', () => $('confirm-dialog').close());
  $('edit-delete-btn').addEventListener('click', () => {
    const id = state.editingId;
    $('task-dialog').close();
    requestAnimationFrame(() => openDeleteDialog(id));
  });
  $('task-dialog').addEventListener('click', (event) => {
    if (event.target === $('task-dialog')) $('task-dialog').close();
  });
  $('confirm-dialog').addEventListener('click', (event) => {
    if (event.target === $('confirm-dialog')) $('confirm-dialog').close();
  });
  $('appearance-btn').addEventListener('click', () => toggleAppearance());
  document.querySelectorAll('[data-theme-choice]').forEach((button) => {
    button.addEventListener('click', () => saveAppearance({ theme: button.dataset.themeChoice }));
  });
  document.addEventListener('mousedown', (event) => {
    if (!$('appearance-panel').contains(event.target) && !$('appearance-btn').contains(event.target)) {
      toggleAppearance(false);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') toggleAppearance(false);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      if (!$('task-dialog').open && !$('confirm-dialog').open) openTaskDialog();
    }
  });
  systemDark.addEventListener('change', () => {
    if (state.settings.theme === 'system') applySettings();
  });
}

async function init() {
  bindEvents();
  buildSwatches();
  applySettings();
  render();
  try {
    const [tasks, settings] = await Promise.all([
      requireInvoke()('get_tasks'),
      requireInvoke()('get_settings'),
    ]);
    state.tasks = tasks;
    state.settings = settings;
    applySettings();
    render();
    await refreshStorageInfo();
  } catch (error) {
    setStatus('本地数据读取失败', 'error');
    showToast(`初始化失败：${errorText(error)}`, 'error', 8000);
  }
}

init();

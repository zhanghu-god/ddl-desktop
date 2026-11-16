/* DDL Board —— 零构建前端，直接调用 Rust/Tauri 命令。 */

const { invoke, $, errorText, systemDark, requireInvoke } = window.PKUI;
const showToast = (message, type, duration) => window.PKUI.toast(message, type, duration);
const COLORS = ['blue', 'green', 'orange', 'purple', 'teal', 'gray'];
const COLOR_NAMES = { blue: '蓝色', green: '绿色', orange: '橙色', purple: '紫色', teal: '青色', gray: '灰色' };

const state = {
  tasks: [],
  settings: { theme: 'system', todoColor: 'blue', doneColor: 'green' },
  viewDate: new Date(),
  editingId: null,
  deletingId: null,
  saving: false,
  deleting: false,
  appInfo: null,
  updateInfo: null,
  updateBusy: false,
};
function pad(number) {
  return String(number).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayKey() {
  return dateKey(new Date());
}

function parseDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function weekdayNumber(date) {
  return ((date.getDay() + 6) % 7) + 1;
}

function occursOn(task, key) {
  if (!task.repeat) return task.dueDate === key;
  const rule = task.repeat;
  if (rule.freq !== 'weekly') return false;
  if (key < task.dueDate) return false;
  if (rule.until && key > rule.until) return false;
  const date = parseDateKey(key);
  if (!rule.weekdays.includes(weekdayNumber(date))) return false;
  const anchor = parseDateKey(task.dueDate);
  const diffDays = Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
      - Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())) / 86400000,
  );
  const weekIndex = Math.floor(diffDays / 7);
  return weekIndex % (rule.interval || 1) === 0;
}

function occurrenceFor(task, key) {
  const override = task.overrides?.[key];
  if (override?.cancelled) return null;
  return {
    task,
    date: key,
    title: task.title,
    dueTime: task.dueTime,
    isDone: task.repeat ? !!override?.isDone : task.isDone,
    recurring: !!task.repeat,
  };
}

function isOverdue(occ) {
  if (occ.isDone) return false;
  if (occ.dueTime) {
    return new Date(`${occ.date}T${occ.dueTime}:00`).getTime() < Date.now();
  }
  return occ.date < todayKey();
}

function setStatus(message, type = 'ready') {
  $('status-text').textContent = message;
  $('status-dot').className = `status-dot ${type}`;
}

function occurrencesForDate(key) {
  return state.tasks
    .filter((task) => occursOn(task, key))
    .map((task) => occurrenceFor(task, key))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
      const timeOrder = (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');
      return timeOrder || a.task.createdAt.localeCompare(b.task.createdAt);
    });
}

function render() {
  const year = state.viewDate.getFullYear();
  const month = state.viewDate.getMonth();
  $('month-label').textContent = `${year}年${month + 1}月`;

  let monthCount = 0;
  let monthPending = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const occurrences = occurrencesForDate(`${year}-${pad(month + 1)}-${pad(day)}`);
    monthCount += occurrences.length;
    monthPending += occurrences.filter((occ) => !occ.isDone).length;
  }
  $('month-summary').textContent = monthCount
    ? `本月 ${monthCount} 项 · 未完成 ${monthPending} 项`
    : '本月暂无 DDL';
  $('empty-state').hidden = monthCount > 0;

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
  occurrencesForDate(key).forEach((occ) => list.appendChild(renderTask(occ)));
  cell.appendChild(list);
  return cell;
}

function renderTask(occ) {
  const item = document.createElement('div');
  item.className = 'task-item';
  if (occ.isDone) item.classList.add('is-done');
  if (isOverdue(occ)) item.classList.add('is-overdue');
  item.title = `${occ.date}${occ.dueTime ? ` ${occ.dueTime}` : '（全天）'}${occ.recurring ? ' · 每周重复' : ''}${isOverdue(occ) ? ' · 已逾期' : ''}`;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = occ.isDone;
  checkbox.title = occ.isDone ? '取消完成' : '标记完成';
  checkbox.setAttribute('aria-label', `${checkbox.title}：${occ.title}`);
  checkbox.addEventListener('change', () => toggleDone(occ.task.id, occ.date, checkbox.checked));

  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'task-title';
  title.textContent = occ.title;
  title.title = occ.recurring ? '点击编辑整个系列' : '点击编辑';
  title.addEventListener('click', () => openTaskDialog(occ.task.id));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'delete-task';
  remove.textContent = '×';
  remove.title = occ.recurring ? '删除整个系列' : '删除';
  remove.setAttribute('aria-label', `删除：${occ.title}`);
  remove.addEventListener('click', () => openDeleteDialog(occ.task.id));

  item.appendChild(checkbox);
  if (occ.recurring) {
    const badge = document.createElement('span');
    badge.className = 'repeat-badge';
    badge.textContent = '↻';
    badge.title = '每周重复';
    item.appendChild(badge);
  }
  if (occ.dueTime) {
    const time = document.createElement('span');
    time.className = 'task-time';
    time.textContent = occ.dueTime;
    item.appendChild(time);
  }
  item.append(title, remove);
  return item;
}

function getSelectedWeekdays() {
  return [...document.querySelectorAll('.weekday-btn.selected')]
    .map((button) => Number(button.dataset.weekday))
    .sort((a, b) => a - b);
}

function setSelectedWeekdays(days) {
  document.querySelectorAll('.weekday-btn').forEach((button) => {
    button.classList.toggle('selected', days.includes(Number(button.dataset.weekday)));
  });
}

function syncRepeatOptions() {
  const weekly = $('task-repeat').value === 'weekly';
  $('repeat-options').hidden = !weekly;
  if (weekly && getSelectedWeekdays().length === 0) {
    const key = $('task-date').value || todayKey();
    setSelectedWeekdays([weekdayNumber(parseDateKey(key))]);
  }
}

function openTaskDialog(id = null, defaultDate = todayKey()) {
  const task = id ? state.tasks.find((item) => item.id === id) : null;
  state.editingId = task?.id || null;
  $('task-dialog-title').textContent = task ? '编辑 DDL' : '新建 DDL';
  $('task-title').value = task?.title || '';
  $('task-date').value = task?.dueDate || defaultDate;
  $('task-time').value = task?.dueTime || '';
  $('task-repeat').value = task?.repeat ? 'weekly' : 'none';
  setSelectedWeekdays(task?.repeat?.weekdays || [weekdayNumber(parseDateKey(task?.dueDate || defaultDate))]);
  $('task-until').value = task?.repeat?.until || '';
  syncRepeatOptions();
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
  let repeat = null;
  if ($('task-repeat').value === 'weekly') {
    const weekdays = getSelectedWeekdays();
    if (weekdays.length === 0) {
      $('form-error').textContent = '每周重复至少选择一个星期';
      $('form-error').hidden = false;
      return;
    }
    repeat = { freq: 'weekly', interval: 1, weekdays, until: $('task-until').value || null };
  }
  const input = {
    title: $('task-title').value,
    dueDate: $('task-date').value,
    dueTime: $('task-time').value || null,
    repeat,
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

async function toggleDone(id, date, isDone) {
  try {
    const updated = await requireInvoke()('set_occurrence_done', { id, date, isDone });
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
  $('delete-series-note').hidden = !task.repeat;
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
  window.PKUI.applyTheme(settings.theme);
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

async function loadAppInfo() {
  try {
    state.appInfo = await requireInvoke()('get_app_info');
    $('about-version').textContent = `v${state.appInfo.version}`;
    $('about-repo').textContent = state.appInfo.repo;
    $('about-data-dir').textContent = state.appInfo.dataDir;
    $('about-data-dir').title = state.appInfo.dataDir;
  } catch (error) {
    $('about-version').textContent = '未知';
  }
}

function openAbout() {
  toggleAppearance(false);
  loadAppInfo();
  $('about-dialog').showModal();
}

function setUpdateStatus(text, isError = false) {
  const status = $('update-status');
  status.textContent = text;
  status.classList.toggle('error', isError);
}

async function checkForUpdate({ manual = false } = {}) {
  if (state.updateBusy) return;
  state.updateBusy = true;
  $('check-update-btn').disabled = true;
  setUpdateStatus('正在检查更新…');
  try {
    const info = await requireInvoke()('check_update');
    state.updateInfo = info;
    if (!info.hasUpdate) {
      setUpdateStatus(`已是最新版本 v${info.currentVersion}`);
      if (manual) showToast('已是最新版本');
      return;
    }
    setUpdateStatus(`发现新版本 v${info.latestVersion}，正在下载并校验…`);
    const prepared = await requireInvoke()('prepare_update', { info });
    setUpdateStatus(`新版本 v${prepared.version} 已准备好`);
    $('update-version').textContent = `v${prepared.version}`;
    $('update-dialog').showModal();
  } catch (error) {
    setUpdateStatus(`更新失败：${errorText(error)}`, true);
    if (manual) showToast(`更新失败：${errorText(error)}`, 'error', 5000);
  } finally {
    state.updateBusy = false;
    $('check-update-btn').disabled = false;
  }
}

async function restartForUpdate() {
  $('update-restart-btn').disabled = true;
  $('update-later-btn').disabled = true;
  try {
    await requireInvoke()('apply_update_and_restart');
  } catch (error) {
    $('update-restart-btn').disabled = false;
    $('update-later-btn').disabled = false;
    showToast(`重启更新失败：${errorText(error)}`, 'error', 5000);
  }
}

function shiftMonth(delta) {
  state.viewDate = new Date(state.viewDate.getFullYear(), state.viewDate.getMonth() + delta, 1);
  render();
}

function bindEvents() {
  $('prev-month').addEventListener('click', () => shiftMonth(-1));
  $('next-month').addEventListener('click', () => shiftMonth(1));
  // 月历区域滚轮切换月份：下滚=下月、上滚=上月；累积阈值+冷却防止一次滚动连跳多月。
  let wheelAccum = 0;
  let wheelLast = 0;
  let wheelLock = 0;
  $('calendar-scroll').addEventListener('wheel', (event) => {
    event.preventDefault();
    const now = Date.now();
    if (now < wheelLock) return;
    if (now - wheelLast > 240) wheelAccum = 0;
    wheelLast = now;
    if (wheelAccum !== 0 && Math.sign(event.deltaY) !== Math.sign(wheelAccum)) wheelAccum = 0;
    wheelAccum += event.deltaY;
    if (Math.abs(wheelAccum) >= 60) {
      const delta = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      wheelLock = now + 320;
      shiftMonth(delta);
    }
  }, { passive: false });
  $('today-btn').addEventListener('click', () => {
    state.viewDate = new Date();
    render();
  });
  $('new-task-btn').addEventListener('click', () => openTaskDialog());
  $('task-repeat').addEventListener('change', syncRepeatOptions);
  $('task-date').addEventListener('change', () => {
    if ($('task-repeat').value === 'weekly') syncRepeatOptions();
  });
  document.querySelectorAll('.weekday-btn').forEach((button) => {
    button.addEventListener('click', () => button.classList.toggle('selected'));
  });
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
  $('about-btn').addEventListener('click', openAbout);
  $('close-about-dialog').addEventListener('click', () => $('about-dialog').close());
  $('about-dialog').addEventListener('click', (event) => {
    if (event.target === $('about-dialog')) $('about-dialog').close();
  });
  $('check-update-btn').addEventListener('click', () => checkForUpdate({ manual: true }));
  $('update-later-btn').addEventListener('click', () => {
    $('update-dialog').close();
    showToast('更新已保留，可稍后在“关于”中重启更新');
  });
  $('update-restart-btn').addEventListener('click', restartForUpdate);
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
      if (!document.querySelector('dialog[open]')) openTaskDialog();
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
    await loadAppInfo();
    checkForUpdate({ manual: false });
  } catch (error) {
    setStatus('本地数据读取失败', 'error');
    showToast(`初始化失败：${errorText(error)}`, 'error', 8000);
  }
}

init();

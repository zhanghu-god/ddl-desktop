use tauri::{AppHandle, State};

use crate::models::{AppInfo, Settings, StorageInfo, Task, TaskInput};
use crate::storage::AppStore;
use crate::update::{self, PreparedUpdate, UpdateInfo};
use portable_kit::webdav::{self, BackupReport, RestoreReport, WebDavConfig};

/// 电脑端与手机端共用同一远端目录，保证多端同步同一份数据。
const SYNC_APP: &str = "ddl-desktop";

fn sync_cfg(store: &AppStore) -> Result<WebDavConfig, String> {
    let s = store.settings().sync;
    if !s.enabled {
        return Err("未启用 WebDAV 同步".into());
    }
    if s.url.trim().is_empty() {
        return Err("未配置 WebDAV 地址".into());
    }
    Ok(WebDavConfig { url: s.url, username: s.username, password: s.password, root: s.root })
}

/// 修改后自动同步（增量备份，后台线程，失败不影响本地）。
pub fn maybe_auto_sync(store: &AppStore) {
    let s = store.settings().sync;
    if !(s.enabled && s.auto_sync) || s.url.trim().is_empty() {
        return;
    }
    let cfg = WebDavConfig { url: s.url, username: s.username, password: s.password, root: s.root };
    let dir = store.data_dir().to_path_buf();
    std::thread::spawn(move || {
        match webdav::backup_app(&cfg, SYNC_APP, &dir) {
            Ok(r) => portable_kit::logging::info(&format!("auto sync uploaded={}", r.uploaded)),
            Err(e) => portable_kit::logging::warn(&format!("auto sync failed: {e}")),
        }
    });
}

#[tauri::command]
pub fn get_tasks(store: State<'_, AppStore>) -> Result<Vec<Task>, String> {
    store.list_tasks()
}

#[tauri::command]
pub fn create_task(input: TaskInput, store: State<'_, AppStore>) -> Result<Task, String> {
    let r = store.create_task(input);
    if r.is_ok() {
        maybe_auto_sync(&store);
    }
    r
}

#[tauri::command]
pub fn update_task(
    id: String,
    input: TaskInput,
    store: State<'_, AppStore>,
) -> Result<Task, String> {
    let r = store.update_task(&id, input);
    if r.is_ok() {
        maybe_auto_sync(&store);
    }
    r
}

#[tauri::command]
pub fn set_task_done(
    id: String,
    is_done: bool,
    store: State<'_, AppStore>,
) -> Result<Task, String> {
    let r = store.set_task_done(&id, is_done);
    if r.is_ok() {
        maybe_auto_sync(&store);
    }
    r
}

#[tauri::command]
pub fn set_occurrence_done(
    id: String,
    date: String,
    is_done: bool,
    store: State<'_, AppStore>,
) -> Result<Task, String> {
    let r = store.set_occurrence_done(&id, &date, is_done);
    if r.is_ok() {
        maybe_auto_sync(&store);
    }
    r
}

#[tauri::command]
pub fn delete_task(id: String, store: State<'_, AppStore>) -> Result<(), String> {
    let r = store.delete_task(&id);
    if r.is_ok() {
        maybe_auto_sync(&store);
    }
    r
}

#[tauri::command]
pub fn sync_test(store: State<'_, AppStore>) -> Result<String, String> {
    let cfg = sync_cfg(&store)?;
    webdav::test_connection(&cfg)?;
    Ok("连接成功".into())
}

#[tauri::command]
pub fn sync_backup(store: State<'_, AppStore>) -> Result<BackupReport, String> {
    let cfg = sync_cfg(&store)?;
    let r = webdav::backup_app(&cfg, SYNC_APP, store.data_dir())?;
    portable_kit::logging::info(&format!("sync backup uploaded={} skipped={}", r.uploaded, r.skipped));
    Ok(r)
}

#[tauri::command]
pub fn sync_restore(store: State<'_, AppStore>) -> Result<RestoreReport, String> {
    let cfg = sync_cfg(&store)?;
    let r = webdav::restore_app(&cfg, SYNC_APP, store.data_dir())?;
    store.reload()?;
    portable_kit::logging::info(&format!("sync restore downloaded={}", r.downloaded));
    Ok(r)
}

#[tauri::command]
pub fn get_settings(store: State<'_, AppStore>) -> Settings {
    store.settings()
}

#[tauri::command]
pub fn save_settings(settings: Settings, store: State<'_, AppStore>) -> Result<Settings, String> {
    store.update_settings(settings)
}

#[tauri::command]
pub fn get_storage_info(store: State<'_, AppStore>) -> Result<StorageInfo, String> {
    store.storage_info()
}

#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_app_info(store: State<'_, AppStore>) -> AppInfo {
    AppInfo {
        version: update::current_version().to_string(),
        repo: update::REPO.to_string(),
        data_dir: store.data_dir().to_string_lossy().into_owned(),
    }
}

#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    update::check_update().await
}

#[tauri::command]
pub async fn prepare_update(
    info: UpdateInfo,
    store: State<'_, AppStore>,
) -> Result<PreparedUpdate, String> {
    let data_dir = store.data_dir().to_path_buf();
    update::prepare_update(&data_dir, &info).await
}

#[tauri::command]
pub fn apply_update_and_restart(app: AppHandle, store: State<'_, AppStore>) -> Result<(), String> {
    update::apply_update_and_restart(store.data_dir())?;
    app.exit(0);
    Ok(())
}

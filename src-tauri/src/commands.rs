use tauri::{AppHandle, State};

use crate::models::{AppInfo, Settings, StorageInfo, Task, TaskInput};
use crate::storage::AppStore;
use crate::update::{self, PreparedUpdate, UpdateInfo};

#[tauri::command]
pub fn get_tasks(store: State<'_, AppStore>) -> Result<Vec<Task>, String> {
    store.list_tasks()
}

#[tauri::command]
pub fn create_task(input: TaskInput, store: State<'_, AppStore>) -> Result<Task, String> {
    store.create_task(input)
}

#[tauri::command]
pub fn update_task(
    id: String,
    input: TaskInput,
    store: State<'_, AppStore>,
) -> Result<Task, String> {
    store.update_task(&id, input)
}

#[tauri::command]
pub fn set_task_done(
    id: String,
    is_done: bool,
    store: State<'_, AppStore>,
) -> Result<Task, String> {
    store.set_task_done(&id, is_done)
}

#[tauri::command]
pub fn set_occurrence_done(
    id: String,
    date: String,
    is_done: bool,
    store: State<'_, AppStore>,
) -> Result<Task, String> {
    store.set_occurrence_done(&id, &date, is_done)
}

#[tauri::command]
pub fn delete_task(id: String, store: State<'_, AppStore>) -> Result<(), String> {
    store.delete_task(&id)
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

use tauri::State;

use crate::models::{Settings, StorageInfo, Task, TaskInput};
use crate::storage::AppStore;

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

//! DDL Board —— 独立、便携的 DDL 月历应用。

mod commands;
mod models;
mod storage;
mod update;

use storage::AppStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let data_dir = storage::portable_data_dir().expect("无法定位程序目录");
    storage::configure_webview_data_dir(&data_dir).expect("无法创建便携缓存目录");
    let _ = portable_kit::logging::init("ddl-desktop");
    portable_kit::logging::install_panic_hook();
    portable_kit::logging::info(&format!(
        "startup version={} exe={:?}",
        env!("CARGO_PKG_VERSION"),
        std::env::current_exe().ok()
    ));
    update::cleanup_leftover(&data_dir);
    let store = AppStore::load(data_dir).expect("无法初始化本地数据");

    tauri::Builder::default()
        .manage(store)
        .invoke_handler(tauri::generate_handler![
            commands::get_tasks,
            commands::create_task,
            commands::update_task,
            commands::set_task_done,
            commands::set_occurrence_done,
            commands::delete_task,
            commands::get_settings,
            commands::save_settings,
            commands::get_storage_info,
            commands::get_app_info,
            commands::check_update,
            commands::prepare_update,
            commands::apply_update_and_restart,
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}

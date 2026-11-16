//! DDL Board —— 独立、便携的 DDL 月历应用（桌面便携 + 移动端 WebDAV 同步）。

mod commands;
mod models;
mod storage;
mod update;

use storage::AppStore;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "android")]
    android_logger::init_once(
        android_logger::Config::default().with_max_level(log::LevelFilter::Info),
    );
    log::info!("ddl-desktop run start");
    if let Err(error) = try_run() {
        // 不用 panic，避免移动端 stop_unwind 直接 abort；把原因写到 logcat。
        log::error!("ddl-desktop run failed: {error}");
    }
}

fn try_run() -> Result<(), String> {
    // Android 无 stderr：panic 消息直接写 logcat，便于定位。
    #[cfg(target_os = "android")]
    std::panic::set_hook(Box::new(|info| {
        log::error!("PANIC: {info}");
    }));
    #[cfg(not(target_os = "android"))]
    portable_kit::logging::install_panic_hook();

    let mut context = tauri::generate_context!();
    // 桌面：把宿主目录重定向到 exe 同级 data（便携）。
    // 移动端不支持相对路径覆盖且本身非便携，必须跳过，否则 Android 启动即报错。
    if cfg!(not(any(target_os = "android", target_os = "ios"))) {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                let data = dir.join("data");
                context.config_mut().app.app_directories_override =
                    Some(tauri::utils::config::AppDirectoriesOverride::Directories(
                        tauri::utils::config::AppDirectoryOverrides {
                            config: Some(data.clone()),
                            data: Some(data.clone()),
                            local_data: Some(data.join("cache").join("webview2")),
                            cache: Some(data.join("caches")),
                            log: Some(data.join("logs")),
                        },
                    ));
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 桌面：exe 同级 data（便携）；移动端：系统应用数据目录（非便携）。
            let data_dir = if cfg!(any(target_os = "android", target_os = "ios")) {
                app.path().app_data_dir().map_err(|e| {
                    log::error!("app_data_dir failed: {e}");
                    e.to_string()
                })?
            } else {
                storage::portable_data_dir()?
            };
            log::info!("data_dir={}", data_dir.display());
            if cfg!(not(any(target_os = "android", target_os = "ios"))) {
                storage::configure_webview_data_dir(&data_dir)?;
                update::cleanup_leftover(&data_dir);
            }
            let _ = portable_kit::logging::init_at(&data_dir, "ddl-desktop");
            portable_kit::logging::info(&format!(
                "startup version={} data_dir={}",
                env!("CARGO_PKG_VERSION"),
                data_dir.display()
            ));
            let store = AppStore::load(data_dir).map_err(|e| {
                log::error!("AppStore::load failed: {e}");
                e
            })?;
            app.manage(store);

            // 常驻同步线程：启动即备份一次，之后每小时增量备份 + 清理过期日志。
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                let store = handle.state::<AppStore>();
                let s = store.settings().sync;
                if s.enabled && !s.url.trim().is_empty() {
                    let cfg = portable_kit::webdav::WebDavConfig {
                        url: s.url.clone(),
                        username: s.username.clone(),
                        password: s.password.clone(),
                        root: s.root.clone(),
                    };
                    match portable_kit::webdav::backup_app(&cfg, "ddl-desktop", store.data_dir()) {
                        Ok(r) => portable_kit::logging::info(&format!(
                            "hourly sync uploaded={} skipped={}",
                            r.uploaded, r.skipped
                        )),
                        Err(e) => portable_kit::logging::warn(&format!("hourly sync failed: {e}")),
                    }
                }
                if let Some(dir) = portable_kit::logging::log_dir() {
                    let _ = portable_kit::logging::cleanup_old_logs(dir, 7);
                }
                std::thread::sleep(std::time::Duration::from_secs(3600));
            });
            Ok(())
        })
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
            commands::sync_test,
            commands::sync_backup,
            commands::sync_restore,
            commands::open_url,
        ])
        .run(context)
        .map_err(|e| e.to_string())
}

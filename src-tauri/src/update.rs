//! 自动更新薄封装：复用 portable-kit 的方案二更新逻辑（Web 重定向 + SHA256SUMS）。

use std::path::Path;

use portable_kit::update::{self as kit, UpdateConfig};
pub use portable_kit::update::{PreparedUpdate, UpdateInfo};

pub const CFG: UpdateConfig = UpdateConfig {
    repo: "zhanghu-god/ddl-desktop",
    exe_name: "ddl-desktop.exe",
    asset_base: "ddl-desktop",
    user_agent: "ddl-desktop-updater",
};

pub fn current_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

/// 仓库标识（关于面板展示用）
pub const REPO: &str = CFG.repo;

pub async fn check_update() -> Result<UpdateInfo, String> {
    kit::check_update(&CFG, current_version()).await
}

pub async fn prepare_update(data_dir: &Path, info: &UpdateInfo) -> Result<PreparedUpdate, String> {
    kit::prepare_update(&CFG, data_dir, info).await
}

pub fn apply_update_and_restart(data_dir: &Path) -> Result<(), String> {
    kit::apply_update_and_restart(&CFG, data_dir)
}

pub fn cleanup_leftover(data_dir: &Path) {
    kit::cleanup_leftover(data_dir);
}

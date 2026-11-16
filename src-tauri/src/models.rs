use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    /// 本地日期，格式为 YYYY-MM-DD。
    pub due_date: String,
    /// 可选的本地时间，格式为 HH:MM；None 表示全天。
    pub due_time: Option<String>,
    pub is_done: bool,
    pub created_at: String,
    pub updated_at: String,
    /// 可选重复规则；None 表示单次 DDL。
    #[serde(default)]
    pub repeat: Option<RepeatRule>,
    /// 重复 DDL 的按次覆盖状态，key 为 YYYY-MM-DD。
    #[serde(default)]
    pub overrides: BTreeMap<String, OccurrenceOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RepeatRule {
    /// 目前支持 weekly。
    pub freq: String,
    #[serde(default = "default_interval")]
    pub interval: u32,
    /// 1=周一，7=周日。
    pub weekdays: Vec<u8>,
    #[serde(default)]
    pub until: Option<String>,
}

fn default_interval() -> u32 {
    1
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OccurrenceOverride {
    #[serde(default)]
    pub is_done: Option<bool>,
    #[serde(default)]
    pub cancelled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SyncSettings {
    pub enabled: bool,
    pub auto_sync: bool,
    pub url: String,
    pub username: String,
    pub password: String,
    pub root: String,
}

impl Default for SyncSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_sync: true,
            url: String::new(),
            username: String::new(),
            password: String::new(),
            root: "rust-apps".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub todo_color: String,
    pub done_color: String,
    #[serde(default)]
    pub sync: SyncSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            todo_color: "blue".into(),
            done_color: "green".into(),
            sync: SyncSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    pub due_date: String,
    pub due_time: Option<String>,
    #[serde(default)]
    pub repeat: Option<RepeatRule>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub data_dir: String,
    pub task_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub repo: String,
    pub data_dir: String,
}

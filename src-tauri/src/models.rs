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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub todo_color: String,
    pub done_color: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            todo_color: "blue".into(),
            done_color: "green".into(),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    pub due_date: String,
    pub due_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub data_dir: String,
    pub task_count: usize,
}

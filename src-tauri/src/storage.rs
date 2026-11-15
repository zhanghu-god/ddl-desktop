//! 便携数据层：任务、配置和 WebView2 缓存均位于 exe 同级 data 目录。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{NaiveDate, NaiveTime, SecondsFormat, Utc};
use serde::de::DeserializeOwned;
use serde::Serialize;
use uuid::Uuid;

use crate::models::{Settings, StorageInfo, Task, TaskInput};

const COLORS: [&str; 6] = ["blue", "green", "orange", "purple", "teal", "gray"];

/// 只使用程序所在目录，不回退到 APPDATA 等系统位置。
pub fn portable_data_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法获取程序路径：{e}"))?;
    let exe_dir = exe
        .parent()
        .ok_or_else(|| "程序路径没有父目录".to_string())?;
    Ok(exe_dir.join("data"))
}

/// WebView2 默认会把缓存写入系统用户目录，这里在创建窗口前改为便携目录。
pub fn configure_webview_data_dir(data_dir: &Path) -> Result<(), String> {
    let cache_dir = data_dir.join("cache").join("webview2");
    fs::create_dir_all(&cache_dir).map_err(|e| format!("无法创建 WebView2 缓存目录：{e}"))?;
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", cache_dir);
    Ok(())
}

pub struct AppStore {
    data_dir: PathBuf,
    tasks_path: PathBuf,
    settings_path: PathBuf,
    tasks: Mutex<Vec<Task>>,
    settings: Mutex<Settings>,
}

impl AppStore {
    pub fn load(data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&data_dir).map_err(|e| format!("无法创建数据目录：{e}"))?;
        let tasks_path = data_dir.join("tasks.json");
        let settings_path = data_dir.join("config.json");

        let tasks_existed = tasks_path.exists();
        let settings_existed = settings_path.exists();
        let tasks: Vec<Task> = read_json_or_default(&tasks_path)?;
        let settings: Settings = read_json_or_default(&settings_path)?;
        validate_settings(&settings)?;
        for task in &tasks {
            normalize_task_input(TaskInput {
                title: task.title.clone(),
                due_date: task.due_date.clone(),
                due_time: task.due_time.clone(),
            })?;
        }

        // 首次运行即创建可见的数据文件，方便备份与迁移。
        if !tasks_existed {
            write_json(&tasks_path, &tasks)?;
        }
        if !settings_existed {
            write_json(&settings_path, &settings)?;
        }

        Ok(Self {
            data_dir,
            tasks_path,
            settings_path,
            tasks: Mutex::new(tasks),
            settings: Mutex::new(settings),
        })
    }

    pub fn list_tasks(&self) -> Result<Vec<Task>, String> {
        let tasks = self
            .tasks
            .lock()
            .map_err(|_| "任务数据锁已损坏".to_string())?;
        Ok(tasks.clone())
    }

    pub fn create_task(&self, input: TaskInput) -> Result<Task, String> {
        let (title, due_date, due_time) = normalize_task_input(input)?;
        let now = timestamp();
        let task = Task {
            id: Uuid::new_v4().to_string(),
            title,
            due_date,
            due_time,
            is_done: false,
            created_at: now.clone(),
            updated_at: now,
        };

        let mut tasks = self
            .tasks
            .lock()
            .map_err(|_| "任务数据锁已损坏".to_string())?;
        let mut next = tasks.clone();
        next.push(task.clone());
        write_json(&self.tasks_path, &next)?;
        *tasks = next;
        Ok(task)
    }

    pub fn update_task(&self, id: &str, input: TaskInput) -> Result<Task, String> {
        let (title, due_date, due_time) = normalize_task_input(input)?;
        let mut tasks = self
            .tasks
            .lock()
            .map_err(|_| "任务数据锁已损坏".to_string())?;
        let mut next = tasks.clone();
        let index = next
            .iter()
            .position(|task| task.id == id)
            .ok_or_else(|| "找不到要修改的 DDL".to_string())?;
        let old = &next[index];
        let updated = Task {
            id: old.id.clone(),
            title,
            due_date,
            due_time,
            is_done: old.is_done,
            created_at: old.created_at.clone(),
            updated_at: timestamp(),
        };
        next[index] = updated.clone();
        write_json(&self.tasks_path, &next)?;
        *tasks = next;
        Ok(updated)
    }

    pub fn set_task_done(&self, id: &str, is_done: bool) -> Result<Task, String> {
        let mut tasks = self
            .tasks
            .lock()
            .map_err(|_| "任务数据锁已损坏".to_string())?;
        let mut next = tasks.clone();
        let index = next
            .iter()
            .position(|task| task.id == id)
            .ok_or_else(|| "找不到要更新的 DDL".to_string())?;
        next[index].is_done = is_done;
        next[index].updated_at = timestamp();
        let updated = next[index].clone();
        write_json(&self.tasks_path, &next)?;
        *tasks = next;
        Ok(updated)
    }

    pub fn delete_task(&self, id: &str) -> Result<(), String> {
        let mut tasks = self
            .tasks
            .lock()
            .map_err(|_| "任务数据锁已损坏".to_string())?;
        let mut next = tasks.clone();
        let old_len = next.len();
        next.retain(|task| task.id != id);
        if next.len() == old_len {
            return Err("找不到要删除的 DDL".into());
        }
        write_json(&self.tasks_path, &next)?;
        *tasks = next;
        Ok(())
    }

    pub fn settings(&self) -> Settings {
        self.settings
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn update_settings(&self, settings: Settings) -> Result<Settings, String> {
        validate_settings(&settings)?;
        write_json(&self.settings_path, &settings)?;
        *self
            .settings
            .lock()
            .map_err(|_| "配置数据锁已损坏".to_string())? = settings.clone();
        Ok(settings)
    }

    pub fn storage_info(&self) -> Result<StorageInfo, String> {
        let task_count = self
            .tasks
            .lock()
            .map_err(|_| "任务数据锁已损坏".to_string())?
            .len();
        Ok(StorageInfo {
            data_dir: self.data_dir.to_string_lossy().into_owned(),
            task_count,
        })
    }
}

fn normalize_task_input(input: TaskInput) -> Result<(String, String, Option<String>), String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("标题不能为空".into());
    }
    if title.chars().count() > 200 {
        return Err("标题不能超过 200 个字符".into());
    }

    let due_date = input.due_date.trim();
    let parsed_date = NaiveDate::parse_from_str(due_date, "%Y-%m-%d")
        .map_err(|_| "截止日期格式应为 YYYY-MM-DD".to_string())?;
    if parsed_date.format("%Y-%m-%d").to_string() != due_date {
        return Err("截止日期格式应为 YYYY-MM-DD".into());
    }

    let due_time = input
        .due_time
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            NaiveTime::parse_from_str(value, "%H:%M")
                .map_err(|_| "截止时间格式应为 HH:MM".to_string())?;
            Ok::<String, String>(value.to_string())
        })
        .transpose()?;

    Ok((title.to_string(), due_date.to_string(), due_time))
}

fn validate_settings(settings: &Settings) -> Result<(), String> {
    if !matches!(settings.theme.as_str(), "system" | "light" | "dark") {
        return Err("无效的主题设置".into());
    }
    if !COLORS.contains(&settings.todo_color.as_str())
        || !COLORS.contains(&settings.done_color.as_str())
    {
        return Err("无效的配色设置".into());
    }
    Ok(())
}

fn timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn read_json_or_default<T>(path: &Path) -> Result<T, String>
where
    T: DeserializeOwned + Default,
{
    if !path.exists() {
        return Ok(T::default());
    }
    let text =
        fs::read_to_string(path).map_err(|e| format!("读取 {} 失败：{e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{} 格式错误：{e}", path.display()))
}

fn write_json<T>(path: &Path, value: &T) -> Result<(), String>
where
    T: Serialize + ?Sized,
{
    let text = serde_json::to_string_pretty(value).map_err(|e| format!("序列化数据失败：{e}"))?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, text).map_err(|e| format!("写入 {} 失败：{e}", temp_path.display()))?;

    // Unix 可直接覆盖；Windows 在目标已存在时先删除再重命名。
    match fs::rename(&temp_path, path) {
        Ok(()) => Ok(()),
        Err(first_error) if path.exists() => {
            fs::remove_file(path).map_err(|e| format!("替换 {} 失败：{e}", path.display()))?;
            fs::rename(&temp_path, path).map_err(|e| {
                format!(
                    "替换 {} 失败：{e}（首次错误：{first_error}）",
                    path.display()
                )
            })
        }
        Err(e) => Err(format!("保存 {} 失败：{e}", path.display())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("ddl-desktop-test-{}", Uuid::new_v4()));
            fs::create_dir_all(&path).expect("创建测试目录");
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn input(title: &str, date: &str, time: Option<&str>) -> TaskInput {
        TaskInput {
            title: title.into(),
            due_date: date.into(),
            due_time: time.map(str::to_string),
        }
    }

    #[test]
    fn task_crud_is_persisted() {
        let dir = TestDir::new();
        let store = AppStore::load(dir.0.clone()).expect("初始化存储");
        assert!(dir.0.join("tasks.json").exists());
        assert!(dir.0.join("config.json").exists());

        let task = store
            .create_task(input("  多媒体 hw6  ", "2026-11-18", Some("18:30")))
            .expect("创建任务");
        assert_eq!(task.title, "多媒体 hw6");
        assert!(!task.is_done);

        let updated = store
            .update_task(&task.id, input("多媒体 hw7", "2026-11-19", None))
            .expect("修改任务");
        assert_eq!(updated.due_date, "2026-11-19");
        assert_eq!(updated.due_time, None);
        assert_eq!(updated.created_at, task.created_at);

        store.set_task_done(&task.id, true).expect("完成任务");
        let reloaded = AppStore::load(dir.0.clone()).expect("重新读取存储");
        let tasks = reloaded.list_tasks().expect("列出任务");
        assert_eq!(tasks.len(), 1);
        assert!(tasks[0].is_done);
        assert_eq!(tasks[0].title, "多媒体 hw7");

        reloaded.delete_task(&task.id).expect("删除任务");
        assert!(reloaded.list_tasks().expect("列出任务").is_empty());
        let saved: Vec<Task> =
            read_json_or_default(&dir.0.join("tasks.json")).expect("读取任务文件");
        assert!(saved.is_empty());
    }

    #[test]
    fn invalid_task_input_is_rejected() {
        let dir = TestDir::new();
        let store = AppStore::load(dir.0.clone()).expect("初始化存储");
        assert!(store.create_task(input(" ", "2026-11-18", None)).is_err());
        assert!(store
            .create_task(input("任务", "2026-02-30", None))
            .is_err());
        assert!(store
            .create_task(input("任务", "2026-11-18", Some("25:00")))
            .is_err());
        assert!(store.list_tasks().expect("列出任务").is_empty());
    }

    #[test]
    fn settings_are_validated_and_persisted() {
        let dir = TestDir::new();
        let store = AppStore::load(dir.0.clone()).expect("初始化存储");
        let settings = Settings {
            theme: "dark".into(),
            todo_color: "purple".into(),
            done_color: "gray".into(),
        };
        store.update_settings(settings.clone()).expect("保存配置");
        let reloaded = AppStore::load(dir.0.clone()).expect("重新读取存储");
        assert_eq!(reloaded.settings(), settings);

        let invalid = Settings {
            theme: "unknown".into(),
            ..Settings::default()
        };
        assert!(reloaded.update_settings(invalid).is_err());
    }
}

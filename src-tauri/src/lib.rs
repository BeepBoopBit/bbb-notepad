pub mod files;
pub mod pairs;
pub mod store;
#[cfg(feature = "desktop")]
mod desktop {
    use crate::store::{Note, Session, Store};
    use std::sync::Mutex;
    use tauri::{Manager, State};
    use tauri_plugin_dialog::DialogExt;
    #[tauri::command]
    pub fn update_status(app: tauri::AppHandle) -> serde_json::Value {
        let configured = app
            .config()
            .plugins
            .0
            .get("updater")
            .and_then(|config| config.get("endpoints"))
            .and_then(|value| value.as_array())
            .is_some_and(|urls| !urls.is_empty());
        serde_json::json!({"version":app.package_info().version.to_string(),"configured":configured})
    }
    #[tauri::command]
    pub async fn prepare_update(app: tauri::AppHandle) -> Result<(), String> {
        tauri::async_runtime::spawn_blocking(move || {
            let directory = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?
                .join("backups");
            std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|error| error.to_string())?
                .as_nanos();
            let path = directory.join(format!(
                "before-update-{}-{timestamp}.sqlite3",
                app.package_info().version
            ));
            let database = app.state::<Mutex<Store>>();
            database
                .lock()
                .map_err(|error| error.to_string())?
                .backup_to(&path)
                .map_err(|error| error.to_string())?;
            Ok(())
        })
        .await
        .map_err(|error| error.to_string())?
    }
    #[tauri::command]
    pub fn relaunch_after_update(app: tauri::AppHandle) {
        app.restart();
    }

    #[tauri::command]
    pub async fn open_text_file(
        app: tauri::AppHandle,
    ) -> Result<Option<crate::files::OpenedFile>, String> {
        tauri::async_runtime::spawn_blocking(move || {
            let Some(selected) = app
                .dialog()
                .file()
                .set_title("Open file as text")
                .blocking_pick_file()
            else {
                return Ok(None);
            };
            let path = selected.into_path().map_err(|e| e.to_string())?;
            crate::files::read_file(&path).map(Some)
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn save_text_file(
        app: tauri::AppHandle,
        content: String,
        suggested_name: String,
    ) -> Result<Option<String>, String> {
        tauri::async_runtime::spawn_blocking(move || {
            let Some(selected) = app
                .dialog()
                .file()
                .set_title("Save note as")
                .set_file_name(suggested_name)
                .blocking_save_file()
            else {
                return Ok(None);
            };
            let path = selected.into_path().map_err(|e| e.to_string())?;
            std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
            Ok(Some(
                path.file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
            ))
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[tauri::command]
    pub async fn load_session(db: State<'_, Mutex<Store>>) -> Result<Session, String> {
        db.lock()
            .map_err(|e| e.to_string())?
            .session()
            .map_err(|e| e.to_string())
    }
    #[tauri::command]
    pub async fn save_note(note: Note, db: State<'_, Mutex<Store>>) -> Result<(), String> {
        db.lock()
            .map_err(|e| e.to_string())?
            .save_note(&note)
            .map_err(|e| e.to_string())
    }
    #[tauri::command]
    pub async fn save_session(
        tabs: Vec<String>,
        active: Option<String>,
        db: State<'_, Mutex<Store>>,
    ) -> Result<(), String> {
        db.lock()
            .map_err(|e| e.to_string())?
            .save_session(&tabs, active.as_deref())
            .map_err(|e| e.to_string())
    }
    #[tauri::command]
    pub async fn search_notes(
        query: String,
        db: State<'_, Mutex<Store>>,
    ) -> Result<Vec<Note>, String> {
        db.lock()
            .map_err(|e| e.to_string())?
            .search(&query)
            .map_err(|e| e.to_string())
    }
    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_single_instance::init(
                |app, _arguments, _directory| {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                },
            ))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_dialog::init())
            .setup(|app| {
                let dir = app.path().app_data_dir()?;
                std::fs::create_dir_all(&dir)?;
                app.manage(Mutex::new(Store::open(&dir.join("notes.sqlite3"))?));
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                update_status,
                prepare_update,
                relaunch_after_update,
                open_text_file,
                save_text_file,
                load_session,
                save_note,
                save_session,
                search_notes
            ])
            .run(tauri::generate_context!())
            .expect("Unable to start bbb-notepad");
    }
}
#[cfg(feature = "desktop")]
pub use desktop::run;

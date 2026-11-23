pub mod files;
pub mod pairs;
pub mod store;
#[cfg(feature = "desktop")]
mod desktop {
    use crate::store::{Note, Session, Store};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    };
    use tauri::{Emitter, Manager, State, WebviewWindowBuilder};
    use tauri_plugin_dialog::DialogExt;

    #[derive(Clone, Copy)]
    enum WindowMode {
        Editor,
        Sticky,
    }
    impl WindowMode {
        fn from_args(args: impl IntoIterator<Item = String>) -> Self {
            args.into_iter()
                .skip(1)
                .find_map(|arg| match arg.as_str() {
                    "--sticky" => Some(Self::Sticky),
                    "--editor" => Some(Self::Editor),
                    _ => None,
                })
                .unwrap_or(Self::Editor)
        }
        fn label(self) -> &'static str {
            match self {
                Self::Editor => "main",
                Self::Sticky => "sticky",
            }
        }
    }

    #[derive(Default)]
    struct UpdateLock(AtomicBool);

    #[derive(Default)]
    struct EditorHandoff(Mutex<Option<String>>);

    #[cfg(target_os = "linux")]
    fn focus_hyprland_window(window: &tauri::WebviewWindow) {
        if std::env::var_os("HYPRLAND_INSTANCE_SIGNATURE").is_none() {
            return;
        }
        let Ok(title) = window.title() else { return };
        let title = serde_json::Value::String(title);
        let script = format!(
            r#"for _, window in ipairs(hl.get_windows()) do
                if window.class == "bnote" and window.title == {title} then
                    hl.dispatch(hl.dsp.focus({{window = window}}))
                    break
                end
            end"#
        );
        // Wayland can ignore GTK's request to activate an existing window.
        tauri::async_runtime::spawn_blocking(move || {
            let _ = std::process::Command::new("hyprctl")
                .args(["eval", &script])
                .output();
        });
    }

    fn show_window(app: &tauri::AppHandle, mode: WindowMode) -> Result<(), String> {
        if app.state::<UpdateLock>().0.load(Ordering::Acquire) {
            return Err("An update is being installed.".into());
        }
        let label = mode.label();
        if let Some(window) = app.get_webview_window(label) {
            window.show().map_err(|error| error.to_string())?;
            window.unminimize().map_err(|error| error.to_string())?;
            #[cfg(target_os = "linux")]
            focus_hyprland_window(&window);
            return window.set_focus().map_err(|error| error.to_string());
        }
        let config = app
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == label)
            .ok_or_else(|| format!("Missing window configuration for {label}"))?;
        WebviewWindowBuilder::from_config(app, config)
            .and_then(|builder| builder.build())
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    #[tauri::command]
    async fn open_bnote_window(
        app: tauri::AppHandle,
        sticky: bool,
        note_id: Option<String>,
    ) -> Result<(), String> {
        let mode = if sticky {
            WindowMode::Sticky
        } else {
            WindowMode::Editor
        };
        let (sender, receiver) = std::sync::mpsc::channel();
        let handle = app.clone();
        app.run_on_main_thread(move || {
            let result = show_window(&handle, mode).and_then(|()| {
                if let (WindowMode::Editor, Some(id)) = (mode, note_id) {
                    *handle
                        .state::<EditorHandoff>()
                        .0
                        .lock()
                        .map_err(|error| error.to_string())? = Some(id);
                    handle
                        .emit_to("main", "open-editor-note", ())
                        .map_err(|error| error.to_string())?;
                }
                Ok(())
            });
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
        tauri::async_runtime::spawn_blocking(move || receiver.recv())
            .await
            .map_err(|error| error.to_string())?
            .map_err(|error| error.to_string())?
    }

    #[tauri::command]
    fn begin_update(app: tauri::AppHandle) -> Result<(), String> {
        let lock = app.state::<UpdateLock>();
        lock.0.store(true, Ordering::Release);
        if let Some(window) = app.get_webview_window("sticky") {
            window.close().map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    #[tauri::command]
    fn cancel_update(lock: State<'_, UpdateLock>) {
        lock.0.store(false, Ordering::Release);
    }

    #[tauri::command]
    async fn take_editor_note(
        pending: State<'_, EditorHandoff>,
        db: State<'_, Mutex<Store>>,
    ) -> Result<Option<Note>, String> {
        let id = pending.0.lock().map_err(|error| error.to_string())?.take();
        let Some(id) = id else { return Ok(None) };
        db.lock()
            .map_err(|error| error.to_string())?
            .note(&id)
            .map_err(|error| error.to_string())
    }
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
    pub async fn load_session(
        sticky: bool,
        db: State<'_, Mutex<Store>>,
    ) -> Result<Session, String> {
        db.lock()
            .map_err(|e| e.to_string())?
            .session(sticky)
            .map_err(|e| e.to_string())
    }
    #[tauri::command]
    pub async fn save_note(
        note: Note,
        expected: Option<i64>,
        db: State<'_, Mutex<Store>>,
        app: tauri::AppHandle,
    ) -> Result<i64, String> {
        let saved = db
            .lock()
            .map_err(|error| error.to_string())?
            .save_note_checked(note, expected)
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "NOTE_CONFLICT".to_string())?;
        let _ = app.emit("note-changed", &saved);
        Ok(saved.updated)
    }
    #[tauri::command]
    pub async fn save_session(
        tabs: Vec<String>,
        active: Option<String>,
        sticky: bool,
        db: State<'_, Mutex<Store>>,
    ) -> Result<(), String> {
        db.lock()
            .map_err(|e| e.to_string())?
            .save_session(&tabs, active.as_deref(), sticky)
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
                |app, arguments, _directory| {
                    let handle = app.clone();
                    let mode = WindowMode::from_args(arguments);
                    let _ = app.run_on_main_thread(move || {
                        if let Err(error) = show_window(&handle, mode) {
                            eprintln!("Could not open bnote: {error}");
                        }
                    });
                },
            ))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_dialog::init())
            .setup(|app| {
                let dir = app.path().app_data_dir()?;
                std::fs::create_dir_all(&dir)?;
                app.manage(Mutex::new(Store::open(&dir.join("notes.sqlite3"))?));
                app.manage(UpdateLock::default());
                app.manage(EditorHandoff::default());
                show_window(app.handle(), WindowMode::from_args(std::env::args()))?;
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                update_status,
                prepare_update,
                relaunch_after_update,
                open_bnote_window,
                begin_update,
                cancel_update,
                take_editor_note,
                open_text_file,
                save_text_file,
                load_session,
                save_note,
                save_session,
                search_notes
            ])
            .run(tauri::generate_context!())
            .expect("Unable to start bnote");
    }
}
#[cfg(feature = "desktop")]
pub use desktop::run;

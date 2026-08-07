mod native_desktop;
mod storage;

use std::sync::Mutex;

use storage::{Card, Database, NewCard, Workspace};
use tauri::{Manager, State};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

struct AppState {
    database: Mutex<Database>,
}

struct DesktopLayerState {
    mode: Mutex<native_desktop::Mode>,
}

#[tauri::command]
fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<Workspace>, String> {
    state
        .database
        .lock()
        .map_err(|_| "Workspace storage is unavailable".to_string())?
        .list_workspaces()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_workspace(name: String, state: State<'_, AppState>) -> Result<Workspace, String> {
    state.database.lock().map_err(|_| "Workspace storage is unavailable".to_string())?.create_workspace(name).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_cards(workspace_id: String, state: State<'_, AppState>) -> Result<Vec<Card>, String> {
    state.database.lock().map_err(|_| "Workspace storage is unavailable".to_string())?.list_cards(workspace_id).map_err(|error| error.to_string())
}

#[tauri::command]
fn create_card(card: NewCard, state: State<'_, AppState>) -> Result<Card, String> {
    state.database.lock().map_err(|_| "Workspace storage is unavailable".to_string())?.create_card(card).map_err(|error| error.to_string())
}

#[tauri::command]
fn update_card(card: Card, state: State<'_, AppState>) -> Result<(), String> {
    state.database.lock().map_err(|_| "Workspace storage is unavailable".to_string())?.update_card(card).map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_card(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.database.lock().map_err(|_| "Workspace storage is unavailable".to_string())?.delete_card(id).map_err(|error| error.to_string())
}

pub fn run() {
    let workspace_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Digit0);
    let shortcut_to_handle = workspace_shortcut.clone();
    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcut(workspace_shortcut)
        .expect("Option+0 must be a valid global shortcut")
        .with_handler(move |app, shortcut, event| {
            if shortcut != &shortcut_to_handle || event.state() != ShortcutState::Pressed {
                return;
            }

            let app_handle = app.clone();
            let _ = app.run_on_main_thread(move || {
               let mode = {
    let state = app_handle.state::<DesktopLayerState>();

    let result = match state.mode.lock() {
        Ok(mut mode) => mode.toggle(),
        Err(_) => {
            eprintln!("Floatspace desktop layer state is unavailable");
            return;
        }
    };

    result
};
                let Some(window) = app_handle.get_webview_window("main") else {
                    eprintln!("Floatspace main window is unavailable");
                    return;
                };
                if let Err(error) = native_desktop::apply_mode(&window, mode) {
                    eprintln!("Floatspace could not change desktop layer mode: {error}");
                }
            });
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(shortcut_plugin)
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database = Database::open(data_dir.join("floatspace.sqlite"))?;
            app.manage(AppState {
                database: Mutex::new(database),
            });
            app.manage(DesktopLayerState {
                mode: Mutex::new(native_desktop::Mode::Desktop),
            });
            let window = app
                .get_webview_window("main")
                .ok_or("The main Floatspace window is unavailable")?;
            native_desktop::configure(&window)?;
            window.show()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_workspaces, create_workspace, list_cards, create_card, update_card, delete_card])
        .run(tauri::generate_context!())
        .expect("error while running Floatspace");
}

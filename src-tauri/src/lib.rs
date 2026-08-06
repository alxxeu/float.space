mod storage;

use std::sync::Mutex;

use storage::{Card, Database, NewCard, Workspace};
use tauri::{Manager, State};

struct AppState {
    database: Mutex<Database>,
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database = Database::open(data_dir.join("floatspace.sqlite"))?;
            app.manage(AppState {
                database: Mutex::new(database),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![list_workspaces, create_workspace, list_cards, create_card, update_card, delete_card])
        .run(tauri::generate_context!())
        .expect("error while running Floatspace");
}

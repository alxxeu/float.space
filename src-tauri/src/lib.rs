mod native_desktop;
mod storage;

use std::sync::Mutex;

use storage::{Card, Database, NewCard, Workspace};
use tauri::{Emitter, Manager, State};
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

#[tauri::command]
fn update_workspace(
    id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "Workspace storage is unavailable".to_string())?
        .update_workspace(id, name)
        .map_err(|error| error.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OnboardingState {
    completed: bool,
    step: i64,
}

#[tauri::command]
fn load_onboarding(
    state: State<'_, AppState>,
) -> Result<OnboardingState, String> {
    let (completed, step) = state
        .database
        .lock()
        .map_err(|_| "Onboarding storage is unavailable".to_string())?
        .load_onboarding()
        .map_err(|error| error.to_string())?;

    Ok(OnboardingState { completed, step })
}

#[tauri::command]
fn save_onboarding(
    completed: bool,
    step: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "Onboarding storage is unavailable".to_string())?
        .save_onboarding(completed, step)
        .map_err(|error| error.to_string())
}

pub fn run() {
   let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
    .with_shortcuts([
        Shortcut::new(Some(Modifiers::ALT), Code::Digit1),
        Shortcut::new(Some(Modifiers::ALT), Code::Digit2),
        Shortcut::new(Some(Modifiers::ALT), Code::Digit3),
        Shortcut::new(Some(Modifiers::ALT), Code::Digit4),
        Shortcut::new(Some(Modifiers::ALT), Code::Digit5),
        Shortcut::new(Some(Modifiers::ALT), Code::Digit6),
        Shortcut::new(Some(Modifiers::ALT), Code::Digit7),
        Shortcut::new(Some(Modifiers::ALT), Code::Digit8),
        Shortcut::new(Some(Modifiers::ALT), Code::Digit9),
    ])
    .expect("Floatspace shortcuts must be valid")
    .with_handler(move |app, shortcut, event| {
        if event.state() != ShortcutState::Pressed {
            return;
        }

        let app_handle = app.clone();
        let shortcut = shortcut.clone();

        let _ = app.run_on_main_thread(move || {
            let Some(window) = app_handle.get_webview_window("main") else {
                eprintln!("Floatspace main window is unavailable");
                return;
            };

            // ⌥1 = normal macOS Desktop
         if shortcut == Shortcut::new(Some(Modifiers::ALT), Code::Digit1) {
    let state = app_handle.state::<DesktopLayerState>();

    let needs_desktop_mode = match state.mode.lock() {
        Ok(mut mode) => {
             if *mode == native_desktop::Mode::Desktop {
                false
            } else {
                *mode = native_desktop::Mode::Desktop;
                true
            }
        }
        Err(_) => {
            eprintln!("Floatspace desktop layer state is unavailable");
            return;
        }
    };

  if needs_desktop_mode {
        if let Err(error) = native_desktop::apply_mode(&window, native_desktop::Mode::Desktop) {
            eprintln!("Floatspace could not enter Desktop mode: {error}");
            return;
        }
    
    if let Err(error) = native_desktop::set_desktop_icons_visible(true) {
    eprintln!("Floatspace could not show desktop icons: {error}");
}
}

    if let Err(error) = app_handle.emit("switch-workspace", 1u8) {
        eprintln!("Floatspace could not switch to Desktop: {error}");
    }

    return;
}

            // ⌥2–⌥9 = Floatspace spaces
            let slot = match shortcut {
                s if s == Shortcut::new(Some(Modifiers::ALT), Code::Digit2) => 2,
                s if s == Shortcut::new(Some(Modifiers::ALT), Code::Digit3) => 3,
                s if s == Shortcut::new(Some(Modifiers::ALT), Code::Digit4) => 4,
                s if s == Shortcut::new(Some(Modifiers::ALT), Code::Digit5) => 5,
                s if s == Shortcut::new(Some(Modifiers::ALT), Code::Digit6) => 6,
                s if s == Shortcut::new(Some(Modifiers::ALT), Code::Digit7) => 7,
                s if s == Shortcut::new(Some(Modifiers::ALT), Code::Digit8) => 8,
                s if s == Shortcut::new(Some(Modifiers::ALT), Code::Digit9) => 9,
                _ => return,
            };

           let state = app_handle.state::<DesktopLayerState>();

let needs_workspace_mode = match state.mode.lock() {
    Ok(mut mode) => {
        if *mode == native_desktop::Mode::Workspace {
            false
        } else {
            *mode = native_desktop::Mode::Workspace;
            true
        }
    }
    Err(_) => {
        eprintln!("Floatspace desktop layer state is unavailable");
        return;
    }
};

if needs_workspace_mode {
    if let Err(error) = native_desktop::apply_mode(
        &window,
        native_desktop::Mode::Workspace,
    ) {
        eprintln!("Floatspace could not enter Workspace mode: {error}");
        return;
    }

    if let Err(error) = native_desktop::set_desktop_icons_visible(false) {
        eprintln!("Floatspace could not hide desktop icons: {error}");
    }
}

if let Err(error) = app_handle.emit("switch-workspace", slot) {
    eprintln!("Floatspace could not switch workspace: {error}");
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
        
       .invoke_handler(tauri::generate_handler![
    list_workspaces,
    create_workspace,
    update_workspace,
    list_cards,
    create_card,
    update_card,
    delete_card,
    load_onboarding,
    save_onboarding
])
        .run(tauri::generate_context!())
        .expect("error while running Floatspace");
}

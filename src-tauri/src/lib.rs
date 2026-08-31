mod native_desktop;
mod spotlight;
mod storage;

use std::sync::Mutex;
use storage::{Card, Database, NewCard, Workspace};
use tauri::menu::{Menu, MenuItem, Submenu};
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
    state
        .database
        .lock()
        .map_err(|_| "Workspace storage is unavailable".to_string())?
        .create_workspace(name)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn list_cards(workspace_id: String, state: State<'_, AppState>) -> Result<Vec<Card>, String> {
    state
        .database
        .lock()
        .map_err(|_| "Workspace storage is unavailable".to_string())?
        .list_cards(workspace_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_card(card: NewCard, state: State<'_, AppState>) -> Result<Card, String> {
    let created = state
        .database
        .lock()
        .map_err(|_| "Workspace storage is unavailable".to_string())?
        .create_card(card)
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    if let Err(error) = spotlight::index_card(&created) {
        eprintln!("SPOTLIGHT: failed to index card: {error}");
    }

    Ok(created)
}

#[tauri::command]
fn update_card(card: Card, state: State<'_, AppState>) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "Workspace storage is unavailable".to_string())?
        .update_card(card.clone())
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    if let Err(error) = spotlight::index_card(&card) {
        eprintln!("SPOTLIGHT: failed to update card: {error}");
    }

    Ok(())
}

#[tauri::command]
fn delete_card(id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "Workspace storage is unavailable".to_string())?
        .delete_card(id.clone())
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    if let Err(error) = spotlight::delete_card(&id) {
        eprintln!("SPOTLIGHT: failed to delete card: {error}");
    }

    Ok(())
}

#[tauri::command]
fn update_workspace(
    id: String,
    name: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let db = state.database.lock().map_err(|_| "Storage is unavailable")?;
    
    // Обновляем в БД
    db.update_workspace(id.clone(), name.clone()).map_err(|e| e.to_string())?;
    
    // Синхронизируем с верхним меню macOS
    if let Ok(workspaces) = db.list_workspaces() {
        if let Some(ws) = workspaces.iter().find(|w| w.id == id) {
            let item_id = format!("space-{}", ws.slot);
            
            if let Some(menu) = app.menu() {
                if let Some(item) = menu.get(&item_id) {
                    // Исправлено: Some вместо Ok
                    if let Some(menu_item) = item.as_menuitem() {
                        let _ = menu_item.set_text(name);
                    }
                }
            }
        }
    }
    
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OnboardingState {
    completed: bool,
    step: i64,
}

#[tauri::command]
fn load_onboarding(state: State<'_, AppState>) -> Result<OnboardingState, String> {
    let (completed, step) = state
        .database
        .lock()
        .map_err(|_| "Onboarding storage is unavailable".to_string())?
        .load_onboarding()
        .map_err(|error| error.to_string())?;

    Ok(OnboardingState { completed, step })
}

#[tauri::command]
fn save_onboarding(completed: bool, step: i64, state: State<'_, AppState>) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "Onboarding storage is unavailable".to_string())?
        .save_onboarding(completed, step)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn minimize_other_windows() -> Result<(), String> {
    native_desktop::minimize_other_windows().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_overlay_mode(
    enabled: bool,
    restore_to_workspace: bool,
    state: State<'_, DesktopLayerState>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let mode = if enabled {
        native_desktop::Mode::Workspace
    } else if restore_to_workspace {
        native_desktop::Mode::Workspace
    } else {
        native_desktop::Mode::Desktop
    };

    *state
        .mode
        .lock()
        .map_err(|_| "Failed to lock desktop layer state".to_string())? = mode;

    native_desktop::apply_mode(&window, mode).map_err(|error| error.to_string())?;

    Ok(())
}

#[tauri::command]
fn bring_floatspace_to_front(window: tauri::WebviewWindow) -> Result<(), String> {
    native_desktop::bring_to_front(&window).map_err(|error| error.to_string())
}

#[tauri::command]
fn quit_app() {
    std::process::exit(0);
}

#[tauri::command]
fn take_pending_spotlight_card(state: State<'_, spotlight::PendingCardState>) -> Option<String> {
    spotlight::take_pending_card(state)
}

#[tauri::command]
fn activate_floatspace() -> Result<(), String> {
    native_desktop::activate_app().map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
extern "C" {
    fn authenticate_user(reason: *const std::ffi::c_char) -> bool;
}

#[tauri::command]
fn authenticate_card() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        let reason = std::ffi::CString::new("Unlock secret card in Floatspace").unwrap();
        let success = unsafe { authenticate_user(reason.as_ptr()) };
        Ok(success)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(true) // Фолбек для других ОС
    }
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
                        if let Err(error) =
                            native_desktop::apply_mode(&window, native_desktop::Mode::Desktop)
                        {
                            eprintln!("Floatspace could not enter Desktop mode: {error}");
                            return;
                        }
                    }

                    if let Err(error) = app_handle.emit("switch-workspace", 1u8) {
                        eprintln!("Floatspace could not switch to Desktop: {error}");
                    }

                    return;
                }

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
                    if let Err(error) =
                        native_desktop::apply_mode(&window, native_desktop::Mode::Workspace)
                    {
                        eprintln!("Floatspace could not enter Workspace mode: {error}");
                        return;
                    }
                }

                if let Err(error) = app_handle.emit("switch-workspace", slot) {
                    eprintln!("Floatspace could not switch workspace: {error}");
                }
            });
        })
        .build();

    tauri::Builder::default()
       
        .on_menu_event(|app, event| {
            let Some(slot) = event.id().as_ref().strip_prefix("space-")
                .and_then(|slot| slot.parse::<u8>().ok())
            else {
                return;
            };

            if !(2..=9).contains(&slot) {
                return;
            }

            let Some(window) = app.get_webview_window("main") else {
                return;
            };

            let state = app.state::<DesktopLayerState>();
            if let Ok(mut mode) = state.mode.lock() {
                *mode = native_desktop::Mode::Workspace;
            }

            if native_desktop::apply_mode(&window, native_desktop::Mode::Workspace).is_ok() {
                let _ = app.emit("switch-workspace", slot);
            }
        })
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            println!("SINGLE INSTANCE:\nargv: {:?}\ncwd: {:?}", argv, cwd);

            for arg in argv {
                let Some(card_id) = arg.strip_prefix("floatspace://card/") else {
                    continue;
                };

                println!("SINGLE INSTANCE → CARD: {}", card_id);

{
    let state = app.state::<spotlight::PendingCardState>();
    let mut pending = state.card_id.lock().unwrap();
    *pending = Some(card_id.to_string());
    println!("SINGLE INSTANCE → PENDING CARD SAVED: {}", card_id);
}


                if let Err(error) = app.emit("open-card-from-spotlight", card_id.to_string()) {
                    eprintln!("SINGLE INSTANCE → EVENT ERROR: {}", error);
                } else {
                    println!("SINGLE INSTANCE → EVENT EMITTED: {}", card_id);
                }
            }
        }))
        .plugin(shortcut_plugin)
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;

            app.manage(spotlight::PendingCardState {
                card_id: Mutex::new(None),
            });

            // === АДАПТАЦИЯ ЭКРАНА И МАСШТАБА ===
            if let Some(window) = app.get_webview_window("main") {
                let _ = native_desktop::configure(&window);

                let w_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::ScaleFactorChanged { .. } = event {
                        let _ = native_desktop::configure(&w_clone);
                    }
                });
            }

            // === COLD START DEEP LINK ===
            if let Some(urls) = app.deep_link().get_current()? {
                println!("DEEP LINK START URLS: {:?}", urls);

                for url in urls {
                    if url.scheme() != "floatspace" || url.host_str() != Some("card") {
                        continue;
                    }

                    let Some(card_id) = url.path_segments().and_then(|mut s| s.next()) else {
                        continue;
                    };

                    println!("FLOATSPACE START CARD: {}", card_id);

                    let state = app.state::<spotlight::PendingCardState>();
              let mut pending = state.card_id.lock().unwrap();
    *pending = Some(card_id.to_string());
    println!("SPOTLIGHT → PENDING CARD SAVED: {}", card_id);
                }
            }

            // === WARM START DEEP LINK ===
            #[cfg(desktop)]
            {
                let app_handle = app.handle().clone();

                app.deep_link().on_open_url(move |event| {
                    println!("DEEP LINK EVENT RECEIVED");

                    for url in event.urls() {
                        if url.scheme() != "floatspace" || url.host_str() != Some("card") {
                            continue;
                        }

                        let Some(card_id) = url.path_segments().and_then(|mut s| s.next()) else {
                            continue;
                        };

                        println!("FLOATSPACE OPEN CARD: {}", card_id);

                       {
    let state = app_handle.state::<spotlight::PendingCardState>();
    let mut pending = state.card_id.lock().unwrap();
    *pending = Some(card_id.to_string());
    println!("SPOTLIGHT → PENDING CARD SAVED: {}", card_id);
}


                        if let Err(error) = app_handle.emit("open-card-from-spotlight", card_id.to_string()) {
                            eprintln!("SPOTLIGHT → EMIT ERROR: {}", error);
                        } else {
                            println!("SPOTLIGHT → EVENT EMITTED: {}", card_id);
                        }
                    }
                });
            }

            // === ИНИЦИАЛИЗАЦИЯ СУБД SQLite И ИНДЕКСОВ ===
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

         let database = Database::open(data_dir.join("floatspace.sqlite"))?;

// --- ДИНАМИЧЕСКОЕ МЕНЮ ---
let workspaces = database.list_workspaces().unwrap_or_default();
let menu = tauri::menu::Menu::default(app.handle())?;
let mut space_items = Vec::new();

for slot in 2..=9 {
    // Ищем спэйс по слоту, иначе дефолтное название
    let name = workspaces.iter()
        .find(|w| w.slot == slot as i64) // slot в БД у тебя i64
        .map(|w| w.name.clone())
        .unwrap_or_else(|| format!("Space {}", slot - 1));

    let id = format!("space-{}", slot);
    let accelerator = format!("Alt+{}", slot);
    
    let item = tauri::menu::MenuItem::with_id(
        app.handle(),
        &id,
        &name,
        true,
        Some(&accelerator)
    )?;
    
    space_items.push(item);
}

let items_refs: Vec<&dyn tauri::menu::IsMenuItem<_>> = space_items
    .iter()
    .map(|i| i as &dyn tauri::menu::IsMenuItem<_>)
    .collect();

let spaces_submenu = tauri::menu::Submenu::with_items(
    app.handle(),
    "Spaces",
    true,
    &items_refs,
)?;

menu.append(&spaces_submenu)?;
app.handle().set_menu(menu)?;

            #[cfg(target_os = "macos")]
            {
                spotlight::install_callback(app.handle().clone());

                if let Err(error) = spotlight::install_hook() {
                    eprintln!("SPOTLIGHT: failed to install native hook: {error}");
                }

                if let Err(error) = spotlight::clear() {

                eprintln!("SPOTLIGHT: failed to clear existing index: {error}");
            }

            if let Ok(workspaces) = database.list_workspaces() {
                for workspace in workspaces {
                    if let Ok(cards) = database.list_cards(workspace.id.clone()) {
                        for card in cards {
                            if let Err(error) = spotlight::index_card(&card) {
                                eprintln!("SPOTLIGHT: failed to index card {}: {}", card.id, error);
                            }
                        }
                    }
                }
            }
        }

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
        set_overlay_mode,
        minimize_other_windows,
        list_cards,
        create_card,
        update_card,
        delete_card,
        load_onboarding,
        save_onboarding,
        take_pending_spotlight_card,
        activate_floatspace,
        bring_floatspace_to_front,
        quit_app,
        authenticate_card
    ])
    .run(tauri::generate_context!())
    .expect("error while running Floatspace");
}

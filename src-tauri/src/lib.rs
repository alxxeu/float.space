mod native_desktop;
mod spotlight;
mod storage;

use std::{
    sync::Mutex,
};

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
fn update_workspace(id: String, name: String, state: State<'_, AppState>) -> Result<(), String> {
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
    let mode =
        if enabled {
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

    native_desktop::apply_mode(&window, mode)
        .map_err(|error| error.to_string())?;

    #[cfg(target_os = "macos")]
    {
        match mode {
            native_desktop::Mode::Workspace => {
                native_desktop::set_desktop_icons_visible(false)
                    .map_err(|error| error.to_string())?;
}
            native_desktop::Mode::Desktop => {
                native_desktop::set_desktop_icons_visible(true)
                    .map_err(|error| error.to_string())?;
            }
        }
    }

    Ok(())
}

#[tauri::command]
fn quit_app() {
    std::process::exit(0);
}

#[tauri::command]
fn take_pending_spotlight_card(
    state: State<'_, spotlight::PendingCardState>,
) -> Option<String> {
    spotlight::take_pending_card(state)
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

                // ⌥1 = обычный macOS Desktop
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
                            eprintln!(
                                "Floatspace desktop layer state is unavailable"
                            );
                            return;
                        }
                    };

                    if needs_desktop_mode {
                        if let Err(error) =
                            native_desktop::apply_mode(
                                &window,
                                native_desktop::Mode::Desktop,
                            )
                        {
                            eprintln!(
                                "Floatspace could not enter Desktop mode: {error}"
                            );
                            return;
                        }

                        if let Err(error) =
                            native_desktop::set_desktop_icons_visible(true)
                        {
                            eprintln!(
                                "Floatspace could not show desktop icons: {error}"
                            );
                        }
                    }

                    if let Err(error) =
                        app_handle.emit("switch-workspace", 1u8)
                    {
                        eprintln!(
                            "Floatspace could not switch to Desktop: {error}"
                        );
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
                        eprintln!(
                            "Floatspace desktop layer state is unavailable"
                        );
                        return;
                    }
                };

                if needs_workspace_mode {
                    if let Err(error) =
                        native_desktop::apply_mode(
                            &window,
                            native_desktop::Mode::Workspace,
                        )
                    {
                        eprintln!(
                            "Floatspace could not enter Workspace mode: {error}"
                        );
                        return;
                    }

                    if let Err(error) =
                        native_desktop::set_desktop_icons_visible(false)
                    {
                        eprintln!(
                            "Floatspace could not hide desktop icons: {error}"
                        );
                    }
                }

                if let Err(error) =
                    app_handle.emit("switch-workspace", slot)
                {
                    eprintln!(
                        "Floatspace could not switch workspace: {error}"
                    );
                }
            });
        })
        .build();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_autostart::Builder::new().build()
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
            tauri_plugin_single_instance::init(
                |app, argv, cwd| {
                    println!("SINGLE INSTANCE:");
                    println!("argv: {:?}", argv);
                    println!("cwd: {:?}", cwd);

                    for arg in argv {
                        let Some(card_id) =
                            arg.strip_prefix("floatspace://card/")
                        else {
                            continue;
                        };

                        println!(
                            "SINGLE INSTANCE → CARD: {}",
                            card_id
                        );

                        {
                            let state =
                                app.state::<spotlight::PendingCardState>();

                            let lock_result = state.card_id.lock();
                            match lock_result {
                                Ok(mut pending) => {
                                    *pending =
                                        Some(card_id.to_string());

                                    println!(
                                        "SINGLE INSTANCE → PENDING CARD SAVED: {}",
                                        card_id
                                    );
                                }
                                Err(_) => {
                                    eprintln!(
                                        "SINGLE INSTANCE → FAILED TO LOCK PENDING STATE"
                                    );
                                }
                            }
                        }

                        match app.emit(
                            "open-card-from-spotlight",
                            card_id.to_string(),
                        ) {
                            Ok(_) => {
                                println!(
                                    "SINGLE INSTANCE → EVENT EMITTED: {}",
                                    card_id
                                );
                            }
                            Err(error) => {
                                eprintln!(
                                    "SINGLE INSTANCE → EVENT ERROR: {}",
                                    error
                                );
                            }
                        }
                    }
                },
            )
        )
        .plugin(shortcut_plugin)
        .setup(|app| {
            use tauri_plugin_deep_link::DeepLinkExt;

            // Этот state должен существовать до обработки deep link.
            app.manage(spotlight::PendingCardState {
                card_id: Mutex::new(None),
            });

            /*
             * COLD START
             *
             * Если Floatspace ещё не запущен и macOS запускает его
             * через floatspace://card/<id>, deep-link лежит здесь.
             */
            if let Some(urls) = app.deep_link().get_current()? {
                println!(
                    "DEEP LINK START URLS: {:?}",
                    urls
                );

                for url in urls {
                    println!(
                        "DEEP LINK START URL: {}",
                        url
                    );

                    if url.scheme() != "floatspace" {
                        continue;
                    }

                    if url.host_str() != Some("card") {
                        continue;
                    }

                    let Some(card_id) = url
                        .path_segments()
                        .and_then(|mut segments| segments.next())
                    else {
                        continue;
                    };

                    println!(
                        "FLOATSPACE START CARD: {}",
                        card_id
                    );

                    {
                        let state =
                            app.state::<spotlight::PendingCardState>();

                        let lock_result = state.card_id.lock();
                        match lock_result {
                            Ok(mut pending) => {
                                *pending =
                                    Some(card_id.to_string());

                                println!(
                                    "SPOTLIGHT → PENDING CARD SAVED: {}",
                                    card_id
                                );
                            }
                            Err(_) => {
                                eprintln!(
                                    "SPOTLIGHT → FAILED TO LOCK PENDING STATE"
                                );
                            }
                        }
                    }
                }
            }

            /*
             * WARM START
             *
             * Floatspace уже запущен, а macOS передаёт ему
             * новый deep link.
             */
            #[cfg(desktop)]
            {
                let app_handle = app.handle().clone();

                app.deep_link().on_open_url(
                    move |event| {
                        println!(
                            "DEEP LINK EVENT RECEIVED"
                        );

                        for url in event.urls() {
                            println!(
                                "DEEP LINK URL: {}",
                                url
                            );

                            if url.scheme() != "floatspace" {
                                continue;
                            }

                            if url.host_str() != Some("card") {
                                continue;
                            }

                            let Some(card_id) = url
                                .path_segments()
                                .and_then(|mut segments| {
                                    segments.next()
                                })
                            else {
                                continue;
                            };

                            println!(
                                "FLOATSPACE OPEN CARD: {}",
                                card_id
                            );

                            /*
                             * Всегда сохраняем pending.
                             *
                             * Это важно: React listener может ещё
                             * не существовать в момент emit.
                             */
                            {
                                let state =
                                    app_handle
                                        .state::<spotlight::PendingCardState>();

                                let lock_result = state.card_id.lock();
                                match lock_result {
                                    Ok(mut pending) => {
                                        *pending =
                                            Some(card_id.to_string());

                                        println!(
                                            "SPOTLIGHT → PENDING CARD SAVED: {}",
                                            card_id
                                        );
                                    }
                                    Err(_) => {
                                        eprintln!(
                                            "SPOTLIGHT → FAILED TO LOCK PENDING STATE"
                                        );
                                    }
                                }
                            }

                            /*
                             * Если React уже слушает событие —
                             * карточка откроется сразу.
                             *
                             * Если нет — pending state заберёт
                             * её позже.
                             */
                            match app_handle.emit(
                                "open-card-from-spotlight",
                                card_id.to_string(),
                            ) {
                                Ok(_) => {
                                    println!(
                                        "SPOTLIGHT → EVENT EMITTED: {}",
                                        card_id
                                    );
                                }
                                Err(error) => {
                                    eprintln!(
                                        "SPOTLIGHT → EMIT ERROR: {}",
                                        error
                                    );
                                }
                            }
                        }
                    },
                );
            }

            let data_dir =
                app.path().app_data_dir()?;

            std::fs::create_dir_all(
                &data_dir
            )?;

            let database =
                Database::open(
                    data_dir.join("floatspace.sqlite")
                )?;

            #[cfg(target_os = "macos")]
            {
                spotlight::install_callback(app.handle().clone());

                if let Err(error) = spotlight::install_hook() {
                    eprintln!("SPOTLIGHT: failed to install native hook: {error}");
                }

                if let Err(error) = spotlight::clear() {
                    eprintln!("SPOTLIGHT: failed to clear existing index: {error}");
                }

                match database.list_workspaces() {
                    Ok(workspaces) => {
                        for workspace in workspaces {
                            match database.list_cards(
                                workspace.id.clone()
                            ) {
                                Ok(cards) => {
                                    for card in cards {
                                        if let Err(error) =
                                            spotlight::index_card(&card)
                                        {
                                            eprintln!(
                                                "SPOTLIGHT: failed to index existing card {}: {}",
                                                card.id,
                                                error
                                            );
                                        }
                                    }
                                }

                                Err(error) => {
                                    eprintln!(
                                        "SPOTLIGHT: failed to load cards for workspace {}: {}",
                                        workspace.id,
                                        error
                                    );
                                }
                            }
                        }
                    }

                    Err(error) => {
                        eprintln!(
                            "SPOTLIGHT: failed to load workspaces: {error}"
                        );
                    }
                }
            }

            app.manage(AppState {
                database: Mutex::new(database),
            });

            app.manage(DesktopLayerState {
                mode: Mutex::new(
                    native_desktop::Mode::Desktop
                ),
            });

            let window = app
                .get_webview_window("main")
                .ok_or(
                    "The main Floatspace window is unavailable"
                )?;

            native_desktop::configure(
                &window
            )?;

            window.show()?;

            Ok(())
        })
        .invoke_handler(
            tauri::generate_handler![
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
                quit_app
            ]
        )
        .run(
            tauri::generate_context!()
        )
        .expect(
            "error while running Floatspace"
        );
}

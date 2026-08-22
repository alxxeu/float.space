use tauri::{Runtime, WebviewWindow};

/// Desktop mode:
/// Floatspace находится под обычными окнами и не принимает мышь.
///
/// Workspace mode:
/// Floatspace находится над рабочим столом, но ниже обычных приложений,
/// и принимает мышь.
///
/// Важно:
/// здесь намеренно НЕТ focus/activate/makeKeyAndOrderFront.
/// Именно это было в ранней рабочей версии.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Desktop,
    Workspace,
}

pub fn configure<R: Runtime>(
    window: &WebviewWindow<R>,
) -> tauri::Result<()> {
    if let Some(monitor) = window.current_monitor()? {
        window.set_position(*monitor.position())?;
        window.set_size(*monitor.size())?;
    }

    apply_mode(window, Mode::Desktop)
}

#[cfg(target_os = "macos")]
pub fn activate_app() -> tauri::Result<()> {
    use objc2_app_kit::{
        NSApplicationActivationOptions,
        NSRunningApplication,
    };

    let app = NSRunningApplication::currentApplication();

    let activated =
        app.activateWithOptions(NSApplicationActivationOptions::empty());

    if !activated {
        return Err(tauri::Error::AssetNotFound(
            "Floatspace activation was rejected by macOS".into(),
        ));
    }

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn activate_app() -> tauri::Result<()> {
    Ok(())
}

pub fn apply_mode<R: Runtime>(
    window: &WebviewWindow<R>,
    mode: Mode,
) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        apply_macos_mode(window, mode)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, mode);
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_macos_mode<R: Runtime>(
    window: &WebviewWindow<R>,
    mode: Mode,
) -> tauri::Result<()> {
    use objc2_app_kit::{
        NSColor,
        NSWindow,
        NSWindowCollectionBehavior,
    };

    use objc2_core_graphics::{
        CGWindowLevelForKey,
        CGWindowLevelKey,
    };

    let raw_window = window.ns_window()?;

    let native_window =
        unsafe { &*raw_window.cast::<NSWindow>() };

    // Floatspace — прозрачное окно без стандартной тени.
    native_window.setOpaque(false);

    native_window.setBackgroundColor(
        Some(&NSColor::clearColor()),
    );

    native_window.setHasShadow(false);

native_window.setCollectionBehavior(
    NSWindowCollectionBehavior::IgnoresCycle,
);

    let desktop_icon_level =
        CGWindowLevelForKey(
            CGWindowLevelKey::DesktopIconWindowLevelKey,
        );

    match mode {
        Mode::Desktop => {
            // Ниже слоя иконок Finder.
            //
            // Поэтому:
            // - Floatspace визуально находится на рабочем столе;
            // - иконки Finder находятся поверх него;
            // - Floatspace не получает мышь.
            native_window.setLevel(
                (desktop_icon_level - 1) as isize,
            );

            native_window.setIgnoresMouseEvents(true);
        }

        Mode::Workspace => {
            // Выше desktop icon layer,
            // но НЕ Floating и НЕ NSNormalWindowLevel + 1.
            //
            // Это принципиально:
            // мы не делаем Floatspace активным приложением
            // и не вызываем makeKeyAndOrderFront.
            native_window.setLevel(
                (desktop_icon_level + 1) as isize,
            );

            native_window.setIgnoresMouseEvents(false);
        }
    }

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn minimize_other_windows() -> std::io::Result<()> {
    std::process::Command::new("osascript")
        .args([
            "-e",
            r#"
            tell application "System Events"
                repeat with p in application processes
                    if (name of p) is not "Floatspace" and (background only of p) is false then
                        try
                            set visible of p to false
                        end try
                    end if
                end repeat
            end tell
            "#,
        ])
        .status()?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn minimize_other_windows() -> std::io::Result<()> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn bring_to_front<R: Runtime>(
    window: &WebviewWindow<R>,
) -> tauri::Result<()> {
    use objc2_app_kit::NSWindow;

    let raw_window = window.ns_window()?;
    let native_window =
        unsafe { &*raw_window.cast::<NSWindow>() };

    native_window.makeKeyAndOrderFront(None);

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn bring_to_front<R: Runtime>(
    _window: &WebviewWindow<R>,
) -> tauri::Result<()> {
    Ok(())
}

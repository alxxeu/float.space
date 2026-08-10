use tauri::{Runtime, WebviewWindow};

/// Desktop mode lets Finder receive input. Workspace mode is the temporary,
/// deliberate state in which Floatspace receives pointer events.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Desktop,
    Workspace,
    Overlay,
}

pub fn configure<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    if let Some(monitor) = window.current_monitor()? {
        window.set_position(*monitor.position())?;
        window.set_size(*monitor.size())?;
    }

    apply_mode(window, Mode::Desktop)
}

pub fn apply_mode<R: Runtime>(window: &WebviewWindow<R>, mode: Mode) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    apply_macos_mode(window, mode)?;

    #[cfg(not(target_os = "macos"))]
    let _ = (window, mode);

    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_macos_mode<R: Runtime>(window: &WebviewWindow<R>, mode: Mode) -> tauri::Result<()> {
    use objc2_app_kit::{NSColor, NSWindow, NSWindowCollectionBehavior};
    use objc2_core_graphics::{CGWindowLevelForKey, CGWindowLevelKey};

    let raw_window = window.ns_window()?;
    // Tauri supplies the system-owned NSWindow on the main thread; it remains
    // valid for the life of the WebviewWindow.
    let native_window = unsafe { &*raw_window.cast::<NSWindow>() };

    native_window.setOpaque(false);
    native_window.setBackgroundColor(Some(&NSColor::clearColor()));
    native_window.setHasShadow(false);
    native_window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );

    let desktop_icon_level = CGWindowLevelForKey(CGWindowLevelKey::DesktopIconWindowLevelKey);

    let screen_saver_level = CGWindowLevelForKey(CGWindowLevelKey::ScreenSaverWindowLevelKey);

    match mode {
        // Finder's icons remain in front and receive all mouse events.
        Mode::Desktop => {
            native_window.setLevel((desktop_icon_level - 1) as isize);
            native_window.setIgnoresMouseEvents(true);
        }
        // Lowest public interactive level: below normal apps and the Dock, but
        // above Finder's desktop icon plane.
        Mode::Workspace => {
            native_window.setLevel((desktop_icon_level + 1) as isize);
            native_window.setIgnoresMouseEvents(false);
        }
        // High, not interactive layer
        // Just for onboarding and startup hint notification
        Mode::Overlay => {
            native_window.setLevel((desktop_icon_level + 1) as isize);
            native_window.setIgnoresMouseEvents(true);
        }
    }

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn set_desktop_icons_visible(visible: bool) -> std::io::Result<()> {
    let value = if visible { "true" } else { "false" };

    std::process::Command::new("defaults")
        .args(["write", "com.apple.finder", "CreateDesktop", value])
        .status()?;

    std::process::Command::new("killall")
        .arg("Finder")
        .status()?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn set_desktop_icons_visible(_visible: bool) -> std::io::Result<()> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn minimize_other_windows() -> std::io::Result<()> {
    std::process::Command::new("osascript")
        .args([
            "-e",
            r#"
            tell application "System Events"
                set frontApp to first application process whose frontmost is true
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

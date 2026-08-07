use tauri::{Runtime, WebviewWindow};

/// Desktop mode lets Finder receive input. Workspace mode is the temporary,
/// deliberate state in which Floatspace receives pointer events.
#[derive(Clone, Copy)]
pub enum Mode {
    Desktop,
    Workspace,
}

impl Mode {
    pub fn toggle(&mut self) -> Self {
        *self = match *self {
            Self::Desktop => Self::Workspace,
            Self::Workspace => Self::Desktop,
        };
        *self
    }
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
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );

    let desktop_icon_level = CGWindowLevelForKey(CGWindowLevelKey::DesktopIconWindowLevelKey);
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
    }

    Ok(())
}

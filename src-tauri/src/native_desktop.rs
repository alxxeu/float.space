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
        let monitor_position = monitor.position();
        let monitor_size = monitor.size();
        let scale_factor = monitor.scale_factor();

        // Переводим физические пиксели монитора в логические пиксели для macOS
        let logical_pos = monitor_position.to_logical::<f64>(scale_factor);
        let logical_size = monitor_size.to_logical::<f64>(scale_factor);

        // Устанавливаем позицию и размер строго по границам текущего экрана
        window.set_position(tauri::Position::Logical(logical_pos))?;
        window.set_size(tauri::Size::Logical(logical_size))?;
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
fn ensure_blur_view(
    content_view: &objc2_app_kit::NSView,
) -> objc2::rc::Retained<objc2_app_kit::NSVisualEffectView> {
    use objc2::MainThreadMarker;
    use objc2::MainThreadOnly;
    use objc2::Message;
    use objc2_app_kit::{
        NSAutoresizingMaskOptions,
        NSVisualEffectBlendingMode,
        NSVisualEffectMaterial,
        NSVisualEffectState,
        NSVisualEffectView,
        NSWindowOrderingMode,
    };

    // Если блюр-слой уже вставлен — переиспользуем его
    for view in content_view.subviews().iter() {
        if let Some(existing) = view.downcast_ref::<NSVisualEffectView>() {
            return existing.retain();
        }
    }

    let mtm = MainThreadMarker::new()
        .expect("ensure_blur_view must be called on the main thread");

    let bounds = content_view.bounds();

    // ВСЕ блоки unsafe полностью удалены, так как objc2 теперь считает эти вызовы безопасными
    let blur_view = NSVisualEffectView::initWithFrame(
        NSVisualEffectView::alloc(mtm),
        bounds,
    );

    blur_view.setMaterial(NSVisualEffectMaterial::HUDWindow);
    blur_view.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    blur_view.setState(NSVisualEffectState::Active);
    blur_view.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable
            | NSAutoresizingMaskOptions::ViewHeightSizable,
    );

    content_view.addSubview_positioned_relativeTo(
        &blur_view,
        NSWindowOrderingMode::Below,
        None,
    );

    blur_view
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
            native_window.setLevel(
                (desktop_icon_level - 1) as isize,
            );

            native_window.setIgnoresMouseEvents(true);
        }

        Mode::Workspace => {
            // Выше desktop icon layer.
            native_window.setLevel(
                (desktop_icon_level + 1) as isize,
            );

            native_window.setIgnoresMouseEvents(false);
        }
    }

    if let Some(content_view) = native_window.contentView() {
        let blur_view = ensure_blur_view(&content_view);

            blur_view.setHidden(mode != Mode::Workspace);
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

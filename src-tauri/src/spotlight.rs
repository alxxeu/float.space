use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::sync::OnceLock;

use tauri::Manager;
use tauri::{AppHandle, Emitter};

use crate::storage::Card;

#[link(name = "FloatspaceSpotlightBridge")]
unsafe extern "C" {
    fn floatspace_spotlight_index(
        id: *const c_char,
        title: *const c_char,
        text: *const c_char,
        url: *const c_char,
    ) -> i32;

    fn floatspace_spotlight_delete(id: *const c_char) -> i32;
    fn floatspace_spotlight_clear() -> i32;
    fn floatspace_spotlight_install_hook() -> i32;
    fn floatspace_spotlight_set_callback(
        callback: Option<unsafe extern "C" fn(*const c_char)>,
    );
}

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

pub struct PendingCardState {
    pub card_id: std::sync::Mutex<Option<String>>,
}

unsafe extern "C" fn spotlight_callback(pointer: *const c_char) {
    if pointer.is_null() {
        return;
    }

    let card_id = unsafe { CStr::from_ptr(pointer) }
        .to_string_lossy()
        .into_owned();

    println!("SPOTLIGHT RUST → CALLBACK RECEIVED: {}", card_id);

    if let Some(app) = APP_HANDLE.get() {
        if let Ok(mut pending) = app.state::<PendingCardState>().card_id.lock() {
            *pending = Some(card_id.clone());
        }

        if let Err(error) = app.emit("open-card-from-spotlight", card_id.clone()) {
            eprintln!("SPOTLIGHT RUST → EVENT ERROR: {}", error);
        } else {
            println!("SPOTLIGHT RUST → EVENT EMITTED: {}", card_id);
        }
    } else {
        eprintln!("SPOTLIGHT RUST → APP HANDLE NOT INSTALLED");
    }
}

pub fn install_callback(app: AppHandle) {
    let _ = APP_HANDLE.set(app);

    unsafe {
        floatspace_spotlight_set_callback(Some(spotlight_callback));
    }

    println!("SPOTLIGHT RUST → CALLBACK INSTALLED");
}

pub fn install_hook() -> Result<(), String> {
    let result = unsafe { floatspace_spotlight_install_hook() };

    if result != 0 {
        return Err(format!(
            "Spotlight hook installation failed with status {}",
            result
        ));
    }

    Ok(())
}

fn strip_html(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut inside_tag = false;

    for character in input.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => result.push(character),
            _ => {}
        }
    }

    result
}

fn card_title(text: &str) -> String {
    strip_html(text)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Untitled")
        .chars()
        .take(120)
        .collect()
}

pub fn clear() -> Result<(), String> {
    let result = unsafe { floatspace_spotlight_clear() };

    if result != 0 {
        return Err(format!(
            "Spotlight clear failed with status {}",
            result
        ));
    }

    println!("SPOTLIGHT: index cleared");
    Ok(())
}

pub fn index_card(card: &Card) -> Result<(), String> {
    let text = strip_html(&card.text);
    let title = card_title(&card.text);
    let url = format!("floatspace://card/{}", card.id);

    let id = CString::new(card.id.as_str())
        .map_err(|_| "Card ID contains NUL byte".to_string())?;
    let title = CString::new(title)
        .map_err(|_| "Card title contains NUL byte".to_string())?;
    let text = CString::new(text)
        .map_err(|_| "Card text contains NUL byte".to_string())?;
    let url = CString::new(url)
        .map_err(|_| "Card URL contains NUL byte".to_string())?;

    let result = unsafe {
        floatspace_spotlight_index(
            id.as_ptr(),
            title.as_ptr(),
            text.as_ptr(),
            url.as_ptr(),
        )
    };

    if result != 0 {
        return Err(format!(
            "Spotlight indexing failed with status {}",
            result
        ));
    }

    println!("SPOTLIGHT INDEXED: {}", card.id);
    Ok(())
}

pub fn delete_card(id: &str) -> Result<(), String> {
    let id = CString::new(id)
        .map_err(|_| "Card ID contains NUL byte".to_string())?;

    let result = unsafe { floatspace_spotlight_delete(id.as_ptr()) };

    if result != 0 {
        return Err(format!(
            "Spotlight deletion failed with status {}",
            result
        ));
    }

    println!("SPOTLIGHT DELETED: {}", id.to_string_lossy());
    Ok(())
}

// Kept only for backwards compatibility with older Rust callers.
// New code should use the callback path instead of polling native pending state.
pub fn take_pending_card(state: tauri::State<'_, PendingCardState>) -> Option<String> {
    state.card_id.lock().ok()?.take()
}

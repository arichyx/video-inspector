// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod inspector;
mod logging;

use std::sync::OnceLock;
use tauri::AppHandle;

// Global static APP_HANDLE
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// Initialize the global APP_HANDLE
///
/// This should be called once during application startup
pub fn init_app_handle(app_handle: AppHandle) {
    if APP_HANDLE.set(app_handle).is_err() {
        tracing::error!("Failed to set APP_HANDLE - it was already initialized");
    } else {
        tracing::debug!("APP_HANDLE initialized successfully");
    }
}

/// Get a reference to the global APP_HANDLE
///
/// Returns None if the APP_HANDLE hasn't been initialized yet
pub fn get_app_handle() -> Option<&'static AppHandle> {
    APP_HANDLE.get()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging system
    if let Err(e) = logging::init_logging() {
        eprintln!("Failed to initialize logging: {}", e);
        // Continue running even if logging fails
    }

    tracing::info!("Starting Video Inspector application");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![inspector::get_video_metadata])
        .setup(|app| {
            // Initialize the global APP_HANDLE
            init_app_handle(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

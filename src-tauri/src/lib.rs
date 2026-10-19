mod awww;
mod preview;

use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn get_status() -> awww::DaemonStatus {
    tauri::async_runtime::spawn_blocking(awww::daemon_status)
        .await
        .unwrap_or_else(|error| awww::DaemonStatus {
            running: false,
            version: None,
            outputs: Vec::new(),
            error: Some(format!("Status task failed: {error}")),
        })
}

#[tauri::command]
async fn start_daemon() -> Result<awww::DaemonStatus, String> {
    tauri::async_runtime::spawn_blocking(|| -> Result<awww::DaemonStatus, String> {
        awww::ensure_daemon()?;
        Ok(awww::daemon_status())
    })
    .await
    .map_err(|error| format!("Could not start the daemon: {error}"))?
}

#[tauri::command]
async fn stop_daemon() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(awww::stop_daemon)
        .await
        .map_err(|error| format!("Could not stop the daemon: {error}"))?
}

#[tauri::command]
async fn set_wallpaper(request: awww::SetWallpaperRequest) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        awww::set_wallpaper(&request).map(|result| result.message)
    })
    .await
    .map_err(|error| format!("Wallpaper task failed: {error}"))?
}

#[tauri::command]
async fn clear_wallpaper(color: String, outputs: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        awww::clear_wallpaper(&color, &outputs).map(|result| result.message)
    })
    .await
    .map_err(|error| format!("Colour task failed: {error}"))?
}

#[tauri::command]
async fn restore_wallpaper(outputs: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        awww::restore_wallpaper(&outputs).map(|result| result.message)
    })
    .await
    .map_err(|error| format!("Restore task failed: {error}"))?
}

#[tauri::command]
async fn daemon_action(action: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        awww::daemon_action(&action).map(|result| result.message)
    })
    .await
    .map_err(|error| format!("Daemon task failed: {error}"))?
}

#[tauri::command]
async fn inspect_image(path: String) -> Result<preview::ImageInfo, String> {
    tauri::async_runtime::spawn_blocking(move || preview::inspect(&path))
        .await
        .map_err(|error| format!("Preview task failed: {error}"))
}

#[tauri::command]
async fn pick_image(app: tauri::AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .set_title("Choose a wallpaper")
        .add_filter(
            "Images",
            &[
                "png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "pnm", "tga", "svg",
                "avif", "jxl",
            ],
        )
        .blocking_pick_file()
        .and_then(|path| path.into_path().ok())
        .map(|path| path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_daemon,
            stop_daemon,
            set_wallpaper,
            clear_wallpaper,
            restore_wallpaper,
            daemon_action,
            inspect_image,
            pick_image
        ])
        .run(tauri::generate_context!())
        .expect("failed to run GAWWW");
}

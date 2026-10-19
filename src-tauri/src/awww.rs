use std::{
    collections::BTreeMap,
    env,
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::{Mutex, OnceLock},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

const TRANSITIONS: &[&str] = &[
    "none", "simple", "fade", "left", "right", "top", "bottom", "wipe", "wave", "grow", "center",
    "any", "outer", "random",
];

const RESIZES: &[&str] = &["no", "crop", "fit", "stretch"];

const FILTERS: &[&str] = &["Nearest", "Bilinear", "CatmullRom", "Mitchell", "Lanczos3"];

const GRAVITIES: &[&str] = &[
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DaemonStatus {
    pub running: bool,
    pub version: Option<String>,
    pub outputs: Vec<OutputInfo>,
    pub error: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutputInfo {
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale: f32,
    pub image: Option<String>,
    pub color: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransitionOptions {
    pub kind: String,
    pub duration: f32,
    pub fps: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetWallpaperRequest {
    pub path: String,
    #[serde(default)]
    pub outputs: Vec<String>,
    pub resize: String,
    pub crop_gravity: Option<String>,
    pub filter: String,
    pub transition: TransitionOptions,
}

pub struct ActionResult {
    pub message: String,
}

#[derive(Deserialize)]
struct RawOutput {
    name: String,
    width: u32,
    height: u32,
    #[serde(default = "default_scale")]
    scale: f32,
    #[serde(default)]
    displaying: Option<RawDisplaying>,
}

#[derive(Deserialize)]
struct RawDisplaying {
    #[serde(default)]
    image: Option<String>,
    #[serde(default)]
    color: Option<String>,
}

fn default_scale() -> f32 {
    1.0
}

pub fn daemon_status() -> DaemonStatus {
    let version = awww_version();
    match query_outputs() {
        Ok(outputs) => DaemonStatus {
            running: true,
            version,
            outputs,
            error: None,
        },
        Err(error) => DaemonStatus {
            running: false,
            version,
            outputs: Vec::new(),
            error: Some(error),
        },
    }
}

pub fn ensure_daemon() -> Result<(), String> {
    static LOCK: Mutex<()> = Mutex::new(());
    let _guard = LOCK.lock().unwrap_or_else(|error| error.into_inner());

    if query_outputs().is_ok() {
        return Ok(());
    }

    let log_path = daemon_log_path()?;
    write_log_header(&log_path);

    if let Err(error) = spawn_daemon(&log_path) {
        return Err(with_log_details(
            format!("Could not start awww-daemon: {error}"),
            &log_path,
        ));
    }

    for _ in 0..60 {
        thread::sleep(Duration::from_millis(50));
        if query_outputs().is_ok() {
            return Ok(());
        }
    }

    Err(with_log_details(
        "awww-daemon did not become ready. Make sure a Wayland compositor with wlr-layer-shell support is running.".to_string(),
        &log_path,
    ))
}

pub fn stop_daemon() -> Result<(), String> {
    if query_outputs().is_err() {
        return Ok(());
    }

    run_awww(&["kill".to_string()])?;
    Ok(())
}

pub fn set_wallpaper(request: &SetWallpaperRequest) -> Result<ActionResult, String> {
    if !TRANSITIONS.contains(&request.transition.kind.as_str()) {
        return Err("Invalid transition type.".to_string());
    }
    if !RESIZES.contains(&request.resize.as_str()) {
        return Err("Invalid resize mode.".to_string());
    }
    if !FILTERS.contains(&request.filter.as_str()) {
        return Err("Invalid scaling filter.".to_string());
    }
    if let Some(gravity) = &request.crop_gravity {
        if !gravity.is_empty() && !GRAVITIES.contains(&gravity.as_str()) {
            return Err("Invalid crop anchor.".to_string());
        }
    }
    if !request.transition.duration.is_finite()
        || !(0.0..=120.0).contains(&request.transition.duration)
    {
        return Err("Transition duration must be between 0 and 120 seconds.".to_string());
    }
    if !(1..=240).contains(&request.transition.fps) {
        return Err("Transition frame rate must be between 1 and 240.".to_string());
    }

    let canonical = fs::canonicalize(&request.path)
        .map_err(|error| format!("Cannot open {}: {error}", request.path))?;
    if !canonical.is_file() {
        return Err(format!("{} is not a file.", canonical.display()));
    }
    let image_path = canonical
        .to_str()
        .ok_or_else(|| "The image path is not valid UTF-8.".to_string())?
        .to_string();

    ensure_daemon()?;

    let mut args = vec![
        "img".to_string(),
        "--resize".to_string(),
        request.resize.clone(),
        "--filter".to_string(),
        request.filter.clone(),
        "--transition-type".to_string(),
        request.transition.kind.clone(),
    ];

    if request.resize == "crop" {
        if let Some(gravity) = &request.crop_gravity {
            if !gravity.is_empty() {
                args.push("--crop-gravity".to_string());
                args.push(gravity.clone());
            }
        }
    }

    if request.transition.kind != "simple" && request.transition.kind != "none" {
        args.push("--transition-duration".to_string());
        args.push(format!("{:.2}", request.transition.duration));
    }

    if request.transition.kind != "none" {
        args.push("--transition-fps".to_string());
        args.push(request.transition.fps.to_string());
    }

    push_outputs(&mut args, &request.outputs)?;
    args.push("--".to_string());
    args.push(image_path);

    let output = run_awww(&args)?;
    Ok(ActionResult {
        message: success_message(&output, "Wallpaper applied."),
    })
}

pub fn clear_wallpaper(color: &str, outputs: &[String]) -> Result<ActionResult, String> {
    let color = normalize_color(color)?;

    ensure_daemon()?;

    let mut args = vec!["clear".to_string(), color];
    push_outputs(&mut args, outputs)?;

    let output = run_awww(&args)?;
    Ok(ActionResult {
        message: success_message(&output, "Displays filled with colour."),
    })
}

pub fn restore_wallpaper(outputs: &[String]) -> Result<ActionResult, String> {
    ensure_daemon()?;

    let mut args = vec!["restore".to_string()];
    push_outputs(&mut args, outputs)?;

    let output = run_awww(&args)?;
    Ok(ActionResult {
        message: success_message(&output, "Cached wallpapers restored."),
    })
}

pub fn daemon_action(action: &str) -> Result<ActionResult, String> {
    if !matches!(action, "pause" | "unpause" | "toggle") {
        return Err("Unknown daemon action.".to_string());
    }

    if query_outputs().is_err() {
        return Err("awww-daemon is not running.".to_string());
    }

    run_awww(&[action.to_string()])?;

    let message = match action {
        "pause" => "Animated wallpapers paused.",
        "unpause" => "Animated wallpapers resumed.",
        _ => "Daemon state toggled.",
    };

    Ok(ActionResult {
        message: message.to_string(),
    })
}

fn query_outputs() -> Result<Vec<OutputInfo>, String> {
    let output = run_awww(&["query".to_string(), "-j".to_string()])?;
    let text = String::from_utf8(output.stdout)
        .map_err(|error| format!("awww query returned invalid UTF-8: {error}"))?;

    if text.trim().is_empty() {
        return Ok(Vec::new());
    }

    let namespaces: BTreeMap<String, Vec<RawOutput>> = serde_json::from_str(&text)
        .map_err(|error| format!("Could not parse awww query output: {error}"))?;

    let mut outputs: Vec<OutputInfo> = namespaces
        .into_values()
        .flatten()
        .map(|output| OutputInfo {
            name: output.name,
            width: output.width,
            height: output.height,
            scale: output.scale,
            image: output
                .displaying
                .as_ref()
                .and_then(|item| item.image.clone()),
            color: output
                .displaying
                .as_ref()
                .and_then(|item| item.color.clone()),
        })
        .collect();

    outputs.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(outputs)
}

fn awww_version() -> Option<String> {
    static VERSION: OnceLock<Option<String>> = OnceLock::new();

    VERSION
        .get_or_init(|| {
            let output = Command::new("awww").arg("--version").output().ok()?;
            if !output.status.success() {
                return None;
            }
            let text = String::from_utf8(output.stdout).ok()?;
            let text = text.trim();
            Some(text.strip_prefix("awww ").unwrap_or(text).to_string())
        })
        .clone()
}

fn run_awww(args: &[String]) -> Result<Output, String> {
    let output = Command::new("awww")
        .args(args)
        .output()
        .map_err(|error| format!("Could not run awww: {error}"))?;

    if output.status.success() {
        Ok(output)
    } else {
        Err(extract_error(&output))
    }
}

fn extract_error(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let text = if !stderr.is_empty() { stderr } else { stdout };

    if text.is_empty() {
        format!("awww exited with {}.", output.status)
    } else {
        text
    }
}

fn success_message(output: &Output, fallback: &str) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() { stderr } else { stdout };

    if detail.is_empty() {
        fallback.to_string()
    } else if detail.chars().count() > 600 {
        format!(
            "{fallback} {}",
            detail.chars().take(600).collect::<String>()
        )
    } else {
        format!("{fallback} {detail}")
    }
}

fn push_outputs(args: &mut Vec<String>, outputs: &[String]) -> Result<(), String> {
    let mut names = Vec::new();

    for output in outputs {
        let name = output.trim();
        if name.is_empty() {
            continue;
        }
        if name.contains(',') || name.chars().any(char::is_control) {
            return Err(format!("Invalid display name: {name}"));
        }
        names.push(name.to_string());
    }

    if !names.is_empty() {
        args.push("--outputs".to_string());
        args.push(names.join(","));
    }

    Ok(())
}

fn normalize_color(color: &str) -> Result<String, String> {
    let value = color.trim().trim_start_matches('#');

    if value.len() != 6 && value.len() != 8 {
        return Err("Colour must use the format #rrggbb or #rrggbbaa.".to_string());
    }
    if !value.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err("Colour contains characters that are not hexadecimal.".to_string());
    }

    let value = value.to_ascii_lowercase();
    Ok(if value.len() == 6 {
        format!("{value}ff")
    } else {
        value
    })
}

fn spawn_daemon(log_path: &Path) -> Result<(), String> {
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|error| format!("Could not open {}: {error}", log_path.display()))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("Could not open {}: {error}", log_path.display()))?;

    let spawned = Command::new("setsid")
        .args(["--fork", "awww-daemon"])
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn();

    match spawned {
        Ok(mut child) => match child.wait() {
            Ok(status) if status.success() => Ok(()),
            Ok(status) => Err(format!("setsid exited with {status}")),
            Err(error) => Err(format!("Could not wait for setsid: {error}")),
        },
        Err(error) if error.kind() == ErrorKind::NotFound => {
            let stdout = OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_path)
                .map_err(|error| format!("Could not open {}: {error}", log_path.display()))?;
            let stderr = stdout
                .try_clone()
                .map_err(|error| format!("Could not open {}: {error}", log_path.display()))?;

            Command::new("awww-daemon")
                .stdin(Stdio::null())
                .stdout(Stdio::from(stdout))
                .stderr(Stdio::from(stderr))
                .spawn()
                .map(drop)
                .map_err(|error| format!("Could not run awww-daemon: {error}"))
        }
        Err(error) => Err(format!("Could not run setsid: {error}")),
    }
}

fn daemon_log_path() -> Result<PathBuf, String> {
    let base = env::var_os("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".cache")))
        .ok_or_else(|| "Could not determine the cache directory.".to_string())?;

    let directory = base.join("gawww");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create {}: {error}", directory.display()))?;

    Ok(directory.join("daemon.log"))
}

fn write_log_header(log_path: &Path) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "\n--- awww-daemon start {timestamp} ---");
    }
}

fn with_log_details(message: String, log_path: &Path) -> String {
    let details = fs::read_to_string(log_path)
        .ok()
        .map(|text| {
            text.lines()
                .rev()
                .take(14)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    if details.trim().is_empty() {
        format!("{message}\n\nLog: {}", log_path.display())
    } else {
        format!("{message}\n\nLog: {}\n{details}", log_path.display())
    }
}

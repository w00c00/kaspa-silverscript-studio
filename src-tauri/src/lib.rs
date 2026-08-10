use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct BackendState {
    child: Mutex<Option<CommandChild>>,
    log_path: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendDiagnostics {
    listening: bool,
    child_pid: Option<u32>,
    log_path: String,
    log_tail: String,
    missing_files: Vec<String>,
}

fn append_backend_log(path: &Path, message: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or_default();
        let _ = writeln!(file, "[{timestamp}] {message}");
    }
}

fn runtime_paths(app: &AppHandle) -> Result<(PathBuf, PathBuf, PathBuf, PathBuf, PathBuf), String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let executable_suffix = if cfg!(windows) { ".exe" } else { "" };
    Ok((
        resource_dir.join("runtime/app/server/index.mjs"),
        resource_dir.join(format!("runtime/app/bin/silverc-latest{executable_suffix}")),
        resource_dir.join(format!(
            "runtime/app/bin/silverc-cb34aa5{executable_suffix}"
        )),
        resource_dir.join(format!("runtime/app/bin/silverc-legacy{executable_suffix}")),
        resource_dir.join(format!(
            "runtime/app/bin/kascov-preflight{executable_suffix}"
        )),
    ))
}

// Windows may return Tauri resource paths in the verbatim `\\?\` form. Node's
// CLI does not reliably accept that form as its entry-point argument, so hand
// child processes an ordinary drive/UNC path while retaining the original
// PathBuf for filesystem validation inside Rust.
fn child_process_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = value.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        value.into_owned()
    }
}

fn spawn_backend(app: &AppHandle) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    let log_path = app_data_dir.join("backend.log");
    *app.state::<BackendState>().log_path.lock().unwrap() = Some(log_path.clone());

    let (script, latest_compiler, previous_compiler, legacy_compiler, preflight_engine) =
        runtime_paths(app)?;
    let required = [
        &script,
        &latest_compiler,
        &previous_compiler,
        &legacy_compiler,
        &preflight_engine,
    ];
    let missing = required
        .iter()
        .filter(|path| !path.is_file())
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>();
    if !missing.is_empty() {
        let message = format!(
            "backend start blocked; missing files: {}",
            missing.join(", ")
        );
        append_backend_log(&log_path, &message);
        return Err(message);
    }

    append_backend_log(
        &log_path,
        &format!(
            "starting local service; script={}; data={}",
            script.display(),
            app_data_dir.display()
        ),
    );

    let script_arg = child_process_path(&script);
    let data_arg = child_process_path(&app_data_dir);
    let latest_compiler_arg = child_process_path(&latest_compiler);
    let previous_compiler_arg = child_process_path(&previous_compiler);
    let legacy_compiler_arg = child_process_path(&legacy_compiler);
    let preflight_engine_arg = child_process_path(&preflight_engine);

    let (mut events, child) = app
        .shell()
        .sidecar("node")
        .map_err(|error| error.to_string())?
        .arg(script_arg)
        .env("HOST", "127.0.0.1")
        .env("PORT", "4310")
        .env("STUDIO_DATA_DIR", data_arg)
        .env("SILVERC_LATEST_BIN", latest_compiler_arg)
        .env("SILVERC_PREVIOUS_BIN", previous_compiler_arg)
        .env("SILVERC_LEGACY_BIN", legacy_compiler_arg)
        .env("KASCOV_PREFLIGHT_BIN", preflight_engine_arg)
        .spawn()
        .map_err(|error| error.to_string())?;
    let pid = child.pid();
    *app.state::<BackendState>().child.lock().unwrap() = Some(child);
    append_backend_log(
        &log_path,
        &format!("local service process spawned; pid={pid}"),
    );

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => append_backend_log(
                    &log_path,
                    &format!("stdout: {}", String::from_utf8_lossy(&bytes).trim()),
                ),
                CommandEvent::Stderr(bytes) => append_backend_log(
                    &log_path,
                    &format!("stderr: {}", String::from_utf8_lossy(&bytes).trim()),
                ),
                CommandEvent::Error(error) => {
                    append_backend_log(&log_path, &format!("process error: {error}"))
                }
                CommandEvent::Terminated(payload) => {
                    append_backend_log(&log_path, &format!("process terminated: {payload:?}"))
                }
                _ => {}
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::child_process_path;
    use std::path::Path;

    #[test]
    fn removes_windows_verbatim_drive_prefix_for_child_processes() {
        assert_eq!(
            child_process_path(Path::new(r"\\?\D:\Studio\runtime\index.mjs")),
            r"D:\Studio\runtime\index.mjs"
        );
    }

    #[test]
    fn converts_windows_verbatim_unc_prefix_for_child_processes() {
        assert_eq!(
            child_process_path(Path::new(r"\\?\UNC\server\share\index.mjs")),
            r"\\server\share\index.mjs"
        );
    }
}

fn backend_diagnostics_value(app: &AppHandle) -> BackendDiagnostics {
    let state = app.state::<BackendState>();
    let log_path = state.log_path.lock().unwrap().clone().unwrap_or_default();
    let child_pid = state.child.lock().unwrap().as_ref().map(CommandChild::pid);
    let address = "127.0.0.1:4310".parse::<SocketAddr>().unwrap();
    let listening = TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok();
    let log = fs::read_to_string(&log_path).unwrap_or_default();
    let mut lines = log.lines().rev().take(120).collect::<Vec<_>>();
    lines.reverse();
    let missing_files = runtime_paths(app)
        .map(|paths| {
            [paths.0, paths.1, paths.2, paths.3]
                .into_iter()
                .filter(|path| !path.is_file())
                .map(|path| path.display().to_string())
                .collect()
        })
        .unwrap_or_else(|error| vec![error]);
    BackendDiagnostics {
        listening,
        child_pid,
        log_path: log_path.display().to_string(),
        log_tail: lines.join("\n"),
        missing_files,
    }
}

#[tauri::command]
fn backend_diagnostics(app: AppHandle) -> BackendDiagnostics {
    backend_diagnostics_value(&app)
}

#[tauri::command]
fn restart_backend(app: AppHandle) -> Result<BackendDiagnostics, String> {
    if let Some(child) = app.state::<BackendState>().child.lock().unwrap().take() {
        let _ = child.kill();
    }
    spawn_backend(&app)?;
    Ok(backend_diagnostics_value(&app))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendState::default())
        .invoke_handler(tauri::generate_handler![
            backend_diagnostics,
            restart_backend
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            } else if let Err(error) = spawn_backend(app.handle()) {
                if let Ok(app_data_dir) = app.path().app_data_dir() {
                    append_backend_log(
                        &app_data_dir.join("backend.log"),
                        &format!("failed to spawn local service: {error}"),
                    );
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(child) = handle.state::<BackendState>().child.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}

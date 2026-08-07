use std::fs;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct BackendChild(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendChild::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if !cfg!(debug_assertions) {
                let resource_dir = app.path().resource_dir()?;
                let app_data_dir = app.path().app_data_dir()?;
                fs::create_dir_all(&app_data_dir)?;
                let executable_suffix = if cfg!(windows) { ".exe" } else { "" };
                let script = resource_dir.join("runtime/app/server/index.mjs");
                let latest_compiler =
                    resource_dir.join(format!("runtime/app/bin/silverc-latest{executable_suffix}"));
                let legacy_compiler =
                    resource_dir.join(format!("runtime/app/bin/silverc-legacy{executable_suffix}"));
                let preflight_engine = resource_dir.join(format!(
                    "runtime/app/bin/kascov-preflight{executable_suffix}"
                ));
                let (mut events, child) = app
                    .shell()
                    .sidecar("node")?
                    .arg(script)
                    .env("HOST", "127.0.0.1")
                    .env("PORT", "4310")
                    .env("STUDIO_DATA_DIR", app_data_dir)
                    .env("SILVERC_LATEST_BIN", latest_compiler)
                    .env("SILVERC_LEGACY_BIN", legacy_compiler)
                    .env("KASCOV_PREFLIGHT_BIN", preflight_engine)
                    .spawn()?;
                *app.state::<BackendChild>().0.lock().unwrap() = Some(child);
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = events.recv().await {
                        if let tauri_plugin_shell::process::CommandEvent::Stderr(bytes) = event {
                            log::error!("studio sidecar: {}", String::from_utf8_lossy(&bytes));
                        }
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(child) = handle.state::<BackendChild>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}

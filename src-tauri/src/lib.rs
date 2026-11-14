use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};

struct CoreState {
    child: Mutex<Option<CommandChild>>,
    error: Mutex<Option<String>>,
}

#[tauri::command]
fn core_send(payload: String, state: tauri::State<'_, CoreState>) -> Result<(), String> {
    let mut guard = state.child.lock().map_err(|err| err.to_string())?;
    match guard.as_mut() {
        Some(child) => {
            let line = format!("{payload}\n");
            child
                .write(line.as_bytes())
                .map_err(|err| format!("Không gửi được lệnh tới lõi: {err}"))
        }
        None => {
            let detail = state
                .error
                .lock()
                .ok()
                .and_then(|value| value.clone())
                .unwrap_or_else(|| "Lõi kết nối chưa chạy".to_string());
            Err(detail)
        }
    }
}

#[tauri::command]
fn core_status(state: tauri::State<'_, CoreState>) -> bool {
    state
        .child
        .lock()
        .map(|guard| guard.is_some())
        .unwrap_or(false)
}

fn spawn_core(app: &tauri::AppHandle, state: &CoreState) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("Không xác định được thư mục dữ liệu: {err}"))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|err| format!("Không tạo được thư mục dữ liệu: {err}"))?;

    let sidecar = app
        .shell()
        .sidecar("core-sidecar")
        .map_err(|err| format!("Không tìm thấy lõi core-sidecar: {err}"))?;

    let (mut rx, child) = sidecar
        .env("TELLO_DATA_DIR", data_dir.to_string_lossy().to_string())
        .env(
            "TELLO_APP_VERSION",
            app.package_info().version.to_string(),
        )
        .spawn()
        .map_err(|err| format!("Không khởi chạy được lõi: {err}"))?;

    *state.child.lock().map_err(|err| err.to_string())? = Some(child);

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let text = String::from_utf8_lossy(&bytes).to_string();
                    for line in text.lines() {
                        if line.trim().is_empty() {
                            continue;
                        }
                        let _ = app_handle.emit("core:event", line.to_string());
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    eprintln!("[tello-core] {}", text.trim_end());
                }
                CommandEvent::Terminated(payload) => {
                    let _ = app_handle.emit("core:exit", payload.code);
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mở Tello", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Thoát hẳn", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("tello-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(CoreState {
            child: Mutex::new(None),
            error: Mutex::new(None),
        })
        .setup(|app| {
            let state = app.state::<CoreState>();
            if let Err(error) = spawn_core(app.handle(), &state) {
                eprintln!("[tello] {error}");
                if let Ok(mut slot) = state.error.lock() {
                    *slot = Some(error.clone());
                }
                let _ = app.handle().emit("core:error", error);
            }
            build_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![core_send, core_status])
        .run(tauri::generate_context!())
        .expect("Lỗi khởi chạy Tello");
}

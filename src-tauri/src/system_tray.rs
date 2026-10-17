use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Manager, Runtime, Window, WindowEvent,
};

const TRAY_ID: &str = "ergo-tray";
const MAIN_WINDOW: &str = "main";

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        // Restore the existing webview so its page and session are preserved.
        if let Err(error) = window
            .unminimize()
            .and_then(|_| window.show())
            .and_then(|_| window.set_focus())
        {
            eprintln!("Failed to restore the main window: {error}");
        }
    }
}

pub fn setup<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "tray-open", "Abrir Ergo", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "tray-quit", "Sair do Ergo", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &separator, &quit])?;
    let icon = app.default_window_icon().cloned().ok_or_else(|| {
        std::io::Error::other("The application icon is required for the system tray")
    })?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Ergo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-open" => show_main_window(app),
            // A real exit still runs the existing scheduler shutdown handler.
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if window.label() != MAIN_WINDOW {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        // Only intercept closing when the tray is available to reopen the app.
        if window.app_handle().tray_by_id(TRAY_ID).is_some() {
            api.prevent_close();
            if let Err(error) = window.hide() {
                eprintln!("Failed to hide the main window to the system tray: {error}");
            }
        }
    }
}

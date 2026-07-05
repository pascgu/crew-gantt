#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{Emitter, Manager};

struct StartupFile(Mutex<Option<String>>);

/// Cherche un chemin de fichier .cgan parmi les arguments de la ligne de commande
/// (association de fichier Windows : le shell lance `crew-gantt.exe "C:\...\fichier.cgan"`).
fn extract_cgan_path(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .find(|a| a.to_lowercase().ends_with(".cgan"))
        .cloned()
}

#[tauri::command]
fn take_startup_file(state: tauri::State<StartupFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Une deuxième instance a été lancée (ex. double-clic sur un autre .cgan) :
            // on transmet le fichier à la fenêtre existante au lieu d'ouvrir une nouvelle instance.
            if let Some(path) = extract_cgan_path(&argv) {
                let _ = app.emit("open-file", path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(StartupFile(Mutex::new(extract_cgan_path(
            &std::env::args().collect::<Vec<_>>(),
        ))))
        .invoke_handler(tauri::generate_handler![take_startup_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

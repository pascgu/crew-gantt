#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

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

/// Un programme par fichier (décision T6, v1.3) : chaque double-clic sur un .cgan lance sa propre
/// instance, avec sa fenêtre. La sauvegarde de secours est rangée par fichier côté web (IndexedDB),
/// et une instance prévient si le même fichier est déjà ouvert ailleurs.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(StartupFile(Mutex::new(extract_cgan_path(
            &std::env::args().collect::<Vec<_>>(),
        ))))
        .invoke_handler(tauri::generate_handler![take_startup_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

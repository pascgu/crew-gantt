#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::Manager;

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

/// Vide le service worker et son cache (CacheStorage) du profil WebView2, puis recharge la page.
///
/// Pourquoi : jusqu'à la 1.3, l'app web enregistrait aussi dans l'app bureau le service worker de la
/// version navigateur (PWA). Il mettait l'app en cache et la servait à chaque lancement, et sa mise à
/// jour n'aboutissait pas sous Tauri : après installation d'une nouvelle version, l'ancienne
/// continuait de s'afficher (la désinstallation ne supprime pas le profil WebView2). Seuls le service
/// worker et son cache sont effacés — IndexedDB (sauvegardes de secours, fichiers récents) et les
/// préférences restent intacts. `on_done` est appelé une fois l'effacement terminé.
#[cfg(windows)]
fn clear_service_workers(webview: tauri::webview::PlatformWebview, on_done: impl FnOnce() + 'static) {
    use webview2_com::ClearBrowsingDataCompletedHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Profile2, ICoreWebView2_13, COREWEBVIEW2_BROWSING_DATA_KINDS,
        COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE, COREWEBVIEW2_BROWSING_DATA_KINDS_SERVICE_WORKERS,
    };
    use windows_core::Interface;

    unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(profile) = core.cast::<ICoreWebView2_13>().and_then(|c| c.Profile()) else { return };
        let Ok(profile) = profile.cast::<ICoreWebView2Profile2>() else { return };
        let kinds = COREWEBVIEW2_BROWSING_DATA_KINDS(
            COREWEBVIEW2_BROWSING_DATA_KINDS_SERVICE_WORKERS.0 | COREWEBVIEW2_BROWSING_DATA_KINDS_CACHE_STORAGE.0,
        );
        let handler = ClearBrowsingDataCompletedHandler::create(Box::new(move |_result| {
            on_done();
            let _ = core.Reload();
            Ok(())
        }));
        let _ = profile.ClearBrowsingData(kinds, &handler);
    }
}

/// Une fois par version installée (nouvelle installation ou mise à jour) : purge du service worker
/// hérité. La version déjà traitée est mémorisée dans le dossier de données locales de l'app.
fn purge_stale_web_cache(app: &tauri::App) {
    let version = app.package_info().version.to_string();
    let Ok(dir) = app.path().app_local_data_dir() else { return };
    let marker = dir.join("web-cache-version");
    if std::fs::read_to_string(&marker).map(|v| v.trim() == version).unwrap_or(false) {
        return;
    }
    #[cfg(windows)]
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.with_webview(move |webview| {
            clear_service_workers(webview, move || {
                let _ = std::fs::create_dir_all(&dir);
                let _ = std::fs::write(&marker, &version);
            });
        });
    }
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
        .setup(|app| {
            purge_stale_web_cache(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

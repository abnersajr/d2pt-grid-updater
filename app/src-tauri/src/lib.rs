use md5;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::time::SystemTime;
use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    Manager, State,
};

#[cfg(target_os = "windows")]
use winreg::{
    enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    RegKey,
};

#[cfg(not(target_os = "windows"))]
use dirs;

#[derive(Deserialize, Debug)]
struct GithubContent {
    name: String,
    download_url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Grid {
    pub name: String,
    pub date: String,
    pub download_url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DetectedGrid {
    pub grid_type: String, // "d2pt", "high_winrate", "most_played", or "custom"
    pub name: String,
    pub date: String,
    pub hash: String,
    pub is_known: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GridHashes {
    pub hashes: HashMap<String, String>, // filename -> hash
}

#[tauri::command]
fn find_dota_config_path() -> Result<Option<PathBuf>, String> {
    let mut steam_path: Option<PathBuf> = None;

    #[cfg(target_os = "windows")]
    {
        if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey_with_flags(
            "SOFTWARE\\Wow6432Node\\Valve\\Steam",
            winreg::enums::KEY_READ,
        ) {
            if let Ok(path_str) = hklm.get_value::<String, _>("InstallPath") {
                steam_path = Some(PathBuf::from(path_str));
            }
        }
        if steam_path.is_none() {
            if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER)
                .open_subkey_with_flags("Software\\Valve\\Steam", winreg::enums::KEY_READ)
            {
                if let Ok(path_str) = hkcu.get_value::<String, _>("SteamPath") {
                    steam_path = Some(PathBuf::from(path_str));
                } else if let Ok(path_str) = hkcu.get_value::<String, _>("InstallPath") {
                    steam_path = Some(PathBuf::from(path_str));
                }
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let home_dir = dirs::home_dir().ok_or("Could not find home directory")?;
        let possible_steam_paths = vec![
            home_dir.join(".steam").join("steam"),
            home_dir.join(".local").join("share").join("Steam"),
            home_dir
                .join("Library")
                .join("Application Support")
                .join("Steam"),
        ];
        for p in possible_steam_paths {
            let dota_check_path = p.join("steamapps").join("common").join("dota 2 beta");
            if dota_check_path.exists() && dota_check_path.is_dir() {
                steam_path = Some(p);
                break;
            } else if p.exists() && p.is_dir() {
                steam_path = Some(p);
                break;
            }
        }
    }

    let steam_path = match steam_path {
        Some(p) => p,
        None => return Ok(None),
    };

    let userdata_path = steam_path.join("userdata");
    if !userdata_path.exists() || !userdata_path.is_dir() {
        return Ok(None);
    }

    let mut latest_cfg_path: Option<PathBuf> = None;
    let mut latest_mod_time: Option<SystemTime> = None;

    for entry in fs::read_dir(&userdata_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let user_id_path = entry.path();
        if user_id_path.is_dir() {
            let dota_cfg_dir = user_id_path.join("570").join("remote").join("cfg");
            if dota_cfg_dir.exists() && dota_cfg_dir.is_dir() {
                let hero_grid_path = dota_cfg_dir.join("hero_grid_config.json");
                if hero_grid_path.exists() {
                    if let Ok(metadata) = fs::metadata(&hero_grid_path) {
                        if let Ok(mod_time) = metadata.modified() {
                            if let Some(latest) = latest_mod_time {
                                if mod_time.cmp(&latest) == Ordering::Greater {
                                    latest_mod_time = Some(mod_time);
                                    latest_cfg_path = Some(dota_cfg_dir.clone());
                                }
                            } else {
                                latest_mod_time = Some(mod_time);
                                latest_cfg_path = Some(dota_cfg_dir.clone());
                            }
                        }
                    }
                } else {
                    if latest_cfg_path.is_none() {
                        latest_cfg_path = Some(dota_cfg_dir);
                    }
                }
            }
        }
    }
    Ok(latest_cfg_path)
}

#[tauri::command]
async fn list_remote_grids() -> Result<Vec<Grid>, String> {
    let client = reqwest::Client::new();
    let api_url = "https://api.github.com/repos/abnersajr/d2pt-grid-updater/contents/grids";
    let response = client
        .get(api_url)
        .header("User-Agent", "d2pt-grid-updater-app")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch grids from GitHub: {}",
            response.status()
        ));
    }
    let contents: Vec<GithubContent> = response.json().await.map_err(|e| e.to_string())?;
    let grids: Vec<Grid> = contents
        .into_iter()
        .filter_map(|item| {
            if item.name.ends_with(".json") && item.download_url.is_some() {
                let parts: Vec<&str> = item.name.split('_').collect();
                let date = parts
                    .iter()
                    .find(|p| p.starts_with("20"))
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "Unknown".to_string());
                Some(Grid {
                    name: item.name.clone(),
                    date,
                    download_url: item.download_url.unwrap(),
                })
            } else {
                None
            }
        })
        .collect();
    Ok(grids)
}

#[tauri::command]
async fn download_grid_hashes() -> Result<GridHashes, String> {
    let client = reqwest::Client::new();
    let url = "https://raw.githubusercontent.com/abnersajr/d2pt-grid-updater/main/grid_hashes.txt";

    let response = client
        .get(url)
        .header("User-Agent", "d2pt-grid-updater-app")
        .send()
        .await
        .map_err(|e| format!("Failed to download grid hashes: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download grid hashes: {}",
            response.status()
        ));
    }

    let content = response.text().await.map_err(|e| e.to_string())?;
    let mut hashes = HashMap::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if let Some((filename, hash)) = line.split_once(',') {
            hashes.insert(filename.to_string(), hash.to_string());
        }
    }

    Ok(GridHashes { hashes })
}

#[tauri::command]
fn detect_current_grid(dota_config_path: Option<String>) -> Result<Option<DetectedGrid>, String> {
    let config_path = match dota_config_path {
        Some(path) => PathBuf::from(path),
        None => {
            let found_path = find_dota_config_path()?;
            match found_path {
                Some(path) => path,
                None => return Ok(None),
            }
        }
    };

    let grid_file_path = config_path.join("hero_grid_config.json");
    if !grid_file_path.exists() {
        return Ok(None);
    }

    let content =
        fs::read(&grid_file_path).map_err(|e| format!("Failed to read grid file: {}", e))?;
    let hash = format!("{:x}", md5::compute(&content));

    // Try to determine grid type from filename patterns in the known hashes
    // We'll get this from the download_grid_hashes call, but for now return basic info
    Ok(Some(DetectedGrid {
        grid_type: "unknown".to_string(),
        name: "Current Grid".to_string(),
        date: "Unknown".to_string(),
        hash,
        is_known: false,
    }))
}

#[tauri::command]
fn match_grid_hash(
    grid_hash: String,
    grid_hashes: GridHashes,
) -> Result<Option<DetectedGrid>, String> {
    for (filename, hash) in &grid_hashes.hashes {
        if hash == &grid_hash {
            // Parse filename to extract grid type and date
            // Format: dota2protracker_hero_grid_[type]_config_[date]_p[version]_[patch].json
            let parts: Vec<&str> = filename.split('_').collect();
            let grid_type = if filename.contains("d2pt_rating") {
                "d2pt"
            } else if filename.contains("high_winrate") {
                "high_winrate"
            } else if filename.contains("most_played") {
                "most_played"
            } else {
                "unknown"
            };

            let date = parts
                .iter()
                .find(|p| p.starts_with("20"))
                .map(|s| s.to_string())
                .unwrap_or_else(|| "Unknown".to_string());

            return Ok(Some(DetectedGrid {
                grid_type: grid_type.to_string(),
                name: filename.clone(),
                date,
                hash: hash.clone(),
                is_known: true,
            }));
        }
    }

    Ok(None)
}

/*
#[tauri::command]
async fn activate_grid(app: AppHandle, grid_name: String, download_url: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
async fn clear_cache(app: AppHandle) -> Result<(), String> {
    Ok(())
}
*/

#[tauri::command]
fn estimate_system_dpi_scale(
    #[allow(unused_variables)] screen_width: f64,
    #[allow(unused_variables)] screen_height: f64,
    device_pixel_ratio: f64,
) -> f64 {
    // Estimate system DPI scaling based on screen dimensions and device pixel ratio
    // This is a heuristic approach that works reasonably well across platforms

    // Common display resolutions and their typical scaling factors:
    // - 1920x1080: 100% scale (DPR ~1.0), 125% scale (DPR ~1.25), 150% scale (DPR ~1.5)
    // - 2560x1440: Often 125% scale (DPR ~1.25) or 150% scale (DPR ~1.5)
    // - 3840x2160: Often 150% scale (DPR ~1.5) or 200% scale (DPR ~2.0)

    // For Windows specifically, we can make educated guesses based on common setups
    #[cfg(target_os = "windows")]
    {
        // High DPI display detection
        if screen_width >= 2560.0 && screen_height >= 1440.0 {
            // QHD+ displays often use scaling
            if device_pixel_ratio >= 1.4 {
                return 1.5; // Likely 150% system scaling
            } else if device_pixel_ratio >= 1.2 {
                return 1.25; // Likely 125% system scaling
            }
        } else if screen_width >= 1920.0 && screen_height >= 1080.0 {
            // FHD displays
            if device_pixel_ratio >= 1.4 {
                return 1.5; // Likely 150% system scaling
            } else if device_pixel_ratio >= 1.2 {
                return 1.25; // Likely 125% system scaling
            }
        }

        // 4K displays
        if screen_width >= 3840.0 && screen_height >= 2160.0 {
            if device_pixel_ratio >= 1.8 {
                return 2.0; // Likely 200% system scaling
            } else if device_pixel_ratio >= 1.4 {
                return 1.5; // Likely 150% system scaling
            }
        }
    }

    // For other platforms or unknown configurations, trust devicePixelRatio
    // but cap it to reasonable values
    if device_pixel_ratio > 2.5 {
        2.5 // Cap at 250% to avoid extreme values
    } else if device_pixel_ratio < 0.8 {
        1.0 // Minimum reasonable scale
    } else {
        device_pixel_ratio
    }
}

#[derive(Default)]
pub struct AppSettings {
    pub minimize_to_tray: AtomicBool,
    pub start_minimized: AtomicBool,
}

#[tauri::command]
fn set_minimize_to_tray(_app: tauri::AppHandle, enabled: bool, settings: State<AppSettings>) {
    println!("set_minimize_to_tray called");
    println!("Setting minimize_to_tray to: {}", enabled);
    settings
        .minimize_to_tray
        .store(enabled, AtomicOrdering::SeqCst);

    // minimize_to_tray persistence is handled through localStorage -> initialize_settings flow
}

#[tauri::command]
fn set_start_minimized(app: tauri::AppHandle, enabled: bool, settings: State<AppSettings>) {
    println!("Setting start_minimized to: {}", enabled);
    settings
        .start_minimized
        .store(enabled, AtomicOrdering::SeqCst);

    // Also save to persistent file
    println!("Saving start_minimized={} to file", enabled);
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let file_path = app_data_dir.join("start_minimized.txt");
        match fs::write(&file_path, if enabled { "true" } else { "false" }) {
            Ok(_) => println!(
                "Successfully saved start_minimized to file: {:?}",
                file_path
            ),
            Err(e) => println!("Failed to save start_minimized to file: {}", e),
        }
    } else {
        println!("Could not get app data directory");
    }
}

#[tauri::command]
fn initialize_settings(
    app: tauri::AppHandle,
    minimize_to_tray: bool,
    start_minimized: bool,
    settings: State<AppSettings>,
) {
    println!(
        "Initializing settings: minimize_to_tray={}, start_minimized={}",
        minimize_to_tray, start_minimized
    );
    settings
        .minimize_to_tray
        .store(minimize_to_tray, AtomicOrdering::SeqCst);
    settings
        .start_minimized
        .store(start_minimized, AtomicOrdering::SeqCst);

    // Persistence is handled by frontend localStorage for minimize_to_tray
    // Save start_minimized to file for persistence across restarts
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let file_path = app_data_dir.join("start_minimized.txt");
        let _ = fs::write(&file_path, if start_minimized { "true" } else { "false" });
    }
}

fn handle_tray_event(tray_icon: &tauri::tray::TrayIcon, event: TrayIconEvent) {
    match event {
        TrayIconEvent::DoubleClick { .. } => {
            // Double click shows the window
            let app = tray_icon.app_handle();
            let window = app.get_webview_window("main").unwrap();
            window.show().unwrap();
            window.set_focus().unwrap();
        }
        _ => {}
    }
}

fn handle_menu_event(app: &tauri::AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "show" => {
            let window = app.get_webview_window("main").unwrap();
            window.show().unwrap();
            window.set_focus().unwrap();
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppSettings {
            minimize_to_tray: AtomicBool::new(true),
            start_minimized: AtomicBool::new(false),
        })
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_tray_icon_event(handle_tray_event)
                .on_menu_event(handle_menu_event)
                .build(app)?;

            // Check start_minimized setting from file and set initial window visibility
            let window = app.get_webview_window("main").unwrap();
            println!("Checking file for start_minimized setting...");
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let file_path = app_data_dir.join("start_minimized.txt");
                println!("Looking for start_minimized file: {:?}", file_path);
                match fs::read_to_string(&file_path) {
                    Ok(content) => {
                        println!("Read start_minimized file content: '{}'", content.trim());
                        let start_minimized = content.trim() == "true";
                        println!("Parsed start_minimized = {}", start_minimized);
                        if !start_minimized {
                            println!("Showing window based on file setting (start_minimized=false)");
                            let _ = window.show();
                            let _ = window.set_focus();
                        } else {
                            println!("Keeping window hidden based on file setting (start_minimized=true)");
                            // Window is already hidden by default, so do nothing
                        }
                    }
                    Err(e) => {
                        println!(
                            "Could not read start_minimized file ({}), defaulting to show window",
                            e
                        );
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            } else {
                println!("Could not get app data directory, defaulting to show window");
                let _ = window.show();
                let _ = window.set_focus();
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let app = window.app_handle();
                let minimize_to_tray = app
                    .state::<AppSettings>()
                    .minimize_to_tray
                    .load(AtomicOrdering::SeqCst);

                println!(
                    "Window close requested, minimize_to_tray = {}",
                    minimize_to_tray
                );

                if minimize_to_tray {
                    println!("Minimizing to tray");
                    window.hide().unwrap();
                    api.prevent_close();
                } else {
                    println!("Allowing app to close");
                    // If minimize_to_tray is false, allow the app to close normally
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            find_dota_config_path,
            list_remote_grids,
            estimate_system_dpi_scale,
            download_grid_hashes,
            detect_current_grid,
            match_grid_hash,
            set_minimize_to_tray,
            set_start_minimized,
            initialize_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

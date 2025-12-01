use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

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
    screen_width: f64,
    screen_height: f64,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            find_dota_config_path,
            list_remote_grids,
            estimate_system_dpi_scale // activate_grid,
                                      // clear_cache
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

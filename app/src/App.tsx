import { useState, useEffect } from "react";
import {
  Button,
  Card,
  ConfigProvider,
  Flex,
  Layout,
  Space,
  Switch,
  Table,
  theme,
  Typography,
  notification,
  Alert,
} from "antd";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

// Define the shape of the grid data coming from the backend
interface Grid {
  key: string;
  name: string;
  date: string;
  download_url: string;
}

interface GroupedGrid {
  key: string;
  date: string;
  patch: string;
  d2pt?: Grid;
  highWinrate?: Grid;
  mostPlayed?: Grid;
}

interface DetectedGrid {
  grid_type: string;
  name: string;
  date: string;
  hash: string;
  is_known: boolean;
}

interface GridHashes {
  hashes: { [filename: string]: string };
}



function App() {
  const [dotaPath, setDotaPath] = useState("Searching for Dota 2 path...");
  const [grids, setGrids] = useState<GroupedGrid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detectedGrid, setDetectedGrid] = useState<DetectedGrid | null>(null);
  const [gridHashes, setGridHashes] = useState<GridHashes | null>(null);

  const [autoSync, setAutoSync] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(3); // Default to middle (100%)
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [isSelectingPath, setIsSelectingPath] = useState(false);
  const [applyingGrid, setApplyingGrid] = useState<string | null>(null);

  // Save setting to localStorage
  const saveSetting = (key: string, value: any) => {
    try {
      console.log(`Saving setting ${key}:`, value);
      localStorage.setItem(key, JSON.stringify(value));
      console.log(`Successfully saved setting ${key}`);
    } catch (error) {
      console.error(`Failed to save setting ${key}:`, error);
    }
  };

  const handleApplyGrid = async (grid: Grid) => {
    if (applyingGrid) return; // Prevent multiple simultaneous applications

    setApplyingGrid(grid.download_url);
    try {
      await invoke("activate_grid", {
        gridName: grid.name,
        downloadUrl: grid.download_url
      });

      notification.success({
        title: "Grid Applied Successfully",
        description: `Successfully applied ${grid.name}`,
        placement: "bottomRight",
      });

      // Refresh the detected grid after applying
      const path: string | null = await invoke("find_dota_config_path");
      if (path) {
        const detected: DetectedGrid | null = await invoke("detect_current_grid", { dotaConfigPath: path });
        if (detected && gridHashes) {
          const matched: DetectedGrid | null = await invoke("match_grid_hash", {
            gridHash: detected.hash,
            gridHashes
          });
          setDetectedGrid(matched || { ...detected, is_known: false });
        }
      }
    } catch (e: any) {
      notification.error({
        title: "Failed to Apply Grid",
        description: e.toString(),
        placement: "bottomRight",
      });
    } finally {
      setApplyingGrid(null);
    }
  };

  const handleSelectDotaPath = async () => {
    if (isSelectingPath) return; // Prevent multiple dialogs

    setIsSelectingPath(true);
    try {
      const selectedPath: string | null = await invoke("select_dota_path");
      if (selectedPath) {
        setDotaPath(selectedPath);

        // Re-run grid detection with the new path
        const detected: DetectedGrid | null = await invoke("detect_current_grid", { dotaConfigPath: selectedPath });
        if (detected && gridHashes) {
          const matched: DetectedGrid | null = await invoke("match_grid_hash", {
            gridHash: detected.hash,
            gridHashes
          });
          setDetectedGrid(matched || { ...detected, is_known: false });
        } else {
          setDetectedGrid(null);
        }

        notification.success({
          title: "Path Updated",
          description: "Dota 2 path has been updated successfully.",
          placement: "bottomRight",
        });
      }
    } catch (e: any) {
      notification.error({
        title: "Failed to Select Path",
        description: e.toString(),
        placement: "bottomRight",
      });
    } finally {
      setIsSelectingPath(false);
    }
  };

  const getGridRender = (gridType: string) => (grid?: Grid) => {
    if (!grid) return "N/A";

    const isCurrent = detectedGrid?.is_known &&
      detectedGrid.grid_type === gridType &&
      detectedGrid.name === grid.name;

    return (
      <Space>
        <Button
          onClick={() => handleApplyGrid(grid)}
          size="small"
          loading={applyingGrid === grid.download_url}
          disabled={applyingGrid === grid.download_url}
        >
          Apply
        </Button>
        {isCurrent && (
          <Text
            title="Currently Applied"
            style={{
              color: '#52c41a',
              fontSize: '16px',
              textShadow: '0 0 4px rgba(82, 196, 26, 0.6)',
              marginLeft: '4px',
              cursor: 'help'
            }}
          >
            ●
          </Text>
        )}
      </Space>
    );
  };

  const columns = [
    {
      title: "Date",
      dataIndex: "date",
      key: "date",
      width: 120,
    },
    {
      title: "Patch",
      dataIndex: "patch",
      key: "patch",
      width: 100,
    },
    {
      title: "D2PT Rating",
      dataIndex: "d2pt",
      key: "d2pt",
      render: getGridRender("d2pt"),
    },
    {
      title: "High Winrate",
      dataIndex: "highWinrate",
      key: "highWinrate",
      render: getGridRender("high_winrate"),
    },
    {
      title: "Most Played",
      dataIndex: "mostPlayed",
      key: "mostPlayed",
      render: getGridRender("most_played"),
    },
  ];

  // Zoom levels: 1=80%, 2=90%, 3=100%, 4=110%, 5=125%
  const getZoomScale = (level: number) => {
    const scales = [0.8, 0.9, 1.0, 1.1, 1.25];
    return scales[level - 1] || 1.0;
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => {
      const newLevel = Math.min(prev + 1, 5);
      saveSetting("zoomLevel", newLevel);
      return newLevel;
    });
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => {
      const newLevel = Math.max(prev - 1, 1);
      saveSetting("zoomLevel", newLevel);
      return newLevel;
    });
  };

  // Function to detect and update DPI information
  const updateDpiInfo = async () => {
    const dpi = window.devicePixelRatio;
    const effectiveScreenWidth = window.screen.width;
    const effectiveScreenHeight = window.screen.height;

    // Calculate physical screen resolution (effective resolution * device pixel ratio)
    const physicalScreenWidth = Math.round(effectiveScreenWidth * dpi);
    const physicalScreenHeight = Math.round(effectiveScreenHeight * dpi);

    // Get system DPI scale estimate from Tauri backend
    const systemDpiScale = await invoke("estimate_system_dpi_scale", {
      screenWidth: effectiveScreenWidth,
      screenHeight: effectiveScreenHeight,
      devicePixelRatio: dpi,
    }) as number;

    const screenInfo = {
      devicePixelRatio: dpi,
      screenWidth: effectiveScreenWidth,
      screenHeight: effectiveScreenHeight,
      physicalScreenWidth,
      physicalScreenHeight,
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      systemDpiScale,
    };

    console.log('DPI Debug Info Updated:', screenInfo);
    setDpiInfo(screenInfo);

    // Apply DPI-based scaling adjustments
    if (dpi >= 1.5) {
      document.documentElement.style.fontSize = '18px';
    } else if (dpi >= 2.0) {
      document.documentElement.style.fontSize = '20px';
    }
  };

  // DPI Debug Information
  const [dpiInfo, setDpiInfo] = useState({
    devicePixelRatio: 1,
    screenWidth: 0,
    screenHeight: 0,
    physicalScreenWidth: 0,
    physicalScreenHeight: 0,
    windowInnerWidth: 0,
    windowInnerHeight: 0,
    userAgent: '',
    platform: '',
    systemDpiScale: 1,
  });

  // Load settings on mount and sync with backend
  useEffect(() => {
    const initializeSettings = async () => {
      try {
        // Load settings from localStorage
        const storedAutoSync = localStorage.getItem("autoSync");
        const storedStartMinimized = localStorage.getItem("startMinimized");
        const storedMinimizeToTray = localStorage.getItem("minimizeToTray");
        const storedZoomLevel = localStorage.getItem("zoomLevel");
        const storedShowDebugInfo = localStorage.getItem("showDebugInfo");

        console.log("Loaded from localStorage:", {
          storedAutoSync,
          storedStartMinimized,
          storedMinimizeToTray,
          storedZoomLevel,
          storedShowDebugInfo
        });

        // Set state with loaded values (or defaults)
        const loadedAutoSync = storedAutoSync ? JSON.parse(storedAutoSync) : true;
        const loadedStartMinimized = storedStartMinimized ? JSON.parse(storedStartMinimized) : false;
        const loadedMinimizeToTray = storedMinimizeToTray ? JSON.parse(storedMinimizeToTray) : true;
        const loadedZoomLevel = storedZoomLevel ? parseInt(storedZoomLevel) : 3;
        const loadedShowDebugInfo = storedShowDebugInfo ? JSON.parse(storedShowDebugInfo) : false;

        console.log("Setting state to:", {
          loadedAutoSync,
          loadedStartMinimized,
          loadedMinimizeToTray,
          loadedZoomLevel,
          loadedShowDebugInfo
        });

        setAutoSync(loadedAutoSync);
        setStartMinimized(loadedStartMinimized);
        setMinimizeToTray(loadedMinimizeToTray);
        setZoomLevel(loadedZoomLevel);
        setShowDebugInfo(loadedShowDebugInfo);

        // Initialize backend settings
        console.log("Initializing backend with:", {
          minimizeToTray: loadedMinimizeToTray,
          startMinimized: loadedStartMinimized
        });
        await invoke("initialize_settings", {
          minimizeToTray: loadedMinimizeToTray,
          startMinimized: loadedStartMinimized
        });

        // Window visibility is now handled by the Rust backend during setup

      } catch (error) {
        console.error("Failed to initialize settings:", error);
      }
    };
    initializeSettings();
  }, []);

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      setError(null);
      try {
        // Initialize DPI information
        await updateDpiInfo();

        const path: string | null = await invoke("find_dota_config_path");
        setDotaPath(path ?? "Dota 2 configuration path not found.");

        // Download grid hashes for detection
        const hashes: GridHashes = await invoke("download_grid_hashes");
        setGridHashes(hashes);

        // Detect current grid if Dota path was found
        if (path) {
          const detected: DetectedGrid | null = await invoke("detect_current_grid", { dotaConfigPath: path });
          if (detected) {
            // Match the detected grid against known hashes
            const matched: DetectedGrid | null = await invoke("match_grid_hash", {
              gridHash: detected.hash,
              gridHashes: hashes
            });
            setDetectedGrid(matched || { ...detected, is_known: false });
          } else {
            setDetectedGrid(null);
          }
        }

        const remoteGrids: Grid[] = await invoke("list_remote_grids");
        const grouped = remoteGrids.reduce((acc, grid) => {
          const { date, name } = grid;
          const patchMatch = name.match(/_p(\d+)_(\w+)\.json/);
          const patch = patchMatch ? `${patchMatch[1]}.${patchMatch[2]}` : "N/A";
          if (!acc[date]) {
            acc[date] = {
              key: date,
              date,
              patch,
            };
          }
          if (name.includes("d2pt_rating")) {
            acc[date].d2pt = grid;
          } else if (name.includes("high_winrate")) {
            acc[date].highWinrate = grid;
          } else if (name.includes("most_played")) {
            acc[date].mostPlayed = grid;
          }
          return acc;
        }, {} as { [date: string]: GroupedGrid });

        setGrids(
          Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date))
        );
      } catch (e: any) {
        setError(e.toString());
        notification.error({
          title: "Error During Initialization",
          description: e.toString(),
          placement: "bottomRight" as const,
        });
      } finally {
        setLoading(false);
      }
    };

    initialize();

    // Set up event listeners for monitor changes
    let lastScreenInfo = {
      width: window.screen.width,
      height: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
    };

    const handleResize = () => {
      // Check if screen properties have changed (indicating monitor switch)
      const currentScreenInfo = {
        width: window.screen.width,
        height: window.screen.height,
        devicePixelRatio: window.devicePixelRatio,
      };

      const screenChanged =
        currentScreenInfo.width !== lastScreenInfo.width ||
        currentScreenInfo.height !== lastScreenInfo.height ||
        currentScreenInfo.devicePixelRatio !== lastScreenInfo.devicePixelRatio;

      if (screenChanged) {
        console.log('Monitor change detected, updating DPI info');
        lastScreenInfo = currentScreenInfo;
      }

      // Always update DPI info on resize to capture window size changes
      updateDpiInfo();
    };

    // Listen for resize events (may trigger when moving between monitors)
    window.addEventListener('resize', handleResize);

    // Also poll every 2 seconds as a fallback for monitor changes
    const pollInterval = setInterval(() => {
      const currentScreenInfo = {
        width: window.screen.width,
        height: window.screen.height,
        devicePixelRatio: window.devicePixelRatio,
      };

      if (
        currentScreenInfo.width !== lastScreenInfo.width ||
        currentScreenInfo.height !== lastScreenInfo.height ||
        currentScreenInfo.devicePixelRatio !== lastScreenInfo.devicePixelRatio
      ) {
        console.log('Monitor change detected via polling, updating DPI info');
        lastScreenInfo = currentScreenInfo;
        updateDpiInfo();
      }
    }, 2000);

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      clearInterval(pollInterval);
    };
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          fontSize: getZoomScale(zoomLevel) * 14,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: "flex", alignItems: "center" }}>
          <Title level={3} style={{ color: "white", margin: 0 }}>
            D2PT Grid Updater
          </Title>
        </Header>
        <Content
          style={{
            padding: "24px",
          }}
        >
          <Flex vertical gap="large" style={{ width: "100%" }}>
            {error && (
              <Alert
                message="An error occurred"
                description={error}
                type="error"
                showIcon
              />
            )}

            <Card title="Status">
              <Space direction="vertical" size="small" style={{ width: "100%" }}>
                <div>
                  <Space>
                    <Text strong>Dota 2 Config Path: </Text>
                    <Button
                      size="small"
                      onClick={handleSelectDotaPath}
                      loading={isSelectingPath}
                      disabled={isSelectingPath}
                      style={{ fontSize: '12px', padding: '0 8px' }}
                    >
                      Change
                    </Button>
                  </Space>
                  <br />
                  <Text code style={{ display: 'block', marginTop: '4px' }}>{dotaPath}</Text>
                </div>
                <div>
                  <Text strong>Current Grid: </Text>
                  {detectedGrid ? (
                    <Text code>
                      {detectedGrid.is_known
                        ? `${detectedGrid.name} (${detectedGrid.date})`
                        : `Custom Grid (MD5: ${detectedGrid.hash.substring(0, 8)}...)`
                      }
                    </Text>
                  ) : (
                    <Text code>No grid file found</Text>
                  )}
                </div>
                {showDebugInfo && (
                  <>
                    <div>
                      <Text strong>DPI Debug Info: </Text>
                      <Text code>
                        DPR: {dpiInfo.devicePixelRatio} |
                        Physical Screen: {dpiInfo.physicalScreenWidth}x{dpiInfo.physicalScreenHeight} |
                        Effective Screen: {dpiInfo.screenWidth}x{dpiInfo.screenHeight} |
                        Window: {dpiInfo.windowInnerWidth}x{dpiInfo.windowInnerHeight} |
                        System Scale: {dpiInfo.systemDpiScale}x
                      </Text>
                    </div>
                    <div>
                      <Text strong>Platform: </Text>
                      <Text code>{dpiInfo.platform}</Text>
                    </div>
                  </>
                )}
              </Space>
            </Card>

            <Card title="Available Grids">
              <Table
                columns={columns}
                dataSource={grids}
                loading={loading}
                pagination={{ pageSize: 10 }}
                size="small"
              />
            </Card>

            <Card title="Settings">
              <Space direction="vertical" style={{ width: "100%" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <Text>Auto-sync with latest grid</Text>
                  <Switch checked={autoSync} onChange={setAutoSync} />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <Text>Start minimized</Text>
                  <Switch
                    checked={startMinimized}
                    onChange={async (checked) => {
                      console.log("Start minimized switch changed to:", checked);
                      setStartMinimized(checked);
                      saveSetting("startMinimized", checked);
                      try {
                        await invoke("set_start_minimized", { enabled: checked });
                      } catch (error) {
                        console.error("Failed to update start minimized setting:", error);
                      }
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <Text>Minimize to tray on close</Text>
                  <Switch
                    checked={minimizeToTray}
                    onChange={async (checked) => {
                      console.log("Minimize to tray switch changed to:", checked);
                      setMinimizeToTray(checked);
                      saveSetting("minimizeToTray", checked);
                      try {
                        await invoke("set_minimize_to_tray", { enabled: checked });
                      } catch (error) {
                        console.error("Failed to update minimize to tray setting:", error);
                      }
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text>Font Size / Zoom</Text>
                  <Space>
                    <Button size="small" onClick={handleZoomOut} disabled={zoomLevel <= 1}>-</Button>
                    <Text style={{ minWidth: '40px', textAlign: 'center' }}>
                      {Math.round(getZoomScale(zoomLevel) * 100)}%
                    </Text>
                    <Button size="small" onClick={handleZoomIn} disabled={zoomLevel >= 5}>+</Button>
                  </Space>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <Text>Show DPI Debug Info</Text>
                  <Switch
                    checked={showDebugInfo}
                    onChange={(checked) => {
                      setShowDebugInfo(checked);
                      saveSetting("showDebugInfo", checked);
                    }}
                  />
                </div>
                <Button
                  danger
                  style={{ marginTop: "16px" }}
                  onClick={async () => {
                    try {
                      await invoke("clear_cache");
                      notification.success({
                        title: "Cache Cleared",
                        description: "Local cache has been cleared successfully.",
                        placement: "bottomRight",
                      });
                    } catch (e: any) {
                      notification.error({
                        title: "Failed to Clear Cache",
                        description: e.toString(),
                        placement: "bottomRight",
                      });
                    }
                  }}
                >
                  Clear Local Cache
                </Button>
              </Space>
            </Card>
          </Flex>
        </Content>
        <Footer style={{ textAlign: "center" }}>
          D2PT Grid Updater ©2025 Created with Tauri
        </Footer>
      </Layout>
    </ConfigProvider>
  );
}

export default App;

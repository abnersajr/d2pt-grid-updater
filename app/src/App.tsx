import { useState, useEffect } from "react";
import {
  Button,
  Card,
  ConfigProvider,
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

const notifyBackendBroken = () => {
  notification.error({
    title: "Feature Not Available",
    description:
      "The backend for this feature is currently broken and could not be compiled. This functionality is disabled.",
    placement: "bottomRight" as const,
  });
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
    render: (grid?: Grid) =>
      grid ? (
        <Button onClick={notifyBackendBroken} size="small">
          Apply
        </Button>
      ) : (
        "N/A"
      ),
  },
  {
    title: "High Winrate",
    dataIndex: "highWinrate",
    key: "highWinrate",
    render: (grid?: Grid) =>
      grid ? (
        <Button onClick={notifyBackendBroken} size="small">
          Apply
        </Button>
      ) : (
        "N/A"
      ),
  },
  {
    title: "Most Played",
    dataIndex: "mostPlayed",
    key: "mostPlayed",
    render: (grid?: Grid) =>
      grid ? (
        <Button onClick={notifyBackendBroken} size="small">
          Apply
        </Button>
      ) : (
        "N/A"
      ),
  },
];

function App() {
  const [dotaPath, setDotaPath] = useState("Searching for Dota 2 path...");
  const [grids, setGrids] = useState<GroupedGrid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [autoSync, setAutoSync] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);
  const [wslOverride, setWslOverride] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(3); // Default to middle (100%)
  const [showDebugInfo, setShowDebugInfo] = useState(false);

  // Zoom levels: 1=80%, 2=90%, 3=100%, 4=110%, 5=125%
  const getZoomScale = (level: number) => {
    const scales = [0.8, 0.9, 1.0, 1.1, 1.25];
    return scales[level - 1] || 1.0;
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 1, 5));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 1, 1));
  };

  // DPI Debug Information
  const [dpiInfo, setDpiInfo] = useState({
    devicePixelRatio: 1,
    screenWidth: 0,
    screenHeight: 0,
    windowInnerWidth: 0,
    windowInnerHeight: 0,
    userAgent: '',
    platform: '',
    systemDpiScale: 1,
  });

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      setError(null);
      try {
        // DPI Detection and Logging
        const dpi = window.devicePixelRatio;
        const screenInfo = {
          devicePixelRatio: dpi,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          windowInnerWidth: window.innerWidth,
          windowInnerHeight: window.innerHeight,
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          systemDpiScale: 1, // Will be updated from Tauri command
        };

        console.log('DPI Debug Info:', screenInfo);

        // Try to get system DPI from Tauri (will fail gracefully if command doesn't exist yet)
        try {
          const systemDpi = await invoke("get_system_dpi_scale") as number;
          screenInfo.systemDpiScale = systemDpi;
        } catch (e) {
          console.log('System DPI command not available yet:', e);
        }

        setDpiInfo(screenInfo);

        // Apply DPI-based scaling adjustments
        if (dpi >= 1.5) {
          document.documentElement.style.fontSize = '18px';
        } else if (dpi >= 2.0) {
          document.documentElement.style.fontSize = '20px';
        }

        const path: string | null = await invoke("find_dota_config_path");
        setDotaPath(path ?? "Dota 2 configuration path not found.");

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
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          fontSize: 14,
        },
      }}
    >
      <Layout
        className={`layout ${wslOverride ? 'wsl-override' : ''}`}
        style={{
          transform: `scale(${getZoomScale(zoomLevel)})`,
          transformOrigin: 'top left',
          width: `${100 / getZoomScale(zoomLevel)}%`,
          height: `${100 / getZoomScale(zoomLevel)}%`,
        }}
      >
        <Header style={{ display: "flex", alignItems: "center" }}>
          <Title level={3} style={{ color: "white", margin: 0 }}>
            D2PT Grid Updater
          </Title>
        </Header>
        <Content style={{ padding: "24px" }}>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
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
                  <Text strong>Dota 2 Config Path: </Text>
                  <Text code>{dotaPath}</Text>
                </div>
                {showDebugInfo && (
                  <>
                    <div>
                      <Text strong>DPI Debug Info: </Text>
                      <Text code>
                        DPR: {dpiInfo.devicePixelRatio} |
                        Screen: {dpiInfo.screenWidth}x{dpiInfo.screenHeight} |
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
                    onChange={setStartMinimized}
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
                    onChange={setMinimizeToTray}
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
                    onChange={setShowDebugInfo}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <Text>WSL Font Size Override (Debug)</Text>
                  <Switch
                    checked={wslOverride}
                    onChange={setWslOverride}
                  />
                </div>
                <Button
                  danger
                  style={{ marginTop: "16px" }}
                  onClick={notifyBackendBroken}
                >
                  Clear Local Cache
                </Button>
              </Space>
            </Card>
          </Space>
        </Content>
        <Footer style={{ textAlign: "center" }}>
          D2PT Grid Updater ©2025 Created with Tauri
        </Footer>
      </Layout>
    </ConfigProvider>
  );
}

export default App;

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

const notifyBackendBroken = () => {
  notification.error({
    message: "Feature Not Available",
    description:
      "The backend for this feature is currently broken and could not be compiled. This functionality is disabled.",
    placement: "bottomRight",
  });
};

const columns = [
  {
    title: "Grid Name",
    dataIndex: "name",
    key: "name",
  },
  {
    title: "Date",
    dataIndex: "date",
    key: "date",
    width: 120,
  },
  {
    title: "Action",
    key: "action",
    width: 120,
    render: () => <Button onClick={notifyBackendBroken}>Apply</Button>,
  },
];

function App() {
  const [dotaPath, setDotaPath] = useState("Searching for Dota 2 path...");
  const [grids, setGrids] = useState<Grid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [autoSync, setAutoSync] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      setError(null);
      try {
        // --- Call working backend functions ---
        const path: string | null = await invoke("find_dota_config_path");
        setDotaPath(path ?? "Dota 2 configuration path not found.");

        const remoteGrids: Grid[] = await invoke("list_remote_grids");
        setGrids(remoteGrids.map((g) => ({ ...g, key: g.name })));
      } catch (e: any) {
        setError(e.toString());
        notification.error({
          message: "Error During Initialization",
          description: e.toString(),
          placement: "bottomRight",
        });
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <Layout className="layout">
        <Header style={{ display: "flex", alignItems: "center" }}>
          <Title level={3} style={{ color: "white", margin: 0 }}>
            D2PT Grid Updater
          </Title>
        </Header>
        <Content style={{ padding: "24px" }}>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            {error && <Alert message="An error occurred" description={error} type="error" showIcon />}
            
            <Card title="Status">
              <Text strong>Dota 2 Config Path: </Text>
              <Text code>{dotaPath}</Text>
            </Card>

            <Card title="Available Grids">
              <Table
                columns={columns}
                dataSource={grids}
                loading={loading}
                pagination={{ pageSize: 5 }}
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

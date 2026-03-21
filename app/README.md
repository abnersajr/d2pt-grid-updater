# D2PT Grid Updater

A simple Tauri-based desktop application for Windows, macOS, and Linux to automatically find your Dota 2 installation and keep your hero grids synchronized with the latest versions from the Dota 2 Pro Tracker community.

## Features

- **Automatic Path Detection:** Automatically finds your Dota 2 configuration directory across multiple Steam user profiles with manual override option.
- **Remote Grid Library:** Fetches the latest hero grid configurations from a remote repository.
- **On-Demand Updates:** Apply any grid from the library with a single click.
- **Local Caching:** Grids are cached locally to save bandwidth and for offline use.
- **Grid Detection:** Automatically detects and identifies your currently applied grid configuration.
- **Tray Integration:** Minimizes to system tray with customizable behavior and double-click to restore.
- **Settings Persistence:** Remembers your preferences including zoom level, startup behavior, and UI settings.
- **DPI Scaling & Zoom:** Automatic DPI detection with manual zoom controls for optimal display on high-resolution monitors.
- **Auto-Sync:** Optional setting to automatically apply the latest grid on application startup.
- **Cross-Platform:** Built with Tauri to run on Windows, macOS, and Linux.

## Tech Stack & Decisions

- **[Tauri 2](https://tauri.app/):** Used for the core desktop application framework. It provides a lightweight, secure, and cross-platform way to build desktop apps using a Rust backend and a webview frontend.
- **[React 19](https://react.dev/):** Used for the frontend UI. It provides a modern, component-based architecture for building user interfaces.
- **[Ant Design 6](https://ant.design/):** Used as the UI component library. It offers a rich set of high-quality components that accelerates UI development.
- **[Rust](https://www.rust-lang.org/):** Used for the backend. Its performance, safety, and strong typing make it ideal for handling system-level tasks like file system operations and network requests.
- **Remote-First Grids:** Grid files are not bundled with the app. They are fetched from a GitHub repository, which allows for updating grids without needing a new application release.
- **Tray Icon Support:** Integrated system tray functionality for minimized operation and quick access.
- **Settings Persistence:** User preferences are saved locally using localStorage and persistent files for cross-session continuity.

## Settings & Configuration

The application provides several customizable settings:

- **Auto-sync:** Automatically apply the latest grid on application startup
- **Start Minimized:** Launch the application minimized to tray
- **Minimize to Tray:** Send window to system tray instead of closing when the close button is clicked
- **Font Size / Zoom:** Manual zoom controls (80%, 90%, 100%, 110%, 125%) with automatic DPI scaling
- **Debug Information:** Optional DPI and system information display for troubleshooting

## Development

To set up a development environment, you will need to install [Node.js/pnpm](https://pnpm.io/installation) and the [Rust toolchain with Tauri prerequisites](https://tauri.app/start/prerequisites/).

**WSL Development Notes:**
- For WSL development with Windows display output (`--target x86_64-pc-windows-gnu`), you need:
  - **Rust toolchain**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - **Windows target**: `rustup target add x86_64-pc-windows-gnu`
  - **MinGW-w64**: `sudo apt-get install gcc-mingw-w64 g++-mingw-w64`
  - **Additional libraries**: `sudo apt-get install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`
- This setup allows running the application on WSL while displaying through Windows mechanisms instead of X11.

**Note:** Some backend functions (`activate_grid`, `clear_cache`, `select_dota_path`) are currently called by the frontend but not fully implemented in the Rust backend. These features are planned for future development.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/abnersajr/d2pt-grid-updater.git
    cd d2pt-grid-updater
    ```

2.  **Install frontend dependencies:**
    The project is located in the `/app` directory.
    ```bash
    cd app
    pnpm install
    ```

3.  **Run the development server:**
    This will open the application in a development window with hot-reloading for both the frontend and backend.

    **Standard development:**
    ```bash
    pnpm tauri:dev
    ```

    **WSL Development (Windows Display):**
    If you're developing on WSL (Windows Subsystem for Linux) and want the application to display using Windows mechanisms instead of X11, use:
    ```bash
    pnpm tauri:dev:wsl
    ```

## Building

To build the application for production, run the following command from the `/app` directory:

```bash
pnpm tauri build
```

The compiled installers and binaries will be located in `app/src-tauri/target/release/`.

## Distribution & Releasing

This project uses **GitHub Actions** to automatically build and release the application when a new version tag is pushed to the repository.

To create a new release:

1.  **Commit all your changes** to the `main` branch.
2.  **Create a new version tag:**
    The tag must follow the format `vX.Y.Z` (e.g., `v1.0.0`, `v1.0.1`).
    ```bash
    git tag v1.0.0
    ```
3.  **Push the tag to GitHub:**
    ```bash
    git push origin v1.0.0
    ```

Pushing the tag will trigger the `release.yml` workflow, which builds the app for Windows, macOS, and Linux, creates a new GitHub Release, and attaches the installers as downloadable artifacts.
# GAWWW

GAWWW (graphical awww) is a graphical wallpaper manager for Linux Wayland desktops, built with Rust and Tauri. It drives [awww](https://codeberg.org/LGFae/awww) (`awww` + `awww-daemon`) through its command line interface, so the daemon keeps owning the wallpaper while this app provides a friendly desktop UI for picking images, choosing outputs, tuning transitions and controlling the daemon.

## Features

- Native file picker and drag-and-drop wallpaper selection (PNG, JPG, WEBP, GIF, SVG, BMP, TIFF, TGA, PNM and other formats supported by `awww`)
- Live preview with dimensions and file size
- Automatic daemon startup when you apply a wallpaper
- Per-output selection when the compositor reports several displays
- Transitions: crossfade, bezier fade, directional wipes, wave, growing and shrinking circles, random effects
- Image fitting controls: crop, fit, stretch and original size, plus crop anchor and scaling filter
- Solid colour fill and restore of the last cached wallpaper
- Pause and resume animated wallpapers
- Recent files list
- Terminal styled interface (monospace, phosphor palette, keyboard shortcuts)
- Self-contained frontend (no Node.js or bundler required)

## Requirements

- Linux with a Wayland compositor that implements `wlr-layer-shell` (Hyprland, Sway, Mango, River, ...)
- `awww` and `awww-daemon` available in `PATH`
- Rust 1.90 or newer
- GTK 3 and WebKitGTK 4.1 development packages, `libsoup-3.0` and `pkg-config`

On Arch Linux the system dependencies are:

```sh
sudo pacman -S --needed awww rust base-devel webkit2gtk-4.1 gtk3 libsoup3
```

## Build and run

```sh
git clone https://github.com/ViaFaniq/Gawww.git
cd Gawww
cargo run --manifest-path src-tauri/Cargo.toml
```

Release build:

```sh
cargo build --release --manifest-path src-tauri/Cargo.toml
./src-tauri/target/release/gawww
```

## Packaging

Bundling is enabled in `src-tauri/tauri.conf.json`. To produce an AppImage, install the Tauri CLI and run:

```sh
cargo install tauri-cli --version "^2"
cargo tauri build --bundles appimage
```

Outputs:

- `src-tauri/target/release/gawww` — plain release binary
- `src-tauri/target/release/bundle/appimage/GAWWW_0.1.0_amd64.AppImage` — portable AppImage

The AppImage normally executes with FUSE (`libfuse2`). On systems without it, run `./GAWWW_0.1.0_amd64.AppImage --appimage-extract-and-run`.

## Usage

1. Start the app. If the daemon is not running, it is reported as offline.
2. Choose an image with the file picker, `Ctrl+O`, or drag and drop a file onto the preview.
3. Pick the displays that should receive the wallpaper.
4. Tune the transition and image fitting options.
5. Press `Apply wallpaper` (`Ctrl+Enter`). The daemon starts automatically if needed.

The daemon controls card offers pause, resume and restore. The header button starts or stops `awww-daemon`. The daemon log is written to `$XDG_CACHE_HOME/gawww/daemon.log` (usually `~/.cache/gawww/daemon.log`).

## Project layout

```
src-tauri/
  src/awww.rs      awww command wrapper, output parsing and daemon lifecycle
  src/preview.rs   thumbnail generation for the UI
  src/lib.rs       Tauri commands and app setup
  tauri.conf.json  window, bundle and security configuration
ui/
  index.html       application shell
  styles.css       terminal styled theme
  main.js          UI state and Tauri command calls
```

## Notes

- The app controls the default `awww-daemon` namespace. Custom daemon namespaces can still be managed with `awww --namespace`.
- Preview generation uses the Rust `image` crate. Formats that `awww` can display but the previewer cannot decode (for example SVG or AVIF) still apply correctly, they just show a placeholder instead of a thumbnail.
- Animated GIFs are previewed by their first frame.
- `awww` cannot run on GNOME because Mutter does not implement `wlr-layer-shell`.

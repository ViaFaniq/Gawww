(() => {
  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke;
  const appWindow = tauri?.webviewWindow?.getCurrentWebviewWindow?.();

  const $ = (id) => document.getElementById(id);

  const daemonBadge = $("daemonBadge");
  const daemonStatusText = $("daemonStatusText");
  const refreshButton = $("refreshButton");
  const daemonToggle = $("daemonToggle");
  const daemonToggleText = $("daemonToggleText");
  const versionText = $("versionText");

  const previewStage = $("previewStage");
  const previewBackdrop = $("previewBackdrop");
  const previewImage = $("previewImage");
  const previewEmpty = $("previewEmpty");
  const previewEmptyTitle = $("previewEmptyTitle");
  const previewEmptyText = $("previewEmptyText");
  const previewLoading = $("previewLoading");
  const previewInfo = $("previewInfo");
  const previewName = $("previewName");
  const previewPath = $("previewPath");
  const previewDims = $("previewDims");
  const previewSize = $("previewSize");
  const previewSourceChip = $("previewSourceChip");
  const selectedPath = $("selectedPath");
  const chooseButton = $("chooseButton");
  const applyButton = $("applyButton");

  const displaysSummary = $("displaysSummary");
  const outputsGrid = $("outputsGrid");
  const outputsEmpty = $("outputsEmpty");
  const outputsEmptyText = $("outputsEmptyText");
  const outputsEmptyAction = $("outputsEmptyAction");
  const selectAllButton = $("selectAllButton");
  const selectNoneButton = $("selectNoneButton");

  const recentCard = $("recentCard");
  const recentList = $("recentList");
  const clearRecentButton = $("clearRecentButton");

  const transitionSelect = $("transitionSelect");
  const transitionChip = $("transitionChip");
  const transitionHint = $("transitionHint");
  const durationField = $("durationField");
  const durationRange = $("durationRange");
  const durationValue = $("durationValue");
  const fpsField = $("fpsField");
  const fpsRange = $("fpsRange");
  const fpsValue = $("fpsValue");

  const resizeSelect = $("resizeSelect");
  const gravityField = $("gravityField");
  const gravitySelect = $("gravitySelect");
  const filterSelect = $("filterSelect");

  const pauseButton = $("pauseButton");
  const resumeButton = $("resumeButton");
  const restoreButton = $("restoreButton");
  const daemonHint = $("daemonHint");

  const fillColor = $("fillColor");
  const fillColorHex = $("fillColorHex");
  const fillButton = $("fillButton");

  const toasts = $("toasts");

  const DEFAULT_SETTINGS = {
    transition: "simple",
    duration: 3,
    fps: 30,
    resize: "crop",
    gravity: "center",
    filter: "Lanczos3",
    fillColor: "#0b0f17",
  };

  const TRANSITIONS = new Set([
    "none",
    "simple",
    "fade",
    "left",
    "right",
    "top",
    "bottom",
    "wipe",
    "wave",
    "grow",
    "center",
    "any",
    "outer",
    "random",
  ]);

  const RESIZES = new Set(["no", "crop", "fit", "stretch"]);
  const FILTERS = new Set(["Nearest", "Bilinear", "CatmullRom", "Mitchell", "Lanczos3"]);
  const GRAVITIES = new Set([
    "top-left",
    "top",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom",
    "bottom-right",
  ]);

  const TRANSITION_LABELS = {
    none: "instant",
    simple: "simple",
    fade: "fade",
    left: "from left",
    right: "from right",
    top: "from top",
    bottom: "from bottom",
    wipe: "wipe",
    wave: "wave",
    grow: "grow",
    center: "centre",
    any: "random circle",
    outer: "outer",
    random: "random",
  };

  const TRANSITION_HINTS = {
    none: "the new wallpaper appears immediately",
    simple: "frame by frame crossfade between the old and the new wallpaper",
    fade: "smooth fade controlled by a bezier curve",
    left: "the wipe travels from the left edge to the right",
    right: "the wipe travels from the right edge to the left",
    top: "the wipe travels from the top edge to the bottom",
    bottom: "the wipe travels from the bottom edge to the top",
    wipe: "angled wipe across the screen",
    wave: "wavy wipe that sweeps across the screen",
    grow: "a growing circle reveals the new wallpaper",
    center: "the circle starts at the centre of the screen",
    outer: "a shrinking circle reveals the new wallpaper",
    any: "a growing or shrinking circle from a random point",
    random: "a random effect, angle and origin every time",
  };

  const STORAGE_KEYS = {
    settings: "gawww.settings.v1",
    recent: "gawww.recent.v1",
    selected: "gawww.selected.v1",
  };

  const TOAST_PREFIXES = {
    success: "[ ok ]",
    error: "[ !! ]",
    info: "[ .. ]",
  };

  function migrateLegacyStorage() {
    const legacy = {
      settings: "awww-wallpaper.settings.v1",
      recent: "awww-wallpaper.recent.v1",
      selected: "awww-wallpaper.selected.v1",
    };
    try {
      for (const [key, legacyKey] of Object.entries(legacy)) {
        const value = localStorage.getItem(legacyKey);
        if (value !== null && localStorage.getItem(STORAGE_KEYS[key]) === null) {
          localStorage.setItem(STORAGE_KEYS[key], value);
        }
      }
    } catch (error) {}
  }

  migrateLegacyStorage();

  const state = {
    status: { running: false, version: null, outputs: [], error: null },
    selectedPath: null,
    selectedInfo: null,
    previewPath: null,
    previewSource: null,
    previewToken: 0,
    selectedOutputs: new Set(),
    knownOutputs: new Set(),
    outputsInitialized: false,
    refreshing: false,
    checking: false,
    busy: {},
    settings: loadSettings(),
    recent: loadRecent(),
  };

  function loadSettings() {
    const settings = { ...DEFAULT_SETTINGS };
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || "{}");
      if (TRANSITIONS.has(stored.transition)) settings.transition = stored.transition;
      if (Number.isFinite(stored.duration)) settings.duration = clamp(stored.duration, 0.5, 10);
      if (Number.isFinite(stored.fps)) settings.fps = clamp(Math.round(stored.fps), 10, 144);
      if (RESIZES.has(stored.resize)) settings.resize = stored.resize;
      if (GRAVITIES.has(stored.gravity)) settings.gravity = stored.gravity;
      if (FILTERS.has(stored.filter)) settings.filter = stored.filter;
      if (/^#[0-9a-f]{6}$/i.test(stored.fillColor)) settings.fillColor = stored.fillColor;
    } catch (error) {
      return { ...DEFAULT_SETTINGS };
    }
    return settings;
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    } catch (error) {}
  }

  function loadRecent() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.recent) || "[]");
      return Array.isArray(stored) ? stored.filter((item) => typeof item === "string").slice(0, 8) : [];
    } catch (error) {
      return [];
    }
  }

  function saveRecent() {
    try {
      localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(state.recent));
    } catch (error) {}
  }

  function loadSelected() {
    try {
      return localStorage.getItem(STORAGE_KEYS.selected) || null;
    } catch (error) {
      return null;
    }
  }

  function saveSelected() {
    try {
      if (state.selectedPath) {
        localStorage.setItem(STORAGE_KEYS.selected, state.selectedPath);
      } else {
        localStorage.removeItem(STORAGE_KEYS.selected);
      }
    } catch (error) {}
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function baseName(path) {
    const parts = String(path).split("/").filter(Boolean);
    return parts[parts.length - 1] || String(path);
  }

  function dirName(path) {
    const parts = String(path).split("/").filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join("/")}` : "/";
  }

  function formatBytes(bytes) {
    if (!bytes) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    const rounded = index === 0 || value >= 10 ? Math.round(value) : value.toFixed(1);
    return `${rounded} ${units[index]}`;
  }

  function paintRange(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const value = Number(input.value);
    const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;
    input.style.setProperty("--fill", `${percentage}%`);
  }

  function showToast(message, type = "info", timeout = 4600) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    const prefix = document.createElement("span");
    prefix.className = "toast-prefix";
    prefix.textContent = TOAST_PREFIXES[type] || TOAST_PREFIXES.info;

    const text = document.createElement("span");
    text.className = "toast-message";
    text.textContent = String(message || "").trim();

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.textContent = "x";
    close.setAttribute("aria-label", "dismiss");

    toast.append(prefix, text, close);
    toasts.append(toast);

    const remove = () => {
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 220);
    };

    close.addEventListener("click", remove);
    setTimeout(remove, timeout);
  }

  function setBusy(key, busy, button, disable = true) {
    state.busy[key] = busy;
    if (button) {
      button.classList.toggle("is-busy", busy);
      if (disable) button.disabled = busy;
    }
  }

  async function withBusy(key, button, task) {
    if (state.busy[key]) return;
    setBusy(key, true, button);
    updateApplyState();
    updateActionButtons();
    updateDaemonUi();

    try {
      return await task();
    } finally {
      setBusy(key, false, button, false);
      updateApplyState();
      updateActionButtons();
      updateDaemonUi();
    }
  }

  function updateDaemonUi() {
    const running = state.status.running;
    daemonBadge.className = `status-pill ${state.checking ? "checking" : running ? "online" : "offline"}`;
    daemonStatusText.textContent = state.checking ? "checking" : running ? "running" : "offline";
    daemonBadge.title = state.status.error || "";

    daemonToggleText.textContent = running ? "stop daemon" : "start daemon";
    daemonToggle.classList.toggle("button-secondary", !running);
    daemonToggle.disabled = Boolean(state.busy.daemon);
    daemonToggle.title = running ? "stop awww-daemon" : "start awww-daemon";

    versionText.textContent = state.status.version ? `awww ${state.status.version}` : "awww";
  }

  function updateActionButtons() {
    const running = state.status.running;
    const busy = Boolean(state.busy.action);
    pauseButton.disabled = !running || busy;
    resumeButton.disabled = !running || busy;
    restoreButton.disabled = Boolean(state.busy.restore);
    daemonHint.textContent = running
      ? "commands control the default awww namespace"
      : "start the daemon to control wallpapers";

    const outputs = state.status.outputs;
    const hasOutputs = running && outputs.length > 0;
    selectAllButton.disabled = !hasOutputs;
    selectNoneButton.disabled = !hasOutputs;
  }

  function updateApplyState() {
    const noneSelected =
      state.status.running && state.status.outputs.length > 0 && state.selectedOutputs.size === 0;
    const inspected = state.selectedInfo ? state.selectedInfo.available !== false : false;
    const canApply = Boolean(state.selectedPath) && inspected && !state.busy.apply;

    applyButton.disabled = !canApply || noneSelected;
    applyButton.title = noneSelected ? "select at least one display" : "";
  }

  function reconcileOutputs() {
    if (!state.status.running) return;
    const names = state.status.outputs.map((output) => output.name);

    if (!state.outputsInitialized) {
      state.selectedOutputs = new Set(names);
      state.knownOutputs = new Set(names);
      state.outputsInitialized = true;
      return;
    }

    const hadAll =
      state.knownOutputs.size > 0 && [...state.knownOutputs].every((name) => state.selectedOutputs.has(name));
    const next = new Set();

    for (const name of names) {
      if (hadAll || state.selectedOutputs.has(name) || !state.knownOutputs.has(name)) {
        next.add(name);
      }
    }

    state.selectedOutputs = next;
    state.knownOutputs = new Set(names);
  }

  function firstImage() {
    for (const output of state.status.outputs) {
      if (output.image) return output.image;
    }
    return null;
  }

  function renderOutputs() {
    outputsGrid.innerHTML = "";
    const running = state.status.running;
    const outputs = state.status.outputs;

    if (!running) {
      outputsEmpty.classList.add("visible");
      outputsEmptyText.textContent = state.status.error
        ? `awww-daemon is not running. ${state.status.error}`
        : "awww-daemon is not running yet";
      outputsEmptyAction.querySelector("span").textContent = "start daemon";
      outputsEmptyAction.hidden = false;
      displaysSummary.textContent = "waiting for the daemon";
      return;
    }

    if (outputs.length === 0) {
      outputsEmpty.classList.add("visible");
      outputsEmptyText.textContent = "the compositor did not report any displays";
      outputsEmptyAction.hidden = true;
      displaysSummary.textContent = "no displays reported";
      return;
    }

    outputsEmpty.classList.remove("visible");

    for (const output of outputs) {
      const selected = state.selectedOutputs.has(output.name);
      const card = document.createElement("button");
      card.type = "button";
      card.className = `output-card${selected ? " selected" : ""}`;
      card.setAttribute("aria-pressed", String(selected));
      card.title = output.image ? `${output.name}\n${output.image}` : output.name;

      const check = document.createElement("span");
      check.className = "output-check";
      check.textContent = selected ? "x" : " ";

      const body = document.createElement("span");
      body.className = "output-body";

      const name = document.createElement("strong");
      name.textContent = output.name;

      const dimensions = document.createElement("span");
      dimensions.textContent = `${output.width}x${output.height} @${Math.round(output.scale * 100)}%`;

      const current = document.createElement("span");
      current.className = "output-current";
      current.textContent = output.image ? baseName(output.image) : output.color ? `solid ${output.color}` : "empty";

      body.append(name, dimensions, current);
      card.append(check, body);

      card.addEventListener("click", () => {
        if (state.selectedOutputs.has(output.name)) {
          state.selectedOutputs.delete(output.name);
        } else {
          state.selectedOutputs.add(output.name);
        }
        renderOutputs();
        updateApplyState();
        updateActionButtons();
      });

      outputsGrid.append(card);
    }

    const count = outputs.filter((output) => state.selectedOutputs.has(output.name)).length;
    if (count === 0) {
      displaysSummary.textContent = "no displays selected";
    } else if (count === outputs.length) {
      displaysSummary.textContent = `all ${outputs.length} display${outputs.length === 1 ? "" : "s"} selected`;
    } else {
      displaysSummary.textContent = `${count} of ${outputs.length} displays selected`;
    }
  }

  function renderRecent() {
    recentCard.hidden = state.recent.length === 0;
    recentList.innerHTML = "";

    for (const path of state.recent) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "recent-item";
      item.title = path;

      const prefix = document.createElement("span");
      prefix.className = "recent-prefix";
      prefix.textContent = ">";

      const text = document.createElement("span");
      text.className = "recent-text";

      const name = document.createElement("strong");
      name.textContent = baseName(path);

      const directory = document.createElement("small");
      directory.textContent = dirName(path);

      text.append(name, directory);
      item.append(prefix, text);
      item.addEventListener("click", () => selectFile(path));
      recentList.append(item);
    }
  }

  function updateSelectionUi() {
    selectedPath.textContent = state.selectedPath || "none selected";
    selectedPath.title = state.selectedPath || "";
  }

  function updateTransitionUi() {
    const kind = state.settings.transition;
    transitionChip.textContent = TRANSITION_LABELS[kind] || kind;
    transitionHint.textContent = TRANSITION_HINTS[kind] || "";
    durationField.hidden = kind === "simple" || kind === "none";
    fpsField.hidden = kind === "none";
  }

  function updateGravityUi() {
    const cropping = state.settings.resize === "crop";
    gravitySelect.disabled = !cropping;
    gravityField.style.opacity = cropping ? "" : "0.55";
  }

  function applySettingsToUi() {
    transitionSelect.value = state.settings.transition;
    durationRange.value = state.settings.duration;
    fpsRange.value = state.settings.fps;
    resizeSelect.value = state.settings.resize;
    gravitySelect.value = state.settings.gravity;
    filterSelect.value = state.settings.filter;
    fillColor.value = state.settings.fillColor;
    fillColorHex.textContent = state.settings.fillColor;

    durationValue.textContent = `${Number(state.settings.duration).toFixed(1)}s`;
    fpsValue.textContent = `${state.settings.fps}fps`;

    paintRange(durationRange);
    paintRange(fpsRange);
    updateTransitionUi();
    updateGravityUi();
  }

  function clearPreview() {
    state.previewToken += 1;
    state.previewPath = null;
    state.previewSource = null;
    state.previewInfo = null;

    previewImage.hidden = true;
    previewImage.removeAttribute("src");
    previewBackdrop.style.backgroundImage = "none";
    previewInfo.hidden = true;
    previewEmpty.hidden = false;
    previewEmptyTitle.textContent = "no wallpaper set";
    previewEmptyText.textContent = "select an image to begin";
    previewSourceChip.textContent = "nothing selected";
    previewSourceChip.className = "chip chip-muted";
    previewStage.classList.remove("is-loading");
    previewLoading.hidden = true;
  }

  function renderPreview(info) {
    const hasPreview = Boolean(info.preview);

    previewImage.hidden = !hasPreview;
    previewEmpty.hidden = hasPreview;

    if (hasPreview) {
      previewImage.src = info.preview;
      previewBackdrop.style.backgroundImage = `url("${info.preview}")`;
    } else {
      previewImage.removeAttribute("src");
      previewBackdrop.style.backgroundImage = "none";
      previewEmptyTitle.textContent = "preview unavailable";
      previewEmptyText.textContent = info.warning || "this file cannot be previewed";
    }

    previewInfo.hidden = false;
    previewName.textContent = info.name;
    previewPath.textContent = info.path;
    previewPath.title = info.path;
    previewDims.textContent = info.width && info.height ? `${info.width}x${info.height}` : "vector or unknown size";
    previewSize.textContent = formatBytes(info.sizeBytes);
    previewSize.hidden = !info.sizeBytes;
  }

  async function showPreview(path, source) {
    const token = ++state.previewToken;

    state.previewPath = path;
    state.previewSource = source;
    state.selectedInfo = source === "selected" ? null : state.selectedInfo;

    previewStage.classList.add("is-loading");
    previewLoading.hidden = false;
    previewSourceChip.textContent = source === "selected" ? "selected image" : "current wallpaper";
    previewSourceChip.className = "chip";

    try {
      const info = await invoke("inspect_image", { path });
      if (token !== state.previewToken) return;
      if (source === "selected") state.selectedInfo = info;
      renderPreview(info);
    } catch (error) {
      if (token !== state.previewToken) return;
      previewImage.hidden = true;
      previewImage.removeAttribute("src");
      previewBackdrop.style.backgroundImage = "none";
      previewInfo.hidden = true;
      previewEmpty.hidden = false;
      previewEmptyTitle.textContent = "preview unavailable";
      previewEmptyText.textContent = String(error);
    } finally {
      if (token === state.previewToken) {
        previewStage.classList.remove("is-loading");
        previewLoading.hidden = true;
        updateApplyState();
      }
    }
  }

  async function selectFile(path) {
    state.selectedPath = path;
    state.selectedInfo = null;
    updateSelectionUi();
    saveSelected();
    updateApplyState();

    addRecent(path);
    await showPreview(path, "selected");
  }

  async function chooseImage() {
    if (state.busy.pick) return;
    state.busy.pick = true;
    try {
      const path = await invoke("pick_image");
      if (path) await selectFile(path);
    } catch (error) {
      showToast(String(error), "error", 8000);
    } finally {
      state.busy.pick = false;
    }
  }

  function addRecent(path) {
    state.recent = [path, ...state.recent.filter((item) => item !== path)].slice(0, 8);
    saveRecent();
    renderRecent();
  }

  function applyStatus(status) {
    state.status = status;
    reconcileOutputs();
    updateDaemonUi();
    renderOutputs();
    updateActionButtons();
    updateApplyState();

    if (!state.selectedPath) {
      const current = firstImage();
      if (current && current !== state.previewPath) {
        showPreview(current, "current");
      } else if (!current && state.previewSource === "current") {
        clearPreview();
      }
    }
  }

  async function refreshStatus(options = {}) {
    if (state.refreshing) return;

    state.refreshing = true;
    if (!options.quiet) {
      state.checking = true;
      refreshButton.classList.add("is-busy");
      updateDaemonUi();
    }

    try {
      const status = await invoke("get_status");
      applyStatus(status);
    } catch (error) {
      applyStatus({ running: false, version: state.status.version, outputs: [], error: String(error) });
    } finally {
      state.refreshing = false;
      state.checking = false;
      refreshButton.classList.remove("is-busy");
      updateDaemonUi();
    }
  }

  async function toggleDaemon() {
    const running = state.status.running;

    if (running) {
      const confirmed =
        typeof window.confirm !== "function" ||
        window.confirm("stop awww-daemon? wallpapers will be removed until it is started again.");
      if (!confirmed) return;
    }

    await withBusy("daemon", daemonToggle, async () => {
      try {
        if (running) {
          await invoke("stop_daemon");
          showToast("daemon stopped", "info");
        } else {
          const status = await invoke("start_daemon");
          applyStatus(status);
          showToast("daemon started", "success");
        }
        await refreshStatus({ quiet: true });
      } catch (error) {
        showToast(String(error), "error", 9000);
        await refreshStatus({ quiet: true });
      }
    });
  }

  async function applyWallpaper() {
    if (!state.selectedPath) {
      await chooseImage();
      return;
    }

    if (state.selectedOutputs.size === 0 && state.status.running && state.status.outputs.length > 0) {
      showToast("select at least one display", "error");
      return;
    }

    await withBusy("apply", applyButton, async () => {
      const request = {
        path: state.selectedPath,
        outputs: [...state.selectedOutputs],
        resize: state.settings.resize,
        cropGravity: state.settings.gravity,
        filter: state.settings.filter,
        transition: {
          kind: state.settings.transition,
          duration: state.settings.duration,
          fps: state.settings.fps,
        },
      };

      try {
        const message = await invoke("set_wallpaper", { request });
        showToast(message || "wallpaper applied", "success");
        previewSourceChip.textContent = "current wallpaper";
        previewSourceChip.className = "chip";
        await refreshStatus({ quiet: true });
      } catch (error) {
        showToast(String(error), "error", 9000);
      }
    });
  }

  async function runDaemonAction(action, button, fallback) {
    await withBusy("action", button, async () => {
      try {
        const message = await invoke("daemon_action", { action });
        showToast(message || fallback, "success");
      } catch (error) {
        showToast(String(error), "error", 8000);
      }
    });
  }

  async function restoreWallpapers() {
    await withBusy("restore", restoreButton, async () => {
      try {
        const message = await invoke("restore_wallpaper", { outputs: [...state.selectedOutputs] });
        showToast(message || "cached wallpapers restored", "success");
        await refreshStatus({ quiet: true });
      } catch (error) {
        showToast(String(error), "error", 8000);
      }
    });
  }

  async function fillDisplays() {
    await withBusy("fill", fillButton, async () => {
      try {
        const message = await invoke("clear_wallpaper", {
          color: state.settings.fillColor,
          outputs: [...state.selectedOutputs],
        });
        showToast(message || "displays filled with colour", "success");
        await refreshStatus({ quiet: true });
      } catch (error) {
        showToast(String(error), "error", 8000);
      }
    });
  }

  function bindEvents() {
    refreshButton.addEventListener("click", () => refreshStatus());
    daemonToggle.addEventListener("click", toggleDaemon);
    chooseButton.addEventListener("click", chooseImage);
    applyButton.addEventListener("click", applyWallpaper);

    previewStage.addEventListener("click", chooseImage);
    previewStage.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        chooseImage();
      }
    });

    outputsEmptyAction.addEventListener("click", toggleDaemon);
    selectAllButton.addEventListener("click", () => {
      state.selectedOutputs = new Set(state.status.outputs.map((output) => output.name));
      renderOutputs();
      updateApplyState();
      updateActionButtons();
    });
    selectNoneButton.addEventListener("click", () => {
      state.selectedOutputs = new Set();
      renderOutputs();
      updateApplyState();
      updateActionButtons();
    });

    clearRecentButton.addEventListener("click", () => {
      state.recent = [];
      saveRecent();
      renderRecent();
    });

    transitionSelect.addEventListener("change", () => {
      state.settings.transition = transitionSelect.value;
      updateTransitionUi();
      saveSettings();
    });

    durationRange.addEventListener("input", () => {
      state.settings.duration = Number(durationRange.value);
      durationValue.textContent = `${state.settings.duration.toFixed(1)}s`;
      paintRange(durationRange);
      saveSettings();
    });

    fpsRange.addEventListener("input", () => {
      state.settings.fps = Number(fpsRange.value);
      fpsValue.textContent = `${state.settings.fps}fps`;
      paintRange(fpsRange);
      saveSettings();
    });

    resizeSelect.addEventListener("change", () => {
      state.settings.resize = resizeSelect.value;
      updateGravityUi();
      saveSettings();
    });

    gravitySelect.addEventListener("change", () => {
      state.settings.gravity = gravitySelect.value;
      saveSettings();
    });

    filterSelect.addEventListener("change", () => {
      state.settings.filter = filterSelect.value;
      saveSettings();
    });

    fillColor.addEventListener("input", () => {
      state.settings.fillColor = fillColor.value;
      fillColorHex.textContent = fillColor.value;
      saveSettings();
    });
    fillButton.addEventListener("click", fillDisplays);

    pauseButton.addEventListener("click", () => runDaemonAction("pause", pauseButton, "animations paused"));
    resumeButton.addEventListener("click", () => runDaemonAction("unpause", resumeButton, "animations resumed"));
    restoreButton.addEventListener("click", restoreWallpapers);

    window.addEventListener("keydown", (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "o") {
        event.preventDefault();
        chooseImage();
      }
      if (modifier && event.key === "Enter") {
        event.preventDefault();
        if (!applyButton.disabled) applyWallpaper();
      }
    });

    if (appWindow && typeof appWindow.onDragDropEvent === "function") {
      appWindow
        .onDragDropEvent((event) => {
          const payload = event.payload || {};
          if (payload.type === "over" || payload.type === "enter") {
            previewStage.classList.add("drag-over");
          } else if (payload.type === "drop") {
            previewStage.classList.remove("drag-over");
            const path = (payload.paths || [])[0];
            if (path) selectFile(path);
          } else {
            previewStage.classList.remove("drag-over");
          }
        })
        .catch(() => {});
    }
  }

  async function init() {
    if (!invoke) {
      showToast("tauri api is unavailable — open the app through the desktop binary", "error", 12000);
      return;
    }

    bindEvents();
    applySettingsToUi();
    renderRecent();
    updateSelectionUi();

    const stored = loadSelected();
    if (stored) {
      state.selectedPath = stored;
      updateSelectionUi();
      showPreview(stored, "selected");
    }

    await refreshStatus();

    setInterval(() => {
      if (!document.hidden) refreshStatus({ quiet: true });
    }, 15000);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshStatus({ quiet: true });
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

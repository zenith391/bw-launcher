/**
	Blocksworld Launcher
    Copyright (C) 2020 zenith391

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

const { app, nativeTheme, ipcMain, BrowserWindow } = require("electron");
const path = require("path");
let win = undefined;
let registerWin = undefined;

if (require("electron-squirrel-startup")) {
  // return;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1024,
    height: 780,
    icon: "html/img/icon.png",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  if (!app.isPackaged && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  win.webContents.on("did-finish-load", function () {
    win.webContents.send("change-dark-theme", nativeTheme.shouldUseDarkColors);
  });
}

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  createWindow();
});

nativeTheme.on("updated", function () {
  win.webContents.send("change-dark-theme", nativeTheme.shouldUseDarkColors);
});

ipcMain.on("open-register-window", function () {
  registerWin = new BrowserWindow({
    width: 1024,
    height: 780,
    icon: "html/img/icon.png",
    parent: win,
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), "preload_register.js"),
    },
  });
  registerWin.loadURL("https://bwsecondary.ddns.net/register.php");
  registerWin.once("ready-to-show", function () {
    registerWin.show();
  });
});

ipcMain.on("update-download", function (event, progress) {
  win.setProgressBar(progress);
});

ipcMain.on("update-done", function () {
  win.setProgressBar(-1);
});

ipcMain.on("close-register-window", function () {
  registerWin.close();
});

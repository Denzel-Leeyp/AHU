// ============================================
// main.js - Electron 主进程入口
// 涡轮增压器测试台进气空调 (AHU) 计算器
// ============================================

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "涡轮增压器测试台 · 进气空调 (AHU) 设计计算系统",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

// 渲染进程请求保存Excel文件
ipcMain.on("save-excel-file", (event, { content, fileName }) => {
  dialog.showSaveDialog(mainWindow, {
    title: "保存Excel报告",
    defaultPath: path.join(app.getPath("desktop"), fileName),
    filters: [{ name: "Excel文件", extensions: ["xls"] }]
  }).then(result => {
    if (!result.canceled && result.filePath) {
      try {
        fs.writeFileSync(result.filePath, content, "utf8");
        event.sender.send("save-excel-reply", { success: true, path: result.filePath });
      } catch (err) {
        event.sender.send("save-excel-reply", { success: false, error: err.message });
      }
    }
  });
});

// 渲染进程请求保存SVG文件
ipcMain.on("save-svg-file", (event, { content, fileName }) => {
  dialog.showSaveDialog(mainWindow, {
    title: "保存工程图",
    defaultPath: path.join(app.getPath("desktop"), fileName),
    filters: [{ name: "SVG文件", extensions: ["svg"] }]
  }).then(result => {
    if (!result.canceled && result.filePath) {
      try {
        fs.writeFileSync(result.filePath, content, "utf8");
        event.sender.send("save-svg-reply", { success: true, path: result.filePath });
      } catch (err) {
        event.sender.send("save-svg-reply", { success: false, error: err.message });
      }
    }
  });
});

app.whenReady().then(createWindow);

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
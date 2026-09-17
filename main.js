const { app, BrowserWindow } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

let server;
let mainWindow;

// Tạo một HTTP server mini để chạy file export-tool.html trên cổng 4999
// Điều này giúp tránh giới hạn quota của giao thức file:/// và hỗ trợ đầy đủ File System Access API
function startLocalServer() {
  server = http.createServer((req, res) => {
    // Chỉ phục vụ file export-tool.html
    const filePath = path.join(__dirname, 'export-tool.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end("Error loading export-tool.html");
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  });

  server.listen(4999, '127.0.0.1', () => {
    console.log("Local server running at http://127.0.0.1:4999");
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    title: "All In One MMO - Tool Xuất Ảnh Cục Bộ (Desktop App)",
    icon: path.join(__dirname, 'public', 'favicon.ico'), // sử dụng nếu có
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false // QUAN TRỌNG: Tắt chế độ bóp hiệu năng của Chromium khi ẩn/thu nhỏ cửa sổ
    }
  });

  // Load trang từ server nội bộ
  mainWindow.loadURL('http://127.0.0.1:4999');

  // Xóa menu bar mặc định của Electron để giao diện gọn gàng
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startLocalServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (server) server.close();
  if (process.platform !== 'darwin') app.quit();
});

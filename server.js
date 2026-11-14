const express = require("express");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

const WORKSPACES_DIR = path.join(__dirname, "user_workspaces");
if (!fs.existsSync(WORKSPACES_DIR)) {
  fs.mkdirSync(WORKSPACES_DIR);
}

// --- Frontend Web App Dashboard ---
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Terminal AI - Multi-User Cloud Workspace</title>
      <style>
        :root {
          --bg-main: #090d16;
          --bg-card: #0f172a;
          --border-color: #1e293b;
          --accent-green: #10b981;
          --accent-blue: #38bdf8;
          --accent-pink: #f43f5e;
          --text-main: #f8fafc;
          --text-dim: #94a3b8;
        }
        * { box-sizing: border-box; }
        body {
          background: var(--bg-main);
          color: var(--text-main);
          font-family: 'Courier New', Courier, monospace;
          margin: 0;
          padding: 10px;
          display: flex;
          flex-direction: column;
          height: 100vh;
        }
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 8px;
          margin-bottom: 8px;
        }
        h1 { font-size: 0.95rem; color: var(--accent-pink); margin: 0; }
        .session-info { font-size: 0.7rem; color: var(--accent-green); background: rgba(16,185,129,0.1); padding: 3px 6px; border-radius: 4px; border: 1px solid var(--accent-green); }
        .terminal-container {
          flex: 1;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 10px;
          overflow-y: auto;
          font-size: 0.85rem;
          white-space: pre-wrap;
          word-break: break-all;
          box-shadow: inset 0 2px 6px rgba(0,0,0,0.8);
          margin-bottom: 10px;
        }
        .section-label { font-size: 0.72rem; color: var(--text-dim); margin-bottom: 3px; }
        .toolbar { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
        .btn-chip {
          background: #1e293b;
          border: 1px solid #334155;
          color: var(--accent-blue);
          padding: 5px 8px;
          border-radius: 4px;
          font-size: 0.72rem;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-chip:active { background: #334155; }
        .input-box { display: flex; gap: 6px; }
        input[type="text"] {
          flex: 1;
          background: #020617;
          border: 1px solid #475569;
          color: var(--text-main);
          padding: 10px;
          border-radius: 6px;
          font-family: inherit;
          font-size: 0.95rem;
          outline: none;
        }
        input[type="text"]:focus { border-color: var(--accent-blue); }
        .btn-send {
          background: #2563eb;
          color: white;
          border: none;
          padding: 10px 16px;
          border-radius: 6px;
          font-weight: bold;
          cursor: pointer;
          font-family: inherit;
        }
        .btn-send:active { background: #1d4ed8; }
      </style>
    </head>
    <body>
      <header>
        <h1>⚡ TERMINAL AI (Isolated Session)</h1>
        <div id="sessionBadge" class="session-info">Connecting...</div>
      </header>

      <div class="section-label">📁 คำสั่งระบบส่วนตัว (Private Workspace)</div>
      <div class="toolbar">
        <button class="btn-chip" onclick="setCmd('pwd')">📍 pwd</button>
        <button class="btn-chip" onclick="setCmd('ls -la')">📁 ls -la</button>
        <button class="btn-chip" onclick="setCmd('whoami')">👤 whoami</button>
        <button class="btn-chip" onclick="clearTerminal()">🧹 เคลียร์จอ</button>
      </div>

      <div class="section-label">🌿 Git & Workspace Automation</div>
      <div class="toolbar">
        <button class="btn-chip" onclick="setCmd('git status')">📊 status</button>
        <button class="btn-chip" onclick="setCmd('git init')">🚩 git init</button>
        <button class="btn-chip" onclick="setCmd('touch main.js')">📄 touch main.js</button>
      </div>

      <div id="terminalOutput" class="terminal-container">🚀 กำลังสร้างพื้นที่ทำงานส่วนตัวเฉพาะคุณ (Isolated Session)...</div>

      <div class="input-box">
        <input type="text" id="commandInput" placeholder="พิมพ์คำสั่ง Terminal ของคุณ..." autofocus onkeypress="if(event.key === 'Enter') executeCommand()">
        <button class="btn-send" onclick="executeCommand()">ส่ง</button>
      </div>

      <script>
        let sessionId = localStorage.getItem('terminal_ai_session');
        if (!sessionId) {
          sessionId = 'user_' + Math.random().toString(36).substring(2, 10);
          localStorage.setItem('terminal_ai_session', sessionId);
        }
        document.getElementById('sessionBadge').innerText = 'ID: ' + sessionId;

        function setCmd(cmd) { document.getElementById('commandInput').value = cmd; }
        function clearTerminal() { document.getElementById('terminalOutput').innerText = "🧹 หน้าจอถูกล้างสะอาดแล้ว..."; }

        async function executeCommand() {
          const input = document.getElementById('commandInput');
          const output = document.getElementById('terminalOutput');
          const val = input.value.trim();
          if (!val) return;

          output.innerText += "\\n\\n$ " + val;
          input.value = "";

          try {
            const res = await fetch('/api/terminal/run', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: val, sessionId: sessionId })
            });
            const data = await res.json();
            output.innerText += "\\n" + (data.output || "✅ ทำงานสำเร็จ");
          } catch (err) {
            output.innerText += "\\n❌ Connection Error: " + err.message;
          }
          output.scrollTop = output.scrollHeight;
        }
      </script>
    </body>
    </html>
  `);
});

// --- API Endpoint สำหรับประมวลผลคำสั่งแบบแยกผู้ใช้ ---
app.post("/api/terminal/run", async (req, res) => {
  const { command, sessionId } = req.body;

  if (!sessionId || typeof sessionId !== "string" || sessionId.length > 20) {
    return res.json({ success: false, output: "❌ Invalid Session ID" });
  }

  const userDir = path.join(WORKSPACES_DIR, sessionId.replace(/[^a-zA-Z0-9_]/g, ""));
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  if (!command || command.includes("rm -rf /") || command.includes(":(){ :|:& };:")) {
    return res.json({ success: false, output: "❌ [ProsEye Security]: คำสั่งนี้ถูกระงับเพื่อความปลอดภัย" });
  }

  exec(command, { cwd: userDir, timeout: 15000 }, (error, stdout, stderr) => {
    if (error) {
      return res.json({ success: true, output: `⚠️ Error:\\n${stderr || error.message}` });
    }
    res.json({ success: true, output: stdout || "✅ ทำงานสำเร็จ (ไม่มี Text Output)" });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Terminal AI Multi-User Server running at http://localhost:${PORT}`);
});


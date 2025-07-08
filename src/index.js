const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const fs = require("fs");
const yaml = require("js-yaml");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

// Load config.yaml (optional)
let yamlConfig = {};
try {
  yamlConfig = yaml.load(fs.readFileSync("config.yaml", "utf8")) || {};
} catch {
  console.warn("⚠️ config.yaml not found or invalid.");
}

const port = process.env.PORT || yamlConfig.port || 3000;
const host = process.env.HOST || yamlConfig.host || "0.0.0.0";

const targetNumbers = (process.env.TARGET_NUMBERS
  ? process.env.TARGET_NUMBERS.split(",")
  : yamlConfig.targets?.numbers || []).map(n => n.trim()).filter(Boolean);

const targetGroups = (process.env.TARGET_GROUPS
  ? process.env.TARGET_GROUPS.split(",")
  : yamlConfig.targets?.groups || []).map(g => g.trim()).filter(Boolean);

const groupCache = new Map();

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-zygote",
      "--disable-gpu",
      "--window-size=1280,800",
    ],
  },
});

client.on("qr", (qr) => {
  console.log("📱 Scan this QR code to log in:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
  console.log("✅ WhatsApp is ready");
  const chats = await client.getChats();

  for (const groupName of targetGroups) {
    const group = chats.find(c => c.isGroup && c.name === groupName);
    if (group) {
      groupCache.set(groupName, group.id._serialized);
      console.log(`📁 Cached group: ${groupName}`);
    } else {
      console.warn(`⚠️ Group '${groupName}' not found`);
    }
  }
});

function formatGrafanaAlert(alert) {
  const labels = alert.labels || {};
  const annotations = alert.annotations || {};
  const values = alert.values || {};

  const lines = [
    `🚨 *Alert: ${labels.alertname || "Unknown"}*`,
    labels.grafana_folder ? `📁 Folder: ${labels.grafana_folder}` : "",
    labels.instance ? `💻 Instance: ${labels.instance}` : "",
    `🟠 Status: ${alert.status || "unknown"}`,
    "",
  ];

  const valueLines = Object.entries(values).map(([k, v]) => `• ${k} = ${v}`);
  if (valueLines.length) {
    lines.push("📊 Values:", ...valueLines);
  }

  if (annotations.summary) lines.push(`📝 Summary: ${annotations.summary}`, "");
  if (annotations.description) lines.push(`📒 Description: ${annotations.description}`, "");
  if (alert.silenceURL) lines.push(`🔕 Silence: ${alert.silenceURL}`);
  if (alert.dashboardURL) lines.push(`📊 Dashboard: ${alert.dashboardURL}`);
  if (alert.panelURL) lines.push(`📈 Panel: ${alert.panelURL}`);

  return lines.filter(Boolean).join("\n");
}

app.post("/webhook/grafana", async (req, res) => {
  const alert = req.body.alerts?.[0];
  if (!alert) return res.status(400).send("❌ No alerts found");

  const message = formatGrafanaAlert(alert);

  try {
    for (const number of targetNumbers) {
      const chatId = `${number}@c.us`;
      await client.sendMessage(chatId, message);
      console.log(`✅ Sent to number: ${number}`);
    }

    for (const groupName of targetGroups) {
      const groupId = groupCache.get(groupName);
      if (groupId) {
        await client.sendMessage(groupId, message);
        console.log(`✅ Sent to group: ${groupName}`);
      } else {
        console.warn(`⚠️ Group '${groupName}' not cached`);
      }
    }

    res.send("✅ Alert sent");
  } catch (err) {
    console.error("❌ Failed to send alert:", err.message);
    res.status(500).send("❌ Error sending alert");
  }
});

app.listen(port, host, () => {
  console.log(`🚀 Listening at http://${host}:${port}`);
});

client.initialize();

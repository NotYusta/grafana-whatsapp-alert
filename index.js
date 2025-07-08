const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const express = require("express");
const fs = require("fs");
const yaml = require("js-yaml");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// Load YAML config
const config = yaml.load(fs.readFileSync("config.yaml", "utf8"));
const targets = config.targets;
const port = config.port;
const host = config.host;

// Initialize WhatsApp client
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

// Cache group IDs
const groupCache = new Map();

client.on("qr", (qr) => {
  console.log("📱 Scan this QR code to log in:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
  console.log("✅ WhatsApp is ready!");

  if (targets.groups?.length) {
    const chats = await client.getChats();

    for (const groupName of targets.groups) {
      const group = chats.find(
        (chat) => chat.isGroup && chat.name === groupName
      );

      if (group) {
        groupCache.set(groupName, group.id._serialized);
        console.log(`📁 Cached group: ${groupName}`);
      } else {
        console.warn(`⚠️ Group '${groupName}' not found during cache`);
      }
    }
  }
});

// Format Grafana alert to WhatsApp message
function formatGrafanaAlert(alert) {
  const labels = alert.labels || {};
  const annotations = alert.annotations || {};
  const values = alert.values || {};

  const lines = [];

  lines.push(`🚨 *Alert: ${labels.alertname || "Unknown"}*`);
  if (labels.grafana_folder) lines.push(`📁 Folder: ${labels.grafana_folder}`);
  if (labels.instance) lines.push(`💻 Instance: ${labels.instance}`);
  lines.push(`🟠 Status: ${alert.status || "unknown"}`);
  lines.push("");

  // Values
  const valueLines = Object.entries(values).map(
    ([key, val]) => `• ${key} = ${val}`
  );
  if (valueLines.length) {
    lines.push("📊 Values:");
    lines.push(...valueLines);
  }

  if (annotations.summary) {
    lines.push(`📝 Summary: ${annotations.summary}`);
    lines.push("");
  }

  if (annotations.description) {
    lines.push(`📒 Description: ${annotations.description}`);
    lines.push("");
  }

  if (alert.silenceURL) lines.push(`🔕 Silence: ${alert.silenceURL}`);
  if (alert.dashboardURL) lines.push(`📊 Dashboard: ${alert.dashboardURL}`);
  if (alert.panelURL) lines.push(`📈 Panel: ${alert.panelURL}`);

  return lines.join("\n");
}

// Webhook endpoint
app.post("/webhook/grafana", async (req, res) => {
  const body = req.body;

  try {
    const alert = body.alerts?.[0];
    if (!alert) {
      return res.status(400).send("❌ No alerts found in payload");
    }

    const message = formatGrafanaAlert(alert);

    // Send to numbers
    for (const num of targets.numbers || []) {
      const chatId = num + "@c.us";
      await client.sendMessage(chatId, message);
      console.log(`✅ Sent alert to ${num}`);
    }

    // Send to groups
    for (const groupName of targets.groups || []) {
      const groupId = groupCache.get(groupName);
      if (groupId) {
        await client.sendMessage(groupId, message);
        console.log(`✅ Sent alert to group: ${groupName}`);
      } else {
        console.warn(`⚠️ Group '${groupName}' not cached`);
      }
    }

    res.send("✅ Alert sent");
  } catch (err) {
    console.error("❌ Error sending alert:", err.message);
    res.status(500).send("❌ Failed to send alert");
  }
});

app.listen(port, host, () =>
  console.log(`🚀 Express server listening at http://${host}:${port}`)
);

client.initialize();

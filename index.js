const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");

const P = require("pino");

const PHONE_NUMBER = process.env.BOT_PHONE_NUMBER;

if (!PHONE_NUMBER) {
  console.error("❌ BOT_PHONE_NUMBER is missing.");
  process.exit(1);
}

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    browser: Browsers.windows("XMAN Strict Group Bot"),
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Generate pairing code when WhatsApp is ready
    if (qr && !state.creds.registered) {
      try {
        const code = await sock.requestPairingCode(PHONE_NUMBER);

        console.log("");
        console.log("================================");
        console.log("🔗 XMAN WHATSAPP PAIRING CODE");
        console.log("================================");
        console.log(`PAIRING CODE: ${code}`);
        console.log("================================");
        console.log("");
        console.log("On your phone:");
        console.log("WhatsApp → Settings → Linked Devices");
        console.log("→ Link a Device → Link with phone number");
        console.log("Enter the pairing code above.");
        console.log("");
      } catch (error) {
        console.error("❌ Pairing code error:", error);
      }
    }

    if (connection === "open") {
      console.log("");
      console.log("================================");
      console.log("✅ XMAN BOT CONNECTED TO WHATSAPP");
      console.log("================================");
      console.log("");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      console.log("⚠️ WhatsApp connection closed:", statusCode);

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("🔄 Reconnecting...");
        startBot();
      } else {
        console.log("❌ WhatsApp session logged out.");
      }
    }
  });

  // Basic message test
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const message = messages[0];

    if (!message?.message) return;
    if (message.key.fromMe) return;

    const jid = message.key.remoteJid;

    console.log("📩 Message received:", jid);
  });
}

startBot().catch((error) => {
  console.error("❌ Fatal bot error:", error);
});
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

let pairingRequested = false;

async function startBot() {
  console.log("🚀 Starting XMAN Strict Group Bot...");

  const { state, saveCreds } =
    await useMultiFileAuthState("./session");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    browser: Browsers.windows("XMAN Strict Group Bot")
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const {
      connection,
      lastDisconnect,
      qr,
      isNewLogin
    } = update;

    // ================================
    // PAIRING CODE
    // ================================
    if (
      qr &&
      !state.creds.registered &&
      !pairingRequested
    ) {
      pairingRequested = true;

      try {
        console.log("");
        console.log("================================");
        console.log("🔗 XMAN WHATSAPP PAIRING CODE");
        console.log("================================");

        const code =
          await sock.requestPairingCode(PHONE_NUMBER);

        console.log(`PAIRING CODE: ${code}`);

        console.log("================================");
        console.log("📱 ON YOUR PHONE");
        console.log("================================");
        console.log("WhatsApp");
        console.log("→ Settings");
        console.log("→ Linked Devices");
        console.log("→ Link a Device");
        console.log("→ Link with phone number instead");
        console.log(`→ Enter: ${code}`);
        console.log("================================");
        console.log("");
      } catch (error) {
        console.error(
          "❌ Pairing code error:",
          error?.message || error
        );

        pairingRequested = false;
      }
    }

    // ================================
    // CONNECTED
    // ================================
    if (connection === "open") {
      console.log("");
      console.log("================================");
      console.log("✅ XMAN BOT CONNECTED");
      console.log("================================");
      console.log("🤖 WhatsApp connection is active.");
      console.log("");
    }

    // ================================
    // NEW LOGIN
    // ================================
    if (isNewLogin) {
      console.log("");
      console.log("🔐 NEW WHATSAPP LOGIN DETECTED");
      console.log("💾 Saving authentication session...");
      console.log("");
    }

    // ================================
    // CONNECTION CLOSED
    // ================================
    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      console.log("");
      console.log("⚠️ WhatsApp connection closed.");
      console.log("Status:", statusCode);

      if (
        statusCode === DisconnectReason.loggedOut
      ) {
        console.log(
          "❌ WhatsApp session was logged out."
        );
        return;
      }

      console.log("🔄 Restarting WhatsApp connection...");

      pairingRequested = false;

      setTimeout(() => {
        startBot();
      }, 3000);
    }
  });

  // ================================
  // MESSAGE TEST
  // ================================
  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {
      const message = messages[0];

      if (!message?.message) return;

      if (message.key.fromMe) return;

      const jid = message.key.remoteJid;

      console.log("");
      console.log("📩 MESSAGE RECEIVED");
      console.log("From:", jid);
      console.log("");
    }
  );
}

startBot().catch((error) => {
  console.error("");
  console.error("❌ FATAL BOT ERROR");
  console.error(error);
  console.error("");
});
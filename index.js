const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const pino = require("pino");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(
    "auth_info_baileys"
  );

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    browser: ["XMAN STRICT BOT", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("================================");
      console.log("   XMAN STRICT GROUP BOT ONLINE");
      console.log("================================");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      console.log("WhatsApp connection closed.");

      if (shouldReconnect) {
        console.log("Reconnecting...");
        startBot();
      } else {
        console.log("Logged out. Please authenticate again.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];

      if (!msg || !msg.message) return;
      if (msg.key.fromMe) return;

      const jid = msg.key.remoteJid;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      if (!text) return;

      console.log(`[MESSAGE] ${jid}: ${text}`);

      // Basic test command
      if (text.trim().toLowerCase() === ".ping") {
        await sock.sendMessage(jid, {
          text: "🏓 XMAN STRICT BOT: ONLINE"
        });
      }

      // Rules command
      if (text.trim().toLowerCase() === ".rules") {
        await sock.sendMessage(jid, {
          text:
            "🛡️ XMAN STRICT GROUP RULES\n\n" +
            "1. No spam\n" +
            "2. No unauthorized links\n" +
            "3. No advertising\n" +
            "4. No abusive language\n" +
            "5. Respect admins and members\n\n" +
            "⚠️ Breaking the rules may result in a warning or removal."
        });
      }

      // Group-only moderation
      if (jid.endsWith("@g.us")) {
        const lowerText = text.toLowerCase();

        const blockedLinks = [
          "http://",
          "https://",
          "www.",
          "t.me/",
          "chat.whatsapp.com/"
        ];

        const containsBlockedLink = blockedLinks.some(link =>
          lowerText.includes(link)
        );

        if (containsBlockedLink) {
          try {
            await sock.sendMessage(jid, {
              delete: msg.key
            });

            await sock.sendMessage(jid, {
              text:
                "🚫 Unauthorized link removed.\n" +
                "⚠️ Please do not post links without admin permission."
            });
          } catch (error) {
            console.log("Could not delete message:", error.message);
          }
        }
      }
    } catch (error) {
      console.error("Message handler error:", error);
    }
  });
}

startBot().catch(error => {
  console.error("Fatal bot error:", error);
});
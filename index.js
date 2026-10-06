const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const pino = require("pino");

// ===============================
// XMAN STRICT GROUP BOT
// ===============================

const warnings = new Map();

const MAX_WARNINGS = 3;

const blockedWords = [
  "spamword1",
  "spamword2"
];

const blockedLinks = [
  "http://",
  "https://",
  "www.",
  "t.me/",
  "chat.whatsapp.com/",
  "discord.gg/"
];

// ===============================
// GET MESSAGE TEXT
// ===============================

function getText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  );
}

// ===============================
// GET USER ID
// ===============================

function getUserId(jid) {
  return jid?.split("@")[0] || jid;
}

// ===============================
// START BOT
// ===============================

async function startBot() {
  const { state, saveCreds } =
    await useMultiFileAuthState("auth_info_baileys");

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["XMAN STRICT BOT", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  // ===============================
  // CONNECTION
  // ===============================

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("");
      console.log("================================");
      console.log("  XMAN STRICT GROUP BOT ONLINE");
      console.log("================================");
      console.log("");
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log("Connection lost. Reconnecting...");
        startBot();
      } else {
        console.log("Bot logged out.");
      }
    }
  });

  // ===============================
  // MESSAGE HANDLER
  // ===============================

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];

      if (!msg?.message) return;
      if (msg.key.fromMe) return;

      const jid = msg.key.remoteJid;
      const sender = msg.key.participant || jid;

      const text = getText(msg.message).trim();

      if (!text) return;

      console.log(`[MESSAGE] ${sender}: ${text}`);

      // =============================
      // PRIVATE CHAT
      // =============================

      if (!jid.endsWith("@g.us")) {
        if (text.toLowerCase() === ".ping") {
          await sock.sendMessage(jid, {
            text: "🏓 XMAN STRICT BOT: ONLINE"
          });
        }

        return;
      }

      // =============================
      // GROUP INFORMATION
      // =============================

      const metadata = await sock.groupMetadata(jid);

      const participant = metadata.participants.find(
        p => p.id === sender
      );

      const senderIsAdmin =
        participant?.admin === "admin" ||
        participant?.admin === "superadmin";

      const botJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";

      const botParticipant = metadata.participants.find(
        p => p.id === botJid
      );

      const botIsAdmin =
        botParticipant?.admin === "admin" ||
        botParticipant?.admin === "superadmin";

      // =============================
      // ADMIN COMMANDS
      // =============================

      const command = text.toLowerCase();

      if (command === ".ping") {
        await sock.sendMessage(jid, {
          text: "🏓 XMAN STRICT BOT: ONLINE"
        });
        return;
      }

      if (command === ".rules") {
        await sock.sendMessage(jid, {
          text:
            "🛡️ *XMAN STRICT GROUP RULES*\n\n" +
            "1️⃣ No spam\n" +
            "2️⃣ No unauthorized links\n" +
            "3️⃣ No advertising\n" +
            "4️⃣ No abusive language\n" +
            "5️⃣ Respect everyone\n" +
            "6️⃣ No flooding the group\n\n" +
            `⚠️ ${MAX_WARNINGS} warnings = removal`
        });
        return;
      }

      // =============================
      // ADMIN-ONLY COMMANDS
      // =============================

      if (command === ".lock") {
        if (!senderIsAdmin) {
          await sock.sendMessage(jid, {
            text: "❌ Only group admins can use this command."
          });
          return;
        }

        if (!botIsAdmin) {
          await sock.sendMessage(jid, {
            text: "⚠️ Make me a group admin first."
          });
          return;
        }

        await sock.groupSettingUpdate(jid, "announcement");

        await sock.sendMessage(jid, {
          text: "🔒 GROUP LOCKED\n\nOnly admins can send messages."
        });

        return;
      }

      if (command === ".unlock") {
        if (!senderIsAdmin) {
          await sock.sendMessage(jid, {
            text: "❌ Only group admins can use this command."
          });
          return;
        }

        if (!botIsAdmin) {
          await sock.sendMessage(jid, {
            text: "⚠️ Make me a group admin first."
          });
          return;
        }

        await sock.groupSettingUpdate(jid, "not_announcement");

        await sock.sendMessage(jid, {
          text: "🔓 GROUP UNLOCKED"
        });

        return;
      }

      // =============================
      // MODERATION
      // =============================

      // Never moderate admins
      if (senderIsAdmin) return;

      // =============================
      // LINK PROTECTION
      // =============================

      const lowerText = text.toLowerCase();

      const hasBlockedLink = blockedLinks.some(link =>
        lowerText.includes(link)
      );

      if (hasBlockedLink) {
        if (botIsAdmin) {
          await sock.sendMessage(jid, {
            delete: msg.key
          });
        }

        await addWarning(sock, jid, sender, "Unauthorized link");

        return;
      }

      // =============================
      // BAD WORD FILTER
      // =============================

      const hasBlockedWord = blockedWords.some(word =>
        lowerText.includes(word.toLowerCase())
      );

      if (hasBlockedWord) {
        if (botIsAdmin) {
          await sock.sendMessage(jid, {
            delete: msg.key
          });
        }

        await addWarning(sock, jid, sender, "Banned word");

        return;
      }

    } catch (error) {
      console.error("Message handler error:", error);
    }
  });
}

// ===============================
// WARNING SYSTEM
// ===============================

async function addWarning(sock, jid, user, reason) {
  const key = `${jid}:${user}`;

  const currentWarnings = warnings.get(key) || 0;
  const newWarnings = currentWarnings + 1;

  warnings.set(key, newWarnings);

  const number = getUserId(user);

  if (newWarnings >= MAX_WARNINGS) {
    try {
      await sock.groupParticipantsUpdate(
        jid,
        [user],
        "remove"
      );

      warnings.delete(key);

      await sock.sendMessage(jid, {
        text:
          `🔨 @${number} has been removed.\n\n` +
          `Reason: ${reason}\n` +
          `Warnings reached: ${MAX_WARNINGS}`,
        mentions: [user]
      });

    } catch (error) {
      await sock.sendMessage(jid, {
        text:
          `⚠️ @${number} reached ${MAX_WARNINGS} warnings, ` +
          `but I couldn't remove them.\n\n` +
          `Make sure the bot is an admin.`,
        mentions: [user]
      });
    }

    return;
  }

  await sock.sendMessage(jid, {
    text:
      `⚠️ WARNING ${newWarnings}/${MAX_WARNINGS}\n\n` +
      `@${number}\n` +
      `Reason: ${reason}`,
    mentions: [user]
  });
}

// ===============================
// START
// ===============================

startBot().catch(error => {
  console.error("Fatal error:", error);
});
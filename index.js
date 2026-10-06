const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser
} = require("@whiskeysockets/baileys");

const pino = require("pino");

// ==========================================
// XMAN STRICT GROUP BOT
// ==========================================

const PREFIX = ".";

const MAX_WARNINGS = 3;

// Temporary in-memory settings.
// We will add a database later.
const groupSettings = new Map();
const warnings = new Map();

// ==========================================
// DEFAULT GROUP SETTINGS
// ==========================================

function getSettings(jid) {
  if (!groupSettings.has(jid)) {
    groupSettings.set(jid, {
      antilink: true
    });
  }

  return groupSettings.get(jid);
}

// ==========================================
// MESSAGE TEXT
// ==========================================

function getText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    ""
  ).trim();
}

// ==========================================
// GET MENTIONED USER
// ==========================================

function getTarget(msg, text) {
  const mentioned =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    msg.message?.imageMessage?.contextInfo?.mentionedJid ||
    msg.message?.videoMessage?.contextInfo?.mentionedJid ||
    [];

  if (mentioned.length > 0) {
    return jidNormalizedUser(mentioned[0]);
  }

  // Support replying to a user's message
  const quotedParticipant =
    msg.message?.extendedTextMessage?.contextInfo?.participant;

  if (quotedParticipant) {
    return jidNormalizedUser(quotedParticipant);
  }

  return null;
}

// ==========================================
// GET USER NUMBER
// ==========================================

function displayUser(jid) {
  return jid?.split("@")[0] || jid;
}

// ==========================================
// CHECK ADMIN
// ==========================================

function isAdmin(metadata, jid) {
  const user = metadata.participants.find(
    p => jidNormalizedUser(p.id) === jidNormalizedUser(jid)
  );

  return (
    user?.admin === "admin" ||
    user?.admin === "superadmin"
  );
}

// ==========================================
// START BOT
// ==========================================

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

  // ========================================
  // CONNECTION
  // ========================================

  sock.ev.on(
    "connection.update",
    ({ connection, lastDisconnect }) => {

      if (connection === "open") {
        console.log("");
        console.log("====================================");
        console.log("     XMAN STRICT GROUP BOT");
        console.log("           ONLINE");
        console.log("====================================");
        console.log("");
      }

      if (connection === "close") {

        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.log("Connection closed.");
          console.log("Reconnecting...");
          startBot();
        } else {
          console.log("WhatsApp session logged out.");
        }
      }
    }
  );

  // ========================================
  // MESSAGE HANDLER
  // ========================================

  sock.ev.on(
    "messages.upsert",
    async ({ messages }) => {

      try {

        const msg = messages[0];

        if (!msg?.message) return;

        if (msg.key.fromMe) return;

        const jid = msg.key.remoteJid;

        if (!jid) return;

        const sender =
          msg.key.participant || jid;

        const text = getText(msg.message);

        if (!text) return;

        console.log(
          `[MESSAGE] ${sender}: ${text}`
        );

        // ==================================
        // PRIVATE CHAT
        // ==================================

        if (!jid.endsWith("@g.us")) {

          if (
            text.toLowerCase() ===
            `${PREFIX}ping`
          ) {
            await sock.sendMessage(jid, {
              text:
                "🏓 XMAN STRICT BOT\n\n" +
                "STATUS: ONLINE ✅"
            });
          }

          return;
        }

        // ==================================
        // GROUP INFORMATION
        // ==================================

        const metadata =
          await sock.groupMetadata(jid);

        const senderAdmin =
          isAdmin(metadata, sender);

        const botJid =
          jidNormalizedUser(sock.user.id);

        const botAdmin =
          isAdmin(metadata, botJid);

        const settings =
          getSettings(jid);

        const commandText =
          text.startsWith(PREFIX)
            ? text.slice(PREFIX.length).trim()
            : "";

        const args =
          commandText
            .split(/\s+/)
            .filter(Boolean);

        const command =
          (args.shift() || "").toLowerCase();

        // ==================================
        // PING
        // ==================================

        if (command === "ping") {

          await sock.sendMessage(jid, {
            text:
              "🏓 *XMAN STRICT BOT*\n\n" +
              "STATUS: ONLINE ✅"
          });

          return;
        }

        // ==================================
        // RULES
        // ==================================

        if (command === "rules") {

          await sock.sendMessage(jid, {
            text:
              "🛡️ *XMAN STRICT GROUP RULES*\n\n" +
              "1️⃣ No spam\n" +
              "2️⃣ No unauthorized links\n" +
              "3️⃣ No advertising\n" +
              "4️⃣ No flooding\n" +
              "5️⃣ No abusive content\n" +
              "6️⃣ Respect admins and members\n\n" +
              "⚠️ Breaking the rules may result in warnings or removal.\n\n" +
              `Maximum warnings: ${MAX_WARNINGS}`
          });

          return;
        }

        // ==================================
        // SETTINGS
        // ==================================

        if (command === "settings") {

          await sock.sendMessage(jid, {
            text:
              "⚙️ *XMAN GROUP SETTINGS*\n\n" +
              `🔗 Anti-link: ${
                settings.antilink
                  ? "ON ✅"
                  : "OFF ❌"
              }\n\n` +
              "Use:\n" +
              ".antlink on\n" +
              ".antlink off"
          });

          return;
        }

        // ==================================
        // ADMIN COMMAND PROTECTION
        // ==================================

        const adminCommands = [
          "warn",
          "kick",
          "del",
          "antlink",
          "lock",
          "unlock"
        ];

        if (
          adminCommands.includes(command) &&
          !senderAdmin
        ) {

          await sock.sendMessage(jid, {
            text:
              "🚫 *ACCESS DENIED*\n\n" +
              "Only group admins can use this command."
          });

          return;
        }

        // ==================================
        // WARN
        // ==================================

        if (command === "warn") {

          const target =
            getTarget(msg, text);

          if (!target) {
            await sock.sendMessage(jid, {
              text:
                "⚠️ Mention or reply to the member.\n\n" +
                "Example:\n" +
                ".warn @user"
            });
            return;
          }

          if (isAdmin(metadata, target)) {
            await sock.sendMessage(jid, {
              text:
                "🛡️ I cannot warn a group admin."
            });
            return;
          }

          await addWarning(
            sock,
            jid,
            target,
            "Manual admin warning",
            botAdmin
          );

          return;
        }

        // ==================================
        // KICK
        // ==================================

        if (command === "kick") {

          const target =
            getTarget(msg, text);

          if (!target) {
            await sock.sendMessage(jid, {
              text:
                "⚠️ Mention or reply to a member.\n\n" +
                "Example:\n" +
                ".kick @user"
            });
            return;
          }

          if (isAdmin(metadata, target)) {
            await sock.sendMessage(jid, {
              text:
                "🛡️ I cannot remove a group admin."
            });
            return;
          }

          if (!botAdmin) {
            await sock.sendMessage(jid, {
              text:
                "⚠️ I need to be a group admin before I can remove members."
            });
            return;
          }

          await sock.groupParticipantsUpdate(
            jid,
            [target],
            "remove"
          );

          await sock.sendMessage(jid, {
            text:
              `🔨 @${displayUser(target)} was removed.`,
            mentions: [target]
          });

          return;
        }

        // ==================================
        // DELETE MESSAGE
        // ==================================

        if (command === "del") {

          if (!botAdmin) {
            await sock.sendMessage(jid, {
              text:
                "⚠️ I need to be a group admin to delete messages."
            });
            return;
          }

          await sock.sendMessage(jid, {
            delete: msg.key
          });

          return;
        }

        // ==================================
        // ANTI-LINK ON/OFF
        // ==================================

        if (command === "antlink") {

          const value =
            (args[0] || "").toLowerCase();

          if (
            value !== "on" &&
            value !== "off"
          ) {
            await sock.sendMessage(jid, {
              text:
                "Usage:\n" +
                ".antlink on\n" +
                ".antlink off"
            });

            return;
          }

          settings.antilink =
            value === "on";

          await sock.sendMessage(jid, {
            text:
              `🔗 Anti-link is now ${
                settings.antilink
                  ? "ON ✅"
                  : "OFF ❌"
              }`
          });

          return;
        }

        // ==================================
        // LOCK GROUP
        // ==================================

        if (command === "lock") {

          if (!botAdmin) {
            await sock.sendMessage(jid, {
              text:
                "⚠️ Make me a group admin first."
            });
            return;
          }

          await sock.groupSettingUpdate(
            jid,
            "announcement"
          );

          await sock.sendMessage(jid, {
            text:
              "🔒 *GROUP LOCKED*\n\n" +
              "Only admins can send messages."
          });

          return;
        }

        // ==================================
        // UNLOCK GROUP
        // ==================================

        if (command === "unlock") {

          if (!botAdmin) {
            await sock.sendMessage(jid, {
              text:
                "⚠️ Make me a group admin first."
            });
            return;
          }

          await sock.groupSettingUpdate(
            jid,
            "not_announcement"
          );

          await sock.sendMessage(jid, {
            text:
              "🔓 *GROUP UNLOCKED*\n\n" +
              "Members can send messages again."
          });

          return;
        }

        // ==================================
        // NORMAL MEMBER MODERATION
        // ==================================

        if (senderAdmin) return;

        // ==================================
        // ANTI-LINK
        // ==================================

        if (settings.antilink) {

          const links = [
            "http://",
            "https://",
            "www.",
            "t.me/",
            "chat.whatsapp.com/",
            "discord.gg/"
          ];

          const lowerText =
            text.toLowerCase();

          const hasLink =
            links.some(link =>
              lowerText.includes(link)
            );

          if (hasLink) {

            if (botAdmin) {

              await sock.sendMessage(jid, {
                delete: msg.key
              });
            }

            await addWarning(
              sock,
              jid,
              sender,
              "Unauthorized link",
              botAdmin
            );

            return;
          }
        }

      } catch (error) {

        console.error(
          "Message handler error:",
          error
        );
      }
    }
  );
}

// ==========================================
// WARNING SYSTEM
// ==========================================

async function addWarning(
  sock,
  jid,
  user,
  reason,
  botAdmin
) {

  const key =
    `${jid}:${user}`;

  const current =
    warnings.get(key) || 0;

  const total =
    current + 1;

  warnings.set(key, total);

  const number =
    displayUser(user);

  // ========================================
  // AUTO KICK
  // ========================================

  if (total >= MAX_WARNINGS) {

    if (botAdmin) {

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
            `Warnings: ${MAX_WARNINGS}/${MAX_WARNINGS}`,
          mentions: [user]
        });

        return;

      } catch (error) {

        console.error(
          "Kick error:",
          error
        );
      }
    }

    await sock.sendMessage(jid, {
      text:
        `🚨 @${number} reached ${MAX_WARNINGS}/${MAX_WARNINGS} warnings.\n\n` +
        `Reason: ${reason}\n\n` +
        `⚠️ I could not remove the member. Make sure I am a group admin.`,
      mentions: [user]
    });

    return;
  }

  // ========================================
  // NORMAL WARNING
  // ========================================

  await sock.sendMessage(jid, {
    text:
      `⚠️ *WARNING ${total}/${MAX_WARNINGS}*\n\n` +
      `👤 @${number}\n` +
      `📌 Reason: ${reason}`,
    mentions: [user]
  });
}

// ==========================================
// START
// ==========================================

startBot().catch(error => {

  console.error(
    "Fatal bot error:",
    error
  );

});
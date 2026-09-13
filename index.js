const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

// =========================
// CONFIGURAÇÕES
// =========================

const ROBLOX_CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const ROBLOX_CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const ROBLOX_REDIRECT_URI = process.env.ROBLOX_REDIRECT_URI;

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const DISCORD_REDIRECT_URI =
  "https://utl-verify-1.onrender.com/discord/callback";

const GUILD_ID = "1543572035064823889";
const VERIFIED_ROLE_ID = "1543594745559781376";

// Guarda temporariamente quem iniciou cada verificação
const sessions = new Map();

// =========================
// PÁGINA INICIAL
// =========================

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8">
        <title>UTL Verify</title>
      </head>
      <body>
        <h1>🔐 UTL Verify</h1>
        <p>Clique abaixo para iniciar a verificação.</p>
        <a href="/login">
          <button>✅ VERIFY</button>
        </a>
      </body>
    </html>
  `);
});

// =========================
// 1. DISCORD OAUTH
// =========================

app.get("/login", (req, res) => {
  const state = crypto.randomBytes(32).toString("hex");

  sessions.set(state, {
    createdAt: Date.now()
  });

  const discordURL =
    "https://discord.com/oauth2/authorize" +
    `?client_id=${encodeURIComponent(DISCORD_CLIENT_ID)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(DISCORD_REDIRECT_URI)}` +
    `&scope=identify`;

  res.redirect(discordURL + `&state=${encodeURIComponent(state)}`);
});

// =========================
// 2. CALLBACK DO DISCORD
// =========================

app.get("/discord/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("❌ Autorização do Discord inválida.");
    }

    const session = sessions.get(state);

    if (!session) {
      return res.status(400).send("❌ Sessão expirada ou inválida.");
    }

    // Sessão válida por 10 minutos
    if (Date.now() - session.createdAt > 10 * 60 * 1000) {
      sessions.delete(state);
      return res.status(400).send("❌ A sessão expirou.");
    }

    // Troca o código por token do Discord
    const discordTokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const discordAccessToken = discordTokenResponse.data.access_token;

    // Descobre quem autorizou
    const discordUserResponse = await axios.get(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${discordAccessToken}`
        }
      }
    );

    const discordUser = discordUserResponse.data;

    // Guarda o ID do Discord na sessão
    session.discordUserId = discordUser.id;

    // Agora manda o usuário para o Roblox
    const robloxURL =
      "https://apis.roblox.com/oauth/v1/authorize" +
      `?client_id=${encodeURIComponent(ROBLOX_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(ROBLOX_REDIRECT_URI)}` +
      "&response_type=code" +
      "&scope=openid%20profile" +
      `&state=${encodeURIComponent(state)}`;

    res.redirect(robloxURL);

  } catch (error) {
    console.error(
      "Erro Discord:",
      error.response?.data || error.message
    );

    res.status(500).send("❌ Erro ao autorizar o Discord.");
  }
});

// =========================
// 3. CALLBACK DO ROBLOX
// =========================

app.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("❌ Autorização do Roblox inválida.");
    }

    const session = sessions.get(state);

    if (!session || !session.discordUserId) {
      return res.status(400).send("❌ Sessão inválida ou expirada.");
    }

    const discordUserId = session.discordUserId;

    // Troca o código do Roblox por access token
    const robloxTokenResponse = await axios.post(
      "https://apis.roblox.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: ROBLOX_CLIENT_ID,
        client_secret: ROBLOX_CLIENT_SECRET,
        redirect_uri: ROBLOX_REDIRECT_URI
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const robloxAccessToken =
      robloxTokenResponse.data.access_token;

    // Pega informações do usuário Roblox
    const robloxUserResponse = await axios.get(
      "https://apis.roblox.com/oauth/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${robloxAccessToken}`
        }
      }
    );

    const robloxUser = robloxUserResponse.data;

    // Display Name do Roblox
    const robloxName =
      robloxUser.name ||
      robloxUser.preferred_username;

    // =========================
    // 4. ADICIONA O CARGO
    // =========================

    await axios.put(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${VERIFIED_ROLE_ID}`,
      {},
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`
        }
      }
    );

    // =========================
    // 5. MUDA O APELIDO
    // =========================

    await axios.patch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}`,
      {
        nick: robloxName
      },
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Remove a sessão
    sessions.delete(state);

    // =========================
    // 6. SUCESSO
    // =========================

    res.send(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Verificação concluída</title>
        </head>

        <body>
          <h1>✅ Verificação concluída!</h1>

          <p>
            Roblox:
            <strong>${escapeHTML(robloxName)}</strong>
          </p>

          <p>Seu cargo foi adicionado no Discord.</p>

          <p>Seu apelido foi atualizado para o seu nome do Roblox.</p>

          <br>

          <p>Você já pode voltar para o Discord.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error(
      "Erro Roblox/Discord:",
      error.response?.data || error.message
    );

    res.status(500).send(`
      <h1>❌ Erro na verificação</h1>
      <p>Não foi possível finalizar sua verificação.</p>
      <p>Verifique as configurações do bot e tente novamente.</p>
    `);
  }
});

// =========================
// SEGURANÇA PARA O NOME
// =========================

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =========================
// LIMPEZA DE SESSÕES
// =========================

setInterval(() => {
  const now = Date.now();

  for (const [state, session] of sessions.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      sessions.delete(state);
    }
  }
}, 60 * 1000);

// =========================
// INICIAR SERVIDOR
// =========================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`UTL Verify online na porta ${PORT}`);
});

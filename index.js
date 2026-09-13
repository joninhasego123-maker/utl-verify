const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

// =====================================
// CONFIGURAÇÕES
// =====================================

const ROBLOX_CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const ROBLOX_CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const ROBLOX_REDIRECT_URI = process.env.ROBLOX_REDIRECT_URI;

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

const GUILD_ID = "1543572035064823889";
const VERIFIED_ROLE_ID = "1543594745559781376";

const DISCORD_INVITE = "https://discord.gg/cMNtuVWZG";

// =====================================
// SESSÕES
// =====================================

const sessions = new Map();

// =====================================
// ESCAPAR HTML
// =====================================

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =====================================
// PÁGINA INICIAL
// =====================================

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>UTL Verification</title>

  <style>
    body {
      background: #111827;
      color: white;
      font-family: Arial, sans-serif;
      text-align: center;
      padding-top: 100px;
    }

    .box {
      max-width: 500px;
      margin: auto;
      background: #1f2937;
      padding: 40px;
      border-radius: 15px;
    }

    a {
      display: inline-block;
      background: #5865F2;
      color: white;
      text-decoration: none;
      padding: 15px 30px;
      border-radius: 8px;
      font-weight: bold;
    }

    a:hover {
      background: #4752C4;
    }
  </style>
</head>

<body>

  <div class="box">

    <h1>🔐 UTL Verification</h1>

    <p>
      Clique no botão abaixo para verificar sua conta.
    </p>

    <a href="/login">
      ✅ VERIFICAR
    </a>

  </div>

</body>
</html>
  `);
});

// =====================================
// LOGIN DISCORD
// =====================================

app.get("/login", (req, res) => {

  const state = crypto.randomBytes(32).toString("hex");

  sessions.set(state, {
    createdAt: Date.now()
  });

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri:
      "https://utl-verify-1.onrender.com/discord/callback",
    response_type: "code",
    scope: "identify",
    state
  });

  res.redirect(
    `https://discord.com/oauth2/authorize?${params.toString()}`
  );
});

// =====================================
// CALLBACK DISCORD
// =====================================

app.get("/discord/callback", async (req, res) => {

  try {

    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send("Código ou state inválido.");
    }

    const session = sessions.get(state);

    if (!session) {
      return res.status(400).send("Sessão inválida ou expirada.");
    }

    // ---------------------------------
    // TOKEN DISCORD
    // ---------------------------------

    const tokenResponse = await axios.post(
      "https://discord.com/api/oauth2/token",

      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri:
          "https://utl-verify-1.onrender.com/discord/callback"
      }),

      {
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        }
      }
    );

    const discordAccessToken =
      tokenResponse.data.access_token;

    // ---------------------------------
    // USUÁRIO DISCORD
    // ---------------------------------

    const discordUserResponse = await axios.get(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization:
            `Bearer ${discordAccessToken}`
        }
      }
    );

    const discordUser =
      discordUserResponse.data;

    console.log(
      "Discord:",
      discordUser.username,
      discordUser.id
    );

    // ---------------------------------
    // SALVAR SESSÃO
    // ---------------------------------

    sessions.set(state, {

      discordUserId: discordUser.id,

      createdAt: session.createdAt

    });

    // =================================
    // IR PARA ROBLOX
    // =================================

    const robloxParams = new URLSearchParams({

      client_id: ROBLOX_CLIENT_ID,

      redirect_uri:
        ROBLOX_REDIRECT_URI,

      response_type: "code",

      scope: "openid profile",

      state

    });

    res.redirect(
      `https://apis.roblox.com/oauth/v1/authorize?${robloxParams.toString()}`
    );

  } catch (error) {

    console.error(
      "Erro Discord:",
      error.response?.data ||
      error.message
    );

    res.status(500).send(`
      <h1>❌ Erro no Discord</h1>
      <p>Não foi possível continuar a verificação.</p>
    `);
  }
});

// =====================================
// CALLBACK ROBLOX
// =====================================

app.get("/callback", async (req, res) => {

  try {

    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send(
        "Código ou state inválido."
      );
    }

    const session = sessions.get(state);

    if (!session || !session.discordUserId) {

      return res.status(400).send(
        "Sessão inválida ou expirada."
      );
    }

    const discordUserId =
      session.discordUserId;

    // =================================
    // TOKEN ROBLOX
    // =================================

    const tokenResponse = await axios.post(

      "https://apis.roblox.com/oauth/v1/token",

      new URLSearchParams({

        client_id:
          ROBLOX_CLIENT_ID,

        client_secret:
          ROBLOX_CLIENT_SECRET,

        grant_type:
          "authorization_code",

        code,

        redirect_uri:
          ROBLOX_REDIRECT_URI

      }),

      {
        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        }
      }

    );

    const robloxAccessToken =
      tokenResponse.data.access_token;

    // =================================
    // INFORMAÇÕES ROBLOX
    // =================================

    const robloxUserResponse =
      await axios.get(

        "https://apis.roblox.com/oauth/v1/userinfo",

        {
          headers: {
            Authorization:
              `Bearer ${robloxAccessToken}`
          }
        }

      );

    const robloxUser =
      robloxUserResponse.data;

    // =================================
    // USERNAME DO ROBLOX
    // =================================

    const robloxName =
      robloxUser.preferred_username;

    if (!robloxName) {

      throw new Error(
        "Username do Roblox não encontrado."
      );

    }

    console.log(
      "Roblox Username:",
      robloxName
    );

    console.log(
      "Roblox ID:",
      robloxUser.sub
    );

    // =================================
    // DAR CARGO
    // =================================

    await axios.put(

      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}/roles/${VERIFIED_ROLE_ID}`,

      {},

      {
        headers: {
          Authorization:
            `Bot ${DISCORD_BOT_TOKEN}`
        }
      }

    );

    console.log(
      "✅ Cargo adicionado."
    );

    // =================================
    // ALTERAR NICKNAME
    // =================================

    try {

      await axios.patch(

        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordUserId}`,

        {
          nick: robloxName
        },

        {
          headers: {

            Authorization:
              `Bot ${DISCORD_BOT_TOKEN}`,

            "Content-Type":
              "application/json"

          }
        }

      );

      console.log(
        "✅ Nickname alterado para:",
        robloxName
      );

    } catch (nicknameError) {

      console.error(
        "⚠️ Não foi possível alterar o nickname:",
        nicknameError.response?.data ||
        nicknameError.message
      );

    }

    // =================================
    // APAGAR SESSÃO
    // =================================

    sessions.delete(state);

    // =================================
    // REDIRECIONAR PARA DISCORD
    // =================================

    res.send(`

<!DOCTYPE html>

<html>

<head>

  <meta charset="UTF-8">

  <title>
    Verificação concluída
  </title>

  <meta
    http-equiv="refresh"
    content="1;url=${DISCORD_INVITE}"
  >

  <style>

    body {

      background: #111827;

      color: white;

      font-family: Arial, sans-serif;

      text-align: center;

      padding-top: 100px;

    }

  </style>

</head>

<body>

  <h1>
    ✅ Verificação concluída!
  </h1>

  <p>
    Bem-vindo, ${escapeHTML(robloxName)}!
  </p>

  <p>
    Redirecionando para o Discord...
  </p>

</body>

</html>

    `);

  } catch (error) {

    console.error(

      "Erro Roblox/Discord:",

      error.response?.data ||
      error.message

    );

    res.status(500).send(`

<!DOCTYPE html>

<html>

<head>

  <meta charset="UTF-8">

  <title>
    Erro na verificação
  </title>

  <style>

    body {

      background: #111827;

      color: white;

      font-family: Arial, sans-serif;

      text-align: center;

      padding-top: 100px;

    }

    .box {

      max-width: 500px;

      margin: auto;

      background: #1f2937;

      padding: 40px;

      border-radius: 15px;

    }

    h1 {

      color: #ef4444;

    }

  </style>

</head>

<body>

  <div class="box">

    <h1>
      ❌ Erro na verificação
    </h1>

    <p>
      Não foi possível finalizar sua verificação.
    </p>

    <p>
      Tente novamente.
    </p>

  </div>

</body>

</html>

    `);

  }

});

// =====================================
// INICIAR SERVIDOR
// =====================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Servidor rodando na porta ${PORT}`
    );

  }
);

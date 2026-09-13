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
<html lang="pt-BR">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Verificação UTL</title>

  <style>

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;

      display: flex;
      align-items: center;
      justify-content: center;

      background:
        radial-gradient(circle at top, #123b72 0%, #081525 45%, #03070d 100%);

      color: white;
      font-family: Arial, Helvetica, sans-serif;
    }

    .box {
      width: 90%;
      max-width: 480px;

      background: rgba(15, 25, 40, 0.95);

      border: 1px solid rgba(255,255,255,0.08);

      border-radius: 18px;

      padding: 35px;

      text-align: center;

      box-shadow:
        0 20px 60px rgba(0,0,0,0.45);
    }

    h1 {
      margin: 0 0 12px;
      font-size: 30px;
    }

    p {
      color: #cbd5e1;
      line-height: 1.5;
    }

    a {
      display: inline-block;

      margin-top: 20px;

      padding: 14px 30px;

      background: #5865F2;

      color: white;

      text-decoration: none;

      border-radius: 10px;

      font-weight: bold;
    }

    a:hover {
      opacity: 0.9;
    }

  </style>

</head>

<body>

  <div class="box">

    <h1>🛡️ Verificação UTL</h1>

    <p>
      Clique abaixo para iniciar sua verificação.
    </p>

    <a href="/login">
      Verificar conta
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
      return res.status(400).send(
        "Código ou state inválido."
      );
    }

    const session = sessions.get(state);

    if (!session) {
      return res.status(400).send(
        "Sessão inválida ou expirada."
      );
    }

    // Trocar código por token
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

    // Pegar usuário Discord
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

    // Salvar sessão
    sessions.set(state, {

      discordUserId:
        discordUser.id,

      createdAt:
        session.createdAt

    });

    // =================================
    // IR PARA ROBLOX
    // =================================

    const robloxParams = new URLSearchParams({

      client_id:
        ROBLOX_CLIENT_ID,

      redirect_uri:
        ROBLOX_REDIRECT_URI,

      response_type:
        "code",

      scope:
        "openid profile",

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

      <p>
        Não foi possível continuar a verificação.
      </p>

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
    // DADOS DO ROBLOX
    // =================================

    const robloxUserResponse = await axios.get(

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
    // USERNAME
    // =================================

    const robloxName =
      robloxUser.preferred_username;

    if (!robloxName) {

      throw new Error(
        "Username do Roblox não encontrado."
      );

    }

    const robloxId =
      robloxUser.sub;

    console.log(
      "Roblox Username:",
      robloxName
    );

    console.log(
      "Roblox ID:",
      robloxId
    );

    // =================================
    // FOTO DO ROBLOX
    // =================================

    let avatarUrl = "";

    try {

      const avatarResponse = await axios.get(

        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${robloxId}&size=150x150&format=Png&isCircular=true`

      );

      avatarUrl =
        avatarResponse.data.data?.[0]?.imageUrl || "";

    } catch (avatarError) {

      console.error(
        "⚠️ Erro ao buscar avatar:",
        avatarError.response?.data ||
        avatarError.message
      );

    }

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
        "⚠️ Erro no nickname:",
        nicknameError.response?.data ||
        nicknameError.message
      );

    }

    // =================================
    // APAGAR SESSÃO
    // =================================

    sessions.delete(state);

    // =================================
    // PÁGINA DE SUCESSO
    // =================================

    res.send(`

<!DOCTYPE html>

<html lang="pt-BR">

<head>

  <meta charset="UTF-8">

  <meta name="viewport"
        content="width=device-width, initial-scale=1.0">

  <title>Verificação concluída</title>

  <style>

    * {
      box-sizing: border-box;
    }

    body {

      margin: 0;

      min-height: 100vh;

      display: flex;

      flex-direction: column;

      align-items: center;

      justify-content: center;

      padding: 20px;

      background:
        radial-gradient(
          circle at top,
          #123d78 0%,
          #08182c 40%,
          #03070d 100%
        );

      color: white;

      font-family:
        Arial,
        Helvetica,
        sans-serif;

    }

    .box {

      width: 100%;

      max-width: 520px;

      padding: 35px;

      background:
        rgba(12, 24, 40, 0.96);

      border:
        1px solid
        rgba(255,255,255,0.08);

      border-radius: 20px;

      text-align: center;

      box-shadow:
        0 25px 70px
        rgba(0,0,0,0.5);

    }

    .verified {

      font-size: 30px;

      font-weight: 700;

      margin-bottom: 12px;

    }

    .description {

      color: #cbd5e1;

      font-size: 16px;

      margin-bottom: 25px;

    }

    .user {

      display: flex;

      align-items: center;

      text-align: left;

      gap: 15px;

      padding: 15px;

      border-radius: 14px;

      background:
        rgba(255,255,255,0.05);

      border:
        1px solid
        rgba(255,255,255,0.06);

      margin-bottom: 28px;

    }

    .avatar {

      width: 58px;

      height: 58px;

      border-radius: 50%;

      object-fit: cover;

      background: #1e293b;

      flex-shrink: 0;

    }

    .username {

      font-size: 18px;

      font-weight: bold;

      margin-bottom: 5px;

    }

    .robloxid {

      color: #94a3b8;

      font-size: 13px;

    }

    .close {

      color: #cbd5e1;

      font-size: 15px;

    }

    #countdown {

      font-weight: bold;

      color: white;

    }

    .footer {

      margin-top: 18px;

      color: #64748b;

      font-size: 12px;

      text-align: center;

    }

  </style>

</head>

<body>

  <div class="box">

    <div class="verified">
      ✅ Verified!
    </div>

    <div class="description">
      Sua conta do Roblox foi linkada ao Discord.
    </div>

    <div class="user">

      ${
        avatarUrl
        ? `<img class="avatar"
                src="${escapeHTML(avatarUrl)}"
                alt="Avatar do Roblox">`
        : `<div class="avatar"></div>`
      }

      <div>

        <div class="username">
          ${escapeHTML(robloxName)}
        </div>

        <div class="robloxid">
          Roblox ID: ${escapeHTML(robloxId)}
        </div>

      </div>

    </div>

    <div class="close">

      <span id="countdown">
        Fechando essa aba em 3...
      </span>

    </div>

  </div>

  <div class="footer">

    © 2026 UTL. Todos os direitos reservados.

  </div>

  <script>

    let seconds = 3;

    const countdown =
      document.getElementById("countdown");

    const timer =
      setInterval(() => {

        seconds--;

        if (seconds > 0) {

          countdown.textContent =
            "Fechando essa aba em " +
            seconds +
            "...";

        } else {

          clearInterval(timer);

          countdown.textContent =
            "Fechando essa aba...";

          // Tentar fechar a aba
          window.close();

          // Segunda tentativa
          setTimeout(() => {

            window.open("", "_self");

            window.close();

          }, 300);

        }

      }, 1000);

  </script>

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

<html lang="pt-BR">

<head>

  <meta charset="UTF-8">

  <title>Erro na verificação</title>

</head>

<body>

  <h1>❌ Erro na verificação</h1>

  <p>
    Não foi possível finalizar sua verificação.
  </p>

  <p>
    Tente novamente.
  </p>

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

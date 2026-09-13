const express = require("express");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.ROBLOX_CLIENT_ID;
const CLIENT_SECRET = process.env.ROBLOX_CLIENT_SECRET;
const REDIRECT_URI = process.env.ROBLOX_REDIRECT_URI;

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = "1543572035064823889";
const VERIFIED_ROLE_ID = "1543594745559781376";

app.get("/", (req, res) => {
  res.send("UTL Verify está online!");
});

app.get("/login", (req, res) => {
  const url =
    "https://apis.roblox.com/oauth/v1/authorize" +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    "&response_type=code" +
    "&scope=openid%20profile";

  res.redirect(url);
});

app.get("/callback", async (req, res) => {
  try {
    const code = req.query.code;

    if (!code) {
      return res.status(400).send("Código de autorização não encontrado.");
    }

    const tokenResponse = await axios.post(
      "https://apis.roblox.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    const userResponse = await axios.get(
      "https://apis.roblox.com/oauth/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const robloxUser = userResponse.data;

    res.send(`
      <h1>✅ Roblox verificado!</h1>
      <p>Usuário: ${robloxUser.name || robloxUser.preferred_username}</p>
      <p>Agora vamos finalizar sua verificação no Discord.</p>
    `);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("Erro ao verificar sua conta Roblox.");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`UTL Verify rodando na porta ${PORT}`);
});

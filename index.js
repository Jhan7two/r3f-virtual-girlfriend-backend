import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";
import ElevenLabsService from "./services/ElevenLabsService.js";

dotenv.config();

// ======== OpenAI ========
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "-" });

// ======== ElevenLabs ========
const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = process.env.VOICE_ID || "kgG7dCoKCfLehAPWkJOE";
const elevenLabsService = new ElevenLabsService(elevenLabsApiKey, voiceID);

// ======== Paths ========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(cors());
const port = process.env.PORT || 3000;

const audiosDir = path.join(__dirname, "audios");
try { await fs.access(audiosDir); } catch { await fs.mkdir(audiosDir, { recursive: true }); }





// ======== Default audios (kept for onboarding) ========
// Note: Only generates MP3 files. Lipsync is now handled by wawa-lipsync in frontend.
const initializeDefaultAudios = async () => {
  const defaults = [
    { file: "intro_0", text: "Hola, ¿cómo estuvo tu día?", emotion: "smile" },
    { file: "intro_1", text: "Te extrañé, no te desconectes tanto tiempo 🙃", emotion: "sad" },
    { file: "api_0",  text: "Por favor, recuerda configurar tus llaves de API.", emotion: "angry" },
    { file: "api_1",  text: "Evitemos costos inesperados: configura OpenAI y ElevenLabs.", emotion: "smile" },
  ];

  for (const msg of defaults) {
    const mp3 = path.join(audiosDir, `${msg.file}.mp3`);
    try {
      await fs.access(mp3);
    } catch {
      try {
        if (!elevenLabsApiKey) throw new Error("no-elevenlabs-key");
        const tts = await elevenLabsService.generateAudio(msg.text, mp3);
        if (!tts.success) throw new Error(tts.error || "elevenlabs-failed");
      } catch (e) {
        console.warn(`Failed to generate default audio for ${msg.file}:`, e.message);
      }
    }
  }
};





// ======== Chat (OpenAI) ========
const callOpenAI = async (userMessage) => {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Eres una asistente empresarial.\nSiempre responderás con un arreglo JSON de mensajes (máximo 3).\nCada mensaje debe incluir: text, facialExpression y animation.\nEl texto debe exponer o explicar datos de la empresa (productos, servicios, indicadores o información general).\nUsa un lenguaje profesional, claro y cercano.\nLas expresiones faciales disponibles son: smile, sad, angry, surprised, funnyFace, default.\nLas animaciones disponibles son: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, Angry.\nFormato de ejemplo de respuesta: {"messages": [{"text": "Nuestra empresa logró un crecimiento del 20% este trimestre.", "facialExpression": "smile", "animation": "Talking_1"}]}\n`,
      },
      { role: "user", content: userMessage || "hola" },
    ],
  });
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) messages = messages.messages;
  return messages;
};

// ======== API ========
app.get("/", (req, res) => { res.send("Business Assistant Server is running!"); });

app.get("/voices", async (req, res) => {
  try { const voices = await elevenLabsService.getAvailableVoices(); res.send(voices); }
  catch (e) { res.status(500).send({ error: "Failed to get voices" }); }
});

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  console.log(`[chat] user: ${typeof userMessage === 'string' ? userMessage.slice(0, 200) : ''}`);

  if (!userMessage) {
    return res.send({ messages: [
      { text: "Hola, ¿cómo estuvo tu día?", audio: await audioFileToBase64(path.join(audiosDir, "intro_0.mp3")), audioMime: "audio/mpeg", facialExpression: "smile", animation: "Talking_1" },
      { text: "Te extrañé, no te desconectes tanto tiempo 🙃", audio: await audioFileToBase64(path.join(audiosDir, "intro_1.mp3")), audioMime: "audio/mpeg", facialExpression: "sad", animation: "Crying" },
    ]});
  }

  // Llaves requeridas
  if (!elevenLabsApiKey || !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "-") {
    return res.send({ messages: [
      { text: "Por favor, configura tus llaves de API.", audio: await audioFileToBase64(path.join(audiosDir, "api_0.mp3")), audioMime: "audio/mpeg", facialExpression: "angry", animation: "Angry" },
      { text: "Necesitas configurar OpenAI y ElevenLabs.", audio: await audioFileToBase64(path.join(audiosDir, "api_1.mp3")), audioMime: "audio/mpeg", facialExpression: "smile", animation: "Laughing" },
    ]});
  }

  try {
    const messages = await callOpenAI(userMessage);
    console.log(`[chat] openai messages: ${messages.length}`);

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const mp3 = path.join(audiosDir, `message_${i}.mp3`);

      try {
        // 1) TTS
        console.log(`[chat] tts -> message_${i}`);
        const audioResult = await elevenLabsService.generateAudio(m.text, mp3);
        if (!audioResult.success) throw new Error(audioResult.error || "tts-failed");

        // 2) Respuesta
        m.audio = await audioFileToBase64(mp3);
        m.audioMime = "audio/mpeg";
      } catch (e) {
        console.error(`[chat] audio exception (message_${i}):`, e.message);
        m.audio = "";
        m.audioMime = "audio/mpeg";
      }
    }

    res.send({ messages, provider: "openai" });
  } catch (error) {
    console.error(`[chat] provider error:`, error.message);
    res.status(500).send({
      error: "Failed to process chat request",
      messages: [{ text: "Lo siento, tengo dificultades técnicas ahora.", facialExpression: "sad", animation: "Crying", audio: "", audioMime: "audio/mpeg" }]
    });
  }
});

// ======== Utils ========
const audioFileToBase64 = async (file) => {
  try {
    const p = path.resolve(file);
    try { await fs.access(p); } catch { return ""; }
    const data = await fs.readFile(p);
    return data?.length ? data.toString("base64") : "";
  } catch { return ""; }
};



// ======== Health ========
app.get("/health", async (req, res) => {
  const status = { status: "healthy", timestamp: new Date().toISOString(), services: { openai: { configured: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-") }, elevenlabs: { configured: !!elevenLabsApiKey } } };
  if (elevenLabsApiKey) {
    try { const voices = await elevenLabsService.getAvailableVoices(); status.services.elevenlabs.status = "healthy"; status.services.elevenlabs.voicesCount = voices.length; }
    catch (e) { status.services.elevenlabs.status = "error"; status.services.elevenlabs.error = e.message; status.status = "degraded"; }
  }
  res.status(status.status === "healthy" ? 200 : 503).json(status);
});

// ======== Start ========
app.listen(port, async () => {
  console.log(`Business Assistant Server listening on port ${port}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`ElevenLabs: ${elevenLabsApiKey ? "Configured" : "Not configured"}`);
  console.log(`OpenAI: ${(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== '-') ? "Configured" : "Not configured"}`);
  try { await initializeDefaultAudios(); } catch (e) { console.error(`[startup] init audios:`, e.message); }
  console.log(`Server ready at http://localhost:${port}`);
});

export default app;

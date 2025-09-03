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
const voiceID = process.env.VOICE_ID || "86V9x9hrQds83qf7zaGn";
const elevenLabsService = new ElevenLabsService(elevenLabsApiKey, voiceID);

// ======== MEMORIA DE CONVERSACIONES ========
// Almacena las conversaciones por sesión/cliente
const conversationHistory = new Map();

// Función para obtener o crear el historial de conversación
const getConversationHistory = (sessionId = "default") => {
  if (!conversationHistory.has(sessionId)) {
    conversationHistory.set(sessionId, [
      {
        role: "system",
        content: `Eres Laura, asesora comercial de Control Facilito. Tu rol es asistir a clientes potenciales en una feria, resolviendo dudas de manera clara, breve y profesional. Tu meta es explicar cómo Control Facilito puede ayudar a su negocio y motivarlos a agendar una reunión.

### Estilo de conversación
- Tono amigable, humano y profesional.
- Responde de forma conversacional, no robótica.
- Personaliza según el rubro o la empresa del cliente si lo menciona.

## FORMATO DE RESPUESTA:
Siempre responde con un JSON con máximo 3 mensajes.
Cada mensaje debe incluir: text, facialExpression, animation.
Expresiones disponibles: smile, sad, angry, surprised, funnyFace, default
Animaciones disponibles: Talking_0, Talking_1, Talking_2, Laughing, Rumba, Idle, Terrified, Angry

### Reglas
- Responde solo con información de www.controlfacilito.com.
- Si preguntan por precios, menciona que los planes inician en 480 $us anuales.

### Información clave de Control Facilito
- Software en la nube para pymes y emprendedores, accesible desde cualquier lugar.
- Ayuda a gestionar ventas, compras, inventarios, facturación, clientes, finanzas y más.
- Sectores donde se aplica:
  - Supermercados: ventas ágiles con lector de códigos y control de inventarios.
  - Restaurantes: control de insumos y recetas con punto de venta fácil.
  - Ferreterías: inventario actualizado e informes de ganancias.
  - Tiendas: integración con lector de códigos y gestión de stock.
  - Distribuidoras: control de productos, cuentas por cobrar y clientes.
  - Importadoras: control de stock y reportes de ganancias rápidos.

### Módulos disponibles
Facturación, Contabilidad, Ventas, Compras, Inventarios, Clientes, Distribución, Producción, Finanzas, Tienda virtual, Descuentos, Gastos, Inteligencia de negocios, y más.

### Planes de precios
- Estándar: módulos básicos (ventas, compras, inventarios) para 1 usuario y 1 sucursal.
- Estándar Facturador: incluye facturación (hasta 4000 facturas/mes), 5 usuarios y 2 sucursales.
- Empresarial: facturación ilimitada, contabilidad, distribución/producción, finanzas, BI, hasta 15 usuarios y 5 sucursales.
- Personalizado: módulos a medida, integraciones API, WhatsApp, automatización de cobranzas, BI, etc.

### Dinámica en feria
- Puedes hacer preguntas para involucrar al cliente:
  - ¿Cómo gestionan hoy su negocio: papel, Excel o sistema?
  - ¿Qué área les genera más problemas: ventas, inventario, facturación?

### Juego de Feria (Trivia)
- Si el usuario dice que quiere jugar, usa SOLO 1 pregunta por turno.
- Haz la pregunta en tono motivador (ej.: "¡Vamos con una rápida por premio!").
- Espera la respuesta del usuario antes de revelar la solución.
- Si la respuesta es correcta, felicita y menciona el premio. Si no, da la respuesta breve y sigue.
- Alterna niveles: fácil → intermedio → avanzado → bonus (si aplica).
- Si el usuario prefiere conocer el producto, ofrece video demo y/o agendar reunión (L-V, 09:00–18:00).`,
      },
    ]);
  }
  return conversationHistory.get(sessionId);
};

// ======== CONFIGURACIÓN DE LÍMITES ========
const MAX_MESSAGES_PER_SESSION = 20; // Máximo de mensajes por sesión
const MAX_CONTEXT_MESSAGES = 15; // Mensajes a mantener en contexto antes de reset

// Función para generar nuevo sessionId
const generateNewSessionId = (baseSessionId) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 5);
  // Mantener prefijo del sessionId original si existe
  const prefix = baseSessionId.split("_")[0] || "user";
  return `${prefix}_${timestamp}_${random}`;
};

// Función para añadir mensaje al historial (SIN verificación de límites)
const addToConversationHistory = (sessionId, role, content) => {
  const history = getConversationHistory(sessionId);
  history.push({ role, content });

  // Solo limpiar mensajes antiguos si excede el contexto
  const conversationLength = history.length - 1; // Excluir system message
  if (conversationLength > MAX_CONTEXT_MESSAGES + 5) {
    // Buffer adicional
    const messagesToRemove = conversationLength - MAX_CONTEXT_MESSAGES;
    history.splice(1, messagesToRemove); // Mantener system message
  }
};

// Nueva función para verificar límites ANTES de procesar
const checkSessionLimits = (sessionId) => {
  const history = getConversationHistory(sessionId);
  const conversationLength = history.length - 1; // Excluir system message

  if (conversationLength >= MAX_MESSAGES_PER_SESSION) {
    return { shouldReset: true, newSessionId: generateNewSessionId(sessionId) };
  }

  return { shouldReset: false };
};

// ======== Paths ========
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(cors());
const port = process.env.PORT || 3000;

const audiosDir = path.join(__dirname, "audios");
try {
  await fs.access(audiosDir);
} catch {
  await fs.mkdir(audiosDir, { recursive: true });
}

// ======== Default audios (kept for onboarding) ========
const initializeDefaultAudios = async () => {
  const defaults = [
    { file: "intro_0", text: "Hola, ¿cómo estuvo tu día?", emotion: "smile" },
    {
      file: "intro_1",
      text: "Te extrañé, no te desconectes tanto tiempo 🙃",
      emotion: "sad",
    },
    {
      file: "api_0",
      text: "Por favor, recuerda configurar tus llaves de API.",
      emotion: "angry",
    },
    {
      file: "api_1",
      text: "Evitemos costos inesperados: configura OpenAI y ElevenLabs.",
      emotion: "smile",
    },
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
        console.warn(
          `Failed to generate default audio for ${msg.file}:`,
          e.message
        );
      }
    }
  }
};

// ======== Chat (OpenAI) CON MEMORIA ========
const callOpenAI = async (userMessage, sessionId = "default") => {
  // VERIFICAR LÍMITES ANTES de agregar mensajes
  const limitCheck = checkSessionLimits(sessionId);

  // Obtener historial de conversación
  const conversationMessages = getConversationHistory(sessionId);

  // Añadir mensaje del usuario al historial
  addToConversationHistory(sessionId, "user", userMessage);

  // Crear mensajes para OpenAI (incluye todo el historial)
  const messages = [
    ...conversationMessages,
    { role: "user", content: userMessage },
  ];

  console.log(
    `[chat] Session: ${sessionId}, Total messages in history: ${messages.length}`
  );

  // Agregar mensaje especial si estamos cerca del límite
  if (limitCheck.shouldReset) {
    messages.push({
      role: "system",
      content: `IMPORTANTE: Esta conversación está llegando a su límite natural. En tu respuesta, sugiere de manera amigable que podemos continuar en una nueva conversación para un mejor rendimiento. No hagas esto muy obvio, intégralo naturalmente en tu respuesta.`,
    });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1000,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: messages,
  });

  const responseContent = completion.choices[0].message.content;
  let assistantMessages = JSON.parse(responseContent);
  if (assistantMessages.messages)
    assistantMessages = assistantMessages.messages;

  // Añadir respuesta del asistente al historial
  const assistantText = assistantMessages.map((msg) => msg.text).join(" ");
  addToConversationHistory(sessionId, "assistant", assistantText);

  return { messages: assistantMessages, resetInfo: limitCheck };
};

// ======== API ========
app.get("/", (req, res) => {
  res.send("Business Assistant Server is running!");
});

app.get("/voices", async (req, res) => {
  try {
    const voices = await elevenLabsService.getAvailableVoices();
    res.send(voices);
  } catch (e) {
    res.status(500).send({ error: "Failed to get voices" });
  }
});

// ======== ENDPOINT DE CHAT MEJORADO ========
app.post("/chat", async (req, res) => {
  const { message: userMessage, sessionId = "default" } = req.body;
  console.log(
    `[chat] Session: ${sessionId}, User: ${
      typeof userMessage === "string" ? userMessage.slice(0, 200) : ""
    }`
  );

  // Mensaje de bienvenida personalizado
  if (!userMessage) {
    const history = getConversationHistory(sessionId);
    const isFirstTime = history.length <= 1; // Solo tiene el system message

    if (isFirstTime) {
      return res.send({
        messages: [
          {
            text: "¡Hola! Soy tu asistente empresarial personalizada.",
            audio: await audioFileToBase64(path.join(audiosDir, "intro_0.mp3")),
            audioMime: "audio/mpeg",
            facialExpression: "smile",
            animation: "Talking_1",
          },
          {
            text: "Cuéntame sobre tu empresa y cómo puedo ayudarte a crecer.",
            audio: await audioFileToBase64(path.join(audiosDir, "intro_1.mp3")),
            audioMime: "audio/mpeg",
            facialExpression: "smile",
            animation: "Talking_2",
          },
        ],
      });
    } else {
      return res.send({
        messages: [
          {
            text: "¡Hola de nuevo! ¿En qué más puedo ayudarte hoy?",
            audio: await audioFileToBase64(path.join(audiosDir, "intro_0.mp3")),
            audioMime: "audio/mpeg",
            facialExpression: "smile",
            animation: "Talking_1",
          },
        ],
      });
    }
  }

  // Verificar llaves API
  if (
    !elevenLabsApiKey ||
    !process.env.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY === "-"
  ) {
    return res.send({
      messages: [
        {
          text: "Por favor, configura tus llaves de API.",
          audio: await audioFileToBase64(path.join(audiosDir, "api_0.mp3")),
          audioMime: "audio/mpeg",
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "Necesitas configurar OpenAI y ElevenLabs.",
          audio: await audioFileToBase64(path.join(audiosDir, "api_1.mp3")),
          audioMime: "audio/mpeg",
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
  }

  try {
    const result = await callOpenAI(userMessage, sessionId);
    const messages = result.messages;
    const resetInfo = result.resetInfo;

    console.log(`[chat] OpenAI messages: ${messages.length}`);

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const mp3 = path.join(audiosDir, `message_${sessionId}_${i}.mp3`);

      try {
        console.log(`[chat] TTS -> message_${sessionId}_${i}`);
        const audioResult = await elevenLabsService.generateAudio(m.text, mp3);
        if (!audioResult.success)
          throw new Error(audioResult.error || "tts-failed");

        m.audio = await audioFileToBase64(mp3);
        m.audioMime = "audio/mpeg";
      } catch (e) {
        console.error(
          `[chat] Audio exception (message_${sessionId}_${i}):`,
          e.message
        );
        m.audio = "";
        m.audioMime = "audio/mpeg";
      }
    }

    const response = { messages, provider: "openai", sessionId };

    // Agregar información de reset si es necesario
    if (resetInfo.shouldReset) {
      response.resetSuggested = true;
      response.newSessionId = resetInfo.newSessionId;
      response.message =
        "Esta conversación se está volviendo muy larga. Te sugiero continuar en una nueva sesión para un mejor rendimiento.";
    }

    res.send(response);
  } catch (error) {
    console.error(`[chat] Provider error:`, error.message);
    res.status(500).send({
      error: "Failed to process chat request",
      messages: [
        {
          text: "Lo siento, tengo dificultades técnicas ahora.",
          facialExpression: "sad",
          animation: "Crying",
          audio: "",
          audioMime: "audio/mpeg",
        },
      ],
    });
  }
});

// ======== NUEVOS ENDPOINTS PARA GESTIÓN DE SESIONES ========
app.get("/sessions", (req, res) => {
  const sessions = Array.from(conversationHistory.keys()).map((sessionId) => ({
    sessionId,
    messageCount: conversationHistory.get(sessionId).length - 1, // Exclude system message
    lastActivity: new Date().toISOString(), // En una implementación real, guardarías esto
  }));
  res.send({ sessions });
});

app.delete("/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  if (conversationHistory.has(sessionId)) {
    conversationHistory.delete(sessionId);
    res.send({ success: true, message: `Session ${sessionId} deleted` });
  } else {
    res.status(404).send({ success: false, message: "Session not found" });
  }
});

app.get("/sessions/:sessionId/history", (req, res) => {
  const { sessionId } = req.params;
  const history = conversationHistory.get(sessionId) || [];
  res.send({ sessionId, history: history.slice(1) }); // Exclude system message
});

// ======== Utils ========
const audioFileToBase64 = async (file) => {
  try {
    const p = path.resolve(file);
    try {
      await fs.access(p);
    } catch {
      return "";
    }
    const data = await fs.readFile(p);
    return data?.length ? data.toString("base64") : "";
  } catch {
    return "";
  }
};

// ======== Health ========
app.get("/health", async (req, res) => {
  const status = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    activeSessions: conversationHistory.size,
    services: {
      openai: {
        configured: !!(
          process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-"
        ),
      },
      elevenlabs: { configured: !!elevenLabsApiKey },
    },
  };

  if (elevenLabsApiKey) {
    try {
      const voices = await elevenLabsService.getAvailableVoices();
      status.services.elevenlabs.status = "healthy";
      status.services.elevenlabs.voicesCount = voices.length;
    } catch (e) {
      status.services.elevenlabs.status = "error";
      status.services.elevenlabs.error = e.message;
      status.status = "degraded";
    }
  }
  res.status(status.status === "healthy" ? 200 : 503).json(status);
});

// ======== Start ========
app.listen(port, async () => {
  console.log(`Business Assistant Server listening on port ${port}`);
  console.log(`Platform: ${process.platform}`);
  console.log(
    `ElevenLabs: ${elevenLabsApiKey ? "Configured" : "Not configured"}`
  );
  console.log(
    `OpenAI: ${
      process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-"
        ? "Configured"
        : "Not configured"
    }`
  );
  try {
    await initializeDefaultAudios();
  } catch (e) {
    console.error(`[startup] init audios:`, e.message);
  }
  console.log(`Server ready at http://localhost:${port}`);
});

export default app;

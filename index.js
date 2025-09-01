import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from 'url';
import ElevenLabsService from "./services/ElevenLabsService.js";

dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-",
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = process.env.VOICE_ID || "kgG7dCoKCfLehAPWkJOE";

// Initialize ElevenLabs service
const elevenLabsService = new ElevenLabsService(elevenLabsApiKey, voiceID);

// Get current directory for Windows compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
const port = process.env.PORT || 3000;

// Create audios directory if it doesn't exist
const audiosDir = path.join(__dirname, 'audios');
try {
  await fs.access(audiosDir);
} catch {
  await fs.mkdir(audiosDir, { recursive: true });
  console.log('Created audios directory');
}

// Initialize default audio files
const initializeDefaultAudios = async () => {
  const defaultMessages = [
    { file: "intro_0", text: "Hey dear... How was your day?", emotion: "smile" },
    { file: "intro_1", text: "I missed you so much... Please don't go for so long!", emotion: "sad" },
    { file: "api_0", text: "Please my dear, don't forget to add your API keys!", emotion: "angry" },
    { file: "api_1", text: "You don't want to ruin Wawa Sensei with a crazy ChatGPT and ElevenLabs bill, right?", emotion: "smile" }
  ];

  for (const msg of defaultMessages) {
    const wavPath = path.join(audiosDir, `${msg.file}.wav`);
    const jsonPath = path.join(audiosDir, `${msg.file}.json`);
    
    try {
      await fs.access(wavPath);
      await fs.access(jsonPath);
    } catch {
      console.log(`Creating default audio: ${msg.file}`);
      
      if (elevenLabsApiKey) {
        try {
          const mp3Path = path.join(audiosDir, `${msg.file}.mp3`);
          const audioResult = await elevenLabsService.generateAudio(msg.text, mp3Path);
          
          if (audioResult.success) {
            await execCommand(`ffmpeg -y -i "${mp3Path}" -acodec pcm_s16le -ar 22050 -ac 1 "${wavPath}"`);
            await generateLipSync(msg.file, wavPath, jsonPath);
            console.log(`Created ${msg.file} successfully`);
          } else {
            await createFallbackAudio(msg.file, msg.text);
          }
        } catch (error) {
          console.log(`Could not generate audio for ${msg.file}, creating fallback`);
          await createFallbackAudio(msg.file, msg.text);
        }
      } else {
        await createFallbackAudio(msg.file, msg.text);
      }
    }
  }
};

// Simplified fallback audio creation
const createFallbackAudio = async (fileName, text) => {
  const jsonPath = path.join(audiosDir, `${fileName}.json`);
  
  const fallback = {
    "metadata": {
      "soundFile": `${fileName}.wav`,
      "duration": Math.max(2.0, text.length * 0.08), // Estimate duration based on text length
      "isFallback": true
    },
    "mouthCues": [
      { "start": 0.0, "end": Math.max(2.0, text.length * 0.08), "value": "A" }
    ]
  };
  
  await fs.writeFile(jsonPath, JSON.stringify(fallback, null, 2));
  console.log(`Created fallback lipsync for ${fileName}`);
};

// Simplified lip sync generation
const generateLipSync = async (fileName, wavPath, jsonPath) => {
  const rhubarbPath = process.platform === 'win32' ? 
    path.join(__dirname, 'bin', 'rhubarb.exe') : 
    path.join(__dirname, 'bin', 'rhubarb');
  
  try {
    await execCommand(`"${rhubarbPath}" -f json -o "${jsonPath}" "${wavPath}" -r phonetic`);
  } catch (error) {
    console.log(`Rhubarb failed for ${fileName}, using fallback`);
    throw error;
  }
};

// Windows-compatible command execution
const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const fullCommand = isWindows && !command.includes('cmd') ? `cmd /c ${command}` : command;
    
    exec(fullCommand, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
};

const lipSyncMessage = async (message, messageText = "") => {
  console.log(`Processing lip sync for message ${message}`);
  
  try {
    const inputPath = path.join(audiosDir, `message_${message}.mp3`);
    const outputPath = path.join(audiosDir, `message_${message}.wav`);
    const jsonPath = path.join(audiosDir, `message_${message}.json`);
    
    // Convert MP3 to WAV
    await execCommand(`ffmpeg -y -i "${inputPath}" -acodec pcm_s16le -ar 22050 -ac 1 "${outputPath}"`);
    
    // Generate lip sync
    await generateLipSync(`message_${message}`, outputPath, jsonPath);
    
    console.log(`Lip sync completed for message ${message}`);
    
  } catch (error) {
    console.log(`Lip sync failed for message ${message}, creating fallback`);
    
    // Create fallback lipsync
    const jsonPath = path.join(audiosDir, `message_${message}.json`);
    const fallback = {
      "metadata": {
        "soundFile": `message_${message}.mp3`,
        "duration": Math.max(2.0, messageText.length * 0.08),
        "isFallback": true
      },
      "mouthCues": [
        { "start": 0.0, "end": Math.max(2.0, messageText.length * 0.08), "value": "A" }
      ]
    };
    
    await fs.writeFile(jsonPath, JSON.stringify(fallback, null, 2));
  }
};

// Main routes
app.get("/", (req, res) => {
  res.send("asistente virtual Server is running!");
});

app.get("/voices", async (req, res) => {
  try {
    const voices = await elevenLabsService.getAvailableVoices();
    res.send(voices);
  } catch (error) {
    res.status(500).send({ error: "Failed to get voices" });
  }
});

// OpenAI chat function
const callOpenAI = async (userMessage) => {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
               Eres una asistente empresarial.
        Siempre responderás con un arreglo JSON de mensajes (máximo 3).
        Cada mensaje debe incluir: text, facialExpression y animation.
        El texto debe exponer o explicar datos de la empresa (productos, servicios, indicadores o información general).
        Usa un lenguaje profesional, claro y cercano.
        Las expresiones faciales disponibles son: smile, sad, angry, surprised, funnyFace, default.
        Las animaciones disponibles son: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, Angry.
        Formato de ejemplo de respuesta: {"messages": [{"text": "Nuestra empresa logró un crecimiento del 20% este trimestre.", "facialExpression": "smile", "animation": "Talking_1"}]}
        `,
      },
      {
        role: "user",
        content: userMessage || "hola",
      },
    ],
  });
  
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages;
  }
  return messages;
};

// Main chat endpoint
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  
  console.log(`User message: ${userMessage}`); // Critical log for chat
  
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64(path.join(audiosDir, "intro_0.wav")),
          audioMime: "audio/wav",
          lipsync: await readJsonTranscript(path.join(audiosDir, "intro_0.json")),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64(path.join(audiosDir, "intro_1.wav")),
          audioMime: "audio/wav",
          lipsync: await readJsonTranscript(path.join(audiosDir, "intro_1.json")),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }

  // Check if required APIs are configured
  if (!elevenLabsApiKey || !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "-") {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64(path.join(audiosDir, "api_0.wav")),
          audioMime: "audio/wav",
          lipsync: await readJsonTranscript(path.join(audiosDir, "api_0.json")),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "You need to configure OpenAI and ElevenLabs API keys!",
          audio: await audioFileToBase64(path.join(audiosDir, "api_1.wav")),
          audioMime: "audio/wav",
          lipsync: await readJsonTranscript(path.join(audiosDir, "api_1.json")),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  try {
    // Call OpenAI
    const messages = await callOpenAI(userMessage);
    console.log(`Generated ${messages.length} messages from OpenAI`); // Critical log

    // Process each message
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const fileName = path.join(audiosDir, `message_${i}.mp3`);
      const textInput = message.text;
      
      try {
        console.log(`Generating audio for message ${i}`); // Critical log
        
        const audioResult = await elevenLabsService.generateAudio(textInput, fileName);
        
        if (audioResult.success) {
          try {
            // Generate lipsync
            await lipSyncMessage(i, textInput);
            
            // Convert to base64
            message.audio = await audioFileToBase64(fileName);
            message.lipsync = await readJsonTranscript(path.join(audiosDir, `message_${i}.json`));
            message.audioMime = "audio/mpeg";
            
          } catch (lipSyncError) {
            // Audio exists but lip sync failed - provide audio with fallback lip sync
            message.audio = await audioFileToBase64(fileName);
            message.audioMime = "audio/mpeg";
            message.lipsync = createFallbackLipSync(i, textInput);
          }
        } else {
          console.log(`Audio generation failed for message ${i}, using fallback`); // Critical log
          
          // Create complete fallback
          message.audio = "";
          message.lipsync = createFallbackLipSync(i, textInput);
        }
      } catch (audioError) {
        console.error(`Audio processing error for message ${i}:`, audioError.message); // Critical log
        
        // Complete fallback
        message.audio = "";
        message.lipsync = createFallbackLipSync(i, textInput);
      }
    }

    res.send({ messages, provider: "openai" });
    
  } catch (error) {
    console.error(`Chat processing error:`, error.message); // Critical log
    res.status(500).send({
      error: "Failed to process chat request",
      messages: [{
        text: "Sorry, I'm having technical difficulties right now.",
        facialExpression: "sad",
        animation: "Crying",
        audio: "",
        audioMime: "audio/mpeg",
        lipsync: getDefaultLipsync()
      }]
    });
  }
});

// Utility functions
const createFallbackLipSync = (messageIndex, text) => {
  const duration = Math.max(2.0, text.length * 0.08);
  return {
    "metadata": {
      "soundFile": `message_${messageIndex}.mp3`,
      "duration": duration,
      "isFallback": true
    },
    "mouthCues": [
      { "start": 0.0, "end": duration, "value": "A" }
    ]
  };
};

const getDefaultLipsync = () => {
  return {
    "metadata": {
      "soundFile": "default.mp3",
      "duration": 1.0
    },
    "mouthCues": [
      { "start": 0.0, "end": 1.0, "value": "A" }
    ]
  };
};

const readJsonTranscript = async (file) => {
  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to read transcript ${file}:`, error.message);
    return getDefaultLipsync();
  }
};

const audioFileToBase64 = async (file) => {
  try {
    const normalizedPath = path.resolve(file);
    
    // Check if file exists
    try {
      await fs.access(normalizedPath);
    } catch {
      return "";
    }
    
    const data = await fs.readFile(normalizedPath);
    
    if (!data || data.length === 0) {
      return "";
    }
    
    return data.toString("base64");
    
  } catch (error) {
    console.error(`Failed to read audio file ${file}:`, error.message);
    return "";
  }
};

// Health check endpoint
app.get("/health", async (req, res) => {
  const healthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      openai: {
        configured: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-")
      },
      elevenlabs: {
        configured: !!elevenLabsApiKey
      }
    }
  };

  // Test ElevenLabs if configured
  if (elevenLabsApiKey) {
    try {
      const voices = await elevenLabsService.getAvailableVoices();
      healthStatus.services.elevenlabs.status = "healthy";
      healthStatus.services.elevenlabs.voicesCount = voices.length;
    } catch (error) {
      healthStatus.services.elevenlabs.status = "error";
      healthStatus.services.elevenlabs.error = error.message;
      healthStatus.status = "degraded";
    }
  }

  const httpStatus = healthStatus.status === "healthy" ? 200 : 503;
  res.status(httpStatus).json(healthStatus);
});

app.listen(port, async () => {
  console.log(`Virtual Girlfriend Server listening on port ${port}`); // Critical log
  console.log(`Platform: ${process.platform}`);
  
  // Check API keys
  if (elevenLabsApiKey) {
    console.log("ElevenLabs: Configured");
  } else {
    console.log("ElevenLabs: Not configured");
  }
  
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-") {
    console.log("OpenAI: Configured");
  } else {
    console.log("OpenAI: Not configured");
  }
  
  // Initialize default audio files
  await initializeDefaultAudios();
  
  console.log(`Server ready at http://localhost:${port}`); // Critical log
});

export default app;
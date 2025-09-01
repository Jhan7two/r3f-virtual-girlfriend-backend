import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from 'url';

dotenv.config();

// Configuration for different AI providers
const AI_PROVIDERS = {
  OPENAI: 'openai',
  CLAUDE: 'claude',
  GEMINI: 'gemini',
  COHERE: 'cohere'
};

// Initialize AI clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-",
});

// Claude client (using Anthropic API)
const anthropic = process.env.ANTHROPIC_API_KEY ? {
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com'
} : null;

// Gemini client
const geminiApiKey = process.env.GEMINI_API_KEY;

// Cohere client
const cohereApiKey = process.env.COHERE_API_KEY;

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = process.env.VOICE_ID || "kgG7dCoKCfLehAPWkJOE";

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
          // Generate audio with ElevenLabs
          const mp3Path = path.join(audiosDir, `${msg.file}.mp3`);
          await voice.textToSpeech(elevenLabsApiKey, voiceID, mp3Path, msg.text);
          
          // Convert to WAV
          await execCommand(`ffmpeg -y -i "${mp3Path}" "${wavPath}"`);
          
          // Generate lipsync
          const rhubarbPath = process.platform === 'win32' ? 
            path.join(__dirname, 'bin', 'rhubarb.exe') : 
            path.join(__dirname, 'bin', 'rhubarb');
          
          await execCommand(`"${rhubarbPath}" -f json -o "${jsonPath}" "${wavPath}" -r phonetic`);
          
          console.log(`✓ Created ${msg.file}`);
        } catch (error) {
          console.log(`⚠️ Could not generate audio for ${msg.file}, creating fallback`);
          await createFallbackAudio(msg.file, msg.text);
        }
      } else {
        await createFallbackAudio(msg.file, msg.text);
      }
    }
  }
};

// Create fallback audio files when ElevenLabs is not available
const createFallbackAudio = async (fileName, text) => {
  const jsonPath = path.join(audiosDir, `${fileName}.json`);
  const fallbackLipsync = {
    "metadata": {
      "soundFile": `${fileName}.wav`,
      "duration": 2.0
    },
    "mouthCues": [
      { "start": 0.0, "end": 2.0, "value": "A" }
    ]
  };
  
  await fs.writeFile(jsonPath, JSON.stringify(fallbackLipsync, null, 2));
  
  // Create empty base64 as placeholder (you'll need to add actual audio files later)
  console.log(`📝 Created fallback lipsync for ${fileName}. Add actual audio file later.`);
};

app.get("/", (req, res) => {
  res.send("Virtual Girlfriend Multi-AI Server is running!");
});

app.get("/voices", async (req, res) => {
  try {
    res.send(await voice.getVoices(elevenLabsApiKey));
  } catch (error) {
    res.status(500).send({ error: "Failed to get voices" });
  }
});

app.get("/providers", (req, res) => {
  const availableProviders = {};
  
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-") {
    availableProviders.openai = "OpenAI GPT";
  }
  if (process.env.ANTHROPIC_API_KEY) {
    availableProviders.claude = "Anthropic Claude";
  }
  if (process.env.GEMINI_API_KEY) {
    availableProviders.gemini = "Google Gemini";
  }
  if (process.env.COHERE_API_KEY) {
    availableProviders.cohere = "Cohere";
  }
  
  res.send({ availableProviders });
});

// Windows-compatible command execution
const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    // Use cmd /c on Windows for better compatibility
    const isWindows = process.platform === 'win32';
    const fullCommand = isWindows && !command.includes('cmd') ? `cmd /c ${command}` : command;
    
    exec(fullCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Exec error: ${error}`);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
};

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);
  
  try {
    // Windows-compatible paths
    const inputPath = path.join(audiosDir, `message_${message}.mp3`);
    const outputPath = path.join(audiosDir, `message_${message}.wav`);
    const jsonPath = path.join(audiosDir, `message_${message}.json`);
    
    // Convert MP3 to WAV using FFmpeg
    await execCommand(
      `ffmpeg -y -i "${inputPath}" "${outputPath}"`
    );
    console.log(`Conversion done in ${new Date().getTime() - time}ms`);
    
    // Windows-compatible Rhubarb execution
    const rhubarbPath = process.platform === 'win32' ? 
      path.join(__dirname, 'bin', 'rhubarb.exe') : 
      path.join(__dirname, 'bin', 'rhubarb');
    
    await execCommand(
      `"${rhubarbPath}" -f json -o "${jsonPath}" "${outputPath}" -r phonetic`
    );
    console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
  } catch (error) {
    console.error(`Lip sync error for message ${message}:`, error);
    // Create a default lipsync if it fails
    const defaultLipsync = {
      "metadata": {
        "soundFile": `message_${message}.wav`,
        "duration": 1.0
      },
      "mouthCues": [
        { "start": 0.0, "end": 1.0, "value": "A" }
      ]
    };
    await fs.writeFile(
      path.join(audiosDir, `message_${message}.json`), 
      JSON.stringify(defaultLipsync, null, 2)
    );
  }
};

// AI Provider Functions
const callOpenAI = async (userMessage) => {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini", // Updated to a more current model
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
        You are a virtual girlfriend.
        You will always reply with a JSON array of messages. With a maximum of 3 messages.
        Each message has a text, facialExpression, and animation property.
        The different facial expressions are: smile, sad, angry, surprised, funnyFace, and default.
        The different animations are: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, and Angry.
        Example response format: {"messages": [{"text": "Hello!", "facialExpression": "smile", "animation": "Talking_1"}]}
        `,
      },
      {
        role: "user",
        content: userMessage || "Hello",
      },
    ],
  });
  
  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) {
    messages = messages.messages;
  }
  return messages;
};

const callClaude = async (userMessage) => {
  if (!anthropic) throw new Error("Claude API key not configured");
  
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropic.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      temperature: 0.6,
      messages: [{
        role: 'user',
        content: `You are a virtual girlfriend. Respond with a JSON array of messages (max 3).
        Each message needs: text, facialExpression (smile/sad/angry/surprised/funnyFace/default), animation (Talking_0/Talking_1/Talking_2/Crying/Laughing/Rumba/Idle/Terrified/Angry).
        Format: {"messages": [{"text": "Hello!", "facialExpression": "smile", "animation": "Talking_1"}]}
        
        User message: ${userMessage}`
      }]
    })
  });
  
  const result = await response.json();
  const content = result.content[0].text;
  
  // Parse the JSON from Claude's response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    let messages = JSON.parse(jsonMatch[0]);
    if (messages.messages) {
      messages = messages.messages;
    }
    return messages;
  }
  
  // Fallback if JSON parsing fails
  return [{
    text: "I'm having trouble processing that right now, but I'm here for you!",
    facialExpression: "smile",
    animation: "Talking_1"
  }];
};

const callGemini = async (userMessage) => {
  if (!geminiApiKey) throw new Error("Gemini API key not configured");
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `You are a virtual girlfriend. Respond with a JSON array of messages (max 3).
          Each message needs: text, facialExpression (smile/sad/angry/surprised/funnyFace/default), animation (Talking_0/Talking_1/Talking_2/Crying/Laughing/Rumba/Idle/Terrified/Angry).
          Format: {"messages": [{"text": "Hello!", "facialExpression": "smile", "animation": "Talking_1"}]}
          
          User message: ${userMessage}`
        }]
      }]
    })
  });
  
  const result = await response.json();
  const content = result.candidates[0].content.parts[0].text;
  
  // Parse JSON from Gemini's response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    let messages = JSON.parse(jsonMatch[0]);
    if (messages.messages) {
      messages = messages.messages;
    }
    return messages;
  }
  
  return [{
    text: "I'm here to chat with you!",
    facialExpression: "smile",
    animation: "Talking_1"
  }];
};

const callCohere = async (userMessage) => {
  if (!cohereApiKey) throw new Error("Cohere API key not configured");
  
  const response = await fetch('https://api.cohere.ai/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cohereApiKey}`
    },
    body: JSON.stringify({
      model: 'command',
      prompt: `You are a virtual girlfriend. Respond with a JSON array of messages (max 3).
      Each message needs: text, facialExpression (smile/sad/angry/surprised/funnyFace/default), animation (Talking_0/Talking_1/Talking_2/Crying/Laughing/Rumba/Idle/Terrified/Angry).
      Format: {"messages": [{"text": "Hello!", "facialExpression": "smile", "animation": "Talking_1"}]}
      
      User message: ${userMessage}
      
      Response:`,
      max_tokens: 1000,
      temperature: 0.6
    })
  });
  
  const result = await response.json();
  const content = result.generations[0].text;
  
  // Parse JSON from Cohere's response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    let messages = JSON.parse(jsonMatch[0]);
    if (messages.messages) {
      messages = messages.messages;
    }
    return messages;
  }
  
  return [{
    text: "Let's talk!",
    facialExpression: "smile",
    animation: "Talking_1"
  }];
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  const aiProvider = req.body.provider || 'openai'; // Default to OpenAI
  
  console.log(`Using AI provider: ${aiProvider}`);
  console.log(`User message: ${userMessage}`);
  
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64(path.join(audiosDir, "intro_0.wav")),
          lipsync: await readJsonTranscript(path.join(audiosDir, "intro_0.json")),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64(path.join(audiosDir, "intro_1.wav")),
          lipsync: await readJsonTranscript(path.join(audiosDir, "intro_1.json")),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }

  // Check if required APIs are configured
  const requiredKey = getRequiredApiKey(aiProvider);
  if (!elevenLabsApiKey || !requiredKey) {
    res.send({
      messages: [
        {
          text: "Please my dear, don't forget to add your API keys!",
          audio: await audioFileToBase64(path.join(audiosDir, "api_0.wav")),
          lipsync: await readJsonTranscript(path.join(audiosDir, "api_0.json")),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: `You need to configure ${aiProvider.toUpperCase()} and ElevenLabs API keys!`,
          audio: await audioFileToBase64(path.join(audiosDir, "api_1.wav")),
          lipsync: await readJsonTranscript(path.join(audiosDir, "api_1.json")),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  try {
    // Call the appropriate AI provider
    let messages;
    switch (aiProvider) {
      case AI_PROVIDERS.OPENAI:
        messages = await callOpenAI(userMessage);
        break;
      case AI_PROVIDERS.CLAUDE:
        messages = await callClaude(userMessage);
        break;
      case AI_PROVIDERS.GEMINI:
        messages = await callGemini(userMessage);
        break;
      case AI_PROVIDERS.COHERE:
        messages = await callCohere(userMessage);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${aiProvider}`);
    }

    // Process each message
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      // Generate audio file with Windows-compatible path
      const fileName = path.join(audiosDir, `message_${i}.mp3`);
      const textInput = message.text;
      
      try {
        await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, textInput);
        
        // Generate lipsync
        await lipSyncMessage(i);
        
        message.audio = await audioFileToBase64(fileName);
        message.lipsync = await readJsonTranscript(path.join(audiosDir, `message_${i}.json`));
      } catch (audioError) {
        console.error(`Audio generation failed for message ${i}:`, audioError);
        // Provide fallback audio
        message.audio = "";
        message.lipsync = getDefaultLipsync();
      }
    }

    res.send({ messages, provider: aiProvider });
    
  } catch (error) {
    console.error(`Error with ${aiProvider}:`, error);
    res.status(500).send({
      error: `Failed to process request with ${aiProvider}`,
      messages: [{
        text: "Sorry, I'm having technical difficulties right now.",
        facialExpression: "sad",
        animation: "Crying",
        audio: "",
        lipsync: getDefaultLipsync()
      }]
    });
  }
});

// Helper function to get required API key for provider
function getRequiredApiKey(provider) {
  switch (provider) {
    case AI_PROVIDERS.OPENAI:
      return process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-";
    case AI_PROVIDERS.CLAUDE:
      return process.env.ANTHROPIC_API_KEY;
    case AI_PROVIDERS.GEMINI:
      return process.env.GEMINI_API_KEY;
    case AI_PROVIDERS.COHERE:
      return process.env.COHERE_API_KEY;
    default:
      return false;
  }
}

// Default lipsync fallback
function getDefaultLipsync() {
  return {
    "metadata": {
      "soundFile": "default.wav",
      "duration": 1.0
    },
    "mouthCues": [
      { "start": 0.0, "end": 1.0, "value": "A" }
    ]
  };
}

const readJsonTranscript = async (file) => {
  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to read transcript ${file}:`, error);
    return getDefaultLipsync();
  }
};

const audioFileToBase64 = async (file) => {
  try {
    const data = await fs.readFile(file);
    return data.toString("base64");
  } catch (error) {
    console.error(`Failed to read audio file ${file}:`, error);
    return "";
  }
};

// Health check endpoint
app.get("/health", (req, res) => {
  res.send({
    status: "ok",
    platform: process.platform,
    ffmpeg: "Check manually",
    rhubarb: "Check manually",
    apis: {
      openai: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-"),
      claude: !!process.env.ANTHROPIC_API_KEY,
      gemini: !!process.env.GEMINI_API_KEY,
      cohere: !!process.env.COHERE_API_KEY,
      elevenlabs: !!elevenLabsApiKey
    }
  });
});

app.listen(port, async () => {
  console.log(`Virtual Girlfriend Multi-AI Server listening on port ${port}`);
  console.log(`Platform: ${process.platform}`);
  
  // Initialize default audio files
  await initializeDefaultAudios();
  
  console.log(`Available AI providers:`);
  
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-") {
    console.log("✓ OpenAI");
  }
  if (process.env.ANTHROPIC_API_KEY) {
    console.log("✓ Claude");
  }
  if (process.env.GEMINI_API_KEY) {
    console.log("✓ Gemini");
  }
  if (process.env.COHERE_API_KEY) {
    console.log("✓ Cohere");
  }
  if (elevenLabsApiKey) {
    console.log("✓ ElevenLabs");
  }
});

export default app;
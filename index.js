import { exec } from "child_process";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from 'url';
import ElevenLabsService from "./services/ElevenLabsService.js";
import AudioErrorHandler from "./utils/AudioErrorHandler.js";

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

// Initialize ElevenLabs service and error handler
const elevenLabsService = new ElevenLabsService(elevenLabsApiKey, voiceID);
let audioErrorHandler;

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

// Initialize audio error handler
audioErrorHandler = new AudioErrorHandler(audiosDir);

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
          // Generate audio with ElevenLabs using the service
          const mp3Path = path.join(audiosDir, `${msg.file}.mp3`);
          const audioResult = await elevenLabsService.generateAudio(msg.text, mp3Path);
          
          if (audioResult.success) {
            try {
              // Enhanced WAV conversion with better error handling
              const ffmpegValidation = await audioErrorHandler.validateFFmpegAvailability();
              if (!ffmpegValidation.isAvailable) {
                throw new Error(`FFmpeg not available for initialization: ${ffmpegValidation.error}`);
              }
              
              // Convert to WAV with enhanced format specification
              await execCommand(`ffmpeg -y -i "${mp3Path}" -acodec pcm_s16le -ar 22050 -ac 1 "${wavPath}"`);
              
              // Validate WAV file was created successfully
              const wavValidation = await audioErrorHandler.validateAudioFile(wavPath);
              if (!wavValidation.exists || !wavValidation.readable || wavValidation.size === 0) {
                throw new Error(`WAV file validation failed for ${msg.file}: ${wavPath}`);
              }
              
              // Enhanced Rhubarb lip sync generation
              const rhubarbPath = process.platform === 'win32' ? 
                path.join(__dirname, 'bin', 'rhubarb.exe') : 
                path.join(__dirname, 'bin', 'rhubarb');
              
              const rhubarbValidation = await audioErrorHandler.validateRhubarbAvailability(rhubarbPath);
              if (!rhubarbValidation.isAvailable) {
                throw new Error(`Rhubarb not available for initialization: ${rhubarbValidation.error}`);
              }
              
              await execCommand(`"${rhubarbPath}" -f json -o "${jsonPath}" "${wavPath}" -r phonetic`);
              
              // Validate and normalize the generated JSON
              const jsonValidation = await audioErrorHandler.validateAudioFile(jsonPath);
              if (jsonValidation.exists && jsonValidation.readable && jsonValidation.size > 0) {
                try {
                  const jsonContent = await fs.readFile(jsonPath, 'utf8');
                  const lipsyncData = JSON.parse(jsonContent);
                  const normalizedLipsync = audioErrorHandler.normalizeLipsyncMetadata(lipsyncData);
                  await fs.writeFile(jsonPath, JSON.stringify(normalizedLipsync, null, 2));
                } catch (jsonError) {
                  console.warn(`Could not normalize lip sync JSON for ${msg.file}: ${jsonError.message}`);
                }
              }
              
              console.log(`✓ Created ${msg.file} with enhanced processing`);
            } catch (processingError) {
              console.warn(`Enhanced processing failed for ${msg.file}, creating fallback: ${processingError.message}`);
              await createFallbackAudio(msg.file, msg.text);
            }
          } else {
            console.log(`⚠️ Could not generate audio for ${msg.file}: ${audioResult.error}`);
            await createFallbackAudio(msg.file, msg.text);
          }
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

// Create enhanced fallback audio files when ElevenLabs is not available
const createFallbackAudio = async (fileName, text) => {
  const jsonPath = path.join(audiosDir, `${fileName}.json`);
  
  try {
    // Use enhanced fallback creation with better duration estimation
    const enhancedFallback = await audioErrorHandler.createEnhancedFallbackLipSync(
      fileName, 
      text, 
      null // No MP3 file available for initialization fallbacks
    );
    
    // Ensure consistent file naming for initialization files
    enhancedFallback.metadata.soundFile = `${fileName}.wav`;
    
    await fs.writeFile(jsonPath, JSON.stringify(enhancedFallback, null, 2));
    
    console.log(`📝 Created enhanced fallback lipsync for ${fileName}:`);
    console.log(`   Duration: ${enhancedFallback.metadata.duration}s (${enhancedFallback.metadata.durationSource})`);
    console.log(`   Mouth cues: ${enhancedFallback.mouthCues.length}`);
    console.log(`   Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
  } catch (fallbackError) {
    console.warn(`Enhanced fallback creation failed for ${fileName}, using basic fallback: ${fallbackError.message}`);
    
    // Basic fallback as last resort
    const basicFallback = {
      "metadata": {
        "soundFile": `${fileName}.wav`,
        "duration": 2.0,
        "isFallback": true,
        "fallbackType": "basic"
      },
      "mouthCues": [
        { "start": 0.0, "end": 2.0, "value": "A" }
      ]
    };
    
    await fs.writeFile(jsonPath, JSON.stringify(basicFallback, null, 2));
    console.log(`📝 Created basic fallback lipsync for ${fileName}`);
  }
};

app.get("/", (req, res) => {
  res.send("Virtual Girlfriend Multi-AI Server is running!");
});



app.get("/voices", async (req, res) => {
  try {
    const voices = await elevenLabsService.getAvailableVoices();
    res.send(voices);
  } catch (error) {
    const errorResponse = elevenLabsService.handleElevenLabsError(error, "get voices");
    res.status(500).send({
      error: errorResponse.error,
      errorCode: errorResponse.errorCode
    });
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

// ElevenLabs validation endpoint
app.get("/elevenlabs/validate", async (req, res) => {
  try {
    const validation = await elevenLabsService.performFullValidation();
    res.send(validation);
  } catch (error) {
    const errorResponse = elevenLabsService.handleElevenLabsError(error, "validation");
    res.status(500).send(errorResponse);
  }
});

// Voice ID validation endpoint with enhanced suggestions
app.get("/elevenlabs/validate-voice/:voiceId?", async (req, res) => {
  try {
    const voiceId = req.params.voiceId || elevenLabsService.voiceId;
    
    if (!voiceId) {
      // If no voice ID provided, return available voices with suggestions
      try {
        const voices = await elevenLabsService.getAvailableVoices();
        return res.status(400).json({
          error: "No voice ID provided and none configured",
          configured: false,
          suggestions: {
            message: "Set a VOICE_ID environment variable to one of these available voices:",
            voices: voices.slice(0, 10).map(voice => ({
              voice_id: voice.voice_id,
              name: voice.name,
              category: voice.category || "Unknown",
              recommended: voices.indexOf(voice) === 0 // Mark first as recommended
            })),
            quickSetup: voices.length > 0 ? {
              envVar: `VOICE_ID=${voices[0].voice_id}`,
              description: `Recommended: ${voices[0].name}`
            } : null
          }
        });
      } catch (voicesError) {
        return res.status(400).json({
          error: "No voice ID provided and none configured",
          configured: false,
          voicesError: "Could not fetch available voices to provide suggestions"
        });
      }
    }

    // Test the specific voice ID
    const validation = await elevenLabsService.testVoiceId(voiceId);
    
    if (validation.isValid) {
      res.json({
        voiceId,
        configured: true,
        valid: true,
        status: "Voice ID is valid and working",
        ...validation
      });
    } else {
      // Voice ID is invalid, provide suggestions
      try {
        const voices = await elevenLabsService.getAvailableVoices();
        res.status(400).json({
          voiceId,
          configured: true,
          valid: false,
          error: validation.error,
          suggestions: {
            message: "The configured voice ID is invalid. Try one of these available voices:",
            voices: voices.slice(0, 10).map(voice => ({
              voice_id: voice.voice_id,
              name: voice.name,
              category: voice.category || "Unknown"
            })),
            quickFix: voices.length > 0 ? {
              envVar: `VOICE_ID=${voices[0].voice_id}`,
              description: `Replace with: ${voices[0].name}`
            } : null
          }
        });
      } catch (voicesError) {
        res.status(400).json({
          voiceId,
          configured: true,
          valid: false,
          error: validation.error,
          voicesError: "Could not fetch available voices to provide suggestions"
        });
      }
    }
  } catch (error) {
    const errorResponse = elevenLabsService.handleElevenLabsError(error, "voice validation");
    res.status(500).send(errorResponse);
  }
});

// Enhanced voice configuration helper endpoint
app.get("/elevenlabs/voice-suggestions", async (req, res) => {
  try {
    if (!elevenLabsApiKey) {
      return res.status(400).json({
        error: "ElevenLabs API key not configured",
        setup: {
          message: "Configure your ElevenLabs API key first",
          steps: [
            "Get an API key from https://elevenlabs.io",
            "Add ELEVEN_LABS_API_KEY=your_key_here to your .env file",
            "Restart the server"
          ]
        }
      });
    }

    const voices = await elevenLabsService.getAvailableVoices();
    
    if (voices.length === 0) {
      return res.json({
        message: "No voices available in your ElevenLabs account",
        suggestions: [
          "Check your ElevenLabs account has voices",
          "Verify your API key has proper permissions",
          "Try creating or cloning a voice in your ElevenLabs dashboard"
        ]
      });
    }

    // Categorize voices for better suggestions
    const categorizedVoices = Array.isArray(voices) ? voices.reduce((acc, voice) => {
      const category = voice.category || "Other";
      if (!acc[category]) acc[category] = [];
      acc[category].push({
        voice_id: voice.voice_id,
        name: voice.name,
        description: voice.description || "No description available"
      });
      return acc;
    }, {}) : {};

    const voicesArray = Array.isArray(voices) ? voices : [];
    
    res.json({
      total: voicesArray.length,
      currentlyConfigured: voiceID || "None",
      currentlyValid: voiceID ? await elevenLabsService.testVoiceId(voiceID).then(r => r.isValid) : false,
      recommended: voicesArray.slice(0, 3).map(voice => ({
        voice_id: voice.voice_id,
        name: voice.name,
        category: voice.category || "Unknown",
        setupCommand: `VOICE_ID=${voice.voice_id}`
      })),
      allVoices: categorizedVoices,
      quickSetup: voicesArray.length > 0 ? {
        message: "To configure a voice, add this to your .env file:",
        example: `VOICE_ID=${voicesArray[0].voice_id}  # ${voicesArray[0].name}`,
        restartRequired: true
      } : {
        message: "No voices available to configure",
        note: "Check your ElevenLabs account and API key"
      }
    });
  } catch (error) {
    const errorResponse = elevenLabsService.handleElevenLabsError(error, "voice suggestions");
    res.status(500).send(errorResponse);
  }
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

const lipSyncMessage = async (message, messageText = "") => {
  const time = new Date().getTime();
  console.log(`Starting enhanced lip sync conversion for message ${message}`);
  
  try {
    // Windows-compatible paths
    const inputPath = path.join(audiosDir, `message_${message}.mp3`);
    const outputPath = path.join(audiosDir, `message_${message}.wav`);
    const jsonPath = path.join(audiosDir, `message_${message}.json`);
    
    // Validate that the input MP3 file is properly generated and ready for processing
    const mp3Validation = await validateMp3FileForProcessing(inputPath);
    if (!mp3Validation.isValid) {
      throw new Error(`MP3 file validation failed: ${mp3Validation.error}`);
    }
    
    console.log(`Input MP3 validated (${mp3Validation.validation.size} bytes), starting enhanced FFmpeg conversion...`);
    
    // Enhanced FFmpeg conversion with comprehensive error handling
    let wavConversionSuccess = false;
    try {
      // First, validate FFmpeg availability
      const ffmpegValidation = await audioErrorHandler.validateFFmpegAvailability();
      if (!ffmpegValidation.isAvailable) {
        throw new Error(`FFmpeg not available: ${ffmpegValidation.error}`);
      }
      
      console.log(`FFmpeg validated (version: ${ffmpegValidation.version}), starting conversion...`);
      
      // Enhanced FFmpeg command with better error handling and format specification
      const ffmpegCommand = `ffmpeg -y -i "${inputPath}" -acodec pcm_s16le -ar 22050 -ac 1 "${outputPath}"`;
      
      await execCommand(ffmpegCommand);
      console.log(`FFmpeg conversion completed in ${new Date().getTime() - time}ms`);
      
      // Comprehensive WAV file validation
      const outputValidation = await audioErrorHandler.validateAudioFile(outputPath);
      if (!outputValidation.exists) {
        throw new Error(`WAV file was not created by FFmpeg: ${outputPath}`);
      }
      
      if (!outputValidation.readable) {
        throw new Error(`WAV file created but is not readable: ${outputPath}`);
      }
      
      if (outputValidation.size === 0) {
        throw new Error(`WAV file created but is empty: ${outputPath}`);
      }
      
      // Additional validation for minimum WAV file size (WAV header is ~44 bytes minimum)
      if (outputValidation.size < 100) {
        throw new Error(`WAV file appears corrupted or incomplete: ${outputPath} (${outputValidation.size} bytes)`);
      }
      
      console.log(`WAV file validated successfully (${outputValidation.size} bytes), proceeding to lip sync...`);
      wavConversionSuccess = true;
      
    } catch (ffmpegError) {
      console.error(`Enhanced FFmpeg conversion failed for message ${message}:`, ffmpegError.message);
      
      // Detailed FFmpeg error analysis
      const errorAnalysis = audioErrorHandler.handleFFmpegError(ffmpegError, inputPath, outputPath);
      
      // Log comprehensive error information
      audioErrorHandler.logAudioError(ffmpegError, {
        messageIndex: message,
        text: messageText,
        operation: "ffmpeg_mp3_to_wav_conversion",
        inputFile: inputPath,
        outputFile: outputPath,
        errorAnalysis,
        mp3Validation: mp3Validation.validation
      });
      
      throw new Error(`Enhanced FFmpeg conversion failed: ${ffmpegError.message}`);
    }
    
    // Enhanced Rhubarb lip sync generation with comprehensive validation
    if (wavConversionSuccess) {
      const rhubarbPath = process.platform === 'win32' ? 
        path.join(__dirname, 'bin', 'rhubarb.exe') : 
        path.join(__dirname, 'bin', 'rhubarb');
      
      try {
        // Validate Rhubarb availability before attempting lip sync
        const rhubarbValidation = await audioErrorHandler.validateRhubarbAvailability(rhubarbPath);
        if (!rhubarbValidation.isAvailable) {
          throw new Error(`Rhubarb not available: ${rhubarbValidation.error}`);
        }
        
        console.log(`Rhubarb validated (version: ${rhubarbValidation.version}), starting lip sync generation...`);
        
        // Double-check WAV file exists and is ready before Rhubarb processing
        const preRhubarbValidation = await audioErrorHandler.validateAudioFile(outputPath);
        if (!preRhubarbValidation.exists || !preRhubarbValidation.readable || preRhubarbValidation.size === 0) {
          throw new Error(`WAV file not ready for Rhubarb processing: ${outputPath}`);
        }
        
        // Enhanced Rhubarb command with better error handling
        const rhubarbCommand = `"${rhubarbPath}" -f json -o "${jsonPath}" "${outputPath}" -r phonetic`;
        
        await execCommand(rhubarbCommand);
        console.log(`Rhubarb lip sync completed in ${new Date().getTime() - time}ms`);
        
        // Comprehensive JSON output validation
        const jsonValidation = await audioErrorHandler.validateAudioFile(jsonPath);
        if (!jsonValidation.exists) {
          throw new Error(`Lip sync JSON file was not created by Rhubarb: ${jsonPath}`);
        }
        
        if (!jsonValidation.readable) {
          throw new Error(`Lip sync JSON file created but is not readable: ${jsonPath}`);
        }
        
        if (jsonValidation.size === 0) {
          throw new Error(`Lip sync JSON file created but is empty: ${jsonPath}`);
        }
        
        // Validate JSON content structure
        try {
          const jsonContent = await fs.readFile(jsonPath, 'utf8');
          const lipsyncData = JSON.parse(jsonContent);
          
          if (!lipsyncData.metadata || !lipsyncData.mouthCues) {
            throw new Error(`Invalid lip sync JSON structure: missing metadata or mouthCues`);
          }
          
          // Normalize the lipsync metadata to ensure .mp3 extension consistency
          const normalizedLipsync = audioErrorHandler.normalizeLipsyncMetadata(lipsyncData);
          
          // Write back the normalized version
          await fs.writeFile(jsonPath, JSON.stringify(normalizedLipsync, null, 2));
          
          console.log(`✓ Enhanced lip sync processing successful for message ${message} (${lipsyncData.mouthCues.length} mouth cues)`);
          
        } catch (jsonParseError) {
          throw new Error(`Invalid JSON content in lip sync file: ${jsonParseError.message}`);
        }
        
      } catch (rhubarbError) {
        console.error(`Enhanced Rhubarb lip sync failed for message ${message}:`, rhubarbError.message);
        
        // Detailed Rhubarb error analysis
        const errorAnalysis = audioErrorHandler.handleRhubarbError(rhubarbError, outputPath, jsonPath);
        
        // Log comprehensive error information
        audioErrorHandler.logAudioError(rhubarbError, {
          messageIndex: message,
          text: messageText,
          operation: "rhubarb_lip_sync_generation",
          inputFile: outputPath,
          outputFile: jsonPath,
          errorAnalysis,
          wavFileExists: wavConversionSuccess
        });
        
        throw new Error(`Enhanced Rhubarb lip sync failed: ${rhubarbError.message}`);
      }
    }
    
  } catch (error) {
    console.error(`Enhanced lip sync processing failed for message ${message}:`, error.message);
    
    // Create enhanced fallback lipsync with better duration estimation
    try {
      const inputPath = path.join(audiosDir, `message_${message}.mp3`);
      const enhancedFallback = await audioErrorHandler.createEnhancedFallbackLipSync(
        message, 
        messageText, 
        inputPath
      );
      
      const jsonPath = path.join(audiosDir, `message_${message}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(enhancedFallback, null, 2));
      
      console.log(`Created enhanced fallback lip sync for message ${message}:`);
      console.log(`  Duration: ${enhancedFallback.metadata.duration}s (${enhancedFallback.metadata.durationSource})`);
      console.log(`  Mouth cues: ${enhancedFallback.mouthCues.length}`);
      console.log(`  Text length: ${enhancedFallback.metadata.textLength} characters`);
      
    } catch (fallbackError) {
      console.error(`Failed to create enhanced fallback lip sync: ${fallbackError.message}`);
      
      // Create basic fallback as last resort
      const basicFallback = {
        "metadata": {
          "soundFile": `message_${message}.mp3`,
          "duration": 2.0,
          "isFallback": true,
          "fallbackType": "basic"
        },
        "mouthCues": [
          { "start": 0.0, "end": 2.0, "value": "A" }
        ]
      };
      
      const jsonPath = path.join(audiosDir, `message_${message}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(basicFallback, null, 2));
      console.log(`Created basic fallback lip sync for message ${message}`);
    }
    
    // Re-throw the error so the caller knows lip sync failed
    throw error;
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
  const requiredKey = getRequiredApiKey(aiProvider);
  if (!elevenLabsApiKey || !requiredKey) {
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
          text: `You need to configure ${aiProvider.toUpperCase()} and ElevenLabs API keys!`,
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
        console.log(`Generating audio for message ${i}: "${textInput.substring(0, 50)}..."`);
        
        const audioResult = await elevenLabsService.generateAudio(textInput, fileName);
        
        if (audioResult.success) {
          console.log(`✓ Audio generated successfully for message ${i}`);
          
          // Ensure the MP3 file is completely written and ready for processing
          const fileReadiness = await ensureFileReady(fileName, "MP3 audio processing");
          
          if (!fileReadiness.success) {
            console.warn(`MP3 file not ready for message ${i}: ${fileReadiness.error}`);
            
            audioErrorHandler.logAudioError(new Error(fileReadiness.error), {
              messageIndex: i,
              text: textInput,
              voiceId: voiceID,
              operation: "mp3_file_readiness_check",
              fileName: fileName
            });
            
            const fallback = await audioErrorHandler.createFallbackAudio(i, textInput);
            message.audio = fallback.audio;
            message.lipsync = fallback.lipsync;
            continue;
          }
          
          console.log(`✓ MP3 file ready for processing: ${fileName} (${fileReadiness.fileSize} bytes)`);
          
          // Validate that the MP3 file was properly generated and is ready for processing
          const mp3Validation = await validateMp3FileForProcessing(fileName);
          
          if (mp3Validation.isValid) {
            console.log(`✓ MP3 file validated for message ${i} (${mp3Validation.validation.size} bytes)`);
            
            try {
              // Generate lipsync
              await lipSyncMessage(i, textInput);
              
              // Convert MP3 to base64 with comprehensive validation
              const preConversionValidation = await validateAudioFileForProcessing(fileName, 'mp3');
              if (!preConversionValidation.isValid) {
                throw new Error(`MP3 file validation failed before base64 conversion: ${preConversionValidation.error}`);
              }
              
              const audioBase64 = await audioFileToBase64(fileName);
              if (!audioBase64) {
                throw new Error("MP3 to base64 conversion failed - empty result");
              }
              
              message.audio = audioBase64;
              message.lipsync = await readJsonTranscript(path.join(audiosDir, `message_${i}.json`));
              
              // Add audio metadata for frontend
              message.audioMime = "audio/mpeg";
              
              console.log(`✓ Complete audio processing successful for message ${i}`);
            } catch (lipSyncError) {
              console.warn(`Lip sync generation failed for message ${i}, using fallback`);
              
              // Audio exists but lip sync failed - provide audio with fallback lip sync
              const preConversionValidation = await validateAudioFileForProcessing(fileName, 'mp3');
              if (preConversionValidation.isValid) {
                const audioBase64 = await audioFileToBase64(fileName);
                if (audioBase64) {
                  message.audio = audioBase64;
                  message.audioMime = "audio/mpeg";
                  message.lipsync = audioErrorHandler.createFallbackLipSync(i, textInput);
                } else {
                  // Base64 conversion failed despite validation, use complete fallback
                  const fallback = await audioErrorHandler.createFallbackAudio(i, textInput);
                  message.audio = fallback.audio;
                  message.lipsync = fallback.lipsync;
                }
              } else {
                // MP3 file validation failed, use complete fallback
                console.warn(`MP3 file validation failed for fallback audio: ${preConversionValidation.error}`);
                const fallback = await audioErrorHandler.createFallbackAudio(i, textInput);
                message.audio = fallback.audio;
                message.lipsync = fallback.lipsync;
              }
              
              audioErrorHandler.logAudioError(lipSyncError, {
                messageIndex: i,
                text: textInput,
                voiceId: voiceID,
                operation: "lip_sync_generation",
                audioFileExists: true,
                audioFileSize: mp3Validation.validation.size
              });
            }
          } else {
            // Audio generation reported success but file validation failed
            console.warn(`MP3 file validation failed for message ${i}: ${mp3Validation.error}`);
            
            // Wait a bit longer and try validation again in case of timing issues
            await new Promise(resolve => setTimeout(resolve, 500));
            const retryValidation = await validateMp3FileForProcessing(fileName);
            
            if (retryValidation.isValid) {
              console.log(`✓ MP3 file validation succeeded on retry for message ${i}`);
              
              try {
                // Validate file before attempting conversion on retry
                const retryValidation = await validateAudioFileForProcessing(fileName, 'mp3');
                if (!retryValidation.isValid) {
                  throw new Error(`MP3 file validation failed on retry: ${retryValidation.error}`);
                }
                
                const audioBase64 = await audioFileToBase64(fileName);
                if (audioBase64) {
                  message.audio = audioBase64;
                  message.audioMime = "audio/mpeg";
                  
                  // Try lip sync generation
                  try {
                    await lipSyncMessage(i, textInput);
                    message.lipsync = await readJsonTranscript(path.join(audiosDir, `message_${i}.json`));
                  } catch (lipSyncError) {
                    message.lipsync = audioErrorHandler.createFallbackLipSync(i, textInput);
                  }
                  
                  console.log(`✓ Audio processing recovered for message ${i}`);
                } else {
                  throw new Error("Base64 conversion failed on retry");
                }
              } catch (retryError) {
                console.warn(`Audio processing retry failed for message ${i}: ${retryError.message}`);
                const fallback = await audioErrorHandler.createFallbackAudio(i, textInput);
                message.audio = fallback.audio;
                message.lipsync = fallback.lipsync;
              }
            } else {
              // File validation failed even after retry
              audioErrorHandler.logAudioError(new Error(mp3Validation.error || "MP3 file validation failed"), {
                messageIndex: i,
                text: textInput,
                voiceId: voiceID,
                operation: "mp3_file_validation",
                fileValidation: mp3Validation.validation,
                validationError: mp3Validation.error,
                retryValidation: retryValidation.validation,
                retryError: retryValidation.error
              });
              
              const fallback = await audioErrorHandler.createFallbackAudio(i, textInput);
              message.audio = fallback.audio;
              message.lipsync = fallback.lipsync;
            }
          }
        } else {
          // Handle specific ElevenLabs API errors gracefully
          console.warn(`Audio generation failed for message ${i}: ${audioResult.error}`);
          
          // Check if this is a 404 error (invalid voice ID or API endpoint)
          if (audioResult.errorCode === "INVALID_VOICE_ID") {
            console.error(`❌ Voice ID validation failed. Current voice ID: ${voiceID}`);
            
            // Try to get available voices for suggestions
            try {
              const voices = await elevenLabsService.getAvailableVoices();
              if (voices.length > 0) {
                console.log("Available voices:");
                voices.slice(0, 3).forEach(voice => {
                  console.log(`  - ${voice.name} (${voice.voice_id})`);
                });
              }
            } catch (voiceError) {
              console.error("Could not fetch available voices:", voiceError.message);
            }
          } else if (audioResult.errorCode === "INVALID_API_KEY") {
            console.error(`❌ ElevenLabs API key validation failed. Please check your ELEVEN_LABS_API_KEY environment variable.`);
          } else if (audioResult.errorCode === "RATE_LIMITED") {
            console.warn(`⚠️ ElevenLabs API rate limit exceeded. Consider implementing retry logic.`);
          }
          
          // Log detailed error information
          audioErrorHandler.logAudioError(audioResult, {
            messageIndex: i,
            text: textInput,
            voiceId: voiceID,
            operation: "audio_generation",
            apiResponse: audioResult
          });
          
          const fallback = await audioErrorHandler.createFallbackAudio(i, textInput);
          message.audio = fallback.audio;
          message.lipsync = fallback.lipsync;
        }
      } catch (audioError) {
        console.error(`Unexpected error during audio processing for message ${i}:`, audioError);
        
        // Handle unexpected errors (network issues, file system errors, etc.)
        audioErrorHandler.logAudioError(audioError, {
          messageIndex: i,
          text: textInput,
          voiceId: voiceID,
          operation: "audio_generation_exception",
          errorType: audioError.constructor.name,
          stack: audioError.stack
        });
        
        const fallback = await audioErrorHandler.createFallbackAudio(i, textInput);
        message.audio = fallback.audio;
        message.lipsync = fallback.lipsync;
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
        audioMime: "audio/mpeg",
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
      "soundFile": "default.mp3", // Use .mp3 extension for consistency
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
    const lipsyncData = JSON.parse(data);
    
    // Normalize the lipsync metadata to ensure .mp3 extension consistency
    return audioErrorHandler.normalizeLipsyncMetadata(lipsyncData);
  } catch (error) {
    console.error(`Failed to read transcript ${file}:`, error);
    audioErrorHandler.logAudioError(error, {
      operation: "read_lipsync_transcript",
      filePath: file,
      errorType: error.code || "unknown"
    });
    return getDefaultLipsync();
  }
};

/**
 * Validates that an MP3 file is properly generated and ready for processing
 * @param {string} filePath - Path to the MP3 file
 * @returns {Promise<{isValid: boolean, validation: object, error?: string}>}
 */
/**
 * Safely waits for a file to be completely written and ready for processing
 * @param {string} filePath - Path to the file
 * @param {number} maxWaitMs - Maximum time to wait in milliseconds
 * @param {number} checkIntervalMs - Interval between checks in milliseconds
 * @returns {Promise<boolean>} True if file is ready, false if timeout
 */
const waitForFileReady = async (filePath, maxWaitMs = 5000, checkIntervalMs = 100) => {
  const startTime = Date.now();
  let lastSize = 0;
  let stableCount = 0;
  const normalizedPath = path.resolve(filePath);
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const stats = await fs.stat(normalizedPath);
      
      if (stats.size > 0) {
        if (stats.size === lastSize) {
          stableCount++;
          // File size hasn't changed for 3 consecutive checks, likely ready
          if (stableCount >= 3) {
            return true;
          }
        } else {
          stableCount = 0;
          lastSize = stats.size;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    } catch (error) {
      // File doesn't exist yet, continue waiting
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
  }
  
  return false;
};

/**
 * Comprehensive audio file validation before processing
 * @param {string} filePath - Path to the audio file
 * @param {string} expectedFormat - Expected file format (mp3, wav, etc.)
 * @returns {Promise<{isValid: boolean, details: object, error?: string}>}
 */
const validateAudioFileForProcessing = async (filePath, expectedFormat = null) => {
  try {
    const normalizedPath = path.resolve(filePath);
    const fileExtension = path.extname(normalizedPath).toLowerCase().substring(1);
    
    // Basic file validation
    const basicValidation = await audioErrorHandler.validateAudioFile(normalizedPath);
    
    if (!basicValidation.exists || !basicValidation.readable || basicValidation.size === 0) {
      return {
        isValid: false,
        details: {
          ...basicValidation,
          fileExtension,
          expectedFormat
        },
        error: `Audio file failed basic validation: ${normalizedPath}`
      };
    }
    
    // Format-specific validation
    let formatValidation = { isValid: true };
    
    if (fileExtension === 'mp3' || expectedFormat === 'mp3') {
      formatValidation = await validateMp3FileForProcessing(normalizedPath);
    }
    
    // Check if format matches expectation
    if (expectedFormat && fileExtension !== expectedFormat) {
      return {
        isValid: false,
        details: {
          ...basicValidation,
          fileExtension,
          expectedFormat,
          formatMismatch: true
        },
        error: `File format mismatch: expected ${expectedFormat}, got ${fileExtension}`
      };
    }
    
    return {
      isValid: formatValidation.isValid,
      details: {
        ...basicValidation,
        fileExtension,
        expectedFormat,
        formatValidation: formatValidation.validation || {},
        path: normalizedPath
      },
      error: formatValidation.error
    };
    
  } catch (error) {
    return {
      isValid: false,
      details: {
        error: error.message,
        path: filePath
      },
      error: `Failed to validate audio file: ${error.message}`
    };
  }
};

/**
 * Ensures a file exists and is ready for processing with retry logic
 * @param {string} filePath - Path to the file
 * @param {string} operation - Description of the operation for logging
 * @returns {Promise<{success: boolean, error?: string, fileSize?: number}>}
 */
const ensureFileReady = async (filePath, operation = "file processing") => {
  try {
    // Normalize file path
    const normalizedPath = path.resolve(filePath);
    
    // First check if file exists
    const validation = await audioErrorHandler.validateAudioFile(normalizedPath);
    
    if (!validation.exists) {
      console.log(`File does not exist yet, waiting for creation: ${normalizedPath}`);
      
      // Wait for file to be created
      const fileReady = await waitForFileReady(normalizedPath);
      
      if (!fileReady) {
        return {
          success: false,
          error: `File was not created within timeout period: ${normalizedPath}`,
          operation,
          timeout: true
        };
      }
      
      // Re-validate after waiting
      const revalidation = await audioErrorHandler.validateAudioFile(normalizedPath);
      if (!revalidation.exists || !revalidation.readable) {
        return {
          success: false,
          error: `File exists but is not readable after waiting: ${normalizedPath}`,
          operation,
          validation: revalidation
        };
      }
      
      console.log(`✓ File created and ready: ${normalizedPath} (${revalidation.size} bytes)`);
      return {
        success: true,
        fileSize: revalidation.size,
        operation,
        waitedForCreation: true
      };
    }
    
    if (!validation.readable) {
      return {
        success: false,
        error: `File exists but is not readable: ${normalizedPath}`,
        operation,
        validation
      };
    }
    
    if (validation.size === 0) {
      console.log(`File exists but is empty, waiting for content: ${normalizedPath}`);
      
      // File exists but is empty, wait for it to be written
      const fileReady = await waitForFileReady(normalizedPath);
      
      if (!fileReady) {
        return {
          success: false,
          error: `File remains empty after timeout: ${normalizedPath}`,
          operation,
          timeout: true,
          initialSize: validation.size
        };
      }
      
      const revalidation = await audioErrorHandler.validateAudioFile(normalizedPath);
      const isReady = revalidation.size > 0;
      
      if (isReady) {
        console.log(`✓ File content written and ready: ${normalizedPath} (${revalidation.size} bytes)`);
      }
      
      return {
        success: isReady,
        error: isReady ? undefined : "File is still empty after waiting",
        fileSize: revalidation.size,
        operation,
        waitedForContent: true,
        initialSize: validation.size,
        finalSize: revalidation.size
      };
    }
    
    // File exists and has content, but let's make sure it's stable (not being written to)
    const isStable = await waitForFileReady(normalizedPath, 2000, 200); // Shorter wait for stability check
    
    if (!isStable) {
      console.warn(`File may still be being written to: ${normalizedPath}`);
      // Continue anyway, but note the potential issue
    }
    
    // Final validation to ensure file is still accessible
    const finalValidation = await audioErrorHandler.validateAudioFile(normalizedPath);
    
    return {
      success: finalValidation.exists && finalValidation.readable && finalValidation.size > 0,
      error: (!finalValidation.exists || !finalValidation.readable || finalValidation.size === 0) ? 
        "File became inaccessible during readiness check" : undefined,
      fileSize: finalValidation.size,
      operation,
      stable: isStable,
      initialSize: validation.size,
      finalSize: finalValidation.size
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Failed to ensure file ready for ${operation}: ${error.message}`,
      operation,
      exception: {
        name: error.name,
        message: error.message,
        code: error.code
      }
    };
  }
};

/**
 * Validates that an MP3 file is properly generated and ready for processing
 * @param {string} filePath - Path to the MP3 file
 * @returns {Promise<{isValid: boolean, validation: object, error?: string}>}
 */
const validateMp3FileForProcessing = async (filePath) => {
  try {
    // Normalize file path
    const normalizedPath = path.resolve(filePath);
    
    // First check basic file validation
    const validation = await audioErrorHandler.validateAudioFile(normalizedPath);
    
    if (!validation.exists) {
      return {
        isValid: false,
        validation,
        error: `MP3 file does not exist: ${normalizedPath}`
      };
    }
    
    if (!validation.readable) {
      return {
        isValid: false,
        validation,
        error: `MP3 file is not readable: ${normalizedPath}`
      };
    }
    
    if (validation.size === 0) {
      return {
        isValid: false,
        validation,
        error: `MP3 file is empty: ${normalizedPath}`
      };
    }
    
    // Additional check for minimum file size (MP3 header is typically at least 128 bytes)
    if (validation.size < 128) {
      return {
        isValid: false,
        validation,
        error: `MP3 file appears to be corrupted or incomplete: ${normalizedPath} (${validation.size} bytes)`
      };
    }
    
    // Try to read the file to validate MP3 format and content
    try {
      // Read only the first chunk for header validation to avoid loading large files entirely
      const headerBuffer = Buffer.alloc(Math.min(4096, validation.size));
      const fileHandle = await fs.open(normalizedPath, 'r');
      
      try {
        const { bytesRead } = await fileHandle.read(headerBuffer, 0, headerBuffer.length, 0);
        
        if (bytesRead === 0) {
          return {
            isValid: false,
            validation: { ...validation, headerCheck: false },
            error: `Could not read MP3 file header: ${normalizedPath}`
          };
        }
        
        // Check for MP3 header signatures
        const firstBytes = headerBuffer.slice(0, Math.min(4, bytesRead));
        let hasValidMp3Header = false;
        let headerType = "unknown";
        
        // ID3v2 tag check
        if (bytesRead >= 3 && firstBytes[0] === 0x49 && firstBytes[1] === 0x44 && firstBytes[2] === 0x33) {
          hasValidMp3Header = true;
          headerType = "ID3v2";
        }
        // MP3 frame sync check (0xFF followed by 0xFB, 0xFA, 0xF3, 0xF2, etc.)
        else if (bytesRead >= 2 && firstBytes[0] === 0xFF && (firstBytes[1] & 0xE0) === 0xE0) {
          hasValidMp3Header = true;
          headerType = "MP3_FRAME";
        }
        // Sometimes MP3 files start with other metadata, scan first few KB for MP3 frame
        else {
          for (let i = 0; i < Math.min(bytesRead - 1, 1024); i++) {
            if (headerBuffer[i] === 0xFF && (headerBuffer[i + 1] & 0xE0) === 0xE0) {
              hasValidMp3Header = true;
              headerType = "MP3_FRAME_OFFSET";
              break;
            }
          }
        }
        
        if (!hasValidMp3Header) {
          return {
            isValid: false,
            validation: { ...validation, headerCheck: false, headerBytes: Array.from(firstBytes) },
            error: `File does not appear to be a valid MP3: ${normalizedPath} (invalid header)`
          };
        }
        
        // Additional validation: ensure file has reasonable size for audio content
        const minAudioSize = 1024; // Minimum size for meaningful audio content
        if (validation.size < minAudioSize) {
          return {
            isValid: false,
            validation: { ...validation, headerCheck: true, contentCheck: false, headerType },
            error: `MP3 file appears to be too small to contain audio data: ${normalizedPath} (${validation.size} bytes)`
          };
        }
        
        // For files larger than 4KB, do a quick scan to ensure there's actual audio content
        let hasAudioContent = true;
        if (validation.size > 4096) {
          // Check if the file has varied content (not just zeros or repeated bytes)
          const sampleSize = Math.min(1024, bytesRead);
          const sample = headerBuffer.slice(0, sampleSize);
          const uniqueBytes = new Set(sample).size;
          
          // If less than 10% unique bytes, might be corrupted or empty
          if (uniqueBytes < sampleSize * 0.1) {
            hasAudioContent = false;
          }
        }
        
        return {
          isValid: true,
          validation: { 
            ...validation, 
            headerCheck: true, 
            contentCheck: hasAudioContent,
            headerType,
            bytesRead,
            actualSize: validation.size
          }
        };
        
      } finally {
        await fileHandle.close();
      }
      
    } catch (readError) {
      return {
        isValid: false,
        validation: { ...validation, readError: readError.message },
        error: `Failed to read MP3 file for validation: ${readError.message}`
      };
    }
    
  } catch (error) {
    return {
      isValid: false,
      validation: { exists: false, readable: false, error: error.message },
      error: `Failed to validate MP3 file: ${error.message}`
    };
  }
};

const audioFileToBase64 = async (file) => {
  try {
    // Normalize file path to handle different path formats
    const normalizedPath = path.resolve(file);
    
    // First validate that the file exists and is readable
    const validation = await audioErrorHandler.validateAudioFile(normalizedPath);
    
    if (!validation.exists) {
      console.warn(`Audio file does not exist: ${normalizedPath}`);
      audioErrorHandler.logAudioError(new Error("File not found"), {
        operation: "audio_file_to_base64",
        filePath: normalizedPath,
        originalPath: file,
        errorType: "ENOENT",
        validationResult: validation
      });
      return "";
    }
    
    if (!validation.readable) {
      console.warn(`Audio file is not readable: ${normalizedPath}`);
      audioErrorHandler.logAudioError(new Error("File not readable"), {
        operation: "audio_file_to_base64",
        filePath: normalizedPath,
        originalPath: file,
        errorType: "EACCES",
        validationResult: validation
      });
      return "";
    }
    
    // Check if file has content (size > 0)
    if (validation.size === 0) {
      console.warn(`Audio file is empty: ${normalizedPath}`);
      audioErrorHandler.logAudioError(new Error("Empty file"), {
        operation: "audio_file_to_base64",
        filePath: normalizedPath,
        originalPath: file,
        errorType: "EMPTY_FILE",
        validationResult: validation
      });
      return "";
    }
    
    // Additional validation for MP3 files - check minimum size and basic format
    if (normalizedPath.toLowerCase().endsWith('.mp3')) {
      const mp3Validation = await validateMp3FileForProcessing(normalizedPath);
      if (!mp3Validation.isValid) {
        console.warn(`MP3 file validation failed: ${mp3Validation.error}`);
        audioErrorHandler.logAudioError(new Error(mp3Validation.error), {
          operation: "audio_file_to_base64",
          filePath: normalizedPath,
          originalPath: file,
          errorType: "INVALID_MP3",
          validationResult: mp3Validation.validation,
          mp3ValidationError: mp3Validation.error
        });
        return "";
      }
    }
    
    // Ensure file is ready for processing (wait for any ongoing writes to complete)
    const fileReadiness = await ensureFileReady(normalizedPath, "base64 conversion");
    if (!fileReadiness.success) {
      console.warn(`File not ready for base64 conversion: ${fileReadiness.error}`);
      audioErrorHandler.logAudioError(new Error(fileReadiness.error), {
        operation: "audio_file_to_base64",
        filePath: normalizedPath,
        originalPath: file,
        errorType: "FILE_NOT_READY",
        readinessCheck: fileReadiness
      });
      return "";
    }
    
    // Read and convert the file to base64
    const data = await fs.readFile(normalizedPath);
    
    // Verify the data was actually read and matches expected size
    if (!data || data.length === 0) {
      console.warn(`No data read from audio file: ${normalizedPath}`);
      audioErrorHandler.logAudioError(new Error("No data read from file"), {
        operation: "audio_file_to_base64",
        filePath: normalizedPath,
        originalPath: file,
        errorType: "NO_DATA_READ",
        expectedSize: validation.size,
        actualSize: data ? data.length : 0
      });
      return "";
    }
    
    // Verify data size matches file stats (detect truncated reads)
    if (data.length !== validation.size && data.length !== fileReadiness.fileSize) {
      console.warn(`Data size mismatch for audio file: ${normalizedPath} (expected: ${validation.size}, read: ${data.length})`);
      audioErrorHandler.logAudioError(new Error("Data size mismatch - possible truncated read"), {
        operation: "audio_file_to_base64",
        filePath: normalizedPath,
        originalPath: file,
        errorType: "SIZE_MISMATCH",
        expectedSize: validation.size,
        actualSize: data.length,
        readinessSize: fileReadiness.fileSize
      });
      // Continue with conversion but log the issue
    }
    
    const base64Data = data.toString("base64");
    
    // Verify base64 conversion was successful
    if (!base64Data || base64Data.length === 0) {
      console.warn(`Base64 conversion failed for audio file: ${normalizedPath}`);
      audioErrorHandler.logAudioError(new Error("Base64 conversion failed"), {
        operation: "audio_file_to_base64",
        filePath: normalizedPath,
        originalPath: file,
        errorType: "BASE64_CONVERSION_FAILED",
        dataLength: data.length
      });
      return "";
    }
    
    // Verify base64 data integrity (basic sanity check)
    const expectedBase64Length = Math.ceil(data.length * 4 / 3);
    if (Math.abs(base64Data.length - expectedBase64Length) > 4) { // Allow for padding
      console.warn(`Base64 conversion length unexpected for audio file: ${normalizedPath}`);
      audioErrorHandler.logAudioError(new Error("Base64 conversion length mismatch"), {
        operation: "audio_file_to_base64",
        filePath: normalizedPath,
        originalPath: file,
        errorType: "BASE64_LENGTH_MISMATCH",
        dataLength: data.length,
        base64Length: base64Data.length,
        expectedBase64Length: expectedBase64Length
      });
      // Continue anyway as this might be a false positive
    }
    
    console.log(`✓ Successfully converted audio file to base64: ${normalizedPath} (${validation.size} bytes → ${base64Data.length} base64 chars)`);
    return base64Data;
    
  } catch (error) {
    console.error(`Failed to read audio file ${file}:`, error);
    
    // Log detailed error information for debugging
    audioErrorHandler.logAudioError(error, {
      operation: "audio_file_to_base64",
      filePath: file,
      errorType: error.code || error.name || "unknown",
      errorMessage: error.message,
      stack: error.stack,
      platform: process.platform,
      nodeVersion: process.version
    });
    
    return "";
  }
};

// Enhanced health check endpoint with detailed ElevenLabs status
app.get("/health", async (req, res) => {
  const healthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    server: {
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version,
      port: port
    },
    services: {
      elevenlabs: {
        configured: false,
        status: "unknown"
      },
      aiProviders: {},
      audio: {}
    }
  };

  try {
    // Enhanced ElevenLabs service status check
    if (elevenLabsApiKey) {
      try {
        console.log("🔍 Performing ElevenLabs health check...");
        const validation = await elevenLabsService.performFullValidation();
        
        healthStatus.services.elevenlabs = {
          configured: true,
          status: validation.overallStatus === "valid" ? "healthy" : "unhealthy",
          apiKey: {
            configured: validation.apiKey.configured,
            valid: validation.connectivity.isValid
          },
          voiceId: {
            configured: validation.voiceId.configured,
            current: voiceID,
            valid: validation.voiceValidation.isValid
          },
          connectivity: validation.connectivity,
          voiceValidation: validation.voiceValidation,
          lastChecked: validation.timestamp
        };

        // Add voice suggestions if voice ID is invalid
        if (!validation.voiceValidation.isValid && validation.voiceValidation.suggestions) {
          healthStatus.services.elevenlabs.voiceId.suggestions = validation.voiceValidation.suggestions;
        }

        // If ElevenLabs is unhealthy, mark overall status as degraded
        if (validation.overallStatus !== "valid") {
          healthStatus.status = "degraded";
        }

      } catch (error) {
        console.error("❌ ElevenLabs health check failed:", error.message);
        healthStatus.services.elevenlabs = {
          configured: true,
          status: "error",
          error: error.message,
          lastChecked: new Date().toISOString()
        };
        healthStatus.status = "degraded";
      }
    } else {
      healthStatus.services.elevenlabs = {
        configured: false,
        status: "not_configured",
        message: "ElevenLabs API key not provided. Set ELEVEN_LABS_API_KEY environment variable."
      };
      healthStatus.status = "degraded";
    }

    // Check AI provider configurations
    const aiProviders = healthStatus.services.aiProviders;
    
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "-") {
      aiProviders.openai = { configured: true, name: "OpenAI GPT" };
    } else {
      aiProviders.openai = { configured: false, name: "OpenAI GPT" };
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      aiProviders.claude = { configured: true, name: "Anthropic Claude" };
    } else {
      aiProviders.claude = { configured: false, name: "Anthropic Claude" };
    }
    
    if (process.env.GEMINI_API_KEY) {
      aiProviders.gemini = { configured: true, name: "Google Gemini" };
    } else {
      aiProviders.gemini = { configured: false, name: "Google Gemini" };
    }
    
    if (process.env.COHERE_API_KEY) {
      aiProviders.cohere = { configured: true, name: "Cohere" };
    } else {
      aiProviders.cohere = { configured: false, name: "Cohere" };
    }

    // Count configured AI providers
    const configuredProviders = Object.values(aiProviders).filter(p => p.configured).length;
    aiProviders.summary = {
      total: Object.keys(aiProviders).length,
      configured: configuredProviders,
      status: configuredProviders > 0 ? "healthy" : "no_providers"
    };

    // If no AI providers are configured, mark as degraded
    if (configuredProviders === 0) {
      healthStatus.status = "degraded";
    }

    // Enhanced audio services health check
    try {
      const audioHealthCheck = await audioErrorHandler.performAudioHealthCheck(elevenLabsService);
      healthStatus.services.audio = {
        status: audioHealthCheck.overallStatus,
        ffmpeg: audioHealthCheck.services.ffmpeg || { status: "unknown", message: "Check manually" },
        rhubarb: audioHealthCheck.services.rhubarb || { status: "unknown", message: "Check manually" },
        lastChecked: audioHealthCheck.timestamp
      };

      // If audio services are unhealthy, mark overall status as degraded
      if (audioHealthCheck.overallStatus !== "healthy") {
        healthStatus.status = "degraded";
      }
    } catch (audioError) {
      console.error("❌ Audio health check failed:", audioError.message);
      healthStatus.services.audio = {
        status: "error",
        error: audioError.message,
        ffmpeg: { status: "unknown", message: "Check manually" },
        rhubarb: { status: "unknown", message: "Check manually" },
        lastChecked: new Date().toISOString()
      };
      healthStatus.status = "degraded";
    }

    // Set appropriate HTTP status code
    const httpStatus = healthStatus.status === "healthy" ? 200 : 
                      healthStatus.status === "degraded" ? 200 : 503;

    res.status(httpStatus).json(healthStatus);

  } catch (error) {
    console.error("❌ Health check failed:", error.message);
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      error: "Health check failed",
      message: error.message
    });
  }
});

app.listen(port, async () => {
  console.log(`Virtual Girlfriend Multi-AI Server listening on port ${port}`);
  console.log(`Platform: ${process.platform}`);
  
  // Enhanced ElevenLabs configuration validation on startup
  if (elevenLabsApiKey) {
    console.log("\n🔍 Validating ElevenLabs configuration...");
    try {
      const validation = await elevenLabsService.performFullValidation();
      
      if (validation.overallStatus === "valid") {
        console.log("✅ ElevenLabs configuration is valid");
        console.log(`   API Key: Configured and validated`);
        console.log(`   Voice ID: ${voiceID} (validated)`);
        
        // Show available voices count for reference
        if (validation.connectivity.voicesCount) {
          console.log(`   Available voices: ${validation.connectivity.voicesCount} voices in your account`);
        }
      } else {
        console.log("⚠️  ElevenLabs configuration issues detected:");
        
        if (!validation.connectivity.isValid) {
          console.log(`   ❌ API Key Issue: ${validation.connectivity.error}`);
          
          if (validation.connectivity.suggestions) {
            console.log("   💡 Suggestions:");
            validation.connectivity.suggestions.forEach(suggestion => {
              console.log(`      - ${suggestion}`);
            });
          }
        } else {
          console.log(`   ✅ API Key: Valid (${validation.connectivity.voicesCount} voices available)`);
        }
        
        if (!validation.voiceValidation.isValid) {
          console.log(`   ❌ Voice ID Issue: ${validation.voiceValidation.error}`);
          
          if (validation.voiceValidation.suggestions && validation.voiceValidation.suggestions.length > 0) {
            console.log("   💡 Available voices in your account:");
            validation.voiceValidation.suggestions.forEach((voice, index) => {
              const marker = index === 0 ? "👉" : "  ";
              console.log(`      ${marker} ${voice.name} (ID: ${voice.voice_id})`);
              if (voice.category) {
                console.log(`         Category: ${voice.category}`);
              }
            });
            console.log(`   💡 To fix: Set VOICE_ID=${validation.voiceValidation.suggestions[0].voice_id} in your .env file`);
          }
          
          if (validation.voiceValidation.suggestions) {
            console.log("   🔧 Quick fix commands:");
            console.log(`      Windows: echo VOICE_ID=${validation.voiceValidation.suggestions[0].voice_id} >> .env`);
            console.log(`      Linux/Mac: echo "VOICE_ID=${validation.voiceValidation.suggestions[0].voice_id}" >> .env`);
          }
        } else {
          console.log(`   ✅ Voice ID: ${voiceID} (validated)`);
        }
        
        // Provide endpoint information for manual validation
        console.log("\n   🔍 For detailed validation, visit:");
        console.log(`      http://localhost:${port}/elevenlabs/validate`);
        console.log(`      http://localhost:${port}/voices`);
        console.log(`      http://localhost:${port}/health`);
      }
    } catch (error) {
      console.log("❌ ElevenLabs validation failed:", error.message);
      console.log("   💡 This might be due to:");
      console.log("      - Network connectivity issues");
      console.log("      - Invalid API key format");
      console.log("      - ElevenLabs service temporarily unavailable");
      console.log(`   🔍 Check the health endpoint: http://localhost:${port}/health`);
    }
  } else {
    console.log("⚠️  ElevenLabs API key not configured");
    console.log("   💡 To enable text-to-speech:");
    console.log("      1. Get an API key from https://elevenlabs.io");
    console.log("      2. Add ELEVEN_LABS_API_KEY=your_key_here to your .env file");
    console.log("      3. Optionally set VOICE_ID=voice_id_here (or use default)");
    console.log(`   🔍 After setup, check: http://localhost:${port}/health`);
  }
  
  // Initialize default audio files
  await initializeDefaultAudios();
  
  console.log(`\n📡 Available AI providers:`);
  
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
  
  console.log(`\n🚀 Server ready at http://localhost:${port}`);
});

export default app;
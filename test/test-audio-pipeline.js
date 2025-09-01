import ElevenLabsService from "../services/ElevenLabsService.js";
import AudioErrorHandler from "../utils/AudioErrorHandler.js";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test the improved audio generation pipeline
async function testAudioPipeline() {
  console.log("🧪 Testing Audio Generation Pipeline...\n");

  const audiosDir = path.join(__dirname, '..', 'audios');
  const audioErrorHandler = new AudioErrorHandler(audiosDir);
  
  // Test 1: Invalid API key scenario
  console.log("1. Testing audio generation with invalid API key:");
  const serviceInvalidKey = new ElevenLabsService("invalid-key", "test-voice");
  
  const result1 = await serviceInvalidKey.generateAudio("Hello world", "/tmp/test.mp3");
  console.log("   Result:", result1);
  
  if (!result1.success) {
    console.log("   Creating fallback audio...");
    const fallback = await audioErrorHandler.createFallbackAudio(0, "Hello world");
    console.log("   Fallback created successfully");
  }
  console.log("");

  // Test 2: Missing voice ID scenario
  console.log("2. Testing audio generation with missing voice ID:");
  const serviceNoVoice = new ElevenLabsService("test-key", null);
  
  const result2 = await serviceNoVoice.generateAudio("Hello world", "/tmp/test.mp3");
  console.log("   Result:", result2);
  console.log("");

  // Test 3: Empty text scenario
  console.log("3. Testing audio generation with empty text:");
  const serviceValid = new ElevenLabsService("test-key", "test-voice");
  
  const result3 = await serviceValid.generateAudio("", "/tmp/test.mp3");
  console.log("   Result:", result3);
  console.log("");

  // Test 4: Text too long scenario
  console.log("4. Testing audio generation with text too long:");
  const longText = "A".repeat(6000); // Over 5000 character limit
  
  const result4 = await serviceValid.generateAudio(longText, "/tmp/test.mp3");
  console.log("   Result:", result4);
  console.log("");

  // Test 5: Error logging
  console.log("5. Testing detailed error logging:");
  const testError = {
    message: "Voice not found",
    errorCode: "INVALID_VOICE_ID",
    originalError: "404 Not Found",
    suggestions: ["Use /voices endpoint", "Check voice ID"]
  };
  
  audioErrorHandler.logAudioError(testError, {
    messageIndex: 1,
    text: "Test message for logging",
    voiceId: "invalid-voice-123",
    operation: "audio_generation_test"
  });
  console.log("   Error logged successfully");
  console.log("");

  // Test 6: File validation
  console.log("6. Testing audio file validation:");
  const validation = await audioErrorHandler.validateAudioFile("/nonexistent/file.mp3");
  console.log("   Validation result:", validation);
  console.log("");

  console.log("✅ Audio Pipeline tests completed!");
}

// Run tests if this file is executed directly
testAudioPipeline().catch(console.error);

export { testAudioPipeline };
import ElevenLabsService from "../services/ElevenLabsService.js";
import AudioErrorHandler from "../utils/AudioErrorHandler.js";

// Simple test script for ElevenLabs service
async function testElevenLabsService() {
  console.log("🧪 Testing ElevenLabs Service...\n");

  // Test with no API key
  console.log("1. Testing with no API key:");
  const serviceNoKey = new ElevenLabsService(null, "test-voice");
  const credentialTest = await serviceNoKey.validateCredentials();
  console.log("   Result:", credentialTest);
  console.log("");

  // Test with invalid API key
  console.log("2. Testing with invalid API key:");
  const serviceInvalidKey = new ElevenLabsService("invalid-key", "test-voice");
  const invalidKeyTest = await serviceInvalidKey.validateCredentials();
  console.log("   Result:", invalidKeyTest);
  console.log("");

  // Test error handling
  console.log("3. Testing error handling:");
  const errorHandler = new AudioErrorHandler("/tmp/audios");
  
  const testError = {
    message: "Voice not found",
    errorCode: "INVALID_VOICE_ID"
  };
  
  const handledError = errorHandler.handleElevenLabsError(testError, "test context");
  console.log("   Handled error:", handledError);
  console.log("");

  // Test fallback audio creation
  console.log("4. Testing fallback audio creation:");
  const fallback = await errorHandler.createFallbackAudio(0, "Hello world test");
  console.log("   Fallback audio:", fallback);
  console.log("");

  // Test retry logic
  console.log("5. Testing retry logic:");
  console.log("   Rate limited error is retryable:", errorHandler.isRetryableError("RATE_LIMITED"));
  console.log("   Invalid API key error is retryable:", errorHandler.isRetryableError("INVALID_API_KEY"));
  console.log("");

  console.log("✅ ElevenLabs Service tests completed!");
}

// Run tests if this file is executed directly
testElevenLabsService().catch(console.error);

export { testElevenLabsService };
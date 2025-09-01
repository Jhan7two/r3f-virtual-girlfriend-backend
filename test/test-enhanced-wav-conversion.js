import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import AudioErrorHandler from "../utils/AudioErrorHandler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test enhanced WAV conversion and lip sync functionality
async function testEnhancedWavConversion() {
  console.log("🧪 Testing Enhanced WAV Conversion and Lip Sync Generation");
  
  const audiosDir = path.join(__dirname, '..', 'audios');
  const audioErrorHandler = new AudioErrorHandler(audiosDir);
  
  try {
    // Test 1: FFmpeg availability validation
    console.log("\n1. Testing FFmpeg availability validation...");
    const ffmpegValidation = await audioErrorHandler.validateFFmpegAvailability();
    console.log(`   FFmpeg available: ${ffmpegValidation.isAvailable}`);
    if (ffmpegValidation.isAvailable) {
      console.log(`   FFmpeg version: ${ffmpegValidation.version}`);
    } else {
      console.log(`   FFmpeg error: ${ffmpegValidation.error}`);
    }
    
    // Test 2: Rhubarb availability validation
    console.log("\n2. Testing Rhubarb availability validation...");
    const rhubarbPath = process.platform === 'win32' ? 
      path.join(__dirname, '..', 'bin', 'rhubarb.exe') : 
      path.join(__dirname, '..', 'bin', 'rhubarb');
    
    const rhubarbValidation = await audioErrorHandler.validateRhubarbAvailability(rhubarbPath);
    console.log(`   Rhubarb available: ${rhubarbValidation.isAvailable}`);
    if (rhubarbValidation.isAvailable) {
      console.log(`   Rhubarb version: ${rhubarbValidation.version}`);
    } else {
      console.log(`   Rhubarb error: ${rhubarbValidation.error}`);
    }
    
    // Test 3: Enhanced fallback lip sync creation
    console.log("\n3. Testing enhanced fallback lip sync creation...");
    const testText = "Hello, this is a test message for enhanced lip sync generation.";
    const enhancedFallback = await audioErrorHandler.createEnhancedFallbackLipSync(
      999, // test message index
      testText,
      null // no MP3 file
    );
    
    console.log(`   Generated fallback with ${enhancedFallback.mouthCues.length} mouth cues`);
    console.log(`   Duration: ${enhancedFallback.metadata.duration}s`);
    console.log(`   Duration source: ${enhancedFallback.metadata.durationSource}`);
    console.log(`   Text length: ${enhancedFallback.metadata.textLength} characters`);
    
    // Test 4: Error handling functions
    console.log("\n4. Testing error handling functions...");
    
    // Test FFmpeg error handling
    const mockFFmpegError = new Error("No such file or directory");
    const ffmpegErrorAnalysis = audioErrorHandler.handleFFmpegError(
      mockFFmpegError, 
      "/test/input.mp3", 
      "/test/output.wav"
    );
    console.log(`   FFmpeg error category: ${ffmpegErrorAnalysis.category}`);
    console.log(`   Troubleshooting steps: ${ffmpegErrorAnalysis.troubleshooting.length}`);
    
    // Test Rhubarb error handling
    const mockRhubarbError = new Error("Invalid audio format");
    const rhubarbErrorAnalysis = audioErrorHandler.handleRhubarbError(
      mockRhubarbError,
      "/test/input.wav",
      "/test/output.json"
    );
    console.log(`   Rhubarb error category: ${rhubarbErrorAnalysis.category}`);
    console.log(`   Troubleshooting steps: ${rhubarbErrorAnalysis.troubleshooting.length}`);
    
    // Test 5: Lipsync metadata normalization
    console.log("\n5. Testing lipsync metadata normalization...");
    const testLipsyncData = {
      metadata: {
        soundFile: "message_0.wav",
        duration: 3.5
      },
      mouthCues: [
        { start: 0.0, end: 1.0, value: "A" },
        { start: 1.0, end: 2.0, value: "E" }
      ]
    };
    
    const normalizedData = audioErrorHandler.normalizeLipsyncMetadata(testLipsyncData);
    console.log(`   Original soundFile: ${testLipsyncData.metadata.soundFile}`);
    console.log(`   Normalized soundFile: ${normalizedData.metadata.soundFile}`);
    
    console.log("\n✅ All enhanced WAV conversion tests completed successfully!");
    
  } catch (error) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testEnhancedWavConversion().catch(console.error);
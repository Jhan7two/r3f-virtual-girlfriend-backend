import { promises as fs } from "fs";
import path from "path";

/**
 * Audio Error Handler for managing audio generation failures and fallbacks
 */
class AudioErrorHandler {
  constructor(audiosDir) {
    this.audiosDir = audiosDir;
  }

  /**
   * Handles ElevenLabs-specific errors and provides appropriate responses
   * @param {Object} error - Error object from ElevenLabs service
   * @param {string} context - Context where error occurred
   * @returns {Object} Structured error response
   */
  handleElevenLabsError(error, context = "audio generation") {
    const timestamp = new Date().toISOString();
    
    console.error(`[${timestamp}] ElevenLabs error in ${context}:`, {
      message: error.message,
      errorCode: error.errorCode,
      context
    });

    return {
      timestamp,
      context,
      errorType: "elevenlabs_error",
      errorCode: error.errorCode || "UNKNOWN_ERROR",
      message: error.error || error.message || "Unknown ElevenLabs error",
      canRetry: this.isRetryableError(error.errorCode)
    };
  }

  /**
   * Creates fallback audio response when ElevenLabs fails
   * @param {number} messageIndex - Index of the message
   * @param {string} text - Original text that failed to generate
   * @returns {Object} Fallback audio data
   */
  async createFallbackAudio(messageIndex, text = "") {
    const fallbackData = {
      audio: "", // Empty base64 audio - frontend should handle gracefully
      audioMime: "audio/mpeg", // Consistent MIME type even for empty audio
      lipsync: this.createFallbackLipSync(messageIndex, text),
      isFallback: true,
      reason: "audio_generation_failed",
      metadata: {
        messageIndex,
        textLength: text.length,
        timestamp: new Date().toISOString(),
        fallbackType: "empty_audio_with_lipsync"
      }
    };

    // Log the fallback creation with more context
    console.warn(`📢 Created fallback audio for message ${messageIndex}:`);
    console.warn(`   Text: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
    console.warn(`   Length: ${text.length} characters`);
    console.warn(`   Estimated duration: ${fallbackData.lipsync.metadata.duration}s`);
    console.warn(`   Frontend will receive empty audio with fallback lip sync data`);

    return fallbackData;
  }

  /**
   * Creates fallback lip sync data when audio generation fails
   * @param {number} messageIndex - Index of the message
   * @param {string} text - Original text
   * @returns {Object} Fallback lip sync data
   */
  createFallbackLipSync(messageIndex, text = "") {
    // Estimate duration based on text length (rough approximation)
    const estimatedDuration = Math.max(1.0, Math.min(10.0, text.length * 0.05));
    
    return {
      metadata: {
        soundFile: `message_${messageIndex}.mp3`, // Use .mp3 extension for consistency
        duration: estimatedDuration
      },
      mouthCues: [
        { start: 0.0, end: estimatedDuration, value: "A" }
      ]
    };
  }

  /**
   * Logs audio errors with detailed context for debugging
   * @param {Object} error - Error object
   * @param {Object} context - Additional context information
   */
  logAudioError(error, context = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      severity: this.getErrorSeverity(error.errorCode || error.code),
      error: {
        message: error.message || error.error,
        code: error.errorCode || error.code,
        type: error.errorType || error.constructor?.name || "unknown",
        originalError: error.originalError,
        retryable: error.retryable || this.isRetryableError(error.errorCode || error.code)
      },
      context: {
        messageIndex: context.messageIndex,
        text: context.text ? `"${context.text.substring(0, 100)}${context.text.length > 100 ? '...' : ''}"` : undefined,
        textLength: context.text ? context.text.length : undefined,
        voiceId: context.voiceId,
        operation: context.operation || "unknown",
        platform: process.platform,
        nodeVersion: process.version,
        ...context
      },
      suggestions: error.suggestions || [],
      troubleshooting: this.getTroubleshootingSteps(error.errorCode || error.code)
    };

    // Use appropriate log level based on severity
    if (logEntry.severity === "critical") {
      console.error("🚨 CRITICAL Audio Error:", JSON.stringify(logEntry, null, 2));
    } else if (logEntry.severity === "warning") {
      console.warn("⚠️  Audio Warning:", JSON.stringify(logEntry, null, 2));
    } else {
      console.error("❌ Audio Error:", JSON.stringify(logEntry, null, 2));
    }
  }

  /**
   * Determines error severity based on error code
   * @param {string} errorCode - Error code
   * @returns {string} Severity level
   */
  getErrorSeverity(errorCode) {
    const criticalErrors = ["INVALID_API_KEY", "QUOTA_EXCEEDED", "MISSING_API_KEY"];
    const warningErrors = ["RATE_LIMITED", "NETWORK_ERROR", "SERVER_ERROR"];
    
    if (criticalErrors.includes(errorCode)) {
      return "critical";
    } else if (warningErrors.includes(errorCode)) {
      return "warning";
    }
    
    return "error";
  }

  /**
   * Provides troubleshooting steps based on error code
   * @param {string} errorCode - Error code
   * @returns {Array<string>} Troubleshooting steps
   */
  getTroubleshootingSteps(errorCode) {
    const troubleshootingMap = {
      "INVALID_API_KEY": [
        "Verify ELEVEN_LABS_API_KEY in .env file",
        "Check API key format and validity",
        "Test API key with /elevenlabs/validate endpoint"
      ],
      "INVALID_VOICE_ID": [
        "Use /voices endpoint to see available voices",
        "Verify VOICE_ID in .env file",
        "Test voice ID with /elevenlabs/validate-voice endpoint"
      ],
      "RATE_LIMITED": [
        "Wait before making more requests",
        "Implement request queuing",
        "Consider upgrading ElevenLabs plan"
      ],
      "NETWORK_ERROR": [
        "Check internet connection",
        "Verify firewall settings",
        "Test with /health endpoint"
      ],
      "QUOTA_EXCEEDED": [
        "Check ElevenLabs account usage",
        "Upgrade plan or wait for quota reset",
        "Verify billing information"
      ]
    };
    
    return troubleshootingMap[errorCode] || [
      "Check error details above",
      "Verify ElevenLabs configuration",
      "Use /health endpoint for system status"
    ];
  }

  /**
   * Determines if an error is retryable
   * @param {string} errorCode - Error code from ElevenLabs service
   * @returns {boolean} Whether the error can be retried
   */
  isRetryableError(errorCode) {
    const retryableErrors = [
      "RATE_LIMITED",
      "NETWORK_ERROR",
      "TIMEOUT_ERROR"
    ];
    
    return retryableErrors.includes(errorCode);
  }



  /**
   * Creates a comprehensive error response for the API
   * @param {Object} error - Original error
   * @param {Object} context - Error context
   * @returns {Object} API-ready error response
   */
  createErrorResponse(error, context = {}) {
    return {
      success: false,
      error: {
        message: error.message || "Audio generation failed",
        code: error.errorCode || "UNKNOWN_ERROR",
        context: context.operation || "audio_processing",
        timestamp: new Date().toISOString(),
        canRetry: this.isRetryableError(error.errorCode)
      },
      fallback: {
        audio: "",
        audioMime: "audio/mpeg",
        lipsync: this.createFallbackLipSync(context.messageIndex || 0, context.text || "")
      }
    };
  }

  /**
   * Validates audio file existence and readability
   * @param {string} filePath - Path to audio file
   * @returns {Promise<{exists: boolean, readable: boolean, size?: number}>}
   */
  async validateAudioFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      if (!stats.isFile()) {
        return { exists: false, readable: false };
      }

      // Try to read the file to ensure it's accessible
      await fs.access(filePath, fs.constants.R_OK);
      
      return {
        exists: true,
        readable: true,
        size: stats.size
      };
    } catch (error) {
      return {
        exists: false,
        readable: false,
        error: error.message
      };
    }
  }

  /**
   * Cleans up temporary audio files
   * @param {Array<string>} filePaths - Array of file paths to clean up
   */
  async cleanupAudioFiles(filePaths) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
        console.log(`Cleaned up audio file: ${filePath}`);
      } catch (error) {
        // File might not exist or already be deleted, which is fine
        if (error.code !== 'ENOENT') {
          console.warn(`Failed to cleanup audio file ${filePath}:`, error.message);
        }
      }
    }
  }









  /**
   * Creates enhanced fallback lip sync data with better duration estimation
   * @param {number} messageIndex - Index of the message
   * @param {string} text - Original text
   * @param {string} mp3Path - Path to MP3 file for duration estimation
   * @returns {Promise<Object>} Enhanced fallback lip sync data
   */
  async createEnhancedFallbackLipSync(messageIndex, text = "", mp3Path = null) {
    let estimatedDuration = 1.0;
    let durationSource = "default";

    // Try multiple methods to estimate duration
    if (mp3Path) {
      try {
        const mp3Stats = await this.validateAudioFile(mp3Path);
        if (mp3Stats.exists && mp3Stats.size > 0) {
          // Rough estimation based on file size (approximate)
          estimatedDuration = Math.max(1.0, Math.min(15.0, mp3Stats.size / 32000));
          durationSource = "file_size_estimation";
        }
      } catch (error) {
        console.warn(`Could not estimate duration from MP3 file: ${error.message}`);
      }
    }

    // Fallback to text-based estimation
    if (durationSource === "default" && text.length > 0) {
      // Estimate based on text length (average speaking rate: ~150 words per minute)
      const wordCount = text.split(/\s+/).length;
      const wordsPerSecond = 150 / 60; // 2.5 words per second
      estimatedDuration = Math.max(1.0, Math.min(15.0, wordCount / wordsPerSecond));
      durationSource = "text_length_estimation";
    }

    // Create more realistic mouth cues for fallback
    const mouthCues = [];
    const cueInterval = 0.2; // Change mouth shape every 200ms
    const mouthShapes = ["A", "E", "I", "O", "U", "M", "B", "P"];
    
    for (let time = 0; time < estimatedDuration; time += cueInterval) {
      const endTime = Math.min(time + cueInterval, estimatedDuration);
      const mouthShape = mouthShapes[Math.floor(Math.random() * mouthShapes.length)];
      
      mouthCues.push({
        start: parseFloat(time.toFixed(2)),
        end: parseFloat(endTime.toFixed(2)),
        value: mouthShape
      });
    }

    return {
      metadata: {
        soundFile: `message_${messageIndex}.mp3`, // Use .mp3 extension for consistency
        duration: parseFloat(estimatedDuration.toFixed(2)),
        isFallback: true,
        durationSource,
        textLength: text.length,
        generatedAt: new Date().toISOString()
      },
      mouthCues
    };
  }

  /**
   * Creates a detailed health check for audio services
   * @param {Object} elevenLabsService - ElevenLabs service instance
   * @returns {Promise<Object>} Health check results
   */
  async performAudioHealthCheck(elevenLabsService) {
    const healthCheck = {
      timestamp: new Date().toISOString(),
      services: {
        elevenlabs: { status: "unknown" },
        filesystem: { status: "unknown" }
      },
      overallStatus: "unknown"
    };

    // Test ElevenLabs service
    try {
      const validation = await elevenLabsService.performFullValidation();
      healthCheck.services.elevenlabs = {
        status: validation.overallStatus === "valid" ? "healthy" : "unhealthy",
        details: validation
      };
    } catch (error) {
      healthCheck.services.elevenlabs = {
        status: "error",
        error: error.message
      };
    }

    // Test filesystem access
    try {
      await fs.access(this.audiosDir, fs.constants.W_OK);
      healthCheck.services.filesystem = {
        status: "healthy",
        audiosDir: this.audiosDir
      };
    } catch (error) {
      healthCheck.services.filesystem = {
        status: "error",
        error: error.message,
        audiosDir: this.audiosDir
      };
    }

    // Determine overall status
    const allHealthy = Object.values(healthCheck.services)
      .every(service => service.status === "healthy");
    
    healthCheck.overallStatus = allHealthy ? "healthy" : "degraded";

    return healthCheck;
  }
}

export default AudioErrorHandler;
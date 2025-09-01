import voice from "elevenlabs-node";

/**
 * ElevenLabs Service for handling text-to-speech operations with validation and error handling
 */
class ElevenLabsService {
  constructor(apiKey, voiceId) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.isValidated = false;
    this.availableVoices = [];
    this.lastValidationTime = null;
    this.validationCacheDuration = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Validates ElevenLabs API credentials by making a test request
   * @returns {Promise<{isValid: boolean, error?: string}>}
   */
  async validateCredentials() {
    if (!this.apiKey) {
      return {
        isValid: false,
        error: "ElevenLabs API key is not configured. Please set ELEVEN_LABS_API_KEY environment variable."
      };
    }

    try {
      // Test API connectivity by fetching voices
      const voices = await voice.getVoices(this.apiKey);
      
      if (!voices || !Array.isArray(voices)) {
        return {
          isValid: false,
          error: "Invalid response from ElevenLabs API. Please check your API key."
        };
      }

      this.availableVoices = voices;
      this.isValidated = true;
      this.lastValidationTime = Date.now();

      return {
        isValid: true,
        voicesCount: voices.length
      };
    } catch (error) {
      return this.handleElevenLabsError(error, "credential validation");
    }
  }

  /**
   * Fetches and caches available voices from ElevenLabs
   * @returns {Promise<Array>} Array of available voices
   */
  async getAvailableVoices() {
    // Use cached voices if validation is recent
    if (this.isValidated && 
        this.lastValidationTime && 
        (Date.now() - this.lastValidationTime) < this.validationCacheDuration &&
        this.availableVoices.length > 0) {
      return this.availableVoices;
    }

    try {
      const voices = await voice.getVoices(this.apiKey);
      this.availableVoices = voices || [];
      this.lastValidationTime = Date.now();
      return this.availableVoices;
    } catch (error) {
      console.error("Failed to fetch voices:", error);
      return this.availableVoices; // Return cached voices if available
    }
  }

  /**
   * Validates the configured voice ID against available voices
   * @returns {Promise<{isValid: boolean, error?: string, suggestions?: Array}>}
   */
  async validateVoiceId() {
    if (!this.voiceId) {
      const voices = await this.getAvailableVoices();
      return {
        isValid: false,
        error: "Voice ID is not configured. Please set VOICE_ID environment variable.",
        suggestions: voices.slice(0, 5).map(v => ({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category || "Unknown"
        }))
      };
    }

    try {
      const voices = await this.getAvailableVoices();
      
      if (voices.length === 0) {
        return {
          isValid: false,
          error: "Could not fetch available voices to validate voice ID."
        };
      }

      const voiceExists = voices.some(v => v.voice_id === this.voiceId);
      
      if (voiceExists) {
        return { isValid: true };
      }

      // Voice ID not found, provide suggestions
      const suggestions = voices.slice(0, 5).map(v => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category || "Unknown"
      }));

      return {
        isValid: false,
        error: `Voice ID "${this.voiceId}" not found in your available voices.`,
        suggestions
      };
    } catch (error) {
      return this.handleElevenLabsError(error, "voice ID validation");
    }
  }

  /**
   * Tests a specific voice ID by attempting to generate a short audio sample
   * @param {string} testVoiceId - Voice ID to test
   * @returns {Promise<{isValid: boolean, error?: string}>}
   */
  async testVoiceId(testVoiceId) {
    if (!testVoiceId) {
      return {
        isValid: false,
        error: "No voice ID provided for testing."
      };
    }

    try {
      // Create a temporary test file path
      const testText = "Test";
      const tempPath = `/tmp/voice_test_${Date.now()}.mp3`;
      
      await voice.textToSpeech(this.apiKey, testVoiceId, tempPath, testText);
      
      // If we get here, the voice ID works
      return { isValid: true };
    } catch (error) {
      return this.handleElevenLabsError(error, `voice ID test for ${testVoiceId}`);
    }
  }

  /**
   * Generates audio using ElevenLabs TTS with proper error handling
   * @param {string} text - Text to convert to speech
   * @param {string} outputPath - Path where to save the audio file
   * @returns {Promise<{success: boolean, error?: string, errorCode?: string}>}
   */
  async generateAudio(text, outputPath) {
    if (!this.apiKey) {
      return {
        success: false,
        error: "ElevenLabs API key not configured. Please set ELEVEN_LABS_API_KEY environment variable.",
        errorCode: "MISSING_API_KEY"
      };
    }

    if (!this.voiceId) {
      return {
        success: false,
        error: "Voice ID not configured. Please set VOICE_ID environment variable.",
        errorCode: "MISSING_VOICE_ID"
      };
    }

    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: "No text provided for audio generation",
        errorCode: "EMPTY_TEXT"
      };
    }

    // Validate text length (ElevenLabs has limits)
    if (text.length > 5000) {
      return {
        success: false,
        error: `Text too long for audio generation (${text.length} characters, max 5000)`,
        errorCode: "TEXT_TOO_LONG"
      };
    }

    try {
      console.log(`Calling ElevenLabs TTS with voice ID: ${this.voiceId}`);
      await voice.textToSpeech(this.apiKey, this.voiceId, outputPath, text);
      
      // Verify the file was actually created
      try {
        const fs = await import('fs/promises');
        const stats = await fs.stat(outputPath);
        
        if (stats.size === 0) {
          return {
            success: false,
            error: "Audio file was created but is empty",
            errorCode: "EMPTY_AUDIO_FILE"
          };
        }
        
        console.log(`✓ Audio file created successfully: ${outputPath} (${stats.size} bytes)`);
        return { success: true };
      } catch (fileError) {
        return {
          success: false,
          error: `Audio generation completed but file verification failed: ${fileError.message}`,
          errorCode: "FILE_VERIFICATION_FAILED"
        };
      }
    } catch (error) {
      const errorResponse = this.handleElevenLabsError(error, "audio generation");
      
      // Add additional context for 404 errors
      if (errorResponse.errorCode === "INVALID_VOICE_ID") {
        console.error(`Voice ID "${this.voiceId}" not found. This usually means:`);
        console.error("1. The voice ID is incorrect or misspelled");
        console.error("2. The voice has been deleted from your ElevenLabs account");
        console.error("3. You don't have access to this voice");
        console.error("Use the /voices endpoint to see available voices");
      }
      
      return errorResponse;
    }
  }

  /**
   * Comprehensive error handler for ElevenLabs API errors
   * @param {Error} error - The error object
   * @param {string} context - Context where the error occurred
   * @returns {Object} Standardized error response
   */
  handleElevenLabsError(error, context = "ElevenLabs operation") {
    console.error(`ElevenLabs error during ${context}:`, {
      message: error.message,
      stack: error.stack?.split('\n')[0], // First line of stack trace
      context
    });

    // Handle different types of errors
    if (error.message) {
      const message = error.message.toLowerCase();
      const originalMessage = error.message;
      
      // API Key related errors (401 Unauthorized)
      if (message.includes('unauthorized') || message.includes('401')) {
        return {
          isValid: false,
          success: false,
          error: "Invalid ElevenLabs API key. Please verify your ELEVEN_LABS_API_KEY environment variable is correct.",
          errorCode: "INVALID_API_KEY",
          originalError: originalMessage,
          suggestions: [
            "Check that your API key is correctly set in the .env file",
            "Verify the API key hasn't expired or been revoked",
            "Ensure there are no extra spaces or characters in the API key"
          ]
        };
      }
      
      // Voice ID related errors (404 Not Found)
      if (message.includes('not found') || message.includes('404')) {
        return {
          isValid: false,
          success: false,
          error: `Voice ID "${this.voiceId}" not found. This voice may not exist or you may not have access to it.`,
          errorCode: "INVALID_VOICE_ID",
          originalError: originalMessage,
          currentVoiceId: this.voiceId,
          suggestions: [
            "Use the /voices endpoint to see your available voices",
            "Check if the voice ID is spelled correctly",
            "Verify you have access to this voice in your ElevenLabs account",
            "Try using a different voice ID from your available voices"
          ]
        };
      }
      
      // Rate limiting errors (429 Too Many Requests)
      if (message.includes('rate limit') || message.includes('429')) {
        return {
          isValid: false,
          success: false,
          error: "ElevenLabs API rate limit exceeded. Please wait before making more requests.",
          errorCode: "RATE_LIMITED",
          originalError: originalMessage,
          retryable: true,
          suggestions: [
            "Wait a few seconds before retrying",
            "Implement exponential backoff for retries",
            "Consider upgrading your ElevenLabs plan for higher rate limits"
          ]
        };
      }
      
      // Quota/billing errors (402 Payment Required)
      if (message.includes('quota') || message.includes('billing') || message.includes('402')) {
        return {
          isValid: false,
          success: false,
          error: "ElevenLabs API quota exceeded or billing issue. Please check your account status.",
          errorCode: "QUOTA_EXCEEDED",
          originalError: originalMessage,
          suggestions: [
            "Check your ElevenLabs account usage and billing status",
            "Upgrade your plan if you've exceeded your quota",
            "Verify your payment method is valid"
          ]
        };
      }
      
      // Network/connectivity errors
      if (message.includes('network') || message.includes('timeout') || message.includes('enotfound') || 
          message.includes('econnrefused') || message.includes('econnreset')) {
        return {
          isValid: false,
          success: false,
          error: "Network error connecting to ElevenLabs API. Please check your internet connection.",
          errorCode: "NETWORK_ERROR",
          originalError: originalMessage,
          retryable: true,
          suggestions: [
            "Check your internet connection",
            "Verify firewall settings allow outbound HTTPS connections",
            "Try again in a few moments"
          ]
        };
      }
      
      // Server errors (5xx)
      if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
        return {
          isValid: false,
          success: false,
          error: "ElevenLabs API server error. This is likely a temporary issue on their end.",
          errorCode: "SERVER_ERROR",
          originalError: originalMessage,
          retryable: true,
          suggestions: [
            "Try again in a few minutes",
            "Check ElevenLabs status page for known issues"
          ]
        };
      }
    }

    // Generic error fallback
    return {
      isValid: false,
      success: false,
      error: `ElevenLabs ${context} failed: ${error.message || 'Unknown error'}`,
      errorCode: "UNKNOWN_ERROR",
      originalError: error.message,
      suggestions: [
        "Check the error details above",
        "Verify your ElevenLabs configuration",
        "Try again or contact support if the issue persists"
      ]
    };
  }

  /**
   * Performs a comprehensive validation of the ElevenLabs configuration
   * @returns {Promise<Object>} Complete validation status
   */
  async performFullValidation() {
    const results = {
      timestamp: new Date().toISOString(),
      apiKey: { configured: !!this.apiKey },
      voiceId: { configured: !!this.voiceId },
      connectivity: { isValid: false },
      voiceValidation: { isValid: false },
      overallStatus: "invalid"
    };

    // Test API credentials
    const credentialTest = await this.validateCredentials();
    results.connectivity = credentialTest;

    if (credentialTest.isValid) {
      // Test voice ID if credentials are valid
      const voiceTest = await this.validateVoiceId();
      results.voiceValidation = voiceTest;
      
      if (voiceTest.isValid) {
        results.overallStatus = "valid";
      }
    }

    return results;
  }
}

export default ElevenLabsService;
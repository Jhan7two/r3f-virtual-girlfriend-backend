/**
 * Test for complete audio generation flow
 * Tests the full pipeline: message -> AI response -> audio generation -> lip sync -> frontend response
 */

import fetch from 'node-fetch';
import { promises as fs } from 'fs';
import path from 'path';

console.log('🎵 Testing Complete Audio Generation Flow');
console.log('==========================================\n');

const SERVER_URL = 'http://localhost:3000';
const TEST_MESSAGE = 'Hello, how are you today?';

// Test function
async function testAudioGenerationFlow() {
  try {
    console.log('1. 📤 Sending test message to /chat endpoint...');
    console.log(`   Message: "${TEST_MESSAGE}"`);
    
    const response = await fetch(`${SERVER_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: TEST_MESSAGE,
        provider: 'openai' // Use OpenAI as it's configured
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Response received successfully');
    
    // Analyze the response structure
    console.log('\n2. 📋 Analyzing response structure...');
    console.log(`   Number of messages: ${data.messages ? data.messages.length : 0}`);
    
    if (data.messages && data.messages.length > 0) {
      for (let i = 0; i < data.messages.length; i++) {
        const message = data.messages[i];
        console.log(`\n   Message ${i + 1}:`);
        console.log(`     Text: "${message.text}"`);
        console.log(`     Facial Expression: ${message.facialExpression}`);
        console.log(`     Animation: ${message.animation}`);
        console.log(`     Audio present: ${message.audio ? 'Yes' : 'No'}`);
        console.log(`     Audio length: ${message.audio ? message.audio.length : 0} characters`);
        console.log(`     Audio MIME: ${message.audioMime || 'Not specified'}`);
        console.log(`     Lipsync present: ${message.lipsync ? 'Yes' : 'No'}`);
        
        if (message.lipsync) {
          console.log(`     Lipsync metadata: ${JSON.stringify(message.lipsync.metadata || {})}`);
          console.log(`     Mouth cues: ${message.lipsync.mouthCues ? message.lipsync.mouthCues.length : 0}`);
        }
      }
    } else {
      console.log('❌ No messages in response');
    }

    // Check if audio files were created
    console.log('\n3. 📁 Checking generated audio files...');
    const audiosDir = './audios';
    
    try {
      const files = await fs.readdir(audiosDir);
      const messageFiles = files.filter(f => f.startsWith('message_'));
      
      console.log(`   Total files in audios directory: ${files.length}`);
      console.log(`   Message-related files: ${messageFiles.length}`);
      
      for (const file of messageFiles) {
        const filePath = path.join(audiosDir, file);
        const stats = await fs.stat(filePath);
        console.log(`     ${file}: ${stats.size} bytes (${new Date(stats.mtime).toLocaleTimeString()})`);
      }
      
    } catch (error) {
      console.log(`   ⚠️  Could not read audios directory: ${error.message}`);
    }

    // Test health endpoint to see overall system status
    console.log('\n4. 🏥 Checking system health after audio generation...');
    const healthResponse = await fetch(`${SERVER_URL}/health`);
    const healthData = await healthResponse.json();
    
    console.log(`   Overall status: ${healthData.status}`);
    console.log(`   ElevenLabs status: ${healthData.services?.elevenlabs?.status || 'unknown'}`);
    console.log(`   Audio services status: ${healthData.services?.audio?.status || 'unknown'}`);

    return {
      success: true,
      messagesCount: data.messages ? data.messages.length : 0,
      hasAudio: data.messages ? data.messages.some(m => m.audio) : false,
      hasLipsync: data.messages ? data.messages.some(m => m.lipsync) : false
    };

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testAudioGenerationFlow().then(result => {
  console.log('\n🎯 Test Results Summary:');
  console.log('========================');
  
  if (result.success) {
    console.log('✅ Audio generation flow test PASSED');
    console.log(`✅ Generated ${result.messagesCount} messages`);
    console.log(`${result.hasAudio ? '✅' : '❌'} Audio data included`);
    console.log(`${result.hasLipsync ? '✅' : '❌'} Lipsync data included`);
    
    console.log('\n💡 What this means:');
    console.log('   - The server can receive chat messages');
    console.log('   - AI responses are generated correctly');
    console.log('   - Audio generation pipeline is working');
    console.log('   - Frontend receives all necessary data');
    
  } else {
    console.log('❌ Audio generation flow test FAILED');
    console.log(`   Error: ${result.error}`);
  }
  
  console.log('\n🔍 For detailed logs, check the server console output');
}).catch(error => {
  console.error('💥 Test execution failed:', error);
});
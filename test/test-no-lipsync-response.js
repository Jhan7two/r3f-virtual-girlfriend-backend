/**
 * Test to verify chat endpoint works without lipsync data
 */

import fetch from 'node-fetch';

console.log('🚀 Testing Chat Endpoint Without Lipsync Data');
console.log('=============================================\n');

const SERVER_URL = 'http://localhost:3000';

async function testChatWithoutLipsync() {
  console.log('1. 📤 Testing default message (no user input)...');
  
  try {
    const response = await fetch(`${SERVER_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });

    const data = await response.json();
    
    if (!data.messages || data.messages.length === 0) {
      console.log('❌ No messages received');
      return;
    }

    console.log(`✅ Received ${data.messages.length} default messages\n`);

    // Analyze each message
    for (let i = 0; i < data.messages.length; i++) {
      const message = data.messages[i];
      
      console.log(`📋 Message ${i + 1} Analysis:`);
      console.log(`   Text: "${message.text}"`);
      console.log(`   Animation: ${message.animation}`);
      console.log(`   Facial Expression: ${message.facialExpression}`);
      
      // Check audio data
      if (message.audio) {
        console.log(`   ✅ Audio: ${message.audio.length} chars (${message.audioMime})`);
      } else {
        console.log(`   ❌ Audio: Missing`);
      }
      
      // Verify lipsync is NOT present
      if (message.lipsync) {
        console.log(`   ❌ Lipsync: Should NOT be present but found`);
      } else {
        console.log(`   ✅ Lipsync: Correctly removed`);
      }
      
      console.log(''); // Empty line between messages
    }

    // Verify required fields are present (except lipsync)
    console.log('🔍 Response Structure Check:');
    
    const firstMessage = data.messages[0];
    const requiredFields = ['text', 'animation', 'facialExpression', 'audio', 'audioMime'];
    const missingFields = requiredFields.filter(field => !firstMessage[field]);
    
    if (missingFields.length === 0) {
      console.log('✅ All required fields present (without lipsync)');
    } else {
      console.log('❌ Missing fields:', missingFields);
    }
    
    // Verify lipsync is not in any message
    const hasLipsync = data.messages.some(msg => msg.lipsync);
    if (!hasLipsync) {
      console.log('✅ Lipsync field successfully removed from all messages');
    } else {
      console.log('❌ Lipsync field still present in some messages');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testChatWithoutLipsync().then(() => {
  console.log('\n🎯 NO-LIPSYNC RESPONSE TEST COMPLETE!');
  console.log('\n💡 Next steps:');
  console.log('   1. Frontend should use wawa-lipsync for real-time processing');
  console.log('   2. Backend no longer needs to generate lipsync data');
  console.log('   3. Response structure is simplified and faster');
  
}).catch(error => {
  console.error('💥 Test execution failed:', error);
});
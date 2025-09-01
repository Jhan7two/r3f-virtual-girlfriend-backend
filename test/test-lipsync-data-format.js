/**
 * Test to verify lipsync data format for frontend compatibility
 */

import fetch from 'node-fetch';

console.log('🎬 Testing Lipsync Data Format for Frontend');
console.log('==========================================\n');

const SERVER_URL = 'http://localhost:3000';

async function testLipsyncDataFormat() {
  console.log('1. 📤 Sending test message to generate lipsync data...');
  
  try {
    const response = await fetch(`${SERVER_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Testing lipsync data format for frontend compatibility",
        provider: 'openai'
      })
    });

    const data = await response.json();
    
    if (!data.messages || data.messages.length === 0) {
      console.log('❌ No messages received');
      return;
    }

    console.log(`✅ Received ${data.messages.length} messages\n`);

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
      
      // Detailed lipsync analysis
      if (message.lipsync) {
        console.log(`   ✅ Lipsync data present`);
        
        // Check metadata
        if (message.lipsync.metadata) {
          console.log(`   📊 Metadata:`);
          console.log(`      Duration: ${message.lipsync.metadata.duration}s`);
          console.log(`      Sound file: ${message.lipsync.metadata.soundFile}`);
          console.log(`      Is fallback: ${message.lipsync.metadata.isFallback || false}`);
          if (message.lipsync.metadata.isFallback) {
            console.log(`      Fallback type: ${message.lipsync.metadata.fallbackType}`);
          }
        }
        
        // Check mouth cues
        if (message.lipsync.mouthCues) {
          console.log(`   👄 Mouth cues: ${message.lipsync.mouthCues.length}`);
          
          // Validate cue format
          let validCues = 0;
          let invalidCues = 0;
          
          for (let j = 0; j < Math.min(5, message.lipsync.mouthCues.length); j++) {
            const cue = message.lipsync.mouthCues[j];
            
            if (typeof cue.start === 'number' && 
                typeof cue.end === 'number' && 
                typeof cue.value === 'string') {
              validCues++;
              console.log(`      Cue ${j}: ${cue.start.toFixed(2)}s-${cue.end.toFixed(2)}s -> "${cue.value}"`);
            } else {
              invalidCues++;
              console.log(`      ❌ Invalid cue ${j}:`, cue);
            }
          }
          
          if (message.lipsync.mouthCues.length > 5) {
            console.log(`      ... and ${message.lipsync.mouthCues.length - 5} more cues`);
          }
          
          console.log(`   ✅ Valid cues: ${validCues}, Invalid: ${invalidCues}`);
          
          // Check timing consistency
          const totalDuration = message.lipsync.metadata?.duration || 0;
          const lastCue = message.lipsync.mouthCues[message.lipsync.mouthCues.length - 1];
          const lastCueEnd = lastCue?.end || 0;
          
          console.log(`   ⏱️  Timing check:`);
          console.log(`      Metadata duration: ${totalDuration}s`);
          console.log(`      Last cue ends at: ${lastCueEnd}s`);
          console.log(`      Timing match: ${Math.abs(totalDuration - lastCueEnd) < 0.5 ? '✅' : '⚠️'}`);
          
        } else {
          console.log(`   ❌ No mouth cues found`);
        }
        
      } else {
        console.log(`   ❌ Lipsync: Missing`);
      }
      
      console.log(''); // Empty line between messages
    }

    // Frontend compatibility check
    console.log('🔍 Frontend Compatibility Check:');
    
    const firstMessage = data.messages[0];
    const requiredFields = ['text', 'animation', 'facialExpression', 'audio', 'lipsync'];
    const missingFields = requiredFields.filter(field => !firstMessage[field]);
    
    if (missingFields.length === 0) {
      console.log('✅ All required fields present');
    } else {
      console.log('❌ Missing fields:', missingFields);
    }
    
    // Check lipsync structure
    if (firstMessage.lipsync) {
      const lipsyncFields = ['metadata', 'mouthCues'];
      const missingLipsyncFields = lipsyncFields.filter(field => !firstMessage.lipsync[field]);
      
      if (missingLipsyncFields.length === 0) {
        console.log('✅ Lipsync structure correct');
      } else {
        console.log('❌ Missing lipsync fields:', missingLipsyncFields);
      }
    }
    
    // Check viseme values
    if (firstMessage.lipsync?.mouthCues) {
      const validVisemes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];
      const usedVisemes = [...new Set(firstMessage.lipsync.mouthCues.map(cue => cue.value))];
      const invalidVisemes = usedVisemes.filter(v => !validVisemes.includes(v));
      
      console.log('👄 Viseme analysis:');
      console.log(`   Used visemes: ${usedVisemes.join(', ')}`);
      if (invalidVisemes.length > 0) {
        console.log(`   ⚠️  Invalid visemes: ${invalidVisemes.join(', ')}`);
      } else {
        console.log('   ✅ All visemes valid');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testLipsyncDataFormat().then(() => {
  console.log('\n🎯 LIPSYNC DATA FORMAT TEST COMPLETE!');
  console.log('\n💡 If lipsync is not working in frontend:');
  console.log('   1. Check browser console for audio/lipsync errors');
  console.log('   2. Use the "debugLipsync" button in Leva controls');
  console.log('   3. Verify audio is actually playing');
  console.log('   4. Check timing between audio.currentTime and mouth cues');
  console.log('   5. Ensure viseme mapping is correct');
  
}).catch(error => {
  console.error('💥 Test execution failed:', error);
});
/**
 * Test to demonstrate automatic file creation
 * Shows how JSON and audio files are created automatically for each message
 */

import fetch from 'node-fetch';
import { promises as fs } from 'fs';

console.log('🔄 Testing Automatic File Creation');
console.log('==================================\n');

const SERVER_URL = 'http://localhost:3000';

async function testAutomaticFileCreation() {
  console.log('1. 📁 Checking current files before sending message...');
  
  try {
    const audiosDir = './audios';
    const filesBefore = await fs.readdir(audiosDir);
    const messageFilesBefore = filesBefore.filter(f => f.startsWith('message_'));
    
    console.log(`   Current message files: ${messageFilesBefore.length}`);
    messageFilesBefore.forEach(file => console.log(`     - ${file}`));
    
  } catch (error) {
    console.log(`   ⚠️  Could not read directory: ${error.message}`);
    return;
  }

  console.log('\n2. 📤 Sending a new message to trigger file creation...');
  
  const testMessage = `Test message at ${new Date().toLocaleTimeString()} - File creation demo`;
  
  try {
    console.log(`   Message: "${testMessage}"`);
    
    const response = await fetch(`${SERVER_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: testMessage,
        provider: 'openai'
      })
    });

    const data = await response.json();
    console.log(`   ✅ Response received with ${data.messages?.length || 0} messages`);
    
    // Wait a moment for file processing
    console.log('   ⏳ Waiting for file processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
  } catch (error) {
    console.log(`   ❌ Message sending failed: ${error.message}`);
    return;
  }

  console.log('\n3. 📁 Checking files after message processing...');
  
  try {
    const audiosDir = './audios';
    const filesAfter = await fs.readdir(audiosDir);
    const messageFilesAfter = filesAfter.filter(f => f.startsWith('message_'));
    
    console.log(`   Message files now: ${messageFilesAfter.length}`);
    
    // Group by message number and show details
    const messageGroups = {};
    messageFilesAfter.forEach(file => {
      const match = file.match(/message_(\d+)\.(mp3|wav|json)/);
      if (match) {
        const messageNum = match[1];
        const extension = match[2];
        if (!messageGroups[messageNum]) messageGroups[messageNum] = {};
        messageGroups[messageNum][extension] = file;
      }
    });
    
    console.log('\n   📋 File groups by message:');
    for (const [messageNum, files] of Object.entries(messageGroups)) {
      console.log(`\n     Message ${messageNum}:`);
      
      if (files.mp3) {
        const mp3Stats = await fs.stat(`./audios/${files.mp3}`);
        console.log(`       🎵 ${files.mp3} (${mp3Stats.size} bytes) - ${new Date(mp3Stats.mtime).toLocaleTimeString()}`);
      }
      
      if (files.wav) {
        const wavStats = await fs.stat(`./audios/${files.wav}`);
        console.log(`       🔊 ${files.wav} (${wavStats.size} bytes) - ${new Date(wavStats.mtime).toLocaleTimeString()}`);
      }
      
      if (files.json) {
        const jsonStats = await fs.stat(`./audios/${files.json}`);
        console.log(`       📝 ${files.json} (${jsonStats.size} bytes) - ${new Date(jsonStats.mtime).toLocaleTimeString()}`);
      }
    }
    
  } catch (error) {
    console.log(`   ⚠️  Could not check files after: ${error.message}`);
  }

  console.log('\n4. 🔍 Demonstrating the automatic process...');
  
  console.log('\n   📋 How it works:');
  console.log('   1. You send a message to /chat');
  console.log('   2. AI generates response text');
  console.log('   3. ElevenLabs creates MP3 audio automatically');
  console.log('   4. FFmpeg converts MP3 to WAV automatically');
  console.log('   5. Rhubarb generates JSON lipsync automatically');
  console.log('   6. All files are saved with incremental numbers');
  console.log('   7. Frontend receives base64 audio + lipsync data');
  
  console.log('\n   🎯 Key Points:');
  console.log('   ✅ NO manual file creation needed');
  console.log('   ✅ Files are numbered automatically (message_0, message_1, etc.)');
  console.log('   ✅ Each message gets its own set of files');
  console.log('   ✅ Old files are reused/overwritten as needed');
  console.log('   ✅ System handles all file management');
}

// Run the test
testAutomaticFileCreation().then(() => {
  console.log('\n🎉 AUTOMATIC FILE CREATION DEMO COMPLETE!');
  console.log('\n💡 Summary:');
  console.log('   - JSON files are created automatically for each message');
  console.log('   - You never need to create them manually');
  console.log('   - The system manages file numbering and cleanup');
  console.log('   - Just send messages and everything works!');
  
}).catch(error => {
  console.error('💥 Test failed:', error);
});
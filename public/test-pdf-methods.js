// Test script to verify PDF loading methods
console.log('🔍 Testing PDF loading methods...');

// Function to test data URL generation
async function testDataURLMethod() {
  try {
    // Create a simple test PDF in memory
    const testPDFData = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, // %PDF-1.4
      0x0A, 0x25, 0xC4, 0xE5, 0xF2, 0xE5, 0xEB, 0xA7, 
      0xF3, 0xA0, 0xD0, 0xC4, 0xC6, 0x0A
    ]);
    
    const blob = new Blob([testPDFData], { type: 'application/pdf' });
    
    // Test data URL creation
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    
    console.log('✅ Data URL method works:', dataUrl.substring(0, 50) + '...');
    return true;
  } catch (error) {
    console.error('❌ Data URL method failed:', error);
    return false;
  }
}

// Function to test blob URL generation
async function testBlobURLMethod() {
  try {
    const testPDFData = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34,
      0x0A, 0x25, 0xC4, 0xE5, 0xF2, 0xE5, 0xEB, 0xA7
    ]);
    
    const blob = new Blob([testPDFData], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    
    console.log('✅ Blob URL method works:', blobUrl);
    
    // Clean up
    URL.revokeObjectURL(blobUrl);
    return true;
  } catch (error) {
    console.error('❌ Blob URL method failed:', error);
    return false;
  }
}

// Run tests
async function runTests() {
  console.log('🧪 Running PDF loading compatibility tests...');
  
  const dataUrlWorks = await testDataURLMethod();
  const blobUrlWorks = await testBlobURLMethod();
  
  console.log('\n📊 Test Results:');
  console.log(`Data URL Support: ${dataUrlWorks ? '✅' : '❌'}`);
  console.log(`Blob URL Support: ${blobUrlWorks ? '✅' : '❌'}`);
  
  if (dataUrlWorks) {
    console.log('\n🎯 Recommendation: Use data URLs for PDF viewing in this environment');
  } else if (blobUrlWorks) {
    console.log('\n🎯 Recommendation: Use blob URLs for PDF viewing');
  } else {
    console.log('\n⚠️ Warning: Neither method works, may need server-side solution');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testDataURLMethod, testBlobURLMethod, runTests };
} else {
  // Run immediately if in browser
  runTests();
}
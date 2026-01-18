// Use built-in fetch for Node.js 18+
const fetch = globalThis.fetch || require('node-fetch');

const API_BASE = 'http://localhost:5000/api';

// Test function to check API endpoints
async function testEndpoint(endpoint, method = 'GET', headers = {}, body = null) {
  try {
    console.log(`\n🔍 Testing ${method} ${endpoint}`);
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Response:`, JSON.stringify(data, null, 2));
    
    return { status: response.status, data };
  } catch (error) {
    console.error(`❌ Error testing ${endpoint}:`, error.message);
    return { error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Starting API Diagnostics...\n');
  
  // Test 1: Health check
  await testEndpoint('/health');
  
  // Test 2: Test endpoint
  await testEndpoint('/test');
  
  // Test 3: Try to get products without auth
  await testEndpoint('/products');
  
  // Test 4: Try vendor status without auth (should fail)
  await testEndpoint('/products/vendor/status');
  
  // Test 5: Try with mock auth token
  const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoidGVzdC11c2VyIiwiZW1haWwiOiJkZXYudW5pdHkuY2NAZ21haWwuY29tIiwibmFtZSI6IlRlc3QgVXNlciIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlfQ.test';
  
  await testEndpoint('/products/vendor/status', 'GET', {
    'Authorization': `Bearer ${mockToken}`
  });
  
  // Test 6: Try cart endpoint with auth
  await testEndpoint('/cart', 'GET', {
    'Authorization': `Bearer ${mockToken}`
  });
  
  // Test 7: Try wishlist endpoint with auth
  await testEndpoint('/wishlist', 'GET', {
    'Authorization': `Bearer ${mockToken}`
  });
  
  // Test 8: Try notifications endpoint with auth
  await testEndpoint('/notifications', 'GET', {
    'Authorization': `Bearer ${mockToken}`
  });
  
  console.log('\n✅ API Diagnostics Complete');
}

runTests().catch(console.error);
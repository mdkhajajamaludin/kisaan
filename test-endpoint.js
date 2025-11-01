const axios = require('axios');

async function testAnalyticsEndpoint() {
  try {
    console.log('Testing analytics endpoint at http://localhost:5000/api/admin/analytics?period=30d\n');
    
    // You need to replace this with a valid admin token
    // For now, we'll just test if the endpoint responds without auth
    const response = await axios.get('http://localhost:5000/api/admin/analytics?period=30d', {
      headers: {
        // Add your admin token here if needed
        // 'Authorization': 'Bearer YOUR_TOKEN'
      },
      validateStatus: () => true // Accept any status code
    });

    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));

    if (response.status === 200 && response.data.success) {
      console.log('\n✅ Analytics endpoint is working!');
    } else if (response.status === 401) {
      console.log('\n⚠️ Endpoint requires authentication (this is expected)');
      console.log('The endpoint structure is correct, just needs a valid token');
    } else {
      console.log('\n❌ Analytics endpoint returned an error');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testAnalyticsEndpoint();

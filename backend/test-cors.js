import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function testCORS() {
  console.log('Testing CORS configuration...\n');

  try {
    // Test with frontend origin
    console.log('Testing with frontend origin (localhost:5173)...');
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:5173'
      },
      body: JSON.stringify({
        username: 'testuser1',
        password: 'password123'
      })
    });

    console.log('Response status:', response.status);
    console.log('CORS headers:');
    console.log('  Access-Control-Allow-Origin:', response.headers.get('access-control-allow-origin'));
    console.log('  Access-Control-Allow-Credentials:', response.headers.get('access-control-allow-credentials'));
    console.log('  Access-Control-Allow-Methods:', response.headers.get('access-control-allow-methods'));
    console.log('  Access-Control-Allow-Headers:', response.headers.get('access-control-allow-headers'));

    if (response.ok) {
      const data = await response.json();
      console.log('✅ CORS test successful - login worked');
    } else {
      console.log('❌ CORS test failed - login failed');
    }

  } catch (error) {
    console.error('❌ CORS test error:', error.message);
  }
}

testCORS();

import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function testGetCurrentUser() {
  console.log('Testing getCurrentUser endpoint...\n');

  try {
    // Step 1: Login to get a token
    console.log('Step 1: Logging in to get token...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'testuser1',
        password: 'password123'
      })
    });

    if (!loginResponse.ok) {
      console.error('Login failed:', await loginResponse.text());
      return;
    }

    const loginData = await loginResponse.json();
    console.log('Login successful, token obtained');

    // Step 2: Test getCurrentUser with the token
    console.log('\nStep 2: Testing getCurrentUser with token...');
    const userResponse = await fetch(`${BASE_URL}/api/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${loginData.token}`,
        'Content-Type': 'application/json',
      }
    });

    console.log('getCurrentUser response status:', userResponse.status);
    console.log('getCurrentUser response headers:', Object.fromEntries(userResponse.headers.entries()));

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('getCurrentUser failed:', errorText);
      return;
    }

    const userData = await userResponse.json();
    console.log('getCurrentUser successful:', userData);

    // Step 3: Test without token (should fail)
    console.log('\nStep 3: Testing getCurrentUser without token (should fail)...');
    const noTokenResponse = await fetch(`${BASE_URL}/api/users/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    console.log('getCurrentUser without token status:', noTokenResponse.status);
    if (!noTokenResponse.ok) {
      const errorText = await noTokenResponse.text();
      console.log('getCurrentUser without token failed as expected:', errorText);
    }

    console.log('\n✅ getCurrentUser test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testGetCurrentUser();

import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function testFrontendLogin() {
  console.log('Testing frontend login flow...\n');

  try {
    // Step 1: Test login API call
    console.log('Step 1: Testing login API call...');
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

    console.log('Login response status:', loginResponse.status);
    console.log('Login response headers:', Object.fromEntries(loginResponse.headers.entries()));

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.error('Login failed:', errorText);
      return;
    }

    const loginData = await loginResponse.json();
    console.log('Login successful:', {
      user: loginData.user,
      token: loginData.token ? 'Present' : 'Missing'
    });

    // Step 2: Test getCurrentUser API call with token
    console.log('\nStep 2: Testing getCurrentUser API call...');
    const userResponse = await fetch(`${BASE_URL}/api/users/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${loginData.token}`,
        'Content-Type': 'application/json',
      }
    });

    console.log('GetCurrentUser response status:', userResponse.status);

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('GetCurrentUser failed:', errorText);
      return;
    }

    const userData = await userResponse.json();
    console.log('GetCurrentUser successful:', userData);

    // Step 3: Verify data consistency
    console.log('\nStep 3: Verifying data consistency...');
    console.log('Login user ID:', loginData.user.id);
    console.log('GetCurrentUser user ID:', userData.id);
    console.log('IDs match:', loginData.user.id === userData.id);

    console.log('\n✅ Frontend login flow test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFrontendLogin();

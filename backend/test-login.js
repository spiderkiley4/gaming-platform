import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function testLogin() {
  const testCases = [
    {
      username: 'testuser1',
      password: 'password123',
      description: 'Valid login'
    },
    {
      username: 'nonexistent',
      password: 'password123',
      description: 'Invalid username'
    },
    {
      username: 'testuser1',
      password: 'wrongpassword',
      description: 'Invalid password'
    },
    {
      username: '',
      password: 'password123',
      description: 'Empty username'
    },
    {
      username: 'testuser1',
      password: '',
      description: 'Empty password'
    }
  ];

  console.log('Testing login endpoint...\n');

  for (const testCase of testCases) {
    try {
      console.log(`Testing: ${testCase.description}`);
      console.log(`  Username: ${testCase.username}, Password: ${testCase.password ? '***' : 'empty'}`);
      
      const startTime = Date.now();
      
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: testCase.username,
          password: testCase.password
        })
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const data = await response.json();
      
      if (response.ok) {
        console.log(`  ✅ SUCCESS: Login successful (${duration}ms)`);
        console.log(`    User ID: ${data.user.id}`);
        console.log(`    Token: ${data.token ? 'Present' : 'Missing'}`);
      } else {
        console.log(`  ❌ FAILED: ${data.error} (${duration}ms)`);
      }
      
      console.log('');
    } catch (error) {
      console.log(`  ❌ ERROR: ${error.message}`);
      console.log('');
    }
  }
}

testLogin();

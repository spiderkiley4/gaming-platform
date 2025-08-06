import fetch from 'node-fetch';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function testRegistration() {
  const testCases = [
    {
      username: 'testuser1',
      email: 'test1@example.com',
      password: 'password123',
      description: 'Basic registration'
    },
    {
      username: 'TESTUSER2',
      email: 'TEST2@EXAMPLE.COM',
      password: 'password123',
      description: 'Uppercase username and email'
    },
    {
      username: 'TestUser3',
      email: 'Test3@Example.com',
      password: 'password123',
      description: 'Mixed case username and email'
    },
    {
      username: 'testuser1',
      email: 'test4@example.com',
      password: 'password123',
      description: 'Duplicate username (should fail)'
    },
    {
      username: 'testuser4',
      email: 'test1@example.com',
      password: 'password123',
      description: 'Duplicate email (should fail)'
    }
  ];

  console.log('Testing registration endpoint...\n');

  for (const testCase of testCases) {
    try {
      console.log(`Testing: ${testCase.description}`);
      console.log(`  Username: ${testCase.username}, Email: ${testCase.email}`);
      
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: testCase.username,
          email: testCase.email,
          password: testCase.password
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        console.log(`  ✅ SUCCESS: User created with ID ${data.user.id}`);
      } else {
        console.log(`  ❌ FAILED: ${data.error}`);
      }
      
      console.log('');
    } catch (error) {
      console.log(`  ❌ ERROR: ${error.message}`);
      console.log('');
    }
  }
}

testRegistration(); 
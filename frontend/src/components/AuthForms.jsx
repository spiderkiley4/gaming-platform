import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../api';

export default function AuthForms() {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { loginUser, registerUser, setUser } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });

  const validateStep1 = () => {
    if (!formData.username || formData.username.length < 3) {
      setError('Username must be at least 3 characters long');
      return false;
    }
    if (!isLogin && (!formData.email || !formData.email.includes('@'))) {
      setError('Please enter a valid email address');
      return false;
    }
    return true;
  };

  const handleContinue = () => {
    setError('');
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    
    console.log('Starting login process...');
    
    if (step === 1 && !isLogin) {
      handleContinue();
      setIsLoading(false);
      return;
    }

    try {
      if (isLogin) {
        console.log('Attempting login with:', { username: formData.username, password: formData.password ? '***' : 'empty' });
        const result = await loginUser(formData.username, formData.password);
        console.log('Login successful:', result);
      } else {
        if (!formData.password || formData.password.length < 6) {
          setError('Password must be at least 6 characters long');
          setIsLoading(false);
          return;
        }
        console.log('Attempting registration with:', { username: formData.username, email: formData.email, password: formData.password ? '***' : 'empty' });
        const result = await registerUser(formData.username, formData.email, formData.password);
        console.log('Registration successful:', result);
      }
    } catch (err) {
      console.error('Login/Registration error:', err);
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      console.log('Login process completed, setting loading to false');
      setIsLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setError('');
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleBack = () => {
    setStep(1);
    setError('');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-96">
        <h2 className="text-2xl font-bold mb-6 text-white text-center">
          {isLogin ? 'Login' : `Register ${step === 1 ? '(Step 1/2)' : '(Step 2/2)'}`}
        </h2>

        {/* Debug test button */}
        <button
          onClick={async () => {
            console.log('Testing API connection...');
            try {
              const response = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'testuser1', password: 'password123' })
              });
              const data = await response.json();
              console.log('API test successful:', data);
              alert('API test successful! Check console for details.');
            } catch (error) {
              console.error('API test failed:', error);
              alert('API test failed! Check console for details.');
            }
          }}
          className="w-full mb-4 p-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Test API Connection
        </button>

        {/* Manual user state test */}
        <button
          onClick={() => {
            console.log('Manually setting user state...');
            const testUser = {
              id: 8,
              username: 'testuser1',
              email: 'test1@example.com',
              avatar_url: null,
              created_at: '2025-08-05T02:48:01.563Z'
            };
            localStorage.setItem('token', 'test-token');
            setUser(testUser);
            console.log('Test user state set:', testUser);
            alert('User state manually set! Check if the app switches to main view.');
          }}
          className="w-full mb-4 p-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Test User State
        </button>

        {/* Test getCurrentUser API */}
        <button
          onClick={async () => {
            console.log('Testing getCurrentUser API...');
            try {
              // First login to get a token
              const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'testuser1', password: 'password123' })
              });
              const loginData = await loginResponse.json();
              console.log('Login successful:', loginData);
              
              // Store the token
              localStorage.setItem('token', loginData.token);
              
              // Now test getCurrentUser
              const userResponse = await fetch(`${API_URL}/api/users/me`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${loginData.token}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (userResponse.ok) {
                const userData = await userResponse.json();
                console.log('getCurrentUser successful:', userData);
                alert('getCurrentUser API test successful! Check console for details.');
              } else {
                const errorText = await userResponse.text();
                console.error('getCurrentUser failed:', errorText);
                alert('getCurrentUser API test failed! Check console for details.');
              }
            } catch (error) {
              console.error('getCurrentUser test error:', error);
              alert('getCurrentUser API test error! Check console for details.');
            }
          }}
          className="w-full mb-4 p-2 bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          Test getCurrentUser API
        </button>

        {error && (
          <div className="bg-red-500 text-white p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 1 && (
            <>
              <div>
                <label className="block text-gray-300 mb-1">Username</label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleInputChange}
                  className="w-full p-2 bg-gray-700 rounded text-white"
                  required
                  minLength={3}
                />
              </div>

              {!isLogin && (
                <div>
                  <label className="block text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full p-2 bg-gray-700 rounded text-white"
                    required
                  />
                </div>
              )}
            </>
          )}

          {(step === 2 || isLogin) && (
            <div>
              <label className="block text-gray-300 mb-1">Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="w-full p-2 bg-gray-700 rounded text-white"
                required
                minLength={6}
              />
            </div>
          )}

          {!isLogin && step === 1 ? (
            <button
              type="button"
              onClick={handleContinue}
              className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              Continue
            </button>
          ) : (
            <button
              type="submit"
              className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isLogin ? 'Logging in...' : 'Registering...'}
                </span>
              ) : (
                isLogin ? 'Login' : 'Register'
              )}
            </button>
          )}
        </form>

        {!isLogin && step === 2 && (
          <button
            onClick={handleBack}
            className="mt-4 text-gray-400 hover:text-gray-300 text-sm w-full text-center"
          >
            ← Back
          </button>
        )}

        <p className="mt-4 text-center text-gray-400">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setStep(1);
              setError('');
              setFormData({ username: '', email: '', password: '' });
            }}
            className="ml-2 text-blue-400 hover:underline"
          >
            {isLogin ? 'Register' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}
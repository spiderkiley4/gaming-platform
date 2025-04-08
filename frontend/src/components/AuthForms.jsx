import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthForms() {
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const { loginUser, registerUser } = useAuth();
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
    
    if (step === 1 && !isLogin) {
      handleContinue();
      return;
    }

    try {
      if (isLogin) {
        await loginUser(formData.username, formData.password);
      } else {
        if (!formData.password || formData.password.length < 6) {
          setError('Password must be at least 6 characters long');
          return;
        }
        await registerUser(formData.username, formData.email, formData.password);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
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
              className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
            >
              Continue
            </button>
          ) : (
            <button
              type="submit"
              className="w-full bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
            >
              {isLogin ? 'Login' : 'Register'}
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
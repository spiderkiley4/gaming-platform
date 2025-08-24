import { AuthProvider, useAuth } from './src/context/AuthContext';

console.log('AuthProvider:', AuthProvider);
console.log('useAuth:', useAuth);

// Test if we can create a simple component
function TestComponent() {
  const auth = useAuth();
  return <div>Test</div>;
}

console.log('TestComponent created successfully');

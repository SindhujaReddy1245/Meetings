import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveUser } from '../services/userService';
import { ensureFrontendUserId } from '../utils/currentUser';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const persistUser = async (userData) => {
    const normalizedUser = ensureFrontendUserId(userData);

    try {
      await saveUser(normalizedUser);
    } catch (error) {
      console.error('Error saving user:', error);
    }
  };

  const handleGoogleSuccess = async (response) => {
    const user = jwtDecode(response.credential);
    const userData = {
      id: user.email,
      firebaseUid: user.sub,
      name: user.name,
      email: user.email,
      picture: user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`,
    };

    await persistUser(userData);
    window.location.href = '/';
  };

  const handleLogin = async (event) => {
    event.preventDefault();

    if (!email) {
      alert('Enter your Gmail');
      return;
    }

    const userData = {
      id: email,
      name: email,
      email,
      picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(email)}`,
    };

    await persistUser(userData);
    navigate('/');
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-100 to-purple-100">
      <div className="backdrop-blur-xl bg-white/70 border border-white/30 w-[380px] p-8 rounded-3xl shadow-xl">
        <h1 className="text-2xl font-semibold text-center mb-6 text-gray-800">Welcome</h1>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Enter your Gmail"
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
            className="px-4 py-3 rounded-xl bg-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-800"
          />

          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            required
            onChange={(event) => setPassword(event.target.value)}
            className="px-4 py-3 rounded-xl bg-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-gray-800"
          />

          <button
            type="submit"
            className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white py-3 rounded-xl transition shadow-lg"
          >
            Login
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-300"></div>
          <span className="text-gray-400 text-sm">OR</span>
          <div className="flex-1 h-px bg-gray-300"></div>
        </div>

        <div className="flex justify-center">
          <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => console.log('Login Failed')} />
        </div>
      </div>
    </div>
  );
}

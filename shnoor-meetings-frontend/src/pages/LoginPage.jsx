import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveUser } from '../services/userService';
import { clearStoredUser, ensureFrontendUserId, getAllowedStoredUser, isAllowedShnoorEmail } from '../utils/currentUser';

const backendAuthBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  'https://meetings-vr93.onrender.com'
).replace(/\/$/, '');

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const user = getAllowedStoredUser();
    if (user) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encodedUser = params.get('user');
    const authSuccess = params.get('auth_success');
    const authError = params.get('auth_error');

    if (authError) {
      alert(`Google login failed: ${authError}`);
      window.history.replaceState({}, document.title, '/login');
      return;
    }

    if (!authSuccess || !encodedUser) {
      return;
    }

    const completeGoogleLogin = async () => {
      try {
        const decodedPayload = atob(encodedUser.replace(/-/g, '+').replace(/_/g, '/'));
        const user = JSON.parse(decodedPayload);

        if (!isAllowedShnoorEmail(user?.email || '')) {
          clearStoredUser();
          alert('Invalid email received from Google login.');
          window.history.replaceState({}, document.title, '/login');
          return;
        }

        await persistUser(user);
        window.history.replaceState({}, document.title, '/login');
        navigate('/', { replace: true });
      } catch (error) {
        console.error('Failed to complete Google login.', error);
        alert('Google login could not be completed.');
        window.history.replaceState({}, document.title, '/login');
      }
    };

    completeGoogleLogin();
  }, [navigate]);

  const persistUser = async (userData) => {
    const normalizedUser = ensureFrontendUserId(userData);

    try {
      await saveUser(normalizedUser);
    } catch (error) {
      console.error('Error saving user:', error);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      alert('Enter your email');
      return;
    }

    if (!isAllowedShnoorEmail(normalizedEmail)) {
      alert('Enter a valid email address');
      return;
    }

    const userData = {
      id: normalizedEmail,
      name: normalizedEmail,
      email: normalizedEmail,
      picture: null,
    };

    await persistUser(userData);
    navigate('/');
  };

  const handleGoogleLogin = () => {
    window.location.href = `${backendAuthBaseUrl}/auth/google/login`;
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-100 to-purple-100">
      <div className="backdrop-blur-xl bg-white/70 border border-white/30 w-[380px] p-8 rounded-3xl shadow-xl">
        <h1 className="text-2xl font-semibold text-center mb-6 text-gray-800">Welcome</h1>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="Enter your email"
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
          <button
            type="button"
            onClick={handleGoogleLogin}
            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}

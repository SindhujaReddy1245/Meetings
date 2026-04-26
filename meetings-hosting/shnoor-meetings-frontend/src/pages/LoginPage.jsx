import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNowStrict, isAfter } from 'date-fns';
import { saveUser } from '../services/userService';
import { clearStoredUser, ensureFrontendUserId, getAllowedStoredUser, isAllowedShnoorEmail } from '../utils/currentUser';
import { buildApiUrl } from '../utils/api';
import {
  buildMeetingLink,
  formatEventDurationLabel,
  formatReminderOffsetLabel,
  normalizeEventCategory,
} from '../utils/calendarEventUtils';

const backendAuthBaseUrl = (
  import.meta.env.VITE_API_BASE_URL ||
  'https://meetings-vr93.onrender.com'
).replace(/\/$/, '');

function getCategoryLabel(category) {
  const normalized = normalizeEventCategory(category);
  if (normalized === 'personal') return 'Personal';
  if (normalized === 'reminders') return 'Reminder';
  return 'Meeting';
}

function getRemainingLabel(startTime) {
  const eventDate = new Date(startTime);
  if (!isAfter(eventDate, new Date())) {
    return 'Started or passed';
  }

  return `${formatDistanceToNowStrict(eventDate)} left`;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [calendarPreview, setCalendarPreview] = useState([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

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

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !isAllowedShnoorEmail(normalizedEmail)) {
      setCalendarPreview([]);
      setIsLoadingPreview(false);
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();

    const loadCalendarPreview = async () => {
      setIsLoadingPreview(true);

      try {
        const params = new URLSearchParams({ user_email: normalizedEmail });
        const response = await fetch(buildApiUrl(`/api/calendar/events?${params.toString()}`), {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const data = await response.json();
        if (!isCancelled) {
          setCalendarPreview(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!isCancelled && error.name !== 'AbortError') {
          console.error('Failed to load calendar preview.', error);
          setCalendarPreview([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPreview(false);
        }
      }
    };

    const timeoutId = window.setTimeout(loadCalendarPreview, 300);

    return () => {
      isCancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [email]);

  const upcomingCalendarPreview = useMemo(() => (
    [...calendarPreview]
      .filter((event) => event?.start_time)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      .slice(0, 5)
  ), [calendarPreview]);

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
      picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(normalizedEmail)}`,
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

        <div className="mt-6 rounded-2xl border border-indigo-100 bg-white/80 p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-800">Your Calendar Patch</h2>
          <p className="mt-1 text-xs text-gray-500">
            Enter your email to see your saved meetings, personal items, and reminders.
          </p>

          <div className="mt-4 space-y-3">
            {isLoadingPreview ? (
              <div className="rounded-xl bg-indigo-50 px-3 py-3 text-xs text-indigo-700">
                Loading your calendar items...
              </div>
            ) : upcomingCalendarPreview.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-xs text-gray-500">
                No saved calendar items found for this email yet.
              </div>
            ) : (
              upcomingCalendarPreview.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                      {getCategoryLabel(event.category)}
                    </span>
                    <span className="text-[11px] font-medium text-gray-500">
                      {getRemainingLabel(event.start_time)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-800">
                    {event.title || 'Untitled'}
                  </div>
                  <div className="mt-1 space-y-1 text-xs text-gray-600">
                    <div>{format(new Date(event.start_time), 'MMM d, yyyy - h:mm a')}</div>
                    <div>Duration: {formatEventDurationLabel(event.start_time, event.end_time)}</div>
                    <div>Reminder: {formatReminderOffsetLabel(event.reminder_offset_minutes)}</div>
                    {event.room_id && (
                      <div className="break-all">
                        Meeting link:{' '}
                        <a
                          href={buildMeetingLink(event.room_id)}
                          className="text-indigo-600 hover:underline"
                        >
                          {buildMeetingLink(event.room_id)}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

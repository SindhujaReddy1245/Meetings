import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import LandingPage from './pages/LandingPage';
import MeetingRoom from './pages/MeetingRoom';
import CalendarPage from './pages/CalendarPage';
import CallsPage from './pages/CallsPage';
import LeftMeetingPage from './pages/LeftMeetingPage';
import LobbyPage from './pages/LobbyPage';
import { applyThemePreference, getMeetingPreferences } from './utils/meetingUtils';

function App() {
  useEffect(() => {
    applyThemePreference(getMeetingPreferences().theme);
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/room/:id" element={<LobbyPage />} />
        <Route path="/meeting/:id" element={<MeetingRoom />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/calls" element={<CallsPage />} />
        <Route path="/left-meeting/:id" element={<LeftMeetingPage />} />
      </Routes>
    </Router>
  );
}

export default App;

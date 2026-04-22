import { useState, useEffect, useMemo } from 'react';
import { addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, isAfter } from 'date-fns';
import MeetingHeader from '../components/MeetingHeader';
import MeetingSidebar from '../components/MeetingSidebar';
import CalendarHeader from '../components/CalendarHeader';
import CalendarSidebar from '../components/CalendarSidebar';
import { MonthView, WeekView, DayView } from '../components/CalendarViews';
import EventModal from '../components/EventModal';
import { buildApiUrl } from '../utils/api';
import { getCurrentUser } from '../utils/currentUser';

export default function CalendarPage() {
  const currentUser = getCurrentUser();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('Month');
  const [events, setEvents] = useState([]);
  const [activeCategories, setActiveCategories] = useState(['personal', 'meetings', 'reminders']);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch(buildApiUrl('/api/calendar/events'));
      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  };

  const handlePrev = () => {
    if (view === 'Month') setCurrentDate(subMonths(currentDate, 1));
    else if (view === 'Week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const handleNext = () => {
    if (view === 'Month') setCurrentDate(addMonths(currentDate, 1));
    else if (view === 'Week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const handleToday = () => setCurrentDate(new Date());

  const handleDateClick = (date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setIsModalOpen(true);
  };

  const handleToggleCategory = (category) => {
    setActiveCategories((prev) => (
      prev.includes(category)
        ? prev.filter((item) => item !== category)
        : [...prev, category]
    ));
  };

  const handleSaveEvent = async (eventData) => {
    const isEditing = Boolean(selectedEvent?.id);
    const method = isEditing ? 'PUT' : 'POST';
    const url = isEditing
      ? buildApiUrl(`/api/calendar/events/${eventData.id}`)
      : buildApiUrl('/api/calendar/events');

    const payload = {
      ...eventData,
      user_id: currentUser?.meetingUserId || null,
      user_email: currentUser?.email || null,
      user_name: currentUser?.name || 'Guest',
      room_id: eventData.category === 'meetings'
        ? (eventData.room_id || eventData.id || crypto.randomUUID())
        : null,
    };

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await fetchEvents();
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error('Failed to save event:', err);
    }
  };

  const filteredEvents = useMemo(() => (
    events.filter((event) => activeCategories.includes(event.category || 'meetings'))
  ), [activeCategories, events]);

  const upcomingReminders = useMemo(() => (
    events
      .filter((event) => (event.category || 'meetings') === 'reminders' && isAfter(new Date(event.start_time), new Date()))
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
  ), [events]);

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden text-gray-900">
      <MeetingHeader />
      
      <div className="flex flex-1 overflow-hidden">
        <MeetingSidebar />
        <CalendarSidebar
          currentDate={currentDate}
          onDateSelect={setCurrentDate}
          onCreateEvent={() => {
            setSelectedEvent(null);
            setSelectedDate(new Date());
            setIsModalOpen(true);
          }}
          activeCategories={activeCategories}
          onToggleCategory={handleToggleCategory}
          upcomingReminders={upcomingReminders}
        />
        
        <main className="flex-1 flex flex-col min-w-0">
          <CalendarHeader 
            currentDate={currentDate} 
            onPrev={handlePrev} 
            onNext={handleNext} 
            onToday={handleToday}
            view={view}
            setView={setView}
          />
          {view === 'Month' && (
            <MonthView 
              currentDate={currentDate} 
              events={filteredEvents} 
              onDateClick={handleDateClick} 
            />
          )}
          {view === 'Week' && (
            <WeekView 
              currentDate={currentDate} 
              events={filteredEvents} 
              onSlotClick={handleDateClick} 
            />
          )}
          {view === 'Day' && (
            <DayView 
              currentDate={currentDate} 
              events={filteredEvents} 
              onSlotClick={handleDateClick} 
            />
          )}
        </main>
      </div>

      <EventModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedDate={selectedDate}
        onSave={handleSaveEvent}
        event={selectedEvent}
      />
    </div>
  );
}

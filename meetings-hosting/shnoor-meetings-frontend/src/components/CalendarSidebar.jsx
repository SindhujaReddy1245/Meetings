import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

export default function CalendarSidebar({ currentDate, onDateSelect, onCreateEvent }) {
  const [displayDate, setDisplayDate] = useState(currentDate);

  const handlePrevMonth = (e) => {
    e.stopPropagation();
    setDisplayDate(subMonths(displayDate, 1));
  };

  const handleNextMonth = (e) => {
    e.stopPropagation();
    setDisplayDate(addMonths(displayDate, 1));
  };
  
  const renderMiniCalendar = () => {
    const monthStart = startOfMonth(displayDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
      <div className="mt-6 px-2">
        <div className="flex items-center justify-between mb-4 px-2">
          <span className="text-sm font-medium text-gray-300">
            {format(displayDate, 'MMMM yyyy')}
          </span>
          <div className="flex gap-1">
            <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-700 rounded-full"><ChevronLeft size={16} /></button>
            <button onClick={handleNextMonth} className="p-1 hover:bg-gray-700 rounded-full"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {weekDays.map(day => (
            <div key={day} className="text-[10px] text-center font-bold text-gray-500 py-1">
              {day}
            </div>
          ))}
          {days.map(day => (
            <button
              key={day.toString()}
              onClick={() => onDateSelect(day)}
              className={`text-xs w-7 h-7 flex items-center justify-center rounded-full transition-colors mx-auto
                ${!isSameMonth(day, monthStart) ? 'text-gray-600' : 'text-gray-300'}
                ${isSameDay(day, currentDate) ? 'bg-blue-600 !text-white' : 'hover:bg-gray-700'}
                ${isSameDay(day, new Date()) && !isSameDay(day, currentDate) ? 'text-blue-400 border border-blue-400' : ''}
              `}
            >
              {format(day, 'd')}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <aside className="w-64 border-r border-gray-100 bg-white flex flex-col p-4 shadow-sm">
      <button 
        onClick={onCreateEvent}
        className="flex items-center gap-4 bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-full shadow-lg border border-gray-100 transition-all transform hover:scale-105 active:scale-95 mb-8 group"
      >
        <Plus size={28} className="text-blue-600 group-hover:rotate-90 transition-transform duration-300" />
        <span className="text-sm font-semibold">Create</span>
      </button>

      {renderMiniCalendar()}

      <div className="mt-10 px-2">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6 px-1">My Calendars</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer group transition-colors">
            <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-white" />
            <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">Personal</span>
          </label>
          <label className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer group transition-colors">
            <input type="checkbox" defaultChecked className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 bg-white" />
            <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">Meetings</span>
          </label>
          <label className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer group transition-colors">
            <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 bg-white" />
            <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">Reminders</span>
          </label>
        </div>
      </div>
    </aside>
  );
}

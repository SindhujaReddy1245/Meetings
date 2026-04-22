import { useState, useEffect } from 'react';
import { X, Clock, AlignLeft, Video, Calendar } from 'lucide-react';
import { format, addHours, startOfToday, isBefore } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

function toLocalDateTimeInputValue(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function EventModal({ isOpen, onClose, selectedDate, onSave, event = null }) {
  const [title, setTitle] = useState(event?.title || '');
  const [description, setDescription] = useState(event?.description || '');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [category, setCategory] = useState(event?.category || 'meetings');
  const [validationMessage, setValidationMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (event) {
        setTitle(event.title);
        setDescription(event.description);
        setStartTime(toLocalDateTimeInputValue(event.start_time));
        setEndTime(toLocalDateTimeInputValue(event.end_time));
        setCategory(event.category || 'meetings');
        setValidationMessage('');
      } else {
        setTitle('');
        setDescription('');
        const start = selectedDate || new Date();
        start.setHours(new Date().getHours() + 1, 0, 0, 0);
        const end = addHours(start, 1);
        setStartTime(format(start, "yyyy-MM-dd'T'HH:mm"));
        setEndTime(format(end, "yyyy-MM-dd'T'HH:mm"));
        setCategory('meetings');
        setValidationMessage('');
      }
    }
  }, [isOpen, event, selectedDate]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    if (isBefore(startDate, startOfToday())) {
      setValidationMessage('Only today and future dates can be saved in calendar.');
      return;
    }

    if (endDate < startDate) {
      setValidationMessage('End time must be after start time.');
      return;
    }

    setValidationMessage('');
    onSave({
      id: event?.id || crypto.randomUUID(),
      title: title || '(No title)',
      description,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      category,
      room_id: category === 'meetings' ? (event?.room_id || crypto.randomUUID()) : null,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-50 bg-white">
              <h3 className="text-xl font-semibold text-gray-800">
                {event ? 'Edit Event' : 'New Event'}
              </h3>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
              >
                <X size={22} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8">
              <div className="space-y-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Event Title</label>
                  <input
                    type="text"
                    placeholder="Add title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-2xl font-bold text-gray-800 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder-gray-400"
                    autoFocus
                  />
                </div>

                <div className="flex items-start gap-6 text-gray-600">
                  <div className="mt-8"><Clock size={20} className="text-gray-400" /></div>
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Start Time</label>
                      <input
                        type="datetime-local"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none w-full transition-all cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">End Time</label>
                      <input
                        type="datetime-local"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none w-full transition-all cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-gray-600">
                  <div><Video size={20} className="text-gray-400" /></div>
                  <button 
                    type="button"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-xl font-bold shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-3 transform active:scale-95"
                  >
                    Add Shnoor Meeting
                  </button>
                </div>

                <div className="flex items-start gap-6 text-gray-600">
                  <div className="mt-2"><Calendar size={20} className="text-gray-400" /></div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                    >
                      <option value="personal">Personal</option>
                      <option value="meetings">Meetings</option>
                      <option value="reminders">Reminders</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-start gap-6 text-gray-600">
                  <div className="mt-2"><AlignLeft size={20} className="text-gray-400" /></div>
                  <div className="flex-1 space-y-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Description</label>
                    <textarea
                      placeholder="Add description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-700 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none min-h-[120px] resize-none transition-all placeholder-gray-400"
                    />
                  </div>
                </div>

                {validationMessage && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {validationMessage}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-50">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-10 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-xl shadow-blue-100 transition-all transform hover:scale-105 active:scale-95"
                >
                  Save
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { Bot, Mic, Video, Send, X } from 'lucide-react';

export default function ChatbotPanel({ onClose }) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { sender: 'AI', text: 'Hello! I am your Shnoor Meeting Assistant. How can I help you today?' }
  ]);

  useEffect(() => {
    // Automatically connect to microphone and camera when chatbot opens
    let mediaStream = null;
    const initMedia = async () => {
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error('Error connecting to camera/mic for AI:', err);
      }
    };
    initMedia();

    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const userMsg = input.trim();
    setMessages(prev => [...prev, { sender: 'You', text: userMsg }]);
    setInput('');
    
    // Mock AI response
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        sender: 'AI', 
        text: `I heard you say: "${userMsg}". I am currently just a demo interface!` 
      }]);
    }, 1000);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col h-[500px] animate-in slide-in-from-bottom-5">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Bot size={20} />
          <span className="font-semibold">AI Assistant</span>
        </div>
        <button onClick={onClose} className="hover:bg-blue-700 p-1 rounded transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Mini Video Feed (Micro Camera) */}
      <div className="bg-gray-900 h-32 relative flex-shrink-0">
        {stream ? (
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline 
            className="w-full h-full object-cover mirror" 
            style={{ transform: 'scaleX(-1)' }}
          />
        ) : (
          <div className="flex w-full h-full items-center justify-center text-gray-500 flex-col gap-2">
            <div className="flex gap-2">
              <Video size={16} /> <Mic size={16} />
            </div>
            <span className="text-xs">Connecting...</span>
          </div>
        )}
        <div className="absolute bottom-2 right-2 bg-black/60 px-2 py-1 rounded text-white text-xs backdrop-blur-sm">
          Live Feed
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.sender === 'AI' ? 'items-start' : 'items-end'}`}>
            <span className="text-[10px] text-gray-400 mb-0.5 ml-1">{msg.sender}</span>
            <div className={`text-sm px-3 py-2 rounded-2xl max-w-[85%] ${msg.sender === 'AI' ? 'bg-white border border-gray-200 text-gray-800 rounded-tl-none' : 'bg-blue-600 text-white rounded-tr-none'}`}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSend} className="p-3 bg-white border-t border-gray-100 flex gap-2">
        <input 
          type="text" 
          placeholder="Ask me anything..." 
          className="flex-1 text-sm outline-none px-3 py-2 bg-gray-50 border border-gray-200 rounded-full focus:ring-2 focus:ring-blue-100 transition-all font-sans"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={!input.trim()} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white p-2 rounded-full transition-colors flex items-center justify-center flex-shrink-0">
          <Send size={16} className="-ml-0.5" />
        </button>
      </form>
    </div>
  );
}

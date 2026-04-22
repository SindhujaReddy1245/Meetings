import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWebRTC } from '../hooks/useWebRTC';
import VideoGrid from '../components/VideoGrid';
import MeetingControls from '../components/MeetingControls';
import { Send, Users, Info, Video, Check, X } from 'lucide-react';

export default function MeetingRoom() {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const {
    localStream,
    remoteStreams,
    messages,
    participantsMetadata,
    isSharingScreen,
    isHandRaised,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
    toggleRaiseHand,
    sendChatMessage,
    admitParticipant,
    denyParticipant,
    activeJoinRequests,
    isHost,
    mediaError,
    displayName,
    isAudioEnabled,
    isVideoEnabled,
  } = useWebRTC(roomId);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPeopleOpen, setIsPeopleOpen] = useState(false);
  const [isCaptionsOn, setIsCaptionsOn] = useState(false);
  const [currentCaptionText, setCurrentCaptionText] = useState('');
  const recognitionRef = useRef(null);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef(null);
  const isAdmitted = sessionStorage.getItem(`meeting_admitted_${roomId}`) === 'true';
  const latestJoinRequest = activeJoinRequests[0] || null;

  useEffect(() => {
    if (!isHost && !isAdmitted) {
      navigate(`/room/${roomId}`, { replace: true });
    }
  }, [isAdmitted, isHost, navigate, roomId]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      sendChatMessage(chatInput.trim());
      setChatInput('');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  useEffect(() => {
    if (isCaptionsOn) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        
        recognitionRef.current.onresult = (event) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              setCurrentCaptionText(event.results[i][0].transcript);
              setTimeout(() => setCurrentCaptionText(''), 5000); 
            } else {
              interimTranscript += event.results[i][0].transcript;
              setCurrentCaptionText(interimTranscript);
            }
          }
        };

        recognitionRef.current.onerror = (event) => {
          console.error("Speech recognition error", event.error);
        };

        try {
          recognitionRef.current.start();
        } catch (e) {
          console.error("Could not start recognition", e);
        }
      } else {
        alert("Your browser does not support live captions.");
        setIsCaptionsOn(false);
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        setCurrentCaptionText('');
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isCaptionsOn]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    alert('Meeting code copied to clipboard!');
  };

  return (
    <div className="h-screen w-full bg-gray-900 flex flex-col overflow-hidden text-white font-sans">
      {/* Top Header */}
      <header className="w-full p-4 flex items-center justify-between border-b border-gray-800 bg-gray-900/90 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse border border-red-400"></div>
          <span className="font-semibold text-lg tracking-wide hidden sm:block">Shnoor Meetings</span>
          <span className="text-gray-400 text-sm bg-gray-800 px-3 py-1 rounded border border-gray-700 ml-4 hidden md:inline-flex items-center cursor-pointer hover:bg-gray-700" onClick={copyRoomCode}>
            Code: {roomId} <Info size={14} className="ml-2" />
          </span>
        </div>
        <div className="flex items-center text-gray-400">
          <Users size={20} className="mr-2" /> 
          <span className="font-medium">{1 + Object.keys(remoteStreams).length}</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden p-4 relative w-full h-full gap-4">
        
        {/* Main Video Grid */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ${isChatOpen ? 'pr-0 md:pr-4 md:w-3/4' : 'w-full'}`}>
          <div className="flex-1 rounded-2xl overflow-hidden flex items-center justify-center p-2">
            {!localStream ? (
              <div className="flex flex-col items-center gap-6 text-center animate-in fade-in duration-700">
                <div className={`p-8 rounded-full bg-gray-800 ${!mediaError ? 'animate-pulse' : ''} border border-gray-700 transition-all`}>
                  <Video size={48} className={mediaError ? 'text-red-500' : 'text-blue-500'} />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold mb-2">
                    {mediaError ? 'Camera/Mic Access Failed' : 'Ready to join?'}
                  </h3>
                  <p className="text-gray-400 max-w-sm">
                    {mediaError 
                      ? `We couldn't access your hardware: ${mediaError}. Please check your browser permissions.`
                      : 'We are requesting access to your camera and microphone. Please click "Allow" in the browser prompt.'}
                  </p>
                  {mediaError && (
                    <button 
                      onClick={() => window.location.reload()}
                      className="mt-6 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold shadow-lg transition-all transform active:scale-95"
                    >
                      Retry Access
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <VideoGrid 
                localStream={localStream} 
                remoteStreams={remoteStreams} 
                participantsMetadata={participantsMetadata}
                localHandRaised={isHandRaised}
                localParticipantName={displayName || 'You'}
                isSharingScreen={isSharingScreen}
              />
            )}
            
            {isCaptionsOn && currentCaptionText && (
              <div className="absolute bottom-28 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-6 py-3 rounded-xl max-w-3xl text-center shadow-2xl z-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <p className="text-white text-lg font-medium tracking-wide">
                  {currentCaptionText}
                </p>
              </div>
            )}
          </div>
          
          {/* Floating Action Menu aligned bottom center */}
          <MeetingControls 
            roomId={roomId}
            onToggleVideo={toggleVideo}
            onToggleAudio={toggleAudio}
            onToggleScreenShare={toggleScreenShare}
            onToggleRaiseHand={toggleRaiseHand}
            onToggleCaptions={() => setIsCaptionsOn(!isCaptionsOn)}
            isSharingScreen={isSharingScreen}
            isHandRaised={isHandRaised}
            isCaptionsOn={isCaptionsOn}
            isAudioOn={isAudioEnabled}
            isVideoOn={isVideoEnabled}
            waitingCount={isHost ? activeJoinRequests.length : 0}
            toggleChatVisibility={() => {
              setIsChatOpen(!isChatOpen);
              if (!isChatOpen) setIsPeopleOpen(false);
            }}
            togglePeopleVisibility={() => {
              setIsPeopleOpen(!isPeopleOpen);
              if (!isPeopleOpen) setIsChatOpen(false);
            }}
          />
        </div>

        {/* Sliding Chat Sidebar */}
        {isChatOpen && (
          <aside className="fixed inset-y-0 right-0 z-20 w-80 bg-gray-800 border-l border-gray-700 flex flex-col shadow-2xl md:relative md:rounded-xl md:my-2 md:mr-2">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-xl">
              <h2 className="font-semibold text-lg">In-call messages</h2>
              <button className="text-gray-400 hover:text-white md:hidden" onClick={() => setIsChatOpen(false)}>✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm text-center px-4">
                  Messages can only be seen by people in the call and are deleted when the call ends.
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div key={idx} className={`flex flex-col ${m.sender === 'Me' ? 'items-end' : 'items-start'}`}>
                    <span className="text-xs text-gray-400 mb-1">{m.sender === 'Me' ? 'You' : m.sender}</span>
                    <div className={`px-4 py-2 rounded-2xl md:max-w-[85%] break-words ${m.sender === 'Me' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-700 text-white rounded-tl-none'}`}>
                      {m.text}
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700 bg-gray-800 rounded-b-xl">
              <div className="flex items-center bg-gray-700 rounded-full pr-1 shadow-inner focus-within:ring-2 focus-within:ring-blue-500">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a message..."
                  className="flex-1 bg-transparent border-none outline-none text-white py-3 px-4 placeholder-gray-400 text-sm"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full disabled:opacity-50 transition-colors m-1"
                >
                  <Send size={18} />
                </button>
              </div>
            </form>
          </aside>
        )}

        {/* Sliding People/Lobby Sidebar */}
        {isPeopleOpen && (
          <aside className="fixed inset-y-0 right-0 z-20 w-80 bg-gray-800 border-l border-gray-700 flex flex-col shadow-2xl md:relative md:rounded-xl md:my-2 md:mr-2">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800 rounded-t-xl">
              <h2 className="font-semibold text-lg">People</h2>
              <button className="text-gray-400 hover:text-white md:hidden" onClick={() => setIsPeopleOpen(false)}>✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Waiting Room / Lobby Section */}
              {isHost && (
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider text-xs">Waiting in Lobby</h3>
                    <span className="bg-blue-500 text-white px-2 py-0.5 rounded-full text-xs font-bold">{activeJoinRequests.length}</span>
                  </div>
                  {activeJoinRequests.length === 0 ? (
                    <div className="text-gray-500 text-sm italic py-2">No one is waiting in the lobby.</div>
                  ) : (
                    <div className="space-y-3">
                      {activeJoinRequests.map(req => (
                        <div key={req.id} className="flex items-center justify-between gap-3 p-3 bg-gray-700 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {req.name.charAt(0)}
                            </div>
                            <span className="text-sm font-medium text-white truncate">{req.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => admitParticipant(req.id)}
                              className="bg-blue-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-blue-500 transition-colors inline-flex items-center gap-1"
                            >
                              <Check size={14} />
                              Accept
                            </button>
                            <button
                              onClick={() => denyParticipant(req.id)}
                              className="bg-gray-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-gray-500 transition-colors inline-flex items-center gap-1"
                            >
                              <X size={14} />
                              Deny
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* In Call Section */}
              <div>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider text-xs mb-3">In Call</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                      {(displayName || 'You').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-white">
                      {displayName || 'You'} {isHost ? '(Host)' : '(You)'}
                    </span>
                  </div>
                  {Object.keys(remoteStreams).map(peerId => (
                    <div key={peerId} className="flex items-center gap-3 py-2">
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white text-xs font-bold">
                        {(participantsMetadata[peerId]?.name || 'Participant').charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-white">
                        {participantsMetadata[peerId]?.name || 'Participant'}
                        {participantsMetadata[peerId]?.role === 'host' ? ' (Host)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Join Requests Overlay (for Host) - Kept as a toast-like notification if sidebar is closed */}
        {isHost && activeJoinRequests.length > 0 && !isPeopleOpen && (
          <div className="fixed top-20 right-4 z-50 w-72 animate-in slide-in-from-right duration-500">
            <div className="bg-white rounded-2xl shadow-2xl p-4 border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-gray-800 font-bold text-sm">Join requests</h3>
                <button 
                  onClick={() => setIsPeopleOpen(true)}
                  className="bg-blue-100 text-blue-600 px-3 py-0.5 rounded-full text-xs font-bold hover:bg-blue-200"
                >
                  View ({activeJoinRequests.length})
                </button>
              </div>
              {latestJoinRequest && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold text-gray-900">{latestJoinRequest.name}</span> is waiting in the lobby.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => admitParticipant(latestJoinRequest.id)}
                      className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => denyParticipant(latestJoinRequest.id)}
                      className="flex-1 bg-gray-100 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold hover:bg-gray-200 transition-colors"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

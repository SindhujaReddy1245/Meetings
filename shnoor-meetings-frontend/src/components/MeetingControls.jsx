import { Mic, MicOff, Video, VideoOff, MessageSquare, PhoneOff, Monitor, Hand, Users, Type } from 'lucide-react';

export default function MeetingControls({ 
  roomId,
  onLeave,
  onToggleVideo, 
  onToggleAudio, 
  onToggleScreenShare,
  onToggleRaiseHand,
  onToggleCaptions,
  isSharingScreen,
  isHandRaised,
  isCaptionsOn,
  isVideoOn,
  isAudioOn,
  toggleChatVisibility, 
  togglePeopleVisibility,
  hasUnreadMessages,
  waitingCount,
}) {
  const handleVideo = () => {
    onToggleVideo();
  };

  const handleAudio = () => {
    onToggleAudio();
  };

  const leaveCall = () => {
    if (typeof onLeave === 'function') {
      onLeave();
    }
    // Use full navigation to guarantee immediate teardown of active media/WebRTC
    // sessions before rendering the post-call screen.
    window.location.assign(`/left-meeting/${roomId}`);
  };

  const btnBase = "p-4 rounded-full transition-all flex items-center justify-center transform hover:scale-105 shadow-lg";

  return (
    <div className="flex items-center justify-center gap-3 py-4 px-4 flex-wrap">
       <button
        onClick={handleAudio}
        title={isAudioOn ? "Mute" : "Unmute"}
        className={`${btnBase} ${isAudioOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
      >
        {isAudioOn ? <Mic size={22} /> : <MicOff size={22} />}
      </button>

      <button
        onClick={handleVideo}
        title={isVideoOn ? "Stop Video" : "Start Video"}
        className={`${btnBase} ${isVideoOn ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-red-500 hover:bg-red-600 text-white'}`}
      >
        {isVideoOn ? <Video size={22} /> : <VideoOff size={22} />}
      </button>

      <button
        onClick={onToggleScreenShare}
        title={isSharingScreen ? "Stop Presenting" : "Present Screen"}
        className={`${btnBase} ${isSharingScreen ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
      >
        <Monitor size={22} />
      </button>

      <button
        onClick={onToggleCaptions}
        title={isCaptionsOn ? "Turn off translation" : "Turn on translation"}
        className={`${btnBase} ${isCaptionsOn ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
      >
        <Type size={22} />
      </button>

      <button
        onClick={onToggleRaiseHand}
        title={isHandRaised ? "Lower Hand" : "Raise Hand"}
        className={`${btnBase} ${isHandRaised ? 'bg-yellow-500 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
      >
        <Hand size={22} />
      </button>

      <button
        onClick={togglePeopleVisibility}
        title={waitingCount > 0 ? `${waitingCount} waiting in lobby` : "Toggle Participants/Lobby"}
        className={`${btnBase} relative ${waitingCount > 0 ? 'bg-blue-600 hover:bg-blue-500 text-white animate-pulse' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
      >
        <Users size={22} />
        {waitingCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 border-2 border-gray-900 rounded-full flex items-center justify-center text-[11px] text-white font-bold leading-none shadow-md">
            {waitingCount}
          </span>
        )}
      </button>

      <button
        onClick={toggleChatVisibility}
        title="Toggle Chat"
        className={`${btnBase} bg-gray-700 hover:bg-gray-600 text-white relative`}
      >
        <MessageSquare size={22} />
        {hasUnreadMessages && (
          <span className="absolute top-1 right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
        )}
      </button>
      
      <button
        onClick={leaveCall}
        className={`${btnBase} bg-red-600 hover:bg-red-700 text-white px-6 rounded-full font-bold uppercase tracking-wider text-sm flex items-center gap-2`}
      >
        <PhoneOff size={22} />
        <span className="hidden sm:inline">Leave</span>
      </button>
    </div>
  );
}

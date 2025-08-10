import { useAudio } from '@/contexts/AudioContext';
import { Volume2, VolumeX } from 'lucide-react';

const SoundControl = () => {
  const { isMuted, toggleMute } = useAudio();

  return (
    <button onClick={toggleMute} className="sound-btn">
      {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      <span className="sr-only">{isMuted ? 'Unmute' : 'Mute'}</span>
    </button>
  );
};

export default SoundControl;
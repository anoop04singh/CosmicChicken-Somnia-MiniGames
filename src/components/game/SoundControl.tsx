import { useSound } from '@/contexts/SoundContext';
import { Volume2, VolumeX } from 'lucide-react';

const SoundControl = () => {
  const { isMuted, toggleMute } = useSound();

  return (
    <button onClick={toggleMute} className="sound-btn">
      {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      <span className="sr-only">{isMuted ? 'Unmute' : 'Mute'}</span>
    </button>
  );
};

export default SoundControl;
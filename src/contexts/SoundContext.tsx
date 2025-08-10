import React, { createContext, useContext, useState, ReactNode, useCallback, useRef, useEffect } from 'react';

interface SoundContextType {
  isMuted: boolean;
  toggleMute: () => void;
  playSound: (sound: string) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

// NOTE: These sound files must exist in the /public/sounds/ directory
const soundFiles: { [key: string]: string } = {
  click: '/sounds/click.wav',
  start: '/sounds/start.wav',
  win: '/sounds/win.wav',
  explosion: '/sounds/explosion.wav',
  eject: '/sounds/eject.wav',
  join: '/sounds/join.wav',
  background: '/sounds/background.mp3',
};

export const SoundProvider = ({ children }: { children: ReactNode }) => {
  const [isMuted, setIsMuted] = useState(true); // Start muted by default
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Preload sounds
    Object.keys(soundFiles).forEach(key => {
      if (!audioRefs.current[key]) {
        audioRefs.current[key] = new Audio(soundFiles[key]);
        audioRefs.current[key].volume = key === 'click' ? 0.5 : 1.0;
      }
    });
    if (!backgroundAudioRef.current) {
        backgroundAudioRef.current = new Audio(soundFiles.background);
        backgroundAudioRef.current.loop = true;
        backgroundAudioRef.current.volume = 0.1;
    }
  }, []);

  const playSound = useCallback((sound: string) => {
    if (!isMuted && audioRefs.current[sound]) {
      audioRefs.current[sound].currentTime = 0;
      audioRefs.current[sound].play().catch(e => console.error(`Error playing sound ${sound}:`, e));
    }
  }, [isMuted]);

  const toggleMute = () => {
    // Play click sound manually regardless of mute state, but only when unmuting
    if (isMuted && audioRefs.current['click']) {
        audioRefs.current['click'].currentTime = 0;
        audioRefs.current['click'].play().catch(e => console.error(`Error playing sound click:`, e));
    }

    setIsMuted(prev => {
      const newMutedState = !prev;
      if (newMutedState) {
        backgroundAudioRef.current?.pause();
      } else {
        // User interaction is required to start audio playback
        backgroundAudioRef.current?.play().catch(e => console.error("Error playing background music. User may need to interact with the page first.", e));
      }
      return newMutedState;
    });
  };

  return (
    <SoundContext.Provider value={{ isMuted, toggleMute, playSound }}>
      {children}
    </SoundContext.Provider>
  );
};

export const useSound = () => {
  const context = useContext(SoundContext);
  if (context === undefined) {
    throw new Error('useSound must be used within a SoundProvider');
  }
  return context;
};
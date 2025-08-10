import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import * as audio from '@/lib/audio';

interface AudioContextType {
  isMuted: boolean;
  toggleMute: () => void;
  playSound: (sound: keyof typeof soundEffects) => void;
  playMultiplierSound: (multiplier: number) => void;
  resetMultiplierSound: () => void;
}

const soundEffects = {
  click: audio.playClickSound,
  start: audio.playStartSound,
  win: audio.playWinSound,
  explosion: audio.playExplosionSound,
  eject: audio.playEjectSound,
};

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const AudioProvider = ({ children }: { children: ReactNode }) => {
  const [isMuted, setIsMuted] = useState(audio.getMuteState());

  const handleToggleMute = useCallback(() => {
    audio.initAudio(); // Ensure context is started
    const newState = audio.toggleMute();
    setIsMuted(newState);
  }, []);

  const playSound = useCallback((sound: keyof typeof soundEffects) => {
    audio.initAudio();
    soundEffects[sound]();
  }, []);

  const playMultiplierSound = useCallback((multiplier: number) => {
    audio.initAudio();
    audio.playMultiplierIncreaseSound(multiplier);
  }, []);
  
  const resetMultiplierSound = useCallback(() => {
    audio.resetMultiplierTick();
  }, []);

  return (
    <AudioContext.Provider value={{ isMuted, toggleMute: handleToggleMute, playSound, playMultiplierSound, resetMultiplierSound }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
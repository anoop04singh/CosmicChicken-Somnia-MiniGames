import React from 'react';
import { cn } from '@/lib/utils';

interface RetroWindowProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const RetroWindow: React.FC<RetroWindowProps> = ({ title, icon, children, className }) => {
  return (
    <div className={cn('retro-window', className)}>
      <div className="retro-titlebar">
        <div className="retro-title">
          {icon}
          <span>{title}</span>
        </div>
        <div className="retro-controls">
          <button className="retro-btn">_</button>
          <button className="retro-btn">□</button>
          <button className="retro-btn">X</button>
        </div>
      </div>
      <div className="retro-content">{children}</div>
    </div>
  );
};

export default RetroWindow;
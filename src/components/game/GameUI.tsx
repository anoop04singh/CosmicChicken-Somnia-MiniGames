import { useState } from 'react';
import { useAccount, useDisconnect, useBalance } from 'wagmi';
import { Button } from '@/components/ui/button';
import RetroWindow from './RetroWindow';
import MultiplayerMode from './MultiplayerMode';
import BotMode from './BotMode';
import { Rocket, Users, Bot, Wallet } from 'lucide-react';
import { formatEther } from 'viem';

type GameMode = 'multiplayer' | 'bot';

const GameUI = () => {
  const [mode, setMode] = useState<GameMode>('multiplayer');
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  return (
    <div className="game-container">
      <RetroWindow title="Cosmic Chicken Control Panel" icon={<Rocket size={16} />} className="main-window">
        <div className="game-header">
          <div className="header-left">
            <div>
              <h2 className="game-title">Cosmic Chicken</h2>
              <p className="game-subtitle">Connected to Somnia Testnet</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-xs text-right">
                <div>{address?.slice(0, 6)}...{address?.slice(-4)}</div>
                <div>{balance ? `${parseFloat(formatEther(balance.value)).toFixed(4)} ${balance.symbol}` : '...'}</div>
             </div>
            <Button onClick={() => disconnect()} className="retro-btn-danger disconnect-btn">Disconnect</Button>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-panel">
            <Users className="stat-icon" />
            <div className="stat-value">--</div>
            <div className="stat-label">Players Online</div>
          </div>
          <div className="stat-panel">
            <Rocket className="stat-icon" />
            <div className="stat-value">--</div>
            <div className="stat-label">Active Rounds</div>
          </div>
          <div className="stat-panel">
            <Wallet className="stat-icon" />
            <div className="stat-value">-- SOM</div>
            <div className="stat-label">Total Won</div>
          </div>
        </div>

        <div className="mode-selector">
          <div className="mode-tabs">
            <button
              className={`mode-tab ${mode === 'multiplayer' ? 'active' : ''}`}
              onClick={() => setMode('multiplayer')}
            >
              <Users className="inline-block mr-2" size={16} />
              Multiplayer Royale
            </button>
            <button
              className={`mode-tab ${mode === 'bot' ? 'active' : ''}`}
              onClick={() => setMode('bot')}
            >
              <Bot className="inline-block mr-2" size={16} />
              Speed Round (vs Bot)
            </button>
          </div>
        </div>

        <div className="game-mode-content">
          {mode === 'multiplayer' ? <MultiplayerMode /> : <BotMode />}
        </div>
      </RetroWindow>
    </div>
  );
};

export default GameUI;
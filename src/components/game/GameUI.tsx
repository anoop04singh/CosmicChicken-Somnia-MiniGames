import { useState } from 'react';
import { useAccount, useDisconnect, useBalance, useReadContract } from 'wagmi';
import { Button } from '@/components/ui/button';
import RetroWindow from './RetroWindow';
import ComingSoon from './ComingSoon';
import BotMode from './BotMode';
import OwnerPanel from './OwnerPanel';
import { Rocket, Users, Bot } from 'lucide-react';
import { formatEther } from 'viem';
import { contractAddress, contractAbi } from '@/lib/abi';
import SoundControl from './SoundControl';
import { useAudio } from '@/contexts/AudioContext';
import { Separator } from '@/components/ui/separator';

type GameMode = 'multiplayer' | 'bot';

const GameUI = () => {
  const [mode, setMode] = useState<GameMode>('bot');
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance, refetch: refetchWalletBalance } = useBalance({ address });
  const { playSound } = useAudio();

  const { data: ownerAddress } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'owner',
  });

  const handleDisconnect = () => {
    playSound('click');
    disconnect();
  };

  const handleGameWin = () => {
    refetchWalletBalance();
  };

  const isOwner = !!(address && ownerAddress && address.toLowerCase() === (ownerAddress as string).toLowerCase());

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
            <SoundControl />
             <div className="text-xs text-right">
                <div>{address?.slice(0, 6)}...{address?.slice(-4)}</div>
                <div>{balance ? `${parseFloat(formatEther(balance.value)).toFixed(4)} ${balance.symbol}` : '...'}</div>
             </div>
            <Button onClick={handleDisconnect} className="retro-btn-danger disconnect-btn">Disconnect</Button>
          </div>
        </div>

        <div className="mode-selector">
          <div className="mode-tabs">
            <button
              className={`mode-tab ${mode === 'multiplayer' ? 'active' : ''}`}
              onClick={() => { setMode('multiplayer'); playSound('click'); }}
            >
              <Users className="inline-block mr-2" size={16} />
              Multiplayer Royale
              <span className="coming-soon-badge">SOON</span>
            </button>
            <button
              className={`mode-tab ${mode === 'bot' ? 'active' : ''}`}
              onClick={() => { setMode('bot'); playSound('click'); }}
            >
              <Bot className="inline-block mr-2" size={16} />
              Speed Round (vs Bot)
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
            <div className="game-mode-content">
                {mode === 'multiplayer' ? <ComingSoon /> : <BotMode onGameWin={handleGameWin} onBalanceUpdate={refetchWalletBalance} />}
            </div>
            
            {isOwner && (
            <>
                <Separator className="my-2 bg-gray-500" />
                <OwnerPanel />
            </>
            )}
        </div>
      </RetroWindow>
    </div>
  );
};

export default GameUI;
import { useState, useEffect } from 'react';
import { useAccount, useDisconnect, useBalance, useReadContract } from 'wagmi';
import { Button } from '@/components/ui/button';
import RetroWindow from './RetroWindow';
import MultiplayerMode from './MultiplayerMode';
import BotMode from './BotMode';
import OwnerPanel from './OwnerPanel';
import { Rocket, Users, Bot, Wallet, Loader2 } from 'lucide-react';
import { formatEther } from 'viem';
import { contractAddress, contractAbi } from '@/lib/abi';

type GameMode = 'multiplayer' | 'bot';

const GameUI = () => {
  const [mode, setMode] = useState<GameMode>('multiplayer');
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  const { data: ownerAddress } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'owner',
  });

  const { data: roundInfo, isLoading: isLoadingRoundInfo, refetch: refetchRoundInfo } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getCurrentRoundInfo',
  });

  const { data: currentRoundId, isLoading: isLoadingCurrentRoundId, refetch: refetchCurrentRoundId } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'currentRoundId',
  });

  useEffect(() => {
    const interval = setInterval(() => {
      refetchRoundInfo();
      refetchCurrentRoundId();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetchRoundInfo, refetchCurrentRoundId]);

  const isOwner = !!(address && ownerAddress && address.toLowerCase() === (ownerAddress as string).toLowerCase());

  const prizePool = roundInfo && roundInfo[3] ? formatEther(roundInfo[3]) : '0';
  const activePlayers = roundInfo && roundInfo[4] ? Number(roundInfo[4]) : 0;

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
            <div className="stat-value">{isLoadingRoundInfo ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : activePlayers}</div>
            <div className="stat-label">Active Players</div>
          </div>
          <div className="stat-panel">
            <Rocket className="stat-icon" />
            <div className="stat-value">{isLoadingCurrentRoundId ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : Number(currentRoundId || 0)}</div>
            <div className="stat-label">Current Round</div>
          </div>
          <div className="stat-panel">
            <Wallet className="stat-icon" />
            <div className="stat-value">{isLoadingRoundInfo ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : `${prizePool} STT`}</div>
            <div className="stat-label">Prize Pool</div>
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
        
        {isOwner && (
          <OwnerPanel />
        )}
      </RetroWindow>
    </div>
  );
};

export default GameUI;
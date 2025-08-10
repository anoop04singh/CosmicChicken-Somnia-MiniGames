import { useState, useEffect } from 'react';
import { useAccount, useDisconnect, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Button } from '@/components/ui/button';
import RetroWindow from './RetroWindow';
import ComingSoon from './ComingSoon';
import BotMode from './BotMode';
import OwnerPanel from './OwnerPanel';
import { Rocket, Users, Bot, Wallet, Loader2 } from 'lucide-react';
import { formatEther } from 'viem';
import { contractAddress, contractAbi } from '@/lib/abi';
import { showError, showSuccess } from '@/utils/toast';
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

  const { data: playerWinnings, refetch: refetchPlayerWinnings } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getPlayerWinnings',
    args: [address as `0x${string}`],
    enabled: !!address,
  });

  const { data: withdrawHash, writeContract, isPending, reset } = useWriteContract();

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: withdrawHash,
    onSuccess: () => {
      showSuccess('Winnings withdrawn successfully!');
      refetchPlayerWinnings();
      refetchWalletBalance();
      reset();
    },
    onError: (error) => {
      showError(error.shortMessage || error.message);
    }
  });

  const handleWithdraw = () => {
    playSound('click');
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'withdrawWinnings',
    });
  };

  const handleDisconnect = () => {
    playSound('click');
    disconnect();
  };

  const handleGameWin = () => {
    refetchPlayerWinnings();
    refetchWalletBalance();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      refetchRoundInfo();
      refetchCurrentRoundId();
      if (address) {
        refetchPlayerWinnings();
      }
    }, 3000); // Polling every 3 seconds for better responsiveness
    return () => clearInterval(interval);
  }, [refetchRoundInfo, refetchCurrentRoundId, refetchPlayerWinnings, address]);

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
            <SoundControl />
            <div className="text-xs text-right">
                <div>Winnings:</div>
                <div>{playerWinnings ? `${parseFloat(formatEther(playerWinnings as bigint)).toFixed(4)} STT` : '0.00 STT'}</div>
            </div>
            <Button 
                onClick={handleWithdraw} 
                disabled={isPending || isConfirming || !playerWinnings || playerWinnings === 0n}
                className={`retro-btn-success disconnect-btn ${playerWinnings && playerWinnings > 0n ? 'pulse' : ''}`}
            >
                {isPending || isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Withdraw'}
            </Button>
             <div className="text-xs text-right">
                <div>{address?.slice(0, 6)}...{address?.slice(-4)}</div>
                <div>{balance ? `${parseFloat(formatEther(balance.value)).toFixed(4)} ${balance.symbol}` : '...'}</div>
             </div>
            <Button onClick={handleDisconnect} className="retro-btn-danger disconnect-btn">Disconnect</Button>
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
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { parseEther, formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { showSuccess } from '@/utils/toast';
import { useSound } from '@/contexts/SoundContext';

const MultiplayerMode = ({ onGameWin }: { onGameWin: () => void; }) => {
  const { address } = useAccount();
  const { data: hash, writeContract, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
  const { playSound } = useSound();

  const { data: roundInfo, refetch, isLoading: isLoadingRound } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getCurrentRoundInfo',
  });

  const { data: entryFee, isLoading: isLoadingFee } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'entryFee',
  });

  const { data: isPlayerInRound, refetch: refetchPlayerStatus } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'isPlayerInCurrentRound',
    args: [address as `0x${string}`],
    enabled: !!address,
  });

  const [timeLeft, setTimeLeft] = useState(0);

  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'RoundFinished',
    onLogs(logs) {
      logs.forEach(log => {
        const { winner, prizeAmount } = log.args;
        if (winner && prizeAmount && address && winner.toLowerCase() === address.toLowerCase()) {
          playSound('win');
          showSuccess(`You won! Prize: ${formatEther(prizeAmount as bigint)} STT. Added to your withdrawable winnings.`);
          onGameWin();
        }
      });
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      if (address) {
        refetchPlayerStatus();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch, refetchPlayerStatus, address]);

  useEffect(() => {
    if (roundInfo && Array.isArray(roundInfo) && roundInfo.length > 2) {
      const endTime = Number(roundInfo[2]);
      const now = Math.floor(Date.now() / 1000);
      setTimeLeft(Math.max(0, endTime - now));
    }
  }, [roundInfo]);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  useEffect(() => {
    if (isConfirmed) {
      refetch();
      refetchPlayerStatus();
      reset();
    }
  }, [isConfirmed, refetch, refetchPlayerStatus, reset]);

  const handleJoin = () => {
    playSound('join');
    if (!entryFee) return;
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'joinRound',
      value: entryFee as bigint,
    });
  };

  const handleEject = () => {
    playSound('eject');
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'ejectFromRound',
    });
  };

  const prizePool = roundInfo && roundInfo[3] ? formatEther(roundInfo[3]) : '0';
  const activePlayers = roundInfo && roundInfo[4] ? Number(roundInfo[4]) : 0;
  const formattedEntryFee = entryFee ? formatEther(entryFee as bigint) : '...';

  return (
    <>
      <div className="rules-panel">
        <h3 className="panel-title">Multiplayer Royale Rules</h3>
        <div className="rules-list">
          <p className="rule-item">Pay {formattedEntryFee} STT to join the round.</p>
          <p className="rule-item">Each new player resets the timer.</p>
          <p className="rule-item">Eject anytime to leave, but forfeit your fee.</p>
          <p className="rule-item">The last player to join before the timer runs out wins the entire prize pool!</p>
        </div>
      </div>

      <div className="intense-timer">
        <div className="timer-display">
          <div className="timer-value">{isLoadingRound ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : `${timeLeft}s`}</div>
          <div className="timer-bar">
            <div className="timer-fill" style={{ width: `${(timeLeft / 60) * 100}%` }}></div>
          </div>
        </div>
      </div>

      <div className="game-status">
        <div className="status-display">
          <div className="round-info">
            {isLoadingRound ? <Loader2 className="h-4 w-4 animate-spin" /> : `Prize Pool: ${prizePool} STT | Players: ${activePlayers}`}
          </div>
        </div>
        <div className="action-buttons">
          {!isPlayerInRound ? (
            <Button onClick={handleJoin} disabled={isPending || isConfirming || isLoadingFee} className="retro-btn-success action-btn pulse">
              {isPending || isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Join Round ({formattedEntryFee} STT)
            </Button>
          ) : (
            <Button onClick={handleEject} disabled={isPending || isConfirming} className="retro-btn-danger action-btn eject-btn">
              {isPending || isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eject from Round
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default MultiplayerMode;
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { parseEther, formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { showError, showSuccess } from '@/utils/toast';

const BotMode = () => {
  const { address } = useAccount();

  const { data: hash, writeContract, isPending: isWritePending, reset: resetWriteContract } = useWriteContract({
    onSuccess: (hash) => { showSuccess(`Transaction sent: ${hash.slice(0,10)}...`); },
    onError: (error) => { showError(error.shortMessage || error.message); }
  });

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const { data: activeGameId, refetch: refetchActiveGameId } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getPlayerActiveBotGame',
    args: [address as `0x${string}`],
    enabled: !!address,
  });

  const { data: botGameInfo, refetch: refetchBotGameInfo } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getBotGameInfo',
    args: [activeGameId as bigint],
    enabled: !!activeGameId && Number(activeGameId) > 0,
  });

  const { data: potentialPayout, refetch: refetchPayout } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getPotentialPayout',
    args: [activeGameId as bigint],
    enabled: !!activeGameId && Number(activeGameId) > 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (address) {
        refetchActiveGameId();
        if (activeGameId && Number(activeGameId) > 0) {
          refetchBotGameInfo();
          refetchPayout();
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [address, activeGameId, refetchActiveGameId, refetchBotGameInfo, refetchPayout]);

  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    if (botGameInfo) {
      const gameIsActive = botGameInfo[5];
      const gameTimedOut = botGameInfo[8];
      const botEjected = botGameInfo[7];
      
      setIsActive(gameIsActive);
      if (!gameIsActive && Number(activeGameId) > 0) {
        setIsFinished(true);
      } else {
        setIsFinished(false);
      }
    } else if (Number(activeGameId) === 0) {
      setIsActive(false);
      setIsFinished(false);
    }
  }, [botGameInfo, activeGameId]);

  const handleReset = () => {
    if (!address) return;
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'resetBotGame',
      args: [address]
    });
  };

  useEffect(() => {
    if (isConfirmed) {
      showSuccess("Transaction confirmed!");
      refetchActiveGameId();
      resetWriteContract();
    }
  }, [isConfirmed, refetchActiveGameId, resetWriteContract]);

  const handleStart = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startBotGame',
      value: parseEther('0.01'),
    });
  };

  const handleEject = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'ejectFromBotGame',
    });
  };

  const isPending = isWritePending || isConfirming;
  const multiplier = botGameInfo && botGameInfo[3] ? Number(formatEther(botGameInfo[3])).toFixed(2) : '1.00';
  const timeRemaining = botGameInfo && botGameInfo[6] ? Number(botGameInfo[6]) : 0;

  return (
    <>
      <div className="rules-panel casino-rules">
        <h3 className="panel-title">Speed Round Rules</h3>
        <div className="rules-list">
          <p className="rule-item">Pay 0.01 STT to start a 30-second round against the bot.</p>
          <p className="rule-item">A prize multiplier increases rapidly.</p>
          <p className="rule-item">The bot will eject at a random time. Cash out before it does to win!</p>
          <p className="rule-item">If the bot ejects first or time runs out, you lose.</p>
        </div>
      </div>

      <div className="bot-game-display">
        <div className="multiplier-display">
          <div className="multiplier-value">{multiplier}x</div>
          <div className="multiplier-label">Current Multiplier</div>
        </div>
        <div className="bot-stats">
          <div className="bot-stat">
            <div className="bot-stat-label">Potential Payout</div>
            <div className="bot-stat-value payout">
              {potentialPayout ? formatEther(potentialPayout as bigint) : '0.00'} STT
            </div>
          </div>
          <div className="bot-stat">
            <div className="bot-stat-label">Time Remaining</div>
            <div className="bot-stat-value time">{isActive ? `${timeRemaining}s` : '--s'}</div>
          </div>
        </div>
      </div>

      <div className="game-status">
        <div className="action-buttons">
          {!isActive && !isFinished && (
            <Button onClick={handleStart} disabled={isPending} className="retro-btn-warning action-btn pulse">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start Bot Game (0.01 STT)
            </Button>
          )}
          {isActive && (
            <Button onClick={handleEject} disabled={isPending} className="retro-btn-success action-btn cashout-btn">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cash Out!
            </Button>
          )}
          {isFinished && (
             <Button onClick={handleReset} disabled={isPending} className="retro-btn-primary action-btn">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Play Again
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default BotMode;
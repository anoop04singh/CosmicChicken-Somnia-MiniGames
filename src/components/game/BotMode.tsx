import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { parseEther, formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { showError, showSuccess } from '@/utils/toast';

const BOT_ROUND_DURATION = 30; // seconds

const BotMode = () => {
  const { address } = useAccount();
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);

  const { data: hash, writeContract, isPending: isWritePending, reset: resetWriteContract } = useWriteContract({
    onSuccess: (hash) => {
      showSuccess(`Transaction sent: ${hash.slice(0,10)}...`);
    },
    onError: (error) => {
      showError(error.shortMessage || error.message);
    }
  });

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const { data: botGameInfo, refetch: refetchBotGame } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getBotGameInfo',
    args: [address],
    enabled: !!address,
    watch: true,
  });

  const [gameId, startTime, isActive, isFinished] = (botGameInfo && Array.isArray(botGameInfo))
    ? botGameInfo as [bigint, bigint, boolean, boolean]
    : [0n, 0n, false, false];

  const { data: potentialPayout, refetch: refetchPayout } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getPotentialPayout',
    args: [gameId],
    enabled: !!gameId && isActive,
  });

  const [multiplier, setMultiplier] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState(BOT_ROUND_DURATION);

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
    if (isFinished && address) {
      handleReset();
    }
  }, [isFinished, address]);

  useEffect(() => {
    if (isConfirmed) {
      showSuccess("Transaction confirmed!");
      refetchBotGame();
      refetchPayout();
      resetWriteContract();
    }
  }, [isConfirmed, refetchBotGame, refetchPayout, resetWriteContract]);

  useEffect(() => {
    if (isActive) {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);

      gameLoopRef.current = setInterval(() => {
        const elapsed = (Date.now() / 1000) - Number(startTime);
        const newMultiplier = 1 + (elapsed / 5);
        setMultiplier(newMultiplier);

        const newTimeRemaining = Math.max(0, BOT_ROUND_DURATION - elapsed);
        setTimeRemaining(newTimeRemaining);

        if (newTimeRemaining <= 0 || isFinished) {
          if (gameLoopRef.current) clearInterval(gameLoopRef.current);
          refetchBotGame();
        }
      }, 1000);
    } else {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      setMultiplier(1);
      setTimeRemaining(BOT_ROUND_DURATION);
    }

    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
    };
  }, [isActive, startTime, refetchBotGame, isFinished]);

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

  return (
    <>
      <div className="rules-panel casino-rules">
        <h3 className="panel-title">Speed Round Rules</h3>
        <div className="rules-list">
          <p className="rule-item">Pay 0.01 SOM to start a 30-second round against the bot.</p>
          <p className="rule-item">A prize multiplier increases rapidly.</p>
          <p className="rule-item">The bot will eject at a random time. Cash out before it does to win!</p>
          <p className="rule-item">If the bot ejects first or time runs out, you lose.</p>
        </div>
      </div>

      <div className="bot-game-display">
        <div className="multiplier-display">
          <div className="multiplier-value">{isActive ? multiplier.toFixed(2) : '1.00'}x</div>
          <div className="multiplier-label">Current Multiplier</div>
        </div>
        <div className="bot-stats">
          <div className="bot-stat">
            <div className="bot-stat-label">Potential Payout</div>
            <div className="bot-stat-value payout">
              {potentialPayout ? formatEther(potentialPayout as bigint) : '0.00'} SOM
            </div>
          </div>
          <div className="bot-stat">
            <div className="bot-stat-label">Time Remaining</div>
            <div className="bot-stat-value time">{isActive ? `${Math.floor(timeRemaining)}s` : '--s'}</div>
          </div>
        </div>
      </div>

      <div className="game-status">
        <div className="action-buttons">
          {!isActive && !isFinished && (
            <Button onClick={handleStart} disabled={isPending} className="retro-btn-warning action-btn pulse">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start Bot Game (0.01 SOM)
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
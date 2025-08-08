import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { parseEther, formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { showError, showSuccess } from '@/utils/toast';

const BOT_ROUND_DURATION = 30; // seconds

const BotMode = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);

  const { data: hash, writeContract, isPending: isWritePending, reset: resetWriteContract } = useWriteContract({
    onSuccess: (hash) => { showSuccess(`Transaction sent: ${hash.slice(0,10)}...`); },
    onError: (error) => { showError(error.shortMessage || error.message); }
  });

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const [botGameInfo, setBotGameInfo] = useState<readonly [bigint, bigint, boolean, boolean] | null>(null);
  const [potentialPayout, setPotentialPayout] = useState<bigint | null>(null);

  const [gameId, startTime, isActive, isFinished] = botGameInfo || [0n, 0n, false, false];

  const fetchBotGameData = useCallback(async () => {
    if (!publicClient || !address) return;
    try {
      const info = await publicClient.readContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'getBotGameInfo',
        args: [address],
      });
      setBotGameInfo(info);

      const [currentId, , currentIsActive] = info;
      if (currentId > 0 && currentIsActive) {
        const payout = await publicClient.readContract({
          address: contractAddress,
          abi: contractAbi,
          functionName: 'getPotentialPayout',
          args: [currentId],
        });
        setPotentialPayout(payout);
      } else {
        setPotentialPayout(null);
      }
    } catch (e) {
      console.error("Failed to fetch bot game data:", e);
    }
  }, [publicClient, address]);

  useEffect(() => {
    fetchBotGameData();
    const interval = setInterval(fetchBotGameData, 3000);
    return () => clearInterval(interval);
  }, [fetchBotGameData]);

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
      fetchBotGameData();
      resetWriteContract();
    }
  }, [isConfirmed, fetchBotGameData, resetWriteContract]);

  useEffect(() => {
    if (isActive) {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current);
      gameLoopRef.current = setInterval(() => {
        const elapsed = (Date.now() / 1000) - Number(startTime);
        setMultiplier(1 + (elapsed / 5));
        setTimeRemaining(Math.max(0, BOT_ROUND_DURATION - elapsed));
        if (timeRemaining <= 0) {
          if (gameLoopRef.current) clearInterval(gameLoopRef.current);
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
  }, [isActive, startTime, timeRemaining]);

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
          <p className="rule-item">Pay 0.01 STT to start a 30-second round against the bot.</p>
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
              {potentialPayout ? formatEther(potentialPayout) : '0.00'} STT
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
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
  const animationFrameRef = useRef<number | null>(null);

  // --- Blockchain Data Hooks ---
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

  // --- State for UI Animation ---
  const [displayMultiplier, setDisplayMultiplier] = useState(1.00);
  const [displayTimeRemaining, setDisplayTimeRemaining] = useState(BOT_ROUND_DURATION);
  const [displayPayout, setDisplayPayout] = useState<bigint | null>(null);

  // --- Derived State from Blockchain Data ---
  const isActive = botGameInfo ? botGameInfo[5] : false;
  const isFinished = botGameInfo ? !botGameInfo[5] && Number(activeGameId) > 0 : false;
  const startTime = botGameInfo ? botGameInfo[2] : 0n;
  const entryFee = botGameInfo ? botGameInfo[4] : 0n;

  // --- Handlers for Contract Writes ---
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
  
  const handleReset = () => {
    if (!address) return;
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'resetBotGame',
      args: [address]
    });
  };

  // --- Effects ---

  // Effect to poll for authoritative game state from the blockchain
  useEffect(() => {
    const interval = setInterval(() => {
      if (address) {
        refetchActiveGameId();
        if (activeGameId && Number(activeGameId) > 0) {
          refetchBotGameInfo();
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [address, activeGameId, refetchActiveGameId, refetchBotGameInfo]);

  // Effect to handle post-transaction logic
  useEffect(() => {
    if (isConfirmed) {
      showSuccess("Transaction confirmed!");
      refetchActiveGameId();
      resetWriteContract();
    }
  }, [isConfirmed, refetchActiveGameId, resetWriteContract]);
  
  // Effect to automatically reset the game when it's finished
  useEffect(() => {
    if (isFinished) {
      handleReset();
    }
  }, [isFinished]);

  // The core animation loop for a smooth UI
  useEffect(() => {
    const loop = () => {
      const elapsed = (Date.now() / 1000) - Number(startTime);
      
      if (elapsed < 0) { // Game start time is in the future, wait.
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const newMultiplier = 1 + (elapsed / 5);
      const newTimeRemaining = Math.max(0, BOT_ROUND_DURATION - elapsed);
      
      setDisplayMultiplier(newMultiplier);
      setDisplayTimeRemaining(newTimeRemaining);

      if (entryFee > 0n) {
        const payout = (entryFee * BigInt(Math.floor(newMultiplier * 10000))) / 10000n;
        setDisplayPayout(payout);
      }

      if (newTimeRemaining > 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    if (isActive && startTime > 0) {
      animationFrameRef.current = requestAnimationFrame(loop);
    } else {
      // Reset display values when not active
      setDisplayMultiplier(1.00);
      setDisplayTimeRemaining(BOT_ROUND_DURATION);
      setDisplayPayout(entryFee > 0n ? entryFee : null);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, startTime, entryFee]);

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
          <div className="multiplier-value">{displayMultiplier.toFixed(2)}x</div>
          <div className="multiplier-label">Current Multiplier</div>
        </div>
        <div className="bot-stats">
          <div className="bot-stat">
            <div className="bot-stat-label">Potential Payout</div>
            <div className="bot-stat-value payout">
              {displayPayout ? formatEther(displayPayout) : '0.00'} STT
            </div>
          </div>
          <div className="bot-stat">
            <div className="bot-stat-label">Time Remaining</div>
            <div className="bot-stat-value time">{isActive ? `${Math.floor(displayTimeRemaining)}s` : '--s'}</div>
          </div>
        </div>
      </div>

      <div className="game-status">
        <div className="action-buttons">
          {!isActive && (
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
        </div>
      </div>
    </>
  );
};

export default BotMode;
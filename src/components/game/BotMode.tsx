import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { parseEther, formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { showError, showSuccess } from '@/utils/toast';
import GameOverDisplay from './GameOverDisplay';

const BOT_ROUND_DURATION = 30; // seconds

const BotMode = ({ onGameWin, onBalanceUpdate }: { onGameWin: () => void; onBalanceUpdate: () => void; }) => {
  const { address } = useAccount();
  const animationFrameRef = useRef<number | null>(null);

  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<{
    playerWon: boolean;
    payout: bigint;
    finalMultiplier: bigint;
  } | null>(null);

  const { data: hash, writeContract, isPending: isWritePending, reset: resetWriteContract } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const { data: entryFeeData, isLoading: isLoadingFee } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'entryFee',
  });

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

  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'BotGameEnded',
    onLogs(logs) {
      logs.forEach(log => {
        const { player, playerWon, payout, finalMultiplier } = log.args;
        if (player && address && player.toLowerCase() === address.toLowerCase()) {
          setGameResult({ 
            playerWon: playerWon as boolean, 
            payout: payout as bigint, 
            finalMultiplier: finalMultiplier as bigint 
          });
          setIsGameOver(true);
          
          // Refetch balances on both win and loss to ensure UI is in sync
          onGameWin();
          onBalanceUpdate();

          if (playerWon) {
            showSuccess(`You won! Payout: ${formatEther(payout as bigint)} STT. Added to your withdrawable winnings.`);
          } else {
            showError("The bot ejected first! Better luck next time.");
          }
        }
      });
    },
  });

  const [displayMultiplier, setDisplayMultiplier] = useState(1.00);
  const [displayTimeRemaining, setDisplayTimeRemaining] = useState(BOT_ROUND_DURATION);
  const [displayPayout, setDisplayPayout] = useState<bigint | null>(null);

  const isActive = botGameInfo ? botGameInfo[5] : false;
  const startTime = botGameInfo ? botGameInfo[2] : 0n;
  const gameEntryFee = botGameInfo ? botGameInfo[4] : 0n;

  const handleStart = () => {
    if (!entryFeeData) return;
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startBotGame',
      value: entryFeeData as bigint,
    }, {
      onSuccess: (hash) => {
        showSuccess(`Transaction sent: ${hash.slice(0,10)}...`);
        onBalanceUpdate(); // Immediately refetch wallet balance for instant feedback
      },
      onError: (error) => {
        showError(error.shortMessage || error.message);
      }
    });
  };

  const handleEject = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'ejectFromBotGame',
    }, {
      onSuccess: (hash) => {
        showSuccess(`Transaction sent: ${hash.slice(0,10)}...`);
      },
      onError: (error) => {
        showError(error.shortMessage || error.message);
      }
    });
  };
  
  const handlePlayAgain = () => {
    setIsGameOver(false);
    setGameResult(null);
    refetchActiveGameId();
  };

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

  useEffect(() => {
    if (isConfirmed) {
      showSuccess("Transaction confirmed!");
      refetchActiveGameId();
      resetWriteContract();
    }
  }, [isConfirmed, refetchActiveGameId, resetWriteContract]);

  useEffect(() => {
    const loop = () => {
      const elapsed = (Date.now() / 1000) - Number(startTime);
      if (elapsed < 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }
      const newMultiplier = 1 + (elapsed / 5);
      const newTimeRemaining = Math.max(0, BOT_ROUND_DURATION - elapsed);
      setDisplayMultiplier(newMultiplier);
      setDisplayTimeRemaining(newTimeRemaining);
      if (gameEntryFee > 0n) {
        const payout = (gameEntryFee * BigInt(Math.floor(newMultiplier * 10000))) / 10000n;
        setDisplayPayout(payout);
      }
      if (newTimeRemaining > 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    if (isActive && startTime > 0) {
      animationFrameRef.current = requestAnimationFrame(loop);
    } else {
      setDisplayMultiplier(1.00);
      setDisplayTimeRemaining(BOT_ROUND_DURATION);
      setDisplayPayout(gameEntryFee > 0n ? gameEntryFee : null);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isActive, startTime, gameEntryFee]);

  const isPending = isWritePending || isConfirming;
  const formattedEntryFee = entryFeeData ? formatEther(entryFeeData as bigint) : '...';

  if (isGameOver && gameResult) {
    return <GameOverDisplay result={gameResult} onPlayAgain={handlePlayAgain} />;
  }

  return (
    <>
      <div className="rules-panel casino-rules">
        <h3 className="panel-title">Speed Round Rules</h3>
        <div className="rules-list">
          <p className="rule-item">Pay {formattedEntryFee} STT to start a 30-second round against the bot.</p>
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
            <Button onClick={handleStart} disabled={isPending || !!activeGameId || isLoadingFee} className="retro-btn-warning action-btn pulse">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start Bot Game ({formattedEntryFee} STT)
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
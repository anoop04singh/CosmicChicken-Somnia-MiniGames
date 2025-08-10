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
  const prevIsActive = useRef<boolean | undefined>();

  const [isGameOver, setIsGameOver] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
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

  const { data: maxMultiplierData } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'BOT_MAX_MULTIPLIER',
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
          setIsFinalizing(false);
          
          onGameWin();
          onBalanceUpdate();

          if (playerWon) {
            showSuccess(`You won! Payout: ${formatEther(payout as bigint)} STT.`);
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

  const currentIsActive = botGameInfo ? botGameInfo[5] : false;
  const startTime = botGameInfo ? botGameInfo[2] : 0n;
  const gameEntryFee = botGameInfo ? botGameInfo[4] : 0n;

  useEffect(() => {
    if (prevIsActive.current === true && currentIsActive === false && !isGameOver) {
      setIsFinalizing(true);
    }
    prevIsActive.current = currentIsActive;
  }, [currentIsActive, isGameOver]);

  useEffect(() => {
    if (isFinalizing) {
      const timeout = setTimeout(() => {
        if (isFinalizing) {
          setIsGameOver(true);
          setIsFinalizing(false);
        }
      }, 15000);
      return () => clearTimeout(timeout);
    }
  }, [isFinalizing]);

  const handleStart = () => {
    if (!entryFeeData) return;
    resetWriteContract(); // Reset state before new write
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startBotGame',
      value: entryFeeData as bigint,
    }, {
      onSuccess: (hash) => {
        showSuccess(`Transaction sent: ${hash.slice(0,10)}...`);
        onBalanceUpdate();
      },
      onError: (error) => {
        showError(error.shortMessage || error.message);
      }
    });
  };

  const handleEject = () => {
    resetWriteContract(); // Reset state before new write
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
    setIsFinalizing(false);
    prevIsActive.current = undefined;
    refetchActiveGameId();
  };

  useEffect(() => {
    if (isConfirmed) {
      showSuccess("Transaction confirmed!");
      refetchActiveGameId().then(() => {
        refetchBotGameInfo();
      });
      resetWriteContract();
    }
  }, [isConfirmed, refetchActiveGameId, refetchBotGameInfo, resetWriteContract]);

  useEffect(() => {
    const loop = () => {
      const elapsed = (Date.now() / 1000) - Number(startTime);
      if (elapsed < 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const maxMultiplier = maxMultiplierData ? Number(maxMultiplierData) / 100 : Infinity;
      let newMultiplier = 1 + (elapsed / 5);
      if (newMultiplier > maxMultiplier) {
        newMultiplier = maxMultiplier;
      }

      const newTimeRemaining = Math.max(0, BOT_ROUND_DURATION - elapsed);
      setDisplayMultiplier(newMultiplier);
      setDisplayTimeRemaining(newTimeRemaining);
      if (gameEntryFee > 0n) {
        const payout = (gameEntryFee * BigInt(Math.floor(newMultiplier * 10000))) / 10000n;
        setDisplayPayout(payout);
      }
      if (newTimeRemaining > 0 && newMultiplier < maxMultiplier) {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    if (currentIsActive && startTime > 0) {
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
  }, [currentIsActive, startTime, gameEntryFee, maxMultiplierData]);

  const isPending = isWritePending || isConfirming;
  const formattedEntryFee = entryFeeData ? formatEther(entryFeeData as bigint) : '...';

  if (isGameOver) {
    if (gameResult) {
      return <GameOverDisplay result={gameResult} onPlayAgain={handlePlayAgain} />;
    }
    return (
      <div className="game-over-display">
        <h2 className="game-over-title">🤖 GAME OVER 🤖</h2>
        <p className="game-over-message">The round has finished. Your balances have been updated.</p>
        <Button onClick={handlePlayAgain} className="retro-btn-primary action-btn mt-6">
          Play Again
        </Button>
      </div>
    );
  }

  if (isFinalizing) {
    return (
      <div className="transaction-status">
        <Loader2 className="loading-spinner" />
        <p className="status-text">Finalizing round, waiting for blockchain confirmation...</p>
      </div>
    );
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
            <div className="bot-stat-value time">{currentIsActive ? `${Math.floor(displayTimeRemaining)}s` : '--s'}</div>
          </div>
        </div>
      </div>

      <div className="game-status">
        <div className="action-buttons">
          {!currentIsActive && (
            <Button onClick={handleStart} disabled={isPending || !!activeGameId || isLoadingFee} className="retro-btn-warning action-btn pulse">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start Bot Game ({formattedEntryFee} STT)
            </Button>
          )}
          {currentIsActive && (
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
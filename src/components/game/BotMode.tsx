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
  const [showResetButton, setShowResetButton] = useState(false);
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
      console.log("EVENT: 'BotGameEnded' logs received:", logs);
      logs.forEach(log => {
        console.log("EVENT: Processing log:", log);
        const { gameId, player, playerWon, payout, finalMultiplier } = log.args;
        
        console.log("EVENT: Log arguments:", { gameId, player, playerWon, payout, finalMultiplier });
        console.log("EVENT: State values for comparison:", { userAddress: address, activeGameId: activeGameId });

        const playerAddressMatch = player && address && (player as string).toLowerCase() === address.toLowerCase();
        const gameIdMatch = activeGameId && gameId && BigInt(gameId as any) === BigInt(activeGameId as any);

        if (playerAddressMatch && gameIdMatch) {
          console.log("EVENT: Player address and game ID match! Setting game result.");
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
        } else {
            console.log("EVENT: Condition not met. Mismatched data:", { 
                playerAddressMatch,
                gameIdMatch,
                eventPlayer: player, 
                userAddress: address,
                eventGameId: gameId,
                activeGameId: activeGameId,
            });
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
      console.log("STATE: Game became inactive. Entering 'isFinalizing' state.");
      setIsFinalizing(true);
    }
    prevIsActive.current = currentIsActive;
  }, [currentIsActive, isGameOver]);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isFinalizing) {
      setShowResetButton(false); // Reset on new finalization
      console.log("STATE: 'isFinalizing' is true. Setting 15s timeout for reset button.");
      timeout = setTimeout(() => {
        console.log("STATE: 15s timeout elapsed. Showing reset button.");
        setShowResetButton(true);
      }, 15000); // Show reset button after 15 seconds
    } else {
      setShowResetButton(false);
    }
    return () => clearTimeout(timeout);
  }, [isFinalizing]);

  const handleStart = () => {
    if (!entryFeeData) return;
    resetWriteContract();
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
    resetWriteContract();
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
    console.log("ACTION: handlePlayAgain called. Resetting game state.");
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

  if (isGameOver && gameResult) {
    return <GameOverDisplay result={gameResult} onPlayAgain={handlePlayAgain} />;
  }

  if (isFinalizing) {
    return (
      <div className="transaction-status">
        <Loader2 className="loading-spinner" />
        <div className="flex flex-col items-center gap-4">
          <p className="status-text">Finalizing round, waiting for blockchain confirmation...</p>
          {showResetButton && (
            <>
              <p className="text-xs text-gray-400">Taking too long? You can reset.</p>
              <Button onClick={handlePlayAgain} className="retro-btn-warning">
                Reset Game
              </Button>
            </>
          )}
        </div>
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
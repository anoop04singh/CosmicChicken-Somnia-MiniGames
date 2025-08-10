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

  // --- STATE MANAGEMENT ---
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<{
    playerWon: boolean;
    payout: bigint;
    finalMultiplier: bigint;
  } | null>(null);
  const [currentGameId, setCurrentGameId] = useState<bigint | null>(null);

  // --- WAGMI HOOKS for blockchain interaction ---
  const { data: hash, writeContract, isPending: isWritePending, reset: resetWriteContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // --- WAGMI HOOKS for reading contract data ---
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

  // This hook is for re-syncing if the user refreshes the page
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
    args: [currentGameId as bigint],
    enabled: !!currentGameId && Number(currentGameId) > 0,
  });

  // --- CONSOLE LOGS for debugging ---
  console.log("--- BotMode Render ---");
  console.log("State:", {
    isGameOver,
    currentGameId: currentGameId?.toString(),
    isWritePending,
    isConfirming,
  });
  console.log("Active Game ID from hook:", activeGameId?.toString());
  console.log("Bot Game Info from hook:", botGameInfo);

  // --- EFFECT: Sync with on-chain state on page load/refresh ---
  useEffect(() => {
    if (activeGameId && activeGameId > 0n && !currentGameId) {
      console.log(`SYNC: Found active game ${activeGameId} on load, setting local state.`);
      setCurrentGameId(activeGameId);
    }
  }, [activeGameId, currentGameId]);

  // --- EVENT LISTENER: Game Started ---
  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'BotGameStarted',
    onLogs(logs) {
      logs.forEach(log => {
        const { gameId, player } = log.args;
        if (player === address) {
          console.log(`EVENT (BotGameStarted): Game ${gameId} started for current player.`);
          setCurrentGameId(gameId as bigint);
          setIsGameOver(false); // Ensure we are not in a game over state
          setGameResult(null);
        }
      });
    },
  });

  // --- EVENT LISTENER: Game Ended ---
  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'BotGameEnded',
    onLogs(logs) {
      logs.forEach(log => {
        const { gameId, player, playerWon, payout, finalMultiplier } = log.args;
        console.log(`EVENT (BotGameEnded): Received for game ${gameId}. Current game is ${currentGameId}.`);
        if (player === address && gameId === currentGameId) {
          console.log("EVENT (BotGameEnded): Matched current player and game. Setting game over.");
          setGameResult({ 
            playerWon: playerWon as boolean, 
            payout: payout as bigint, 
            finalMultiplier: finalMultiplier as bigint 
          });
          setIsGameOver(true);
          setCurrentGameId(null); // Game is officially over
          onGameWin();
          onBalanceUpdate();
        }
      });
    },
  });

  // --- UI STATE DERIVATION ---
  const [displayMultiplier, setDisplayMultiplier] = useState(1.00);
  const [displayTimeRemaining, setDisplayTimeRemaining] = useState(BOT_ROUND_DURATION);
  const [displayPayout, setDisplayPayout] = useState<bigint | null>(null);

  const currentIsActive = botGameInfo ? botGameInfo[4] : false;
  const startTime = botGameInfo ? botGameInfo[2] : 0n;
  const gameEntryFee = botGameInfo ? botGameInfo[3] : 0n;

  // --- HANDLERS ---
  const handleStart = () => {
    console.log("ACTION: handleStart called.");
    if (!entryFeeData) return;
    resetWriteContract();
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startBotGame',
      value: entryFeeData as bigint,
    }, {
      onSuccess: (hash) => showSuccess(`Transaction sent: ${hash.slice(0,10)}...`),
      onError: (error) => showError(error.shortMessage || error.message)
    });
  };

  const handleEject = () => {
    console.log("ACTION: handleEject called.");
    resetWriteContract();
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'ejectFromBotGame',
    }, {
      onSuccess: (hash) => showSuccess(`Transaction sent: ${hash.slice(0,10)}...`),
      onError: (error) => showError(error.shortMessage || error.message)
    });
  };
  
  const handlePlayAgain = () => {
    console.log("ACTION: handlePlayAgain called. Resetting state.");
    setIsGameOver(false);
    setGameResult(null);
    setCurrentGameId(null);
    refetchActiveGameId(); // Check if a game is somehow still active
  };

  // --- EFFECT: Handle transaction confirmation (less critical now, but good for feedback) ---
  useEffect(() => {
    if (isConfirmed) {
      console.log("CONFIRMED: Transaction confirmed. Event listeners will handle state changes.");
      showSuccess("Transaction confirmed!");
      onBalanceUpdate();
      resetWriteContract();
    }
  }, [isConfirmed, onBalanceUpdate, resetWriteContract]);

  // --- EFFECT: Animation loop for the multiplier ---
  useEffect(() => {
    console.log(`ANIMATION: Effect triggered. currentIsActive=${currentIsActive}, startTime=${startTime}`);
    const loop = () => {
      const elapsed = (Date.now() / 1000) - Number(startTime);
      if (elapsed < 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const maxMultiplier = maxMultiplierData ? Number(maxMultiplierData) / 100 : Infinity;
      let newMultiplier = 1 + (elapsed / 5);
      if (newMultiplier > maxMultiplier) newMultiplier = maxMultiplier;

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
      console.log("ANIMATION: Starting animation loop.");
      animationFrameRef.current = requestAnimationFrame(loop);
    } else {
      console.log("ANIMATION: Not starting loop. Resetting display values.");
      setDisplayMultiplier(1.00);
      setDisplayTimeRemaining(BOT_ROUND_DURATION);
      setDisplayPayout(entryFeeData ?? null);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentIsActive, startTime, gameEntryFee, maxMultiplierData, entryFeeData]);

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
            <div className="bot-stat-value time">{currentIsActive ? `${Math.floor(displayTimeRemaining)}s` : '--s'}</div>
          </div>
        </div>
      </div>

      <div className="game-status">
        <div className="action-buttons">
          {currentGameId && currentIsActive ? (
            <Button onClick={handleEject} disabled={isPending} className="retro-btn-success action-btn cashout-btn">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cash Out!
            </Button>
          ) : (
            <Button onClick={handleStart} disabled={isPending || isLoadingFee || !!currentGameId} className="retro-btn-warning action-btn pulse">
              {isPending || (!!currentGameId && !currentIsActive) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {!!currentGameId && !currentIsActive ? 'Starting...' : `Start Bot Game (${formattedEntryFee} STT)`}
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default BotMode;
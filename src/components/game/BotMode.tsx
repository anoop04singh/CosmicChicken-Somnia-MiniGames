import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { config } from '@/lib/wagmi';
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
  const gameIdToFetch = useRef<bigint | null>(null);

  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<{
    playerWon: boolean;
    payout: bigint;
    finalMultiplier: bigint;
  } | null>(null);
  const [currentGameId, setCurrentGameId] = useState<bigint | null>(null);

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

  useEffect(() => {
    if (activeGameId && activeGameId > 0n && activeGameId !== currentGameId) {
      console.log(`STATE: New active game detected. Game ID: ${activeGameId}. Storing it in state.`);
      setCurrentGameId(activeGameId);
    }
  }, [activeGameId, currentGameId]);

  const [displayMultiplier, setDisplayMultiplier] = useState(1.00);
  const [displayTimeRemaining, setDisplayTimeRemaining] = useState(BOT_ROUND_DURATION);
  const [displayPayout, setDisplayPayout] = useState<bigint | null>(null);

  const currentIsActive = botGameInfo ? botGameInfo[4] : false;
  const startTime = botGameInfo ? botGameInfo[2] : 0n;
  const gameEntryFee = botGameInfo ? botGameInfo[3] : 0n;

  useEffect(() => {
    if (prevIsActive.current === true && currentIsActive === false && !isGameOver) {
      console.log("STATE: Game has transitioned from active to inactive on-chain.");
      if (currentGameId) {
        gameIdToFetch.current = currentGameId;
        console.log(`STATE: Storing game ID ${gameIdToFetch.current} to fetch its result.`);
        
        const fetchResult = async () => {
            if (!gameIdToFetch.current) return;
            console.log(`DATA_FETCH: Calling getBotGameResult for game ID ${gameIdToFetch.current}`);
            try {
                const result = await readContract(config, {
                    address: contractAddress,
                    abi: contractAbi,
                    functionName: 'getBotGameResult',
                    args: [gameIdToFetch.current],
                });

                const [playerWon, payout, finalMultiplier] = result;
                console.log("DATA_FETCH: Successfully fetched game result:", { playerWon, payout, finalMultiplier });

                setGameResult({ playerWon, payout, finalMultiplier });
                setIsGameOver(true);
                setCurrentGameId(null);
                gameIdToFetch.current = null;

            } catch (error) {
                console.error("DATA_FETCH_ERROR: Failed to fetch game result.", error);
                showError("Could not retrieve game result. Please try playing again.");
                handlePlayAgain(); // Reset state on error
            }
        };

        fetchResult();
      } else {
        console.log("STATE: Game is inactive, but no game ID was stored. Cannot fetch result.");
      }
    }
    prevIsActive.current = currentIsActive;
  }, [currentIsActive, isGameOver, currentGameId]);


  const handleStart = () => {
    console.log("ACTION: handleStart called.");
    if (!entryFeeData) {
      console.error("ACTION_ERROR: Cannot start, entry fee not loaded.");
      return;
    }
    resetWriteContract();
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startBotGame',
      value: entryFeeData as bigint,
    }, {
      onSuccess: (hash) => {
        console.log(`TX: Start transaction sent. Hash: ${hash}`);
        showSuccess(`Transaction sent: ${hash.slice(0,10)}...`);
        onBalanceUpdate();
      },
      onError: (error) => {
        console.error("TX_ERROR: Start transaction failed to send.", error);
        showError(error.shortMessage || error.message);
      }
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
      onSuccess: (hash) => {
        console.log(`TX: Eject transaction sent. Hash: ${hash}`);
        showSuccess(`Transaction sent: ${hash.slice(0,10)}...`);
      },
      onError: (error) => {
        console.error("TX_ERROR: Eject transaction failed to send.", error);
        showError(error.shortMessage || error.message);
      }
    });
  };
  
  const handlePlayAgain = () => {
    console.log("ACTION: handlePlayAgain called. Resetting all game state.");
    setIsGameOver(false);
    setGameResult(null);
    setCurrentGameId(null);
    prevIsActive.current = undefined;
    gameIdToFetch.current = null;
    refetchActiveGameId();
  };

  useEffect(() => {
    if (isConfirmed) {
      console.log(`TX_CONFIRMED: Transaction with hash ${hash} has been confirmed.`);
      showSuccess("Transaction confirmed!");
      refetchActiveGameId().then(() => {
        console.log("DATA_FETCH: Refetched active game ID after confirmation.");
        refetchBotGameInfo();
      });
      onBalanceUpdate();
      resetWriteContract();
    }
  }, [isConfirmed, hash, refetchActiveGameId, refetchBotGameInfo, resetWriteContract, onBalanceUpdate]);

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
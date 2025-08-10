import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { config } from '@/lib/wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { showError, showSuccess } from '@/utils/toast';
import GameOverDisplay from './GameOverDisplay';
import { useAudio } from '@/contexts/AudioContext';

const BotMode = ({ onGameWin, onBalanceUpdate }: { onGameWin: () => void; onBalanceUpdate: () => void; }) => {
  const { address } = useAccount();
  const animationFrameRef = useRef<number | null>(null);
  const pollerRef = useRef<NodeJS.Timeout | null>(null);
  const { playSound, playMultiplierSound, resetMultiplierSound } = useAudio();

  // --- STATE MANAGEMENT ---
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<{
    playerWon: boolean;
    payout: bigint;
    finalMultiplier: bigint;
  } | null>(null);
  const [currentGameId, setCurrentGameId] = useState<bigint | null>(null);
  const [gameStartTime, setGameStartTime] = useState<bigint | null>(null);
  const [gameDuration, setGameDuration] = useState<number | null>(null);
  const [displayMultiplier, setDisplayMultiplier] = useState(1.00);
  const [displayTimeRemaining, setDisplayTimeRemaining] = useState(0);
  const [displayPayout, setDisplayPayout] = useState<bigint | null>(null);

  const resetGameState = () => {
    setCurrentGameId(null);
    setGameResult(null);
    setIsGameOver(false);
    setGameStartTime(null);
    setGameDuration(null);
    resetMultiplierSound();
    setDisplayMultiplier(1.00);
    setDisplayTimeRemaining(0);
  };

  // --- HOOKS FOR STARTING A GAME ---
  const { 
    writeContract: startGame, 
    isPending: isStartPending,
    reset: resetStartContract
  } = useWriteContract();

  const { data: activeGameId, refetch: refetchActiveGameId } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'playerActiveBotGame',
    args: [address as `0x${string}`],
    enabled: !!address,
  });

  // --- HOOKS FOR EJECTING FROM A GAME ---
  const { 
    data: ejectHash, 
    writeContract: ejectGame, 
    isPending: isEjectPending,
    reset: resetEjectContract
  } = useWriteContract();

  const { isLoading: isEjectConfirming } = useWaitForTransactionReceipt({
    hash: ejectHash,
    onSuccess: (data) => {
      if (data.status === 'success') {
        onBalanceUpdate();
        if (currentGameId) {
          fetchAndSetGameResult(currentGameId);
        }
        resetEjectContract();
      }
    },
    onError: (error) => {
      showError(error.shortMessage || error.message);
    }
  });

  const fetchAndSetGameResult = async (gameId: bigint) => {
    try {
      const result = await readContract(config, {
        address: contractAddress,
        abi: contractAbi,
        functionName: 'getBotGameResult',
        args: [gameId],
      });
  
      const [playerWon, payout, finalMultiplier] = result;
  
      if (playerWon) playSound('win'); else playSound('explosion');
      setGameResult({ playerWon, payout, finalMultiplier });
      setIsGameOver(true);
      onGameWin();
    } catch (err) {
      console.error('[BotMode] Error fetching game result proactively:', err);
      showError("Could not fetch game result. It will update shortly.");
    }
  };

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

  const fetchInitialGameData = async (gameId: bigint) => {
    try {
      const gameInfo = await readContract(config, {
        address: contractAddress,
        abi: contractAbi,
        functionName: 'getBotGameInfo',
        args: [gameId],
      });
      setGameStartTime(gameInfo[2]);

      const duration = await readContract(config, {
        address: contractAddress,
        abi: contractAbi,
        functionName: 'BOT_GAME_MAX_DURATION',
      });
      setGameDuration(Number(duration));
    } catch (err) {
      console.error("Error fetching initial game data:", err);
      showError("Could not load game display. Please refresh.");
    }
  };

  // --- EFFECT: Sync with on-chain state on page load/refresh ---
  useEffect(() => {
    if (activeGameId && activeGameId > 0n && !currentGameId) {
      setCurrentGameId(activeGameId);
      fetchInitialGameData(activeGameId);
    }
  }, [activeGameId, currentGameId]);

  // --- EVENT LISTENERS ---
  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'BotGameEnded',
    onLogs(logs) {
      logs.forEach(log => {
        const args = log.args as { gameId?: bigint; player?: `0x${string}`; playerWon?: boolean; payout?: bigint; finalMultiplier?: bigint; };
        if (args.player === address && args.gameId === currentGameId && !isGameOver) {
          if (args.playerWon) playSound('win'); else playSound('explosion');
          setGameResult({ 
            playerWon: args.playerWon as boolean, 
            payout: args.payout as bigint, 
            finalMultiplier: args.finalMultiplier as bigint 
          });
          setIsGameOver(true);
          onGameWin();
        }
      });
    },
  });

  // --- HANDLERS ---
  const handleStart = () => {
    playSound('start');
    if (!entryFeeData) return;

    const initialGameId = activeGameId;

    startGame({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startBotGame',
      value: entryFeeData as bigint,
    }, {
      onSuccess: (txHash) => {
        showSuccess(`Transaction sent: ${txHash.slice(0,10)}...`);
        onBalanceUpdate();

        const pollStartTime = Date.now();
        const pollTimeout = 30000; // 30 seconds

        pollerRef.current = setInterval(async () => {
          if (Date.now() - pollStartTime > pollTimeout) {
            showError("Game start timed out. Please refresh.");
            if (pollerRef.current) clearInterval(pollerRef.current);
            resetStartContract();
            return;
          }

          const { data: newActiveGameId } = await refetchActiveGameId();
          
          if (newActiveGameId && newActiveGameId > 0n && newActiveGameId !== initialGameId) {
            if (pollerRef.current) clearInterval(pollerRef.current);
            showSuccess("Game started!");
            setCurrentGameId(newActiveGameId);
            fetchInitialGameData(newActiveGameId);
            resetStartContract();
          }
        }, 1500); // Poll every 1.5 seconds
      },
      onError: (error) => {
        showError(error.shortMessage || error.message);
        if (pollerRef.current) clearInterval(pollerRef.current);
      }
    });
  };

  const handleEject = () => {
    playSound('eject');
    ejectGame({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'ejectFromBotGame',
    }, {
      onSuccess: (hash) => showSuccess(`Eject transaction sent: ${hash.slice(0,10)}...`),
      onError: (error) => showError(error.shortMessage || error.message)
    });
  };
  
  const handlePlayAgain = () => {
    playSound('click');
    resetGameState();
    refetchActiveGameId();
  };

  // Cleanup poller on unmount
  useEffect(() => {
    return () => {
      if (pollerRef.current) {
        clearInterval(pollerRef.current);
      }
    };
  }, []);

  // --- EFFECT: Animation loop for the multiplier ---
  useEffect(() => {
    if (!gameStartTime || !gameDuration || !currentGameId || isGameOver) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }
  
    const loop = () => {
      const elapsedSeconds = (Date.now() / 1000) - Number(gameStartTime);
  
      if (elapsedSeconds < 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }
  
      const maxMultiplier = maxMultiplierData ? Number(maxMultiplierData) / 100 : 100;
      const progress = Math.min(elapsedSeconds / gameDuration, 1.0);
      let newMultiplier = 1 + progress * (maxMultiplier - 1);
      newMultiplier = Math.min(newMultiplier, maxMultiplier);
  
      playMultiplierSound(newMultiplier);
  
      const timeRemaining = Math.max(0, gameDuration - elapsedSeconds);
      setDisplayMultiplier(newMultiplier);
      setDisplayTimeRemaining(timeRemaining);
  
      if (entryFeeData && entryFeeData > 0n) {
        const payout = (entryFeeData * BigInt(Math.floor(newMultiplier * 100))) / 100n;
        setDisplayPayout(payout);
      }
  
      if (timeRemaining > 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
      } else {
        setDisplayMultiplier(maxMultiplier);
        if (currentGameId && !isGameOver) {
          fetchAndSetGameResult(currentGameId);
        }
      }
    };
  
    animationFrameRef.current = requestAnimationFrame(loop);
  
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameStartTime, gameDuration, currentGameId, maxMultiplierData, entryFeeData, playMultiplierSound, isGameOver]);

  const isEjecting = isEjectPending || isEjectConfirming;
  const isStarting = isStartPending;
  const formattedEntryFee = entryFeeData ? formatEther(entryFeeData as bigint) : '...';
  const isButtonDisabled = isStarting || isLoadingFee || !!currentGameId;
  const buttonText = isStarting ? 'Sending...' : `Start Bot Game (${formattedEntryFee} STT)`;
  const currentIsActive = !!currentGameId && !isGameOver;

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
          {currentIsActive ? (
            <Button onClick={handleEject} disabled={isEjecting} className="retro-btn-success action-btn cashout-btn">
              {isEjecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEjectConfirming ? 'Confirming...' : 'Cash Out!'}
            </Button>
          ) : (
            <Button onClick={handleStart} disabled={isButtonDisabled} className="retro-btn-warning action-btn pulse">
              {isStarting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {buttonText}
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default BotMode;
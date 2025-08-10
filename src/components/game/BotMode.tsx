import { 
  useAccount, 
  useReadContract, 
  useWriteContract, 
  useWaitForTransactionReceipt, 
  useWatchContractEvent 
} from 'wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { showError, showSuccess } from '@/utils/toast';
import GameOverDisplay from './GameOverDisplay';
import { useAudio } from '@/contexts/AudioContext';

const BOT_ROUND_DURATION = 30; // seconds

const BotMode = ({ onGameWin, onBalanceUpdate }: { onGameWin: () => void; onBalanceUpdate: () => void; }) => {
  const { address } = useAccount();
  const animationFrameRef = useRef<number | null>(null);
  const { playSound, playMultiplierSound, resetMultiplierSound } = useAudio();

  // --- STATE MANAGEMENT ---
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<{ playerWon: boolean; payout: bigint; finalMultiplier: bigint; } | null>(null);
  const [currentGameId, setCurrentGameId] = useState<bigint | null>(null);

  console.log('[BotMode] Render. Current Game ID:', currentGameId?.toString());

  // --- HOOKS FOR STARTING A GAME ---
  const { data: startHash, writeContract: startGame, isPending: isStartPending, reset: resetStartContract } = useWriteContract();

  const { data: activeGameId, refetch: refetchActiveGameId } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'playerActiveBotGame', // ✅ fixed function name
    args: [address as `0x${string}`],
    enabled: !!address,
  });

  // Fetch Bot Game Info
  const { data: botGameInfo, refetch: refetchBotGameInfo } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getBotGameInfo',
    args: [currentGameId as bigint],
    enabled: !!currentGameId && Number(currentGameId) > 0,
  });

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

  // --- Wait for transaction receipt after starting a game ---
  useWaitForTransactionReceipt({
    hash: startHash,
    onSettled: async (data, error) => {
      console.log('[BotMode] Start transaction settled. Data:', data, 'Error:', error);
      if (error) {
        console.error('[BotMode] Transaction failed:', error);
        showError(error.shortMessage || 'Transaction failed.');
        resetStartContract();
        return;
      }
      if (data?.status === 'success') {
        showSuccess("Transaction confirmed! Fetching game details...");
        onBalanceUpdate();

        // Poll for new game ID
        for (let i = 0; i < 5; i++) {
          const { data: newGameId } = await refetchActiveGameId();
          if (newGameId && newGameId > 0n) {
            setCurrentGameId(newGameId);
            refetchBotGameInfo();
            resetStartContract();
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        showError("Could not sync with the new game. Please refresh.");
        resetStartContract();
      } else if (data?.status === 'reverted') {
        showError('Transaction failed. You may already be in a game.');
        resetStartContract();
      }
    },
  });

  // --- HOOKS FOR EJECTING FROM A GAME ---
  const { data: ejectHash, writeContract: ejectGame, isPending: isEjectPending, reset: resetEjectContract } = useWriteContract();

  const { isLoading: isEjectConfirming } = useWaitForTransactionReceipt({
    hash: ejectHash,
    onSuccess: () => {
      onBalanceUpdate();
      resetEjectContract();
    },
    onError: (error) => {
      showError(error.shortMessage || error.message);
    }
  });

  // --- Sync local state with on-chain state ---
  useEffect(() => {
    if (activeGameId && activeGameId > 0n && !currentGameId) {
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
        if (log.args.player === address) {
          console.log('[BotMode] BotGameStarted event:', log.args);
          setCurrentGameId(log.args.gameId);
          refetchBotGameInfo();
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
        if (log.args.player === address && log.args.gameId?.toString() === currentGameId?.toString()) {
          console.log('[BotMode] BotGameEnded event:', log.args);
          setGameResult({
            playerWon: log.args.playerWon as boolean,
            payout: log.args.payout as bigint,
            finalMultiplier: log.args.finalMultiplier as bigint
          });
          setIsGameOver(true);
          setCurrentGameId(null);
          onGameWin();
          resetMultiplierSound();
        }
      });
    },
  });

  // --- EVENT LISTENER: Player Ejected ---
  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'PlayerEjected',
    onLogs(logs) {
      logs.forEach(log => {
        if (log.args.player === address) {
          console.log('[BotMode] PlayerEjected event:', log.args);
          setIsGameOver(true);
          setGameResult(prev => prev || { playerWon: true, payout: BigInt(0), finalMultiplier: BigInt(0) });
          setCurrentGameId(null);
          onGameWin();
        }
      });
    },
  });

  // --- UI STATE ---
  const [displayMultiplier, setDisplayMultiplier] = useState(1.00);
  const [displayTimeRemaining, setDisplayTimeRemaining] = useState(BOT_ROUND_DURATION);
  const [displayPayout, setDisplayPayout] = useState<bigint | null>(null);

  const currentIsActive = botGameInfo ? botGameInfo[4] : false;
  const startTime = botGameInfo ? botGameInfo[2] : 0n;
  const gameEntryFee = botGameInfo ? botGameInfo[3] : 0n;

  // --- Animation loop for multiplier ---
  useEffect(() => {
    if (currentIsActive && startTime > 0) {
      console.log('[BotMode] Animation loop started for game ID:', currentGameId?.toString());
    }

    const loop = () => {
      if (!startTime || startTime === 0n || !currentIsActive) {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        return;
      }
      const elapsed = (Date.now() / 1000) - Number(startTime);
      const maxMultiplier = maxMultiplierData ? Number(maxMultiplierData) / 100 : Infinity;
      let newMultiplier = 1 + (elapsed / 5);
      if (newMultiplier > maxMultiplier) newMultiplier = maxMultiplier;

      playMultiplierSound(newMultiplier);
      const newTimeRemaining = Math.max(0, BOT_ROUND_DURATION - elapsed);
      setDisplayMultiplier(newMultiplier);
      setDisplayTimeRemaining(newTimeRemaining);

      if (gameEntryFee > 0n) {
        const payout = (gameEntryFee * BigInt(Math.floor(newMultiplier * 10000))) / 10000n;
        setDisplayPayout(payout);
      }
      if (newTimeRemaining > 0 && newMultiplier < maxMultiplier && currentIsActive) {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    if (currentIsActive && startTime > 0) {
      animationFrameRef.current = requestAnimationFrame(loop);
    } else {
      setDisplayMultiplier(1.00);
      setDisplayTimeRemaining(BOT_ROUND_DURATION);
      setDisplayPayout(entryFeeData ?? null);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [currentIsActive, startTime, gameEntryFee, maxMultiplierData, entryFeeData, playMultiplierSound, currentGameId]);

  // --- Handlers ---
  const handleStart = () => {
    if (!entryFeeData) return;
    playSound('start');
    startGame({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startBotGame',
      value: entryFeeData as bigint,
    }, {
      onSuccess: (txHash) => showSuccess(`Transaction sent: ${txHash.slice(0,10)}...`),
      onError: (error) => showError(error.shortMessage || error.message)
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
    setIsGameOver(false);
    setGameResult(null);
    setCurrentGameId(null);
    refetchActiveGameId();
    resetMultiplierSound();
  };

  const isEjecting = isEjectPending || isEjectConfirming;
  const isStarting = isStartPending;
  const formattedEntryFee = entryFeeData ? formatEther(entryFeeData as bigint) : '...';
  const isButtonDisabled = isStarting || isLoadingFee || !!currentGameId;
  const buttonText = isStarting ? 'Sending...' : `Start Bot Game (${formattedEntryFee} STT)`;

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
            <Button onClick={handleEject} disabled={isEjecting} className="retro-btn-success action-btn cashout-btn">
              {isEjecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cash Out!
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

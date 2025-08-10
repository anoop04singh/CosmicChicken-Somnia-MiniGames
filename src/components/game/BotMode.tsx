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
  const { playSound, playMultiplierSound, resetMultiplierSound } = useAudio();

  // --- STATE ---
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameResult, setGameResult] = useState<{ playerWon: boolean; payout: bigint; finalMultiplier: bigint; } | null>(null);
  const [currentGameId, setCurrentGameId] = useState<bigint | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [maxMultiplier, setMaxMultiplier] = useState<number>(0);
  const [entryFee, setEntryFee] = useState<bigint | null>(null);

  // Multiplier display state
  const [displayMultiplier, setDisplayMultiplier] = useState(1.00);
  const [displayTimeRemaining, setDisplayTimeRemaining] = useState(0);
  const [displayPayout, setDisplayPayout] = useState<bigint | null>(null);

  // --- HOOKS: Start game ---
  const { data: startHash, writeContract: startGame, isPending: isStartPending, reset: resetStartContract } = useWriteContract();
  const { data: activeGameId, refetch: refetchActiveGameId } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'playerActiveBotGame',
    args: [address as `0x${string}`],
    enabled: !!address,
  });

  useWaitForTransactionReceipt({
    hash: startHash,
    onSettled: async (data, error) => {
      if (error) {
        showError(error.shortMessage || 'Transaction failed.');
        resetStartContract();
        return;
      }
      if (data && data.status === 'success') {
        showSuccess("Transaction confirmed! Waiting for game start...");
        onBalanceUpdate();
        resetStartContract();
      } else if (data && data.status === 'reverted') {
        showError('Transaction failed. You may already be in a game.');
        resetStartContract();
      }
    },
  });

  // --- HOOKS: Eject game ---
  const { data: ejectHash, writeContract: ejectGame, isPending: isEjectPending, reset: resetEjectContract } = useWriteContract();
  const { isLoading: isEjectConfirming } = useWaitForTransactionReceipt({
    hash: ejectHash,
    onSuccess: async (data) => {
      if (data.status === 'success') {
        onBalanceUpdate();
        if (currentGameId) {
          await fetchAndSetGameResult(currentGameId);
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
      const [playerWon, payout, finalMultiplier] = result as [boolean, bigint, bigint];
      if (playerWon) playSound('win'); else playSound('explosion');
      setGameResult({ playerWon, payout, finalMultiplier });
      setIsGameOver(true);
      setCurrentGameId(null);
      onGameWin();
      resetMultiplierSound();
    } catch (err) {
      console.error('[BotMode] Error fetching game result:', err);
      showError("Could not fetch game result.");
    }
  };

  // --- Read constants on mount ---
  useEffect(() => {
    const fetchConstants = async () => {
      try {
        const fee = await readContract(config, { address: contractAddress, abi: contractAbi, functionName: 'entryFee' }) as bigint;
        const maxMult = await readContract(config, { address: contractAddress, abi: contractAbi, functionName: 'BOT_MAX_MULTIPLIER' }) as bigint;
        const dur = await readContract(config, { address: contractAddress, abi: contractAbi, functionName: 'BOT_GAME_MAX_DURATION' }) as bigint;
        setEntryFee(fee);
        setMaxMultiplier(Number(maxMult) / 100);
        setDuration(Number(dur));
        setDisplayPayout(fee);
      } catch (err) {
        console.error('Error fetching constants:', err);
      }
    };
    fetchConstants();
  }, []);

  // Sync game ID on load
  useEffect(() => {
    if (activeGameId && activeGameId > 0n && !currentGameId) {
      setCurrentGameId(activeGameId);
    }
  }, [activeGameId, currentGameId]);

  // --- Event listeners ---
  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'BotGameStarted',
    onLogs: async (logs) => {
      logs.forEach(async log => {
        const args = log.args as { gameId?: bigint; player?: `0x${string}` };
        if (args.player === address) {
          setCurrentGameId(args.gameId as bigint);
          // Fetch start time from contract
          const info = await readContract(config, {
            address: contractAddress,
            abi: contractAbi,
            functionName: 'getBotGameInfo',
            args: [args.gameId as bigint],
          });
          const start = Number((info as any[])[2]);
          const fee = (info as any[])[3] as bigint;
          setStartTime(start);
          setDisplayPayout(fee);
        }
      });
    },
  });

  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'BotGameEnded',
    onLogs(logs) {
      logs.forEach(log => {
        const args = log.args as { gameId?: bigint; player?: `0x${string}`; playerWon?: boolean; payout?: bigint; finalMultiplier?: bigint; };
        if (args.player === address && args.gameId === currentGameId && !isGameOver) {
          if (args.playerWon) playSound('win'); else playSound('explosion');
          setGameResult({ playerWon: args.playerWon as boolean, payout: args.payout as bigint, finalMultiplier: args.finalMultiplier as bigint });
          setIsGameOver(true);
          setCurrentGameId(null);
          onGameWin();
          resetMultiplierSound();
        }
      });
    },
  });

  // --- Multiplier loop (frontend only) ---
  useEffect(() => {
    if (!startTime || duration <= 0 || maxMultiplier <= 0) return;
    const loop = () => {
      const elapsed = (Date.now() / 1000) - startTime;
      if (elapsed < 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }
      let newMultiplier = 1 + (elapsed / 5);
      if (newMultiplier > maxMultiplier) newMultiplier = maxMultiplier;
      playMultiplierSound(newMultiplier);
      const newTimeRemaining = Math.max(0, duration - elapsed);
      setDisplayMultiplier(newMultiplier);
      setDisplayTimeRemaining(newTimeRemaining);
      if (entryFee) {
        const payout = (entryFee * BigInt(Math.floor(newMultiplier * 10000))) / 10000n;
        setDisplayPayout(payout);
      }
      if (newTimeRemaining > 0 && newMultiplier < maxMultiplier) {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };
    animationFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [startTime, duration, maxMultiplier, entryFee, playMultiplierSound]);

  // --- Handlers ---
  const handleStart = () => {
    playSound('start');
    if (!entryFee) return;
    startGame({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startBotGame',
      value: entryFee,
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
    setStartTime(null);
    refetchActiveGameId();
    resetMultiplierSound();
  };

  // --- UI ---
  const isEjecting = isEjectPending || isEjectConfirming;
  const isStarting = isStartPending;
  const formattedEntryFee = entryFee ? formatEther(entryFee) : '...';
  const isButtonDisabled = isStarting || !entryFee || !!currentGameId;
  const buttonText = isStarting ? 'Sending...' : `Start Bot Game (${formattedEntryFee} STT)`;

  if (isGameOver && gameResult) {
    return <GameOverDisplay result={gameResult} onPlayAgain={handlePlayAgain} />;
  }

  return (
    <>
      <div className="rules-panel casino-rules">
        <h3 className="panel-title">Speed Round Rules</h3>
        <div className="rules-list">
          <p className="rule-item">Pay {formattedEntryFee} STT to start a round against the bot.</p>
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
            <div className="bot-stat-value payout">{displayPayout ? formatEther(displayPayout) : '0.00'} STT</div>
          </div>
          <div className="bot-stat">
            <div className="bot-stat-label">Time Remaining</div>
            <div className="bot-stat-value time">{startTime ? `${Math.floor(displayTimeRemaining)}s` : '--s'}</div>
          </div>
        </div>
      </div>

      <div className="game-status">
        <div className="action-buttons">
          {currentGameId && startTime ? (
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

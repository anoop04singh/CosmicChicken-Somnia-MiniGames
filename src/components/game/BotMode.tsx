import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
import { readContract } from '@wagmi/core';
import { config } from '@/lib/wagmi';
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
  const [gameResult, setGameResult] = useState<{
    playerWon: boolean;
    payout: bigint;
    finalMultiplier: bigint;
  } | null>(null);
  const [currentGameId, setCurrentGameId] = useState<bigint | null>(null);

  // --- HOOKS FOR STARTING A GAME ---
  const { 
    data: startHash, 
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

  useWaitForTransactionReceipt({
    hash: startHash,
    onSettled: (data, error) => {
      if (error) {
        showError(error.shortMessage || 'Transaction failed.');
        resetStartContract();
        return;
      }
      if (data && data.status === 'success') {
        showSuccess("Transaction confirmed! Starting game...");
        onBalanceUpdate();
        resetStartContract();
      } else if (data && data.status === 'reverted') {
        showError('Transaction failed. You may already be in a game.');
        resetStartContract();
      }
    },
  });

  // --- HOOKS FOR EJECTING FROM A GAME ---
  const { 
    data: ejectHash, 
    writeContract: ejectGame, 
    isPending: isEjectPending,
    reset: resetEjectContract
  } = useWriteContract();

  const fetchAndSetGameResult = async (gameId: bigint) => {
    try {
      console.log(`[BotMode] Proactively fetching result for game ID: ${gameId}`);
      const result = await readContract(config, {
        address: contractAddress,
        abi: contractAbi,
        functionName: 'getBotGameResult',
        args: [gameId],
      });
  
      const [playerWon, payout, finalMultiplier] = result;
      console.log('[BotMode] Fetched game result:', { playerWon, payout, finalMultiplier });
  
      if (playerWon) playSound('win'); else playSound('explosion');
      setGameResult({ playerWon, payout, finalMultiplier });
      setIsGameOver(true);
      setCurrentGameId(null);
      onGameWin();
      resetMultiplierSound();
    } catch (err) {
      console.error('[BotMode] Error fetching game result proactively:', err);
      showError("Could not fetch game result. It will update shortly.");
    }
  };

  useWaitForTransactionReceipt({
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

  const { data: botGameInfo, refetch: refetchBotGameInfo } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getBotGameInfo',
    args: [currentGameId as bigint],
    enabled: !!currentGameId && Number(currentGameId) > 0,
  });

  // --- EFFECT: Sync with on-chain state on page load/refresh ---
  useEffect(() => {
    if (activeGameId && activeGameId > 0n && !currentGameId) {
      setCurrentGameId(activeGameId);
    }
  }, [activeGameId, currentGameId]);

  // --- EVENT LISTENERS ---
  useWatchContractEvent({
    address: contractAddress,
    abi: contractAbi,
    eventName: 'BotGameStarted',
    onLogs(logs) {
      logs.forEach(log => {
        const args = log.args as { gameId?: bigint; player?: `0x${string}` };
        if (args.player === address) {
          setCurrentGameId(args.gameId as bigint);
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
          setGameResult({ 
            playerWon: args.playerWon as boolean, 
            payout: args.payout as bigint, 
            finalMultiplier: args.finalMultiplier as bigint 
          });
          setIsGameOver(true);
          setCurrentGameId(null);
          onGameWin();
          resetMultiplierSound();
        }
      });
    },
  });

  // --- UI STATE DERIVATION ---
  const [displayMultiplier, setDisplayMultiplier] = useState(1.00);
  const [displayTimeRemaining, setDisplayTimeRemaining] = useState(BOT_ROUND_DURATION);
  const [displayPayout, setDisplayPayout] = useState<bigint | null>(null);

  // --- HANDLERS ---
  const handleStart = () => {
    playSound('start');
    if (!entryFeeData) return;
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

  // --- EFFECT: Animation loop for the multiplier ---
  useEffect(() => {
    const currentIsActive = botGameInfo ? botGameInfo[4] : false;
    const startTime = botGameInfo ? botGameInfo[2] : 0n;
    const gameEntryFee = botGameInfo ? botGameInfo[3] : 0n;

    const loop = () => {
      if (!startTime || startTime === 0n || !currentIsActive) {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        return;
      }
      const elapsed = (Date.now() / 1000) - Number(startTime);
      if (elapsed < 0) {
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }

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
  }, [botGameInfo, entryFeeData, maxMultiplierData, playMultiplierSound]);

  const isEjecting = isEjectPending || isEjectConfirming;
  const isStarting = isStartPending;
  const formattedEntryFee = entryFeeData ? formatEther(entryFeeData as bigint) : '...';
  const isButtonDisabled = isStarting || isLoadingFee || !!currentGameId;
  const buttonText = isStarting ? 'Sending...' : `Start Bot Game (${formattedEntryFee} STT)`;
  const currentIsActive = botGameInfo ? botGameInfo[4] : false;

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
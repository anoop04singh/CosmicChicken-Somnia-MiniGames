import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useWatchContractEvent } from 'wagmi';
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

  console.log('[BotMode] Render. Current Game ID:', currentGameId?.toString());

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
    functionName: 'playerActiveBotGame', // ✅ Corrected function name from ABI
    args: [address as `0x${string}`],
    enabled: !!address,
  });

  useWaitForTransactionReceipt({
    hash: startHash,
    onSettled: async (data, error) => {
      console.log('[BotMode] Start transaction settled. Data:', data, 'Error:', error);
      if (error) {
        console.error('[BotMode] Transaction failed onsettled:', error);
        showError(error.shortMessage || 'Transaction failed.');
        resetStartContract();
        return;
      }
      if (data && data.status === 'success') {
        console.log('[BotMode] Transaction successful. Receipt:', data);
        showSuccess("Transaction confirmed! Waiting for game to start...");
        onBalanceUpdate();
        
        // Fallback polling in case event is missed
        console.log('[BotMode] Actively polling for new game ID as a fallback...');
        for (let i = 0; i < 5; i++) {
          if (currentGameId) break; // Stop polling if event listener already set the ID
          const { data: newGameId } = await refetchActiveGameId();
          if (newGameId && newGameId > 0n && newGameId !== activeGameId) {
            console.log('[BotMode] Polling found new game ID:', newGameId.toString());
            setCurrentGameId(newGameId);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        resetStartContract();

      } else if (data && data.status === 'reverted') {
        console.error('[BotMode] Transaction reverted. Receipt:', data);
        showError('Transaction failed. The contract reverted the transaction. You may already be in a game.');
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

  const { isLoading: isEjectConfirming } = useWaitForTransactionReceipt({
    hash: ejectHash,
    onSuccess: (data) => {
      console.log('[BotMode] Eject transaction confirmed:', data);
      if (data.status === 'success') {
        onBalanceUpdate();
        resetEjectContract();
      }
    },
    onError: (error) => {
      console.error('[BotMode] Error waiting for eject transaction receipt:', error);
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

  const { data: botGameInfo } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getBotGameInfo',
    args: [currentGameId as bigint],
    enabled: !!currentGameId && Number(currentGameId) > 0,
  });

  // --- EFFECT: Sync with on-chain state on page load/refresh ---
  useEffect(() => {
    if (activeGameId && activeGameId > 0n && !currentGameId) {
      console.log('[BotMode] Syncing local game ID from activeGameId on load:', activeGameId.toString());
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
          console.log('[BotMode] BotGameStarted event received, setting game ID:', args.gameId?.toString());
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
        if (args.player === address && args.gameId === currentGameId) {
          console.log('[BotMode] BotGameEnded event matches current game. Processing result.');
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

  const currentIsActive = botGameInfo ? botGameInfo[4] : false;
  const startTime = botGameInfo ? botGameInfo[2] : 0n;
  const gameEntryFee = botGameInfo ? botGameInfo[3] : 0n;

  // --- HANDLERS ---
  const handleStart = () => {
    console.log('[BotMode] handleStart called.');
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
    console.log('[BotMode] handleEject called for game ID:', currentGameId?.toString());
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
    console.log('[BotMode] handlePlayAgain called. Resetting state.');
    playSound('click');
    setIsGameOver(false);
    setGameResult(null);
    setCurrentGameId(null);
    refetchActiveGameId();
    resetMultiplierSound();
  };

  // --- EFFECT: Animation loop for the multiplier ---
  useEffect(() => {
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
  }, [currentIsActive, startTime, gameEntryFee, maxMultiplierData, entryFeeData, playMultiplierSound]);

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
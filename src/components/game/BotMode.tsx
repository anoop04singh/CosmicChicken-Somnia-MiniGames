import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { parseEther, formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const BotMode = () => {
  const { address } = useAccount();
  const { data: hash, writeContract, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const { data: botGameInfo, refetch: refetchBotGame } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getBotGameInfo',
    args: [address!],
    enabled: !!address,
  });

  const gameId = botGameInfo ? (botGameInfo as any)[0] : 0;
  const isActive = botGameInfo ? (botGameInfo as any)[2] : false;

  const { data: potentialPayout } = useReadContract({
    address: contractAddress,
    abi: contractAbi,
    functionName: 'getPotentialPayout',
    args: [gameId],
    enabled: !!gameId && isActive,
  });

  const [multiplier, setMultiplier] = useState(1);

  useEffect(() => {
    if (isConfirmed) {
      refetchBotGame();
      reset();
    }
  }, [isConfirmed, refetchBotGame, reset]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive) {
      const startTime = Number((botGameInfo as any)[1]);
      interval = setInterval(() => {
        const elapsed = (Date.now() / 1000) - startTime;
        const newMultiplier = 1 + (elapsed / 5);
        setMultiplier(newMultiplier);
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isActive, botGameInfo]);

  const handleStart = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'startBotGame',
      value: parseEther('0.01'),
    });
  };

  const handleEject = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'ejectFromBotGame',
    });
  };

  const handleReset = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'resetBotGame',
      args: [address!]
    });
  }

  const isFinished = botGameInfo ? (botGameInfo as any)[3] : false;

  return (
    <>
      <div className="rules-panel casino-rules">
        <h3 className="panel-title">Speed Round Rules</h3>
        <div className="rules-list">
          <p className="rule-item">Pay 0.01 SOM to start a 30-second round against the bot.</p>
          <p className="rule-item">A prize multiplier increases rapidly.</p>
          <p className="rule-item">The bot will eject at a random time. Cash out before it does to win!</p>
          <p className="rule-item">If the bot ejects first or time runs out, you lose.</p>
        </div>
      </div>

      <div className="bot-game-display">
        <div className="multiplier-display">
          <div className="multiplier-value">{multiplier.toFixed(2)}x</div>
          <div className="multiplier-label">Current Multiplier</div>
        </div>
        <div className="bot-stats">
          <div className="bot-stat">
            <div className="bot-stat-label">Potential Payout</div>
            <div className="bot-stat-value payout">
              {potentialPayout ? formatEther(potentialPayout as bigint) : '0.00'} SOM
            </div>
          </div>
          <div className="bot-stat">
            <div className="bot-stat-label">Time Remaining</div>
            <div className="bot-stat-value time">--s</div>
          </div>
        </div>
      </div>

      <div className="game-status">
        <div className="action-buttons">
          {!isActive && !isFinished && (
            <Button onClick={handleStart} disabled={isPending || isConfirming} className="retro-btn-warning action-btn pulse">
              {isPending || isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start Bot Game (0.01 SOM)
            </Button>
          )}
          {isActive && (
            <Button onClick={handleEject} disabled={isPending || isConfirming} className="retro-btn-success action-btn cashout-btn">
              {isPending || isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Cash Out!
            </Button>
          )}
          {isFinished && (
             <Button onClick={handleReset} disabled={isPending || isConfirming} className="retro-btn-primary action-btn">
              {isPending || isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Play Again
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default BotMode;
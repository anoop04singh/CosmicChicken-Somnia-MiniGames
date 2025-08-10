import React from 'react';
import { Button } from '@/components/ui/button';
import { formatEther } from 'viem';

interface GameOverDisplayProps {
  result: {
    playerWon: boolean;
    payout: bigint;
    finalMultiplier: bigint;
  };
  onPlayAgain: () => void;
}

const GameOverDisplay: React.FC<GameOverDisplayProps> = ({ result, onPlayAgain }) => {
  const { playerWon, payout, finalMultiplier } = result;
  const formattedMultiplier = (Number(finalMultiplier) / 100).toFixed(2);
  const formattedPayout = formatEther(payout);

  return (
    <div className="game-over-display">
      <h2 className="game-over-title">{playerWon ? '🎉 YOU WON! 🎉' : '🤖 BOT WON 🤖'}</h2>
      {playerWon ? (
        <p className="game-over-message">You cashed out! Your winnings have been added to your withdrawable balance.</p>
      ) : (
        <p className="game-over-message">The bot ejected first or the time ran out. Better luck next time!</p>
      )}
      <div className="game-over-stats">
        <div>
          <strong>Final Multiplier:</strong> {formattedMultiplier}x
        </div>
        <div>
          <strong>Your Payout:</strong> {formattedPayout} STT
        </div>
      </div>
      <Button onClick={onPlayAgain} className="retro-btn-primary action-btn mt-6">
        Play Again
      </Button>
    </div>
  );
};

export default GameOverDisplay;
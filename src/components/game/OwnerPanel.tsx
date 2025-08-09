import { useState } from 'react';
import { useWriteContract, useBalance, useWaitForTransactionReceipt } from 'wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { parseEther, formatEther } from 'viem';
import { showError, showSuccess } from '@/utils/toast';

const OwnerPanel = () => {
  const [betAmount, setBetAmount] = useState('');
  const [roundDuration, setRoundDuration] = useState('');
  const [botMin, setBotMin] = useState('');
  const [botMax, setBotMax] = useState('');

  const { data: contractBalance } = useBalance({ address: contractAddress });
  
  const { data: hash, writeContract, isPending, reset } = useWriteContract({
    onSuccess: () => {
      showSuccess('Transaction sent!');
      setBetAmount('');
      setRoundDuration('');
      setBotMin('');
      setBotMax('');
    },
    onError: (error) => {
      showError(error.shortMessage || error.message);
    }
  });

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ 
    hash,
    onSuccess: () => {
      showSuccess('Transaction confirmed!');
      reset();
    }
  });

  const handleWithdraw = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'withdrawContractBalance',
    });
  };

  const handleSetBetAmount = () => {
    if (!betAmount || isNaN(parseFloat(betAmount))) {
      showError("Please enter a valid bet amount.");
      return;
    }
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'updateEntryFee',
      args: [parseEther(betAmount)],
    });
  };

  const handleSetRoundDuration = () => {
    if (!roundDuration || isNaN(parseInt(roundDuration))) {
      showError("Please enter a valid duration.");
      return;
    }
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'updateRoundDuration',
      args: [BigInt(roundDuration)],
    });
  };

  const handleSetBotWindow = () => {
    if (!botMin || isNaN(parseInt(botMin)) || !botMax || isNaN(parseInt(botMax))) {
      showError("Please enter valid min and max durations.");
      return;
    }
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'updateBotEjectWindow',
      args: [BigInt(botMin), BigInt(botMax)],
    });
  };

  const isLoading = isPending || isConfirming;

  return (
    <div className="owner-panel">
      <h3 className="panel-title">Owner Controls</h3>
      <div className="owner-content">
        <div className="balance-info">
          <span className="balance-label">Contract Balance</span>
          <span className="balance-value">
            {contractBalance ? `${formatEther(contractBalance.value)} ${contractBalance.symbol}` : '...'}
          </span>
        </div>
        <Button onClick={handleWithdraw} disabled={isLoading} className="retro-btn-warning withdraw-btn">
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Withdraw Balance'}
        </Button>
      </div>
      <div className="flex flex-col md:flex-row gap-4 mt-4">
        <div className="flex-1 flex flex-col">
          <Input 
            type="text" 
            placeholder="New Bet Amount (STT)" 
            value={betAmount}
            onChange={(e) => setBetAmount(e.target.value)}
            className="retro-input"
            disabled={isLoading}
          />
          <Button onClick={handleSetBetAmount} disabled={isLoading} className="retro-btn-primary w-full mt-2">
            Set Bet Amount
          </Button>
        </div>
        <div className="flex-1 flex flex-col">
          <Input 
            type="number" 
            placeholder="New Round Duration (s)" 
            value={roundDuration}
            onChange={(e) => setRoundDuration(e.target.value)}
            className="retro-input"
            disabled={isLoading}
          />
          <Button onClick={handleSetRoundDuration} disabled={isLoading} className="retro-btn-primary w-full mt-2">
            Set Duration
          </Button>
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-4 mt-4">
        <div className="flex-1 flex flex-col">
          <Input 
            type="number" 
            placeholder="Bot Eject Min (s)" 
            value={botMin}
            onChange={(e) => setBotMin(e.target.value)}
            className="retro-input"
            disabled={isLoading}
          />
        </div>
        <div className="flex-1 flex flex-col">
          <Input 
            type="number" 
            placeholder="Bot Eject Max (s)" 
            value={botMax}
            onChange={(e) => setBotMax(e.target.value)}
            className="retro-input"
            disabled={isLoading}
          />
        </div>
      </div>
      <Button onClick={handleSetBotWindow} disabled={isLoading} className="retro-btn-primary w-full mt-2">
        Set Bot Eject Window
      </Button>
    </div>
  );
};

export default OwnerPanel;
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { contractAddress, contractAbi } from '@/lib/abi';
import { parseEther, formatEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

const MultiplayerMode = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: hash, writeContract, isPending, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const [roundInfo, setRoundInfo] = useState<readonly [bigint, bigint, `0x${string}`, bigint, boolean] | null>(null);
  const [isPlayerInRound, setIsPlayerInRound] = useState<boolean>(false);
  const [isLoadingRound, setIsLoadingRound] = useState(true);
  const [timeLeft, setTimeLeft] = useState(0);

  const fetchRoundData = useCallback(async () => {
    if (!publicClient) return;
    setIsLoadingRound(true);
    try {
      const info = await publicClient.readContract({
        address: contractAddress,
        abi: contractAbi,
        functionName: 'getCurrentRoundInfo',
      });
      setRoundInfo(info);

      if (address) {
        const isInRound = await publicClient.readContract({
          address: contractAddress,
          abi: contractAbi,
          functionName: 'isPlayerInCurrentRound',
          args: [address],
        });
        setIsPlayerInRound(isInRound);
      }
    } catch (e) {
      console.error("Failed to fetch round data:", e);
    } finally {
      setIsLoadingRound(false);
    }
  }, [publicClient, address]);

  useEffect(() => {
    fetchRoundData();
    const interval = setInterval(fetchRoundData, 5000);
    return () => clearInterval(interval);
  }, [fetchRoundData]);

  useEffect(() => {
    if (roundInfo) {
      const endTime = Number(roundInfo[1]);
      const now = Math.floor(Date.now() / 1000);
      setTimeLeft(Math.max(0, endTime - now));
    }
  }, [roundInfo]);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  useEffect(() => {
    if (isConfirmed) {
      fetchRoundData();
      reset();
    }
  }, [isConfirmed, fetchRoundData, reset]);

  const handleJoin = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'joinRound',
      value: parseEther('0.01'),
    });
  };

  const handleEject = () => {
    writeContract({
      address: contractAddress,
      abi: contractAbi,
      functionName: 'ejectFromRound',
    });
  };

  return (
    <>
      <div className="rules-panel">
        <h3 className="panel-title">Multiplayer Royale Rules</h3>
        <div className="rules-list">
          <p className="rule-item">Pay 0.01 STT to join the round.</p>
          <p className="rule-item">Each new player resets the timer.</p>
          <p className="rule-item">Eject anytime to leave, but forfeit your fee.</p>
          <p className="rule-item">The last player to join before the timer runs out wins the entire prize pool!</p>
        </div>
      </div>

      <div className="intense-timer">
        <div className="timer-display">
          <div className="timer-value">{isLoadingRound ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : `${timeLeft}s`}</div>
          <div className="timer-bar">
            <div className="timer-fill" style={{ width: `${(timeLeft / 60) * 100}%` }}></div>
          </div>
        </div>
      </div>

      <div className="game-status">
        <div className="status-display">
          <div className="round-info">
            {isLoadingRound ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              roundInfo ? `Prize Pool: ${formatEther(roundInfo[0] as bigint)} STT | Players: ${Number(roundInfo[3])}` : 'Loading...'
            )}
          </div>
        </div>
        <div className="action-buttons">
          {!isPlayerInRound ? (
            <Button onClick={handleJoin} disabled={isPending || isConfirming} className="retro-btn-success action-btn pulse">
              {isPending || isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Join Round (0.01 STT)
            </Button>
          ) : (
            <Button onClick={handleEject} disabled={isPending || isConfirming} className="retro-btn-danger action-btn eject-btn">
              {isPending || isConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Eject from Round
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

export default MultiplayerMode;
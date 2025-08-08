import { useAccount } from 'wagmi';
import ConnectWallet from '@/components/game/ConnectWallet';
import GameUI from '@/components/game/GameUI';

const Index = () => {
  const { isConnected } = useAccount();

  return (
    <div className="retro-desktop">
      {isConnected ? <GameUI /> : <ConnectWallet />}
    </div>
  );
};

export default Index;
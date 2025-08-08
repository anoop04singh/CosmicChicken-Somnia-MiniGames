import { useConnect } from 'wagmi';
import RetroWindow from './RetroWindow';
import { Button } from '@/components/ui/button';

const ConnectWallet = () => {
  const { connectors, connect } = useConnect();

  return (
    <div className="desktop-center-full">
      <RetroWindow title="Cosmic Chicken" className="connect-window">
        <div className="connect-content">
          <div className="retro-logo">
            <div className="chicken-container">
              <span className="chicken-sprite">🐔</span>
              <div className="chicken-effects">
                <span className="rocket-flame">🔥</span>
                <span className="space-helmet">👩‍🚀</span>
              </div>
            </div>
            <div className="logo-text">
              <h1 className="title-text">Cosmic Chicken</h1>
              <p className="subtitle-text">A Web3 Game of Nerve</p>
            </div>
          </div>
          <div className="retro-text">
            Welcome to Cosmic Chicken! Connect your wallet to start playing.
            This game runs on the Somnia Testnet.
          </div>
          <div className="flex flex-col items-center gap-2 mt-4">
            {connectors.map((connector) => (
              <Button
                key={connector.uid}
                onClick={() => connect({ connector })}
                className="retro-btn-primary connect-btn w-full"
              >
                Connect with {connector.name}
              </Button>
            ))}
          </div>
        </div>
      </RetroWindow>
    </div>
  );
};

export default ConnectWallet;
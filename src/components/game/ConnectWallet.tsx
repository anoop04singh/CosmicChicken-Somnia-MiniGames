import { useConnect } from 'wagmi';
import RetroWindow from './RetroWindow';
import { Button } from '@/components/ui/button';
import { InjectedConnector } from 'wagmi/connectors/injected';

const ConnectWallet = () => {
  const { connect } = useConnect();

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
            <Button
              onClick={() => connect({ connector: new InjectedConnector() })}
              className="retro-btn-primary connect-btn w-full"
            >
              Connect Wallet
            </Button>
          </div>
        </div>
      </RetroWindow>
    </div>
  );
};

export default ConnectWallet;
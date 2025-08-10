# Cosmic Chicken: A Web3 Game of Nerve

Welcome to the official documentation for Cosmic Chicken, a decentralized game of strategy, timing, and nerve, built on the Somnia Testnet. This document provides a comprehensive overview of the game's rules, features, architecture, and setup instructions.

## Quick Links

*   **🚀 Play Live:** [**cosmic-chicken-somnia-mini-games.vercel.app**](https://cosmic-chicken-somnia-mini-games.vercel.app/)
*   **🎬 Watch Demo:** [**YouTube Video**](https://youtu.be/TnNddi1X2jI)
*   **📄 View Smart Contract:** [**Somnia Testnet Explorer**](https://shannon-explorer.somnia.network/address/0x465edB47F133e557D2F2946f00507543a88F0ea9?tab=contract)

---

## Key Features

*   **Fully Decentralized:** All game rules and financial transactions are enforced by a smart contract on the blockchain.
*   **Two Exciting Game Modes:** A fast-paced "Speed Round" against a bot is live now, with a strategic "Multiplayer Royale" coming soon.
*   **Real Crypto Stakes:** The game uses Somnia Testnet Tokens (STT), giving players a real-world experience of Web3 gaming.
*   **Provably Fair:** The smart contract's code is public and verified, meaning anyone can audit the game's logic and fairness.
*   **Retro UI:** A nostalgic user interface built with modern web technologies (React, TypeScript, TailwindCSS).

## Game Modes

Cosmic Chicken offers two distinct modes, each with its own rules and strategies.

### Speed Round (vs. Bot) - LIVE!

This is a fast-paced, single-player game of nerve against an automated opponent.

*   **Objective:** Cash out with the highest possible multiplier before the bot "ejects" or time runs out.
*   **Rules:**
    1.  The player pays a fixed entry fee to start a 30-second round.
    2.  A prize multiplier starts at 1.00x and increases rapidly over time.
    3.  The smart contract pre-determines a secret, random time within the round when the bot will "eject".
    4.  The player must click "Cash Out!" to win. The payout is the entry fee multiplied by the current multiplier.
    5.  **You lose if:**
        *   You cash out *after* the bot's secret eject time.
        *   The 30-second round timer expires before you cash out.
*   **Strategy:** How long can you hold your nerve? The longer you wait, the higher the potential reward, but the greater the risk that the bot will eject first.
*   **Constraint:** If you do not "Cash Out" (eject) during the round, you will automatically lose your entry fee when either the bot ejects or the 30-second timer expires, whichever comes first.

### Multiplayer Royale (Coming Soon!)

This is a game of patience and strategy where you compete against other players.

*   **Objective:** Be the last player to join the round before the timer expires.
*   **Rules:**
    1.  Players pay a fixed entry fee (e.g., 0.01 STT) to join an ongoing round.
    2.  Each time a new player joins, the round's countdown timer resets.
    3.  Players can "Eject" at any time, but they forfeit their entry fee.
    4.  When the timer finally runs out, the **last player who joined** wins the entire prize pool.
*   **Strategy:** Do you join early and hope others keep resetting the timer? Or do you wait until the last second to snipe the win, risking that someone else will join right after you?
*   **Constraint:** If you are the last person to join and no one else enters the round, the timer will count down to zero, and you will win the entire prize pool.

## Gameplay Walkthrough

### 1. Connecting Your Wallet

When you first open the application, you will be prompted to connect your Web3 wallet (e.g., MetaMask). This is required to interact with the smart contract. Ensure your wallet is connected to the **Somnia Testnet**.

### 2. The Main Dashboard

Once connected, you'll see the main game interface, which includes:
*   **Your Wallet Info:** Your address and STT balance.
*   **Mode Selector:** Tabs to switch between "Speed Round" and the upcoming "Multiplayer Royale".
*   **Owner Controls:** If you are the owner of the contract, an admin panel will appear.

### 3. Playing a Round

1.  Select the "Speed Round (vs. Bot)" tab.
2.  Click the **"Start Bot Game"** button and confirm the transaction in your wallet.
3.  The round begins immediately. Watch the multiplier climb!
4.  Click **"Cash Out!"** when you are ready. Your wallet will prompt you to confirm the transaction. If your transaction is confirmed before the bot's secret eject time, you win!

## How It Works: On-Chain vs. Off-Chain

The magic of a dApp (decentralized application) is the interplay between the on-chain smart contract and the off-chain frontend.

### Architectural Diagram

```
+-----------------+      +-----------------+      +----------------------+      +----------------------+
|                 |      |                 |      |                      |      |                      |
|   User (You)    +----->|  Frontend (UI)  +----->|   Wallet (MetaMask)  +----->| Blockchain/Contract  |
|                 |      |  (React App)    |      | (Signs Transactions) |      |   (Somnia Testnet)   |
|                 |      |                 |      |                      |      |                      |
+-----------------+      +-------+---------+      +----------+-----------+      +-----------+----------+
       ^                         |                           |                          |
       |                         | (Displays Data)           |                          | (Emits Events)
       +-------------------------+---------------------------+--------------------------+
```

### What Happens On-Chain (The Smart Contract)

The smart contract is the **single source of truth**. It lives permanently on the blockchain and is responsible for all critical logic. You can view the verified contract [here on the Somnia Explorer](https://shannon-explorer.somnia.network/address/0x465edB47F133e557D2F2946f00507543a88F0ea9?tab=contract).

*   **Holding Funds:** The contract holds all entry fees in the prize pool and any player winnings pending withdrawal.
*   **Enforcing Rules:** It validates every action. It checks if a player has paid the correct fee, if a round is active, etc.
*   **Managing State:** It keeps track of the current round, who is playing, when they joined, and the game's start/end times.
*   **Determining Winners:** The contract's code immutably decides the winner based on the rules.
*   **Bot Logic:** The contract handles the entire lifecycle of the Speed Round, from generating the bot's secret eject time to determining the winner based on a timestamp comparison. See below for a detailed breakdown.
*   **Payouts:** It handles the transfer of winnings directly to the player's wallet upon a successful cash-out or withdrawal.

#### Key Contract Functions Used:
*   **Write Functions (State-Changing):**
    *   `startBotGame()`: Pays the entry fee to start a new speed round.
    *   `ejectFromBotGame()`: Cashes out of the speed round to claim winnings.
    *   `withdrawWinnings()`: Transfers your accumulated winnings from the contract to your wallet.
*   **Read Functions (Data-Fetching):**
    *   `getPlayerActiveBotGame()`: Checks if the current user has a bot game in progress.
    *   `getBotGameInfo()`: Gets details for a specific bot game ID.
    *   `getBotGameResult()`: Fetches the outcome of a completed game.
    *   `entryFee()`: Reads the current entry fee for the game.

#### On-Chain Bot Game Logic: A Step-by-Step
The "Speed Round" against the bot is designed to be provably fair, with all critical logic happening transparently on the smart contract. Here’s how it works from the moment you click "Start":

1.  **Starting the Game (`startBotGame`)**
    *   When you send the transaction to start a game, the contract receives your entry fee.
    *   It immediately generates a pseudo-random number using a combination of the current block's timestamp, your wallet address, and an internal game counter. This ensures a different outcome for every game.
    *   This random number is used to determine the **secret `botEjectTime`**. This is a future timestamp, within the 30-second game window, at which the bot is scheduled to "eject".
    *   This secret time is stored securely in the game's data on the blockchain. Neither you nor the frontend can see this value.

2.  **The Race Against Time**
    *   Your game is now active. The frontend starts displaying the increasing multiplier, which is calculated based on the time elapsed since the game started.
    *   The smart contract is now waiting for one of two things to happen: either you eject, or the game timer runs out.

3.  **Cashing Out (`ejectFromBotGame`)**
    *   When you decide to cash out, you send a transaction to the `ejectFromBotGame` function.
    *   The smart contract records the exact `block.timestamp` of when your transaction is confirmed on the blockchain. This is your official cash-out time.
    *   The contract then performs the crucial check: **Is your cash-out timestamp *before* the bot's secret `botEjectTime`?**
        *   **✅ If YES:** You win! The contract calculates your winnings based on the multiplier at your cash-out time, adds the funds to your withdrawable balance, and emits a `BotGameEnded` event declaring you the winner.
        *   **❌ If NO:** You lose. The bot "ejected" first. The contract marks the game as lost and emits a `BotGameEnded` event with a payout of zero. This also happens if you try to cash out after the 30-second game duration has expired.

This entire process is deterministic and auditable. The outcome is sealed the moment the game begins, and the winner is decided simply by comparing two timestamps on the blockchain.

### What Happens Off-Chain (The Frontend)

The React application running in your browser is the **presentation layer**. It provides a user-friendly interface to interact with the on-chain contract.
*   **Reading Data:** It uses `wagmi` hooks to constantly read data from the smart contract (e.g., `useReadContract`) to display things like the prize pool, player count, and timers.
*   **Sending Transactions:** When you click a button like "Start Bot Game" or "Cash Out", the frontend constructs a transaction and sends it to your wallet for approval using the `useWriteContract` hook.
*   **Listening for Events:** The frontend listens for events (like `BotGameEnded`) emitted by the contract to know when to update the UI, for example, by showing the "Game Over" screen.
*   **UI Responsiveness:** To make the game feel faster, the UI begins polling for a game's result as soon as a transaction is *sent*, rather than waiting for it to be confirmed on the blockchain.

## Local Installation & Setup

### Prerequisites

*   **Node.js:** v18.x or later.
*   **NPM or Yarn:** Package manager for Node.js.
*   **MetaMask:** A browser extension wallet for interacting with the dApp.

### Installation Steps

1.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd cosmic-chicken
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Configure MetaMask:**
    *   Add the Somnia Testnet to MetaMask with the following details:
        *   **Network Name:** Somnia Testnet
        *   **RPC URL:** `https://dream-rpc.somnia.network/`
        *   **Chain ID:** 50312
        *   **Currency Symbol:** STT
        *   **Block Explorer URL:** `https://shannon-explorer.somnia.network/`
    *   Obtain some free STT from a Somnia faucet to pay for gas fees and entry fees.

### Running the Game

*   Start the local development server:
    ```bash
    npm run dev
    ```
*   Open your browser and navigate to `http://localhost:8080` (or the URL provided in your terminal).

## Important Considerations & Constraints

**Please read this section carefully to understand the risks and mechanics of playing a Web3 game.**

*   **Gas Fees:** Every transaction that changes the state of the blockchain (starting, cashing out, withdrawing) requires a gas fee paid in STT. This is a fee you pay to the network, not to the game itself.
*   **Transaction Latency:** Blockchain transactions are not instant. They take a few seconds to be confirmed by the network. This has critical implications for gameplay:
    *   **Speed Round (vs. Bot):** This is the most important constraint. Your "Cash Out!" transaction must be sent *and confirmed* by the network before the bot's secret eject time. **Clicking at the last possible second is extremely risky.** Due to network latency, your transaction may not be included in a block in time, causing you to lose. You must approve the transaction in your wallet quickly.
*   **Security:** Always be mindful of the transactions you are approving in your wallet. This project is for demonstration on a testnet, but these principles apply to all Web3 applications.
*   **Testnet Funds:** The STT tokens used in this game are on a testnet and have **no real-world monetary value**.
*   **Browser State:** If you close your browser or refresh the page mid-game, your position is safe. The smart contract holds the true state of the game. When you reconnect your wallet, the frontend will re-sync and show you the current status.

## Owner & Admin Controls

The smart contract includes special functions that can only be called by the contract's owner. These are accessible via the UI if you are connected with the owner's wallet address.
*   **Withdraw Contract Balance:** The owner can withdraw any funds held by the contract that are not allocated to player winnings.
*   **Update Game Parameters:** The owner can update the `entryFee` and the `botEjectMin/MaxDuration` to adjust game balance and difficulty.
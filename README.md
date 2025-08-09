# Cosmic Chicken: A Web3 Game of Nerve

Welcome to the official documentation for Cosmic Chicken, a decentralized game of strategy, timing, and nerve, built on the Somnia Testnet. This document provides a comprehensive overview of the game's rules, features, architecture, and setup instructions.

## Table of Contents

1.  [Introduction](#introduction)
2.  [Key Features](#key-features)
3.  [Game Modes](#game-modes)
    *   [Multiplayer Royale](#multiplayer-royale)
    *   [Speed Round (vs. Bot)](#speed-round-vs-bot)
4.  [Gameplay Walkthrough](#gameplay-walkthrough)
    *   [Connecting Your Wallet](#1-connecting-your-wallet)
    *   [The Main Dashboard](#2-the-main-dashboard)
    *   [Playing a Round](#3-playing-a-round)
5.  [How It Works: On-Chain vs. Off-Chain](#how-it-works-on-chain-vs-off-chain)
    *   [Architectural Diagram](#architectural-diagram)
    *   [What Happens On-Chain (The Smart Contract)](#what-happens-on-chain-the-smart-contract)
    *   [What Happens Off-Chain (The Frontend)](#what-happens-off-chain-the-frontend)
6.  [Local Installation & Setup](#local-installation--setup)
    *   [Prerequisites](#prerequisites)
    *   [Installation Steps](#installation-steps)
    *   [Running the Game](#running-the-game)
7.  [Important Considerations](#important-considerations)
8.  [Owner & Admin Controls](#owner--admin-controls)

---

## Introduction

Cosmic Chicken is a crypto-native game where players risk a small amount of cryptocurrency for a chance to win a much larger pot. The game is built with a retro, "Windows 95" aesthetic and operates entirely on the Somnia Testnet. All core game logic is handled by a smart contract, ensuring fairness, transparency, and true ownership of in-game funds.

## Key Features

*   **Fully Decentralized:** All game rules and financial transactions are enforced by a smart contract on the blockchain.
*   **Two Exciting Game Modes:** Choose between a strategic, last-man-standing "Multiplayer Royale" or a fast-paced "Speed Round" against a bot.
*   **Real Crypto Stakes:** The game uses Somnia Testnet Tokens (STT), giving players a real-world experience of Web3 gaming.
*   **Provably Fair:** The smart contract's code is public, meaning anyone can verify the game's logic and fairness.
*   **Retro UI:** A nostalgic user interface built with modern web technologies (React, TypeScript, TailwindCSS).

## Game Modes

Cosmic Chicken offers two distinct modes, each with its own rules and strategies.

### Multiplayer Royale

This is a game of patience and strategy where you compete against other players.

*   **Objective:** Be the last player to join the round before the timer expires.
*   **Rules:**
    1.  Players pay a fixed entry fee (e.g., 0.01 STT) to join an ongoing round.
    2.  Each time a new player joins, the round's countdown timer resets.
    3.  Players can "Eject" at any time, but they forfeit their entry fee.
    4.  When the timer finally runs out, the **last player who joined** wins the entire prize pool.
*   **Strategy:** Do you join early and hope others keep resetting the timer? Or do you wait until the last second to snipe the win, risking that someone else will join right after you?

### Speed Round (vs. Bot)

This is a fast-paced, single-player game of nerve against an automated opponent.

*   **Objective:** Cash out with the highest possible multiplier before the bot "ejects" or time runs out.
*   **Rules:**
    1.  The player pays a fixed entry fee to start a 30-second round.
    2.  A prize multiplier starts at 1.00x and increases rapidly over time.
    3.  The smart contract pre-determines a secret, random time within the round when the bot will "eject".
    4.  The player must click "Cash Out" to win. The payout is the entry fee multiplied by the current multiplier.
    5.  **You lose if:**
        *   You cash out *after* the bot's secret eject time.
        *   The 30-second round timer expires before you cash out.
*   **Strategy:** How long can you hold your nerve? The longer you wait, the higher the potential reward, but the greater the risk that the bot will eject first.

## Gameplay Walkthrough

### 1. Connecting Your Wallet

When you first open the application, you will be prompted to connect your Web3 wallet (e.g., MetaMask). This is required to interact with the smart contract. Ensure your wallet is connected to the **Somnia Testnet**.

### 2. The Main Dashboard

Once connected, you'll see the main game interface, which includes:
*   **Your Wallet Info:** Your address and STT balance.
*   **Winnings:** A display of any funds you've won that are held in the contract, with a "Withdraw" button.
*   **Live Game Stats:** Real-time data from the blockchain, including the current prize pool, number of active players, and the current round ID.
*   **Mode Selector:** Tabs to switch between "Multiplayer Royale" and "Speed Round".

### 3. Playing a Round

*   **To Play Multiplayer:**
    1.  Select the "Multiplayer Royale" tab.
    2.  Click the **"Join Round"** button. Your wallet will ask you to confirm the transaction for the entry fee.
    3.  Once the transaction is confirmed, you are in the round! You can now either wait or "Eject".
*   **To Play Speed Round:**
    1.  Select the "Speed Round (vs. Bot)" tab.
    2.  Click the **"Start Bot Game"** button and confirm the transaction.
    3.  The round begins immediately. Watch the multiplier climb!
    4.  Click **"Cash Out!"** when you are ready. Your wallet will prompt you to confirm the transaction. If your transaction is confirmed before the bot's secret eject time, you win!

## How It Works: On-Chain vs. Off-Chain

The magic of a dApp (decentralized application) is the interplay between the on-chain smart contract and the off-chain frontend.

### Architectural Diagram

This diagram illustrates the flow of information in the application:

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

The smart contract (`CosmicChickenV2.sol`) is the **single source of truth**. It lives permanently on the blockchain and is responsible for all critical logic:
*   **Holding Funds:** The contract holds all entry fees in the prize pool and any player winnings pending withdrawal.
*   **Enforcing Rules:** It validates every action. It checks if a player has paid the correct fee, if a round is active, etc.
*   **Managing State:** It keeps track of the current round, who is playing, when they joined, and the game's start/end times.
*   **Determining Winners:** The contract's code immutably decides the winner based on the rules (last joiner or who ejected first).
*   **Bot Logic:** For the Speed Round, the contract generates the bot's secret `ejectTime` and compares it against the player's transaction time.
*   **Payouts:** It handles the transfer of winnings directly to the player's wallet upon a successful cash-out or withdrawal.

### What Happens Off-Chain (The Frontend)

The React application running in your browser is the **presentation layer**. It provides a user-friendly interface to interact with the on-chain contract.
*   **Reading Data:** It constantly reads data from the smart contract to display things like the prize pool, player count, and timers.
*   **Sending Transactions:** When you click a button like "Join Round" or "Cash Out", the frontend constructs a transaction and sends it to your wallet for approval.
*   **Listening for Events:** The frontend listens for events (like `RoundFinished` or `BotGameEnded`) emitted by the contract to know when to update the UI, for example, by showing the "Game Over" screen.
*   **Animations:** Visual elements like the increasing multiplier and countdown timers are handled by the frontend for a smooth user experience. They are animated in the UI while the definitive state is fetched from the blockchain.

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

## Important Considerations

*   **Gas Fees:** Every transaction that changes the state of the blockchain (joining, ejecting, cashing out, withdrawing) requires a gas fee paid in STT.
*   **Transaction Latency:** Blockchain transactions are not instant. They take a few seconds to be confirmed. This is especially important in the Speed Round, as your "Cash Out" transaction needs to be mined before the bot's eject time.
*   **Security:** Always be mindful of the transactions you are approving in your wallet. This project is for demonstration on a testnet, but these principles apply to all Web3 applications.
*   **Testnet Funds:** The STT tokens used in this game are on a testnet and have **no real-world monetary value**.

## Owner & Admin Controls

The smart contract includes special functions that can only be called by the contract's owner:
*   **Withdraw Contract Balance:** The owner can withdraw any funds held by the contract that are not allocated to player winnings (e.g., from the house edge).
*   **Update Game Parameters:** The owner can update the `entryFee`, `roundDuration`, and the `botEjectMin/MaxDuration` to adjust game balance and difficulty.
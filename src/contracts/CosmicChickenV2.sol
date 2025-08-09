// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract CosmicChickenV2 {
    struct Round {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        uint256 prizePool;
        uint256 entryFee;
        address[] players;
        mapping(address => bool) isActive;
        mapping(address => uint256) joinTime;
        bool isFinished;
        address winner;
        uint256 activePlayerCount;
    }
    
    uint256 public currentRoundId;
    
    // CONFIGURABLE SETTINGS (can be updated by owner)
    uint256 public roundDuration = 300; // 5 minutes (default)
    uint256 public entryFee = 0.01 ether; // 0.01 SOM (default)
    
    // Bounds for safety
    uint256 public constant MIN_ROUND_DURATION = 60; // 1 minute minimum
    uint256 public constant MAX_ROUND_DURATION = 3600; // 1 hour maximum
    uint256 public constant MIN_ENTRY_FEE = 0.001 ether; // 0.001 SOM minimum
    uint256 public constant MAX_ENTRY_FEE = 1 ether; // 1 SOM maximum
    
    mapping(uint256 => Round) public rounds;
    mapping(address => uint256) public playerWinnings;

    // Bot game mechanics
    struct BotGame {
        uint256 id;
        address player;
        uint256 startTime;
        uint256 entryFee;
        bool isActive;
        uint256 botEjectTime;
        uint256 randomSeed;
        bool playerEjected;
        bool gameEnded;
    }

    mapping(uint256 => BotGame) public botGames;
    mapping(address => uint256) public playerActiveBotGame;
    uint256 public botGameCounter;

    // Bot configuration
    uint256 public constant BOT_BASE_MULTIPLIER = 100; // 1.00x (in basis points)
    uint256 public constant BOT_MULTIPLIER_INCREMENT = 5; // 0.05x per second
    uint256 public constant BOT_MAX_MULTIPLIER = 500; // 5.00x max
    uint256 public constant HOUSE_EDGE = 300; // 3% house edge (in basis points)
    uint256 public constant BOT_GAME_MAX_DURATION = 30; // 30 seconds max
    
    // NEW: Configurable bot difficulty window
    uint256 public botEjectMinDuration = 5; // seconds
    uint256 public botEjectMaxDuration = 25; // seconds

    // Owner functionality
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    event PlayerJoined(uint256 indexed roundId, address indexed player, uint256 prizePool);
    event PlayerEjected(uint256 indexed roundId, address indexed player, uint256 remainingPlayers);
    event RoundFinished(uint256 indexed roundId, address indexed winner, uint256 prizeAmount);
    event WinningsWithdrawn(address indexed player, uint256 amount);

    // Events for bot games
    event BotGameStarted(uint256 indexed gameId, address indexed player, uint256 entryFee, uint256 botEjectTime);
    event BotGameEnded(uint256 indexed gameId, address indexed player, bool playerWon, uint256 payout, uint256 finalMultiplier);
    event BotGameDebug(uint256 indexed gameId, string message, uint256 value);
    
    // Events for admin configuration changes
    event RoundDurationUpdated(uint256 oldDuration, uint256 newDuration);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event BotEjectWindowUpdated(uint256 min, uint256 max);
    
    modifier roundActive(uint256 roundId) {
        require(rounds[roundId].startTime > 0, "Round does not exist");
        require(block.timestamp < rounds[roundId].endTime, "Round has ended");
        require(!rounds[roundId].isFinished, "Round is finished");
        _;
    }
    
    modifier playerInRound(uint256 roundId) {
        require(rounds[roundId].isActive[msg.sender], "Player not in round");
        _;
    }
    
    constructor() {
        owner = msg.sender; // Set contract creator as owner
        startNewRound();
    }
    
    // ADMIN CONFIGURATION FUNCTIONS
    
    function updateRoundDuration(uint256 newDuration) external onlyOwner {
        require(newDuration >= MIN_ROUND_DURATION, "Duration too short");
        require(newDuration <= MAX_ROUND_DURATION, "Duration too long");
        uint256 oldDuration = roundDuration;
        roundDuration = newDuration;
        emit RoundDurationUpdated(oldDuration, newDuration);
    }
    
    function updateEntryFee(uint256 newFee) external onlyOwner {
        require(newFee >= MIN_ENTRY_FEE, "Fee too low");
        require(newFee <= MAX_ENTRY_FEE, "Fee too high");
        uint256 oldFee = entryFee;
        entryFee = newFee;
        emit EntryFeeUpdated(oldFee, newFee);
    }

    function updateBotEjectWindow(uint256 _min, uint256 _max) external onlyOwner {
        require(_min > 0, "Min must be > 0");
        require(_max > _min, "Max must be > min");
        require(_max < BOT_GAME_MAX_DURATION, "Max must be less than game duration");
        botEjectMinDuration = _min;
        botEjectMaxDuration = _max;
        emit BotEjectWindowUpdated(_min, _max);
    }
    
    function getGameConfiguration() external view returns (
        uint256 currentRoundDuration,
        uint256 currentEntryFee,
        uint256 minRoundDuration,
        uint256 maxRoundDuration,
        uint256 minEntryFee,
        uint256 maxEntryFee
    ) {
        return (
            roundDuration,
            entryFee,
            MIN_ROUND_DURATION,
            MAX_ROUND_DURATION,
            MIN_ENTRY_FEE,
            MAX_ENTRY_FEE
        );
    }
    
    function startNewRound() public {
        if (currentRoundId > 0) {
            finishCurrentRound();
        }
        
        currentRoundId++;
        Round storage newRound = rounds[currentRoundId];
        newRound.id = currentRoundId;
        newRound.startTime = block.timestamp;
        newRound.endTime = block.timestamp + roundDuration;
        newRound.entryFee = entryFee;
        newRound.prizePool = 0;
        newRound.activePlayerCount = 0;
        newRound.isFinished = false;
        
        emit RoundStarted(currentRoundId, newRound.startTime, newRound.endTime);
    }
    
    function joinRound() external payable roundActive(currentRoundId) {
        require(msg.value == rounds[currentRoundId].entryFee, "Incorrect entry fee");
        require(!rounds[currentRoundId].isActive[msg.sender], "Already in round");
        
        Round storage round = rounds[currentRoundId];
        round.players.push(msg.sender);
        round.isActive[msg.sender] = true;
        round.joinTime[msg.sender] = block.timestamp;
        round.prizePool += msg.value;
        round.activePlayerCount++;
        
        emit PlayerJoined(currentRoundId, msg.sender, round.prizePool);
    }
    
    function ejectFromRound() external roundActive(currentRoundId) playerInRound(currentRoundId) {
        Round storage round = rounds[currentRoundId];
        round.isActive[msg.sender] = false;
        round.activePlayerCount--;
        
        emit PlayerEjected(currentRoundId, msg.sender, round.activePlayerCount);
        
        if (round.activePlayerCount == 1) {
            finishRoundWithWinner();
        }
    }
    
    function finishCurrentRound() public {
        if (currentRoundId == 0) return;
        Round storage round = rounds[currentRoundId];
        if (round.isFinished) return;
        
        if (block.timestamp >= round.endTime) {
            if (round.activePlayerCount >= 1) {
                address winner = getLastJoiner(currentRoundId);
                if (winner != address(0)) {
                    round.winner = winner;
                    round.isFinished = true;
                    playerWinnings[winner] += round.prizePool;
                    emit RoundFinished(currentRoundId, winner, round.prizePool);
                }
            } else {
                round.isFinished = true;
                emit RoundFinished(currentRoundId, address(0), 0);
            }
        }
    }
    
    function finishRoundWithWinner() internal {
        Round storage round = rounds[currentRoundId];
        address winner = getLastActivePlayer(currentRoundId);
        
        if (winner != address(0)) {
            round.winner = winner;
            round.isFinished = true;
            playerWinnings[winner] += round.prizePool;
            emit RoundFinished(currentRoundId, winner, round.prizePool);
        }
    }
    
    function getLastActivePlayer(uint256 roundId) internal view returns (address) {
        Round storage round = rounds[roundId];
        for (uint i = 0; i < round.players.length; i++) {
            if (round.isActive[round.players[i]]) {
                return round.players[i];
            }
        }
        return address(0);
    }
    
    function getLastJoiner(uint256 roundId) internal view returns (address) {
        Round storage round = rounds[roundId];
        address lastJoiner = address(0);
        uint256 latestJoinTime = 0;
        
        for (uint i = 0; i < round.players.length; i++) {
            address player = round.players[i];
            if (round.isActive[player] && round.joinTime[player] > latestJoinTime) {
                latestJoinTime = round.joinTime[player];
                lastJoiner = player;
            }
        }
        return lastJoiner;
    }
    
    function withdrawWinnings() external {
        uint256 amount = playerWinnings[msg.sender];
        require(amount > 0, "No winnings to withdraw");
        
        playerWinnings[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Failed to send Ether");
        
        emit WinningsWithdrawn(msg.sender, amount);
    }

    // BOT GAME FUNCTIONS
    function startBotGame() external payable {
        require(msg.value >= entryFee, "Insufficient entry fee");
        require(playerActiveBotGame[msg.sender] == 0, "Already in a bot game");
        
        uint256 maxPayout = (msg.value * BOT_MAX_MULTIPLIER) / 100;
        require(address(this).balance >= maxPayout, "Contract has insufficient balance for this game");
        
        botGameCounter++;
        uint256 gameId = botGameCounter;
        
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, gameId, block.prevrandao, blockhash(block.number - 1))));
        
        uint256 ejectWindow = botEjectMaxDuration - botEjectMinDuration;
        uint256 botEjectTime = block.timestamp + botEjectMinDuration + (randomSeed % (ejectWindow + 1));
        
        botGames[gameId] = BotGame({
            id: gameId, player: msg.sender, startTime: block.timestamp, entryFee: msg.value,
            isActive: true, botEjectTime: botEjectTime, randomSeed: randomSeed,
            playerEjected: false, gameEnded: false
        });
        
        playerActiveBotGame[msg.sender] = gameId;
        emit BotGameStarted(gameId, msg.sender, msg.value, botEjectTime);
    }

    function ejectFromBotGame() external {
        uint256 gameId = playerActiveBotGame[msg.sender];
        require(gameId > 0, "No active bot game");
        
        BotGame storage game = botGames[gameId];
        require(game.isActive, "Game not active");
        
        game.playerEjected = true;
        
        if (block.timestamp >= game.startTime + BOT_GAME_MAX_DURATION) {
            _endBotGame(gameId, false, 0, BOT_MAX_MULTIPLIER);
            return;
        }
        
        if (block.timestamp >= game.botEjectTime) {
            uint256 botEjectMultiplier = getCurrentMultiplierForGame(gameId);
            _endBotGame(gameId, false, 0, botEjectMultiplier);
            return;
        }
        
        uint256 finalMultiplier = getCurrentMultiplierForGame(gameId);
        uint256 grossPayout = (game.entryFee * finalMultiplier) / 100;
        uint256 houseEdgeAmount = (grossPayout * HOUSE_EDGE) / 10000;
        uint256 netPayout = grossPayout - houseEdgeAmount;
        
        if (netPayout > address(this).balance) {
            netPayout = address(this).balance;
        }
        
        _endBotGame(gameId, true, netPayout, finalMultiplier);
        
        if (netPayout > 0) {
            (bool sent, ) = payable(msg.sender).call{value: netPayout}("");
            require(sent, "Failed to send Ether");
        }
    }
    
    function _endBotGame(uint256 gameId, bool playerWon, uint256 payout, uint256 finalMultiplier) internal {
        BotGame storage game = botGames[gameId];
        require(game.isActive, "Game already ended");
        game.isActive = false;
        game.gameEnded = true;
        playerActiveBotGame[game.player] = 0;
        emit BotGameEnded(gameId, game.player, playerWon, payout, finalMultiplier);
    }

    function getCurrentMultiplierForGame(uint256 gameId) internal view returns (uint256) {
        BotGame storage game = botGames[gameId];
        if (!game.isActive) return BOT_BASE_MULTIPLIER;
        uint256 timeElapsed = block.timestamp - game.startTime;
        uint256 currentMultiplier = BOT_BASE_MULTIPLIER + (timeElapsed * BOT_MULTIPLIER_INCREMENT);
        return currentMultiplier > BOT_MAX_MULTIPLIER ? BOT_MAX_MULTIPLIER : currentMultiplier;
    }
    
    // VIEW FUNCTIONS
    function getCurrentRoundInfo() external view returns (uint256 id, uint256 startTime, uint256 endTime, uint256 prizePool, uint256 activePlayerCount, bool isFinished, address winner) {
        Round storage round = rounds[currentRoundId];
        return (round.id, round.startTime, round.endTime, round.prizePool, round.activePlayerCount, round.isFinished, round.winner);
    }
    
    function isPlayerInCurrentRound(address player) external view returns (bool) { return rounds[currentRoundId].isActive[player]; }
    function getPlayerWinnings(address player) external view returns (uint256) { return playerWinnings[player]; }
    function getRoundPlayers(uint256 roundId) external view returns (address[] memory) { return rounds[roundId].players; }
    
    function getTimeRemaining() external view returns (uint256) {
        Round storage round = rounds[currentRoundId];
        if (block.timestamp >= round.endTime) return 0;
        return round.endTime - block.timestamp;
    }

    function getBotGameInfo(uint256 gameId) external view returns (uint256 id, address player, uint256 startTime, uint256 currentMultiplier, uint256 gameEntryFee, bool isActive, uint256 timeRemaining, bool botHasEjected, bool gameTimedOut) {
        BotGame storage game = botGames[gameId];
        uint256 remaining = 0;
        if (game.isActive && block.timestamp < game.startTime + BOT_GAME_MAX_DURATION) {
            remaining = (game.startTime + BOT_GAME_MAX_DURATION) - block.timestamp;
        }
        return (game.id, game.player, game.startTime, getCurrentMultiplierForGame(gameId), game.entryFee, game.isActive, remaining, block.timestamp >= game.botEjectTime, block.timestamp >= game.startTime + BOT_GAME_MAX_DURATION);
    }

    function getPlayerActiveBotGame(address player) external view returns (uint256) {
        uint256 gameId = playerActiveBotGame[player];
        if (gameId == 0 || botGames[gameId].gameEnded) return 0;
        return gameId;
    }

    function getCurrentBotMultiplier(uint256 gameId) external view returns (uint256) { return getCurrentMultiplierForGame(gameId); }

    function getPotentialPayout(uint256 gameId) external view returns (uint256) {
        BotGame storage game = botGames[gameId];
        if (!game.isActive) return 0;
        uint256 currentMult = getCurrentMultiplierForGame(gameId);
        uint256 grossPayout = (game.entryFee * currentMult) / 100;
        return grossPayout - ((grossPayout * HOUSE_EDGE) / 10000);
    }

    function getBotGameStatus(uint256 gameId) external view returns (bool isActive, bool playerCanWin, bool botHasEjected, bool gameTimedOut, string memory statusMessage) {
        BotGame storage game = botGames[gameId];
        if (!game.isActive) return (false, false, false, false, "Game finished");
        bool botEjected = block.timestamp >= game.botEjectTime;
        bool timedOut = block.timestamp >= game.startTime + BOT_GAME_MAX_DURATION;
        if (timedOut) return (false, false, false, true, "Game timed out - you lose!");
        if (botEjected) return (false, false, true, false, "Bot ejected - you lose!");
        return (true, true, false, false, "Game active - eject to win!");
    }

    function withdrawContractBalance() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        (bool sent, ) = payable(owner).call{value: balance}("");
        require(sent, "Failed to send Ether");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        owner = newOwner;
    }

    function getOwner() external view returns (address) { return owner; }
    receive() external payable {}
    function fundContract() external payable {}
    function getContractBalance() external view returns (uint256) { return address(this).balance; }
    
    function resetBotGame(address player) external onlyOwner {
        uint256 gameId = playerActiveBotGame[player];
        if (gameId > 0) {
            BotGame storage game = botGames[gameId];
            game.isActive = false;
            game.gameEnded = true;
            playerActiveBotGame[player] = 0;
            emit BotGameDebug(gameId, "Game reset by owner", 0);
        }
    }
}
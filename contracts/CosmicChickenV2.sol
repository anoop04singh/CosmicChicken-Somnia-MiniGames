// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CosmicChickenV2
 * @author Your Name Here
 * @notice A decentralized game of nerve on the Somnia Testnet.
 */
contract CosmicChickenV2 {
    address public owner;

    // Game Configuration
    uint256 public entryFee;
    uint256 public roundDuration;
    uint256 public botEjectMinDuration;
    uint256 public botEjectMaxDuration;

    // Constants
    uint256 public constant MIN_ROUND_DURATION = 30 seconds;
    uint256 public constant MAX_ROUND_DURATION = 1 hours;
    uint256 public constant MIN_ENTRY_FEE = 0.001 ether;
    uint256 public constant MAX_ENTRY_FEE = 1 ether;
    uint256 public constant HOUSE_EDGE = 5; // 5%
    uint256 public constant BOT_GAME_MAX_DURATION = 30 seconds;
    uint256 public constant BOT_BASE_MULTIPLIER = 100; // 1.00x
    uint256 public constant BOT_MULTIPLIER_INCREMENT = 20; // 0.20x per second
    uint256 public constant BOT_MAX_MULTIPLIER = 10000; // 100.00x

    // Multiplayer Royale State
    uint256 public currentRoundId;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bool)) private playerInRound;
    mapping(uint256 => address[]) private roundPlayers;

    // Bot Game State
    uint256 public botGameCounter;
    mapping(uint256 => BotGame) public botGames;
    mapping(address => uint256) public playerActiveBotGame;

    // Player Winnings
    mapping(address => uint256) public playerWinnings;

    struct Round {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        uint256 prizePool;
        uint256 entryFee;
        bool isFinished;
        address winner;
        uint256 activePlayerCount;
    }

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
        // --- RESULT FIELDS ---
        bool playerWon;
        uint256 payout;
        uint256 finalMultiplier;
    }

    // Events
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    event PlayerJoined(uint256 indexed roundId, address indexed player, uint256 prizePool);
    event PlayerEjected(uint256 indexed roundId, address indexed player, uint256 remainingPlayers);
    event RoundFinished(uint256 indexed roundId, address indexed winner, uint256 prizeAmount);
    event BotGameStarted(uint256 indexed gameId, address indexed player, uint256 entryFee, uint256 botEjectTime);
    event BotGameEnded(uint256 indexed gameId, address indexed player, bool playerWon, uint256 payout, uint256 finalMultiplier);
    event WinningsWithdrawn(address indexed player, uint256 amount);
    event EntryFeeUpdated(uint256 oldFee, uint256 newFee);
    event RoundDurationUpdated(uint256 oldDuration, uint256 newDuration);
    event BotEjectWindowUpdated(uint256 min, uint256 max);
    event BotGameDebug(uint256 indexed gameId, string message, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        entryFee = 0.01 ether;
        roundDuration = 60 seconds;
        botEjectMinDuration = 1 seconds;
        botEjectMaxDuration = 29 seconds;
        currentRoundId = 1;
        rounds[currentRoundId] = Round({
            id: currentRoundId,
            startTime: block.timestamp,
            endTime: block.timestamp + roundDuration,
            prizePool: 0,
            entryFee: entryFee,
            isFinished: false,
            winner: address(0),
            activePlayerCount: 0
        });
        emit RoundStarted(currentRoundId, block.timestamp, block.timestamp + roundDuration);
    }

    // --- Multiplayer Royale Functions ---

    function joinRound() public payable {
        require(msg.value == entryFee, "Incorrect entry fee");
        Round storage currentRound = rounds[currentRoundId];
        require(!currentRound.isFinished, "Round is already finished");
        require(!playerInRound[currentRoundId][msg.sender], "Player already in round");

        currentRound.prizePool += msg.value;
        currentRound.endTime = block.timestamp + roundDuration;
        currentRound.activePlayerCount++;
        playerInRound[currentRoundId][msg.sender] = true;
        roundPlayers[currentRoundId].push(msg.sender);

        emit PlayerJoined(currentRoundId, msg.sender, currentRound.prizePool);
    }

    function ejectFromRound() public {
        Round storage currentRound = rounds[currentRoundId];
        require(!currentRound.isFinished, "Round is already finished");
        require(playerInRound[currentRoundId][msg.sender], "Player not in round");

        playerInRound[currentRoundId][msg.sender] = false;
        currentRound.activePlayerCount--;

        emit PlayerEjected(currentRoundId, msg.sender, currentRound.activePlayerCount);
    }

    function finishCurrentRound() public {
        Round storage currentRound = rounds[currentRoundId];
        require(!currentRound.isFinished, "Round is already finished");
        require(block.timestamp >= currentRound.endTime, "Round not over yet");

        currentRound.isFinished = true;
        address[] storage players = roundPlayers[currentRoundId];

        if (players.length > 0) {
            address lastPlayer;
            // Find the last player who did not eject
            for (uint i = players.length; i > 0; i--) {
                if (playerInRound[currentRoundId][players[i-1]]) {
                    lastPlayer = players[i-1];
                    break;
                }
            }
            
            if (lastPlayer != address(0)) {
                currentRound.winner = lastPlayer;
                uint256 prize = currentRound.prizePool;
                playerWinnings[lastPlayer] += prize;
                emit RoundFinished(currentRoundId, lastPlayer, prize);
            }
        }
        
        // Start a new round
        startNewRound();
    }

    function startNewRound() internal {
        currentRoundId++;
        rounds[currentRoundId] = Round({
            id: currentRoundId,
            startTime: block.timestamp,
            endTime: block.timestamp + roundDuration,
            prizePool: 0,
            entryFee: entryFee,
            isFinished: false,
            winner: address(0),
            activePlayerCount: 0
        });
        emit RoundStarted(currentRoundId, block.timestamp, block.timestamp + roundDuration);
    }

    // --- Bot Game Functions ---

    function startBotGame() public payable {
        require(msg.value == entryFee, "Incorrect entry fee");
        require(playerActiveBotGame[msg.sender] == 0, "Player already in a bot game");

        botGameCounter++;
        uint256 gameId = botGameCounter;
        
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, botGameCounter)));
        uint256 ejectDuration = (randomSeed % (botEjectMaxDuration - botEjectMinDuration + 1)) + botEjectMinDuration;
        uint256 botEjectTime = block.timestamp + ejectDuration;

        botGames[gameId] = BotGame({
            id: gameId,
            player: msg.sender,
            startTime: block.timestamp,
            entryFee: msg.value,
            isActive: true,
            botEjectTime: botEjectTime,
            randomSeed: randomSeed,
            playerEjected: false,
            gameEnded: false,
            playerWon: false,
            payout: 0,
            finalMultiplier: 0
        });
        playerActiveBotGame[msg.sender] = gameId;

        emit BotGameStarted(gameId, msg.sender, msg.value, botEjectTime);
    }

    function ejectFromBotGame() public {
        uint256 gameId = playerActiveBotGame[msg.sender];
        require(gameId != 0, "No active bot game");
        BotGame storage game = botGames[gameId];
        require(game.isActive, "Game is not active");

        game.playerEjected = true;
        game.isActive = false;
        game.gameEnded = true;
        playerActiveBotGame[msg.sender] = 0;

        bool playerWon = block.timestamp < game.botEjectTime;
        uint256 finalMultiplier;
        uint256 payout;

        if (playerWon) {
            uint256 elapsed = block.timestamp - game.startTime;
            finalMultiplier = BOT_BASE_MULTIPLIER + (elapsed * BOT_MULTIPLIER_INCREMENT);
            if (finalMultiplier > BOT_MAX_MULTIPLIER) {
                finalMultiplier = BOT_MAX_MULTIPLIER;
            }
            payout = (game.entryFee * finalMultiplier) / 100;
            playerWinnings[msg.sender] += payout;
        } else {
            finalMultiplier = getCurrentBotMultiplier(gameId);
            payout = 0;
        }

        // Store result
        game.playerWon = playerWon;
        game.payout = payout;
        game.finalMultiplier = finalMultiplier;

        emit BotGameEnded(gameId, msg.sender, playerWon, payout, finalMultiplier);
    }

    // --- Player Functions ---

    function withdrawWinnings() public {
        uint256 amount = playerWinnings[msg.sender];
        require(amount > 0, "No winnings to withdraw");
        playerWinnings[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
        emit WinningsWithdrawn(msg.sender, amount);
    }

    // --- Owner Functions ---

    function updateEntryFee(uint256 newFee) public onlyOwner {
        require(newFee >= MIN_ENTRY_FEE && newFee <= MAX_ENTRY_FEE, "Invalid fee amount");
        emit EntryFeeUpdated(entryFee, newFee);
        entryFee = newFee;
    }

    function updateRoundDuration(uint256 newDuration) public onlyOwner {
        require(newDuration >= MIN_ROUND_DURATION && newDuration <= MAX_ROUND_DURATION, "Invalid duration");
        emit RoundDurationUpdated(roundDuration, newDuration);
        roundDuration = newDuration;
    }

    function updateBotEjectWindow(uint256 _min, uint256 _max) public onlyOwner {
        require(_min < _max && _max < BOT_GAME_MAX_DURATION, "Invalid window");
        emit BotEjectWindowUpdated(_min, _max);
        botEjectMinDuration = _min;
        botEjectMaxDuration = _max;
    }

    function withdrawContractBalance() public onlyOwner {
        payable(owner).transfer(address(this).balance);
    }
    
    function fundContract() public payable onlyOwner {}

    receive() external payable {}

    // --- View Functions ---

    function getPlayerWinnings(address player) public view returns (uint256) {
        return playerWinnings[player];
    }

    function isPlayerInCurrentRound(address player) public view returns (bool) {
        return playerInRound[currentRoundId][player];
    }

    function getCurrentRoundInfo() public view returns (uint256 id, uint256 startTime, uint256 endTime, uint256 prizePool, uint256 activePlayerCount, bool isFinished, address winner) {
        Round storage r = rounds[currentRoundId];
        return (r.id, r.startTime, r.endTime, r.prizePool, r.activePlayerCount, r.isFinished, r.winner);
    }

    function getCurrentBotMultiplier(uint256 gameId) public view returns (uint256) {
        BotGame storage game = botGames[gameId];
        if (!game.isActive) return game.finalMultiplier > 0 ? game.finalMultiplier : BOT_BASE_MULTIPLIER;
        
        uint256 elapsed = block.timestamp - game.startTime;
        uint256 multiplier = BOT_BASE_MULTIPLIER + (elapsed * BOT_MULTIPLIER_INCREMENT);
        
        return multiplier > BOT_MAX_MULTIPLIER ? BOT_MAX_MULTIPLIER : multiplier;
    }

    function getBotGameInfo(uint256 gameId) public view returns (uint256, address, uint256, uint256, bool, uint256, bool, bool) {
        if (gameId == 0) return (0, address(0), 0, 0, false, 0, false, false);
        BotGame storage game = botGames[gameId];
        
        uint256 timeRemaining = 0;
        if (game.isActive && block.timestamp < game.startTime + BOT_GAME_MAX_DURATION) {
            timeRemaining = (game.startTime + BOT_GAME_MAX_DURATION) - block.timestamp;
        }
        bool botHasEjected = block.timestamp >= game.botEjectTime;
        bool gameTimedOut = block.timestamp >= game.startTime + BOT_GAME_MAX_DURATION;
        
        return (
            game.id,
            game.player,
            game.startTime,
            game.entryFee,
            game.isActive,
            timeRemaining,
            botHasEjected,
            gameTimedOut
        );
    }

    /**
     * @notice NEW FUNCTION: Gets the definitive result of a completed bot game.
     * @param _gameId The ID of the bot game to query.
     * @return playerWon True if the player won.
     * @return payout The amount the player won.
     * @return finalMultiplier The multiplier at the end of the game.
     */
    function getBotGameResult(uint256 _gameId) public view returns (bool playerWon, uint256 payout, uint256 finalMultiplier) {
        BotGame storage game = botGames[_gameId];
        require(game.id != 0, "Bot game not found");
        require(game.gameEnded, "Game has not ended yet");
        return (game.playerWon, game.payout, game.finalMultiplier);
    }
}
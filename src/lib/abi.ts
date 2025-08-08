// IMPORTANT: Please replace this with your actual contract address and ABI.
export const contractAddress = '0x0000000000000000000000000000000000000000';

export const contractAbi = [
  {
    "type": "function",
    "name": "getCurrentRoundInfo",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      { "name": "prizePool", "type": "uint256" },
      { "name": "endTime", "type": "uint256" },
      { "name": "lastPlayer", "type": "address" },
      { "name": "playerCount", "type": "uint256" },
      { "name": "isFinished", "type": "bool" }
    ]
  },
  {
    "type": "function",
    "name": "getBotGameInfo",
    "stateMutability": "view",
    "inputs": [{ "name": "player", "type": "address" }],
    "outputs": [
        { "name": "gameId", "type": "uint256" },
        { "name": "startTime", "type": "uint256" },
        { "name": "isActive", "type": "bool" },
        { "name": "isFinished", "type": "bool" }
    ]
  },
  {
    "type": "function",
    "name": "isPlayerInCurrentRound",
    "stateMutability": "view",
    "inputs": [{ "name": "player", "type": "address" }],
    "outputs": [{ "name": "", "type": "bool" }]
  },
  {
    "type": "function",
    "name": "getPotentialPayout",
    "stateMutability": "view",
    "inputs": [{ "name": "gameId", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function",
    "name": "joinRound",
    "stateMutability": "payable",
    "inputs": [],
    "outputs": []
  },
  {
    "type": "function",
    "name": "ejectFromRound",
    "stateMutability": "nonpayable",
    "inputs": [],
    "outputs": []
  },
  {
    "type": "function",
    "name": "startBotGame",
    "stateMutability": "payable",
    "inputs": [],
    "outputs": []
  },
  {
    "type": "function",
    "name": "ejectFromBotGame",
    "stateMutability": "nonpayable",
    "inputs": [],
    "outputs": []
  },
  {
    "type": "function",
    "name": "resetBotGame",
    "stateMutability": "nonpayable",
    "inputs": [{ "name": "player", "type": "address" }],
    "outputs": []
  }
];
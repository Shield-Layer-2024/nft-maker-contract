# NFT Maker Project

This project implements an NFT Collection Factory that allows for creating and managing NFT collections with features like whitelisting and time-based minting.

## Features

- NFT Factory for creating multiple NFT collections
- Whitelist support for exclusive minting
- Time-based minting windows
- Maximum supply and per-wallet mint limits
- Pausable minting functionality
- Owner controls and fee management

## Installation

```bash
npm install
```

## Configuration

Copy the `.env.example` file to create your `.env` file:

```bash
cp .env.example .env
```

Then edit the `.env` file with your own values:

```env
INFURA_API_KEY=your_infura_api_key
PRIVATE_KEY=your_wallet_private_key
ETHERSCAN_API_KEY=your_etherscan_api_key
BSC_RPC_URL=https://bsc-dataseed1.binance.org
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
BSCSCAN_API_KEY=your_bscscan_api_key
```

## Available Commands

```bash
# Compile contracts
npm run compile

# Run tests
npm test

# Run tests with gas reporting
npm run test:gas

# Start local Hardhat node
npm run node

# Deploy to local network
npm run deploy:local

# Deploy to Sepolia testnet
npm run deploy:sepolia

# Deploy to BSC mainnet
npm run deploy:bsc

# Deploy to BSC testnet
npm run deploy:bsc-testnet

# Verify contract on Etherscan
npm run verify <CONTRACT_ADDRESS>
```

## Testing

The project includes comprehensive tests for all contract functionality. Run the tests with:

```bash
npm test
```

## Deployment

To deploy to Sepolia testnet:

1. Ensure your `.env` file is properly configured
2. Run the deployment script:
```bash
npm run deploy:sepolia
```

## Contract Verification

After deployment, verify your contract on Etherscan:

```bash
npm run verify <CONTRACT_ADDRESS>
```

## Security

- Contracts use OpenZeppelin's battle-tested implementations
- All functions have appropriate access controls
- Comprehensive test coverage
- Gas optimization enabled in compiler settings

## License

ISC

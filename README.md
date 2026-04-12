# Shelby Protocol dApp

Shelby Protocol is a decentralized data storage and sharing dashboard built on the Aptos blockchain. This Next.js application allows users to authenticate using the Petra Wallet and manage their data securely on-chain.

## Features

- **Next.js 14** Framework with App Router & Server Components
- **Aptos Wallet Integration**: Connect seamlessly using the Petra Wallet via `@aptos-labs/wallet-adapter-react`.
- **Smart Contract Interactivity**: Built-in support for interacting with the Shelby Move smart contracts via `@aptos-labs/ts-sdk`.
- **State Management**: Optimized data fetching and caching with `@tanstack/react-query`.
- **Modern UI**: Styled efficiently with Tailwind CSS.

## Project Structure

- `/src`: Contains the frontend application, Next.js routes, UI components, and wallet integration logic.
- `/contracts`: Contains the Move smart contracts for the Shelby Protocol.

## Getting Started

### Prerequisites

- Node.js (v18 or newer recommended)
- npm, yarn, or pnpm
- Petra Wallet Extension installed in your browser

### Installation

1. Clone the repository:
   ```bash
   git clone <your-repository-url>
   cd Index
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Smart Contracts

To compile and test the Move smart contracts, navigate to the `contracts/` directory and use the Aptos CLI:

```bash
cd contracts
aptos move compile
aptos move test
```

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

## License

This project is licensed under the MIT License.

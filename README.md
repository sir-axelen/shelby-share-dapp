# Shelby Protocol dApp

Shelby Protocol is a decentralized data storage and sharing dashboard built on the Aptos blockchain. This Next.js application allows users to authenticate using the Petra Wallet and manage their data securely on-chain.

## 🚀 Features

- **Next.js 14** Framework with App Router & Server Components
- **Aptos Wallet Integration**: Connect seamlessly using the Petra Wallet via `@aptos-labs/wallet-adapter-react`.
- **Smart Contract Interactivity**: Built-in support for interacting with the Shelby Move smart contracts via `@aptos-labs/ts-sdk`.
- **State Management**: Optimized data fetching and caching with `@tanstack/react-query`.
- **Modern UI**: Styled efficiently with Tailwind CSS.
- **File Upload & Sharing**: Drag-and-drop file uploads with instant link generation.
- **Paywall Functionality**: Lock files behind APT payments for monetization.
- **Real-time Progress**: Visual upload progress indicators.

## 📁 Project Structure

- `/src`: Contains the frontend application, Next.js routes, UI components, and wallet integration logic.
- `/contracts`: Contains the Move smart contracts for the Shelby Protocol.
- `/public`: Static assets like fonts and icons.

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Blockchain**: Aptos (Move smart contracts)
- **Wallet**: Petra Wallet
- **State Management**: TanStack Query
- **Deployment**: Vercel (recommended)

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or newer recommended)
- npm, yarn, or pnpm
- Petra Wallet Extension installed in your browser
- Aptos CLI (for smart contract development)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sir-axelen/shelby-share-dapp.git
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

## 🌐 Deploying to Vercel

This Next.js app can be published publicly with Vercel in just a few steps:

1. Push your code to GitHub (already done).
2. Go to https://vercel.com and sign in with GitHub.
3. Create a new project and select `shelby-share-dapp`.
4. Leave the default Next.js settings and deploy.

After deployment, Vercel will provide a public URL that everyone can access.

If you prefer a different host, the app also works on any Next.js-compatible platform.

## 📜 Smart Contracts

To compile and test the Move smart contracts, navigate to the `contracts/` directory and use the Aptos CLI:

```bash
cd contracts
aptos move compile
aptos move test
```

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.

### Development Guidelines

- Follow the existing code style and TypeScript conventions.
- Test your changes locally before submitting a PR.
- Update documentation as needed.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Contact

- **Author**: sir-axelen
- **Repository**: https://github.com/sir-axelen/shelby-share-dapp
- **Issues**: https://github.com/sir-axelen/shelby-share-dapp/issues

---

Built with ❤️ on Aptos Blockchain

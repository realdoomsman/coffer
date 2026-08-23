# Coffer - Trader Vaults on Solana

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Website](https://img.shields.io/badge/website-coffer.fun-blue)](https://coffer.fun)
[![Solana](https://img.shields.io/badge/Solana-9945FF?logo=solana)](https://solana.com)

> Professional trader vault platform on Solana where traders manage pooled capital with enhanced security and performance.

## 🚀 Overview

Coffer is a production-grade Solana-based trading vault platform that enables professional traders to manage pooled capital with institutional-grade security, real-time analytics, and automated trading execution.

### Core Features

- **Real Trading**: Live trading via Jupiter Router v6 with best execution
- **Vault Management**: Create and manage multiple trading vaults
- **Leaderboards**: Track top performers with real-time PnL analytics
- **Social Integration**: X (Twitter) authentication and social profiles
- **Performance Monitoring**: Comprehensive analytics and metrics
- **Security**: Privy-powered authentication and session management
- **Responsive UI**: Professional dark-themed interface with smooth animations

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Privy
- **Blockchain**: Solana Web3.js
- **Trading**: Jupiter Router v6
- **RPC**: Helius

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite 6
- **Styling**: CSS Modules with professional design system
- **Charts**: Lightweight Charts
- **Authentication**: Privy React Auth
- **Routing**: React Router v6

### Infrastructure
- **Platform**: Railway
- **CI/CD**: GitHub Actions
- **Monitoring**: Custom monitoring endpoints
- **Database**: PostgreSQL on Railway

## 🚦 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 14+
- Solana wallet (for development)

### Installation

```bash
# Clone the repository
git clone https://github.com/CofferFun/coffer.git
cd coffer

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Set up database
npx prisma generate
npx prisma migrate dev

# Start development servers
npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/coffer"

# Blockchain
SOLANA_RPC_URL="https://api.mainnet-beta.solana.com"
JUPITER_API_URL="https://quote-api.jup.ag/v6"

# Authentication
PRIVY_APP_ID="your-privy-app-id"

# External Services
BIRDEYE_API_KEY="your-birdeye-key"
HELIUS_API_KEY="your-helius-key"

# Frontend
FRONTEND_URL="http://localhost:5174"
```

## 🏗️ Project Structure

```
coffer/
├── apps/
│   ├── api/           # Express backend
│   │   ├── src/
│   │   │   ├── routes/     # API routes
│   │   │   ├── middleware/ # Express middleware
│   │   │   ├── services/   # Business logic
│   │   │   └── index.ts    # Entry point
│   │   └── prisma/         # Database schema
│   └── web/           # React frontend
│       ├── src/
│       │   ├── components/ # React components
│       │   ├── pages/      # Page components
│       │   ├── hooks/      # Custom React hooks
│       │   └── main.tsx    # Entry point
│       └── public/         # Static assets
├── packages/          # Shared packages
├── scripts/           # Build and deployment scripts
└── docs/             # Documentation
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# E2E tests
npm run test:e2e
```

## 🚀 Deployment

### Automated Deployment

The application is automatically deployed to Railway via GitHub Actions on push to the `master` branch.

### Manual Deployment

```bash
# Build for production
npm run build

# Deploy to Railway
railway up

# Check deployment status
railway status
```

## 📊 Monitoring

- **Health Check**: `GET /api/health`
- **Metrics**: `GET /api/monitoring/metrics`
- **Status**: `GET /api/monitoring/status`

## 🔒 Security

- **Authentication**: Privy-powered wallet authentication
- **Rate Limiting**: API rate limiting and request validation
- **CORS**: Configured CORS policies
- **Security Headers**: Comprehensive security headers
- **Input Validation**: Request sanitization and validation

## 🤝 Contributing

We welcome contributions from the community! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit with descriptive messages
5. Push to your fork and submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Jupiter](https://jup.ag) - Solana DEX aggregator
- [Privy](https://privy.io) - Web3 authentication
- [Helius](https://helius.xyz) - Solana RPC provider
- [Railway](https://railway.app) - Deployment platform

## 📞 Support

- **Website**: https://coffer.fun
- **Documentation**: https://docs.coffer.fun
- **Issues**: https://github.com/CofferFun/coffer/issues
- **Discussions**: https://github.com/CofferFun/coffer/discussions

## 🗺️ Roadmap

- [ ] Mobile app development
- [ ] Advanced trading strategies
- [ ] Multi-chain support
- [ ] Institutional features
- [ ] Enhanced analytics

---

Built with ❤️ by the CofferFun team
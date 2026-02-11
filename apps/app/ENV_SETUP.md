# Environment Configuration

## Quick Start (Local Development)

1. Copy the sample environment file:
   ```bash
   cp .env.sample .env.local
   ```

2. The `.env.local` file contains sensible defaults for local development. Override as needed:
   - Devnet API: `http://localhost:3000` (default when no env vars set)
   - Devnet RPC: `https://api.devnet.solana.com`

3. Start the development server:
   ```bash
   yarn dev
   ```

## Production Deployment

The frontend supports both mainnet and devnet via a network toggle in the header. Set env vars for both clusters:

```bash
# Mainnet
NEXT_PUBLIC_MAINNET_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_MAINNET_API_URL=https://api.silkyway.ai

# Devnet
NEXT_PUBLIC_DEVNET_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_DEVNET_API_URL=https://devnet-api.silkyway.ai
```

### Vercel Deployment

1. Add environment variables in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add all four `NEXT_PUBLIC_*` variables above
   - Apply to Production, Preview, and Development environments as needed

2. Redeploy to apply changes

### Other Platforms

Add the environment variables according to your platform's documentation:
- **Netlify**: Site Settings → Environment Variables
- **Railway**: Project → Variables
- **Render**: Environment → Environment Variables

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_MAINNET_RPC_URL` | Mainnet Solana RPC endpoint | `https://api.mainnet-beta.solana.com` |
| `NEXT_PUBLIC_MAINNET_API_URL` | Mainnet backend API | `https://api.silkyway.ai` |
| `NEXT_PUBLIC_DEVNET_RPC_URL` | Devnet Solana RPC endpoint | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_DEVNET_API_URL` | Devnet backend API | `https://devnet-api.silkyway.ai` |

## Troubleshooting

### CORS errors when connecting to backend

Make sure the backend's `ALLOWED_ORIGINS` environment variable includes your frontend domain.

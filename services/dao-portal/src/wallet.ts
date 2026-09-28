import { createConfig, http } from "wagmi";
import { polygon, polygonAmoy, foundry } from "wagmi/chains";
import { injected } from "wagmi/connectors";
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const connectors = [injected()];
if (projectId) {
  const { walletConnect } = await import("wagmi/connectors/walletConnect");
  connectors.push(walletConnect({ projectId, showQrModal: true }));
}
export const walletConfig = createConfig({
  chains: [polygon, polygonAmoy, foundry],
  connectors,
  transports: {
    [polygon.id]: http("https://polygon-bor-rpc.publicnode.com"),
    [polygonAmoy.id]: http(),
    [foundry.id]: http("http://127.0.0.1:8545"),
  },
});

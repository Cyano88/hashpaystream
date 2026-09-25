import PrivyTradeCheckout from './PrivyTradeCheckout';
export type TradeCheckoutWallet = {
  state: string;
  session?: { userToken: string; wallet: { id: string; address: string } };
  reconnect: () => Promise<void>;
};
// Preserve callers while Trade signing now uses the authenticated Privy wallet.
export default function TradeCheckout(props: Parameters<typeof PrivyTradeCheckout>[0] & {
  wallet?: TradeCheckoutWallet; getAccessToken: () => Promise<string | null>;
}) { return <PrivyTradeCheckout {...props} />; }

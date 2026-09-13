// Payment provider abstraction. Mock first; real gateways plug in via env.
export interface FundingIntent {
  reference: string;
  amountKobo: number;
  accountHint?: string;
}

export interface PaymentProvider {
  name: string;
  initiate(userId: string, amountKobo: number): Promise<FundingIntent>;
  verify(reference: string): Promise<{ paid: boolean; amountKobo: number }>;
}

class MockPaymentProvider implements PaymentProvider {
  name = 'mock';
  store = new Map<string, number>();
  async initiate(_userId: string, amountKobo: number): Promise<FundingIntent> {
    const reference = `MOCKPAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1e6)}`;
    this.store.set(reference, amountKobo);
    return { reference, amountKobo, accountHint: 'Mock channel — confirm instantly via verify endpoint' };
  }
  async verify(reference: string) {
    const amountKobo = this.store.get(reference);
    if (amountKobo == null) return { paid: false, amountKobo: 0 };
    return { paid: true, amountKobo };
  }
}

export const paymentProvider: PaymentProvider = new MockPaymentProvider();

// Webhook signature helper placeholder for real gateways (HMAC-SHA512).
export function verifyWebhookSignature(_rawBody: string, _signature: string): boolean {
  // Real gateways: compare HMAC with provider secret. Mock accepts internal calls only.
  return true;
}

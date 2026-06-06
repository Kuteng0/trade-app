import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type CheckoutProduct = 'premium' | 'coin10' | 'coin35' | 'coin60';

type StripeCheckoutSession = {
  id: string;
  object: 'checkout.session';
  metadata?: {
    user_id?: string;
    product_type?: string;
  } | null;
};

type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: StripeCheckoutSession;
  };
};

const rewardByProduct: Record<CheckoutProduct, { coins: number; premium: boolean }> = {
  premium: { coins: 50, premium: true },
  coin10: { coins: 10, premium: false },
  coin35: { coins: 35, premium: false },
  coin60: { coins: 60, premium: false },
};

function isCheckoutProduct(product: unknown): product is CheckoutProduct {
  return product === 'premium' || product === 'coin10' || product === 'coin35' || product === 'coin60';
}

function verifyStripeSignature(payload: string, signatureHeader: string | null, webhookSecret: string) {
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(',').reduce<Record<string, string[]>>((acc, part) => {
    const [key, value] = part.split('=');
    if (!key || !value) return acc;
    acc[key] = [...(acc[key] || []), value];
    return acc;
  }, {});

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 || [];

  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const expected = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');

  return signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature, 'hex');
    return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET is not configured.' }, { status: 500 });
  }

  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!verifyStripeSignature(payload, signature, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const productType = session.metadata?.product_type;

  if (!session.id || !userId || !isCheckoutProduct(productType)) {
    return NextResponse.json({ error: 'Missing checkout session metadata.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 });
  }

  const reward = rewardByProduct[productType];
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  // Duplicate protection lives in the database RPC: the Stripe Checkout
  // session id is inserted before rewards are applied, and webhook retries
  // hit the unique session_id constraint instead of granting coins twice.
  const { data, error } = await supabase.rpc('award_stripe_checkout_reward', {
    p_session_id: session.id,
    p_user_id: userId,
    p_product_type: productType,
    p_coins_delta: reward.coins,
    p_is_premium: reward.premium,
  });

  if (error) {
    console.error('Stripe reward error:', error);
    return NextResponse.json({ error: 'Failed to apply Stripe reward.' }, { status: 500 });
  }

  return NextResponse.json({ received: true, rewarded: Boolean(data) });
}

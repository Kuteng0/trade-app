import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type CheckoutProduct = 'premium' | 'coin10' | 'coin35' | 'coin60';

const priceEnvByProduct: Record<CheckoutProduct, string> = {
  premium: 'PREMIUM_PRICE_ID',
  coin10: 'COIN10_PRICE_ID',
  coin35: 'COIN35_PRICE_ID',
  coin60: 'COIN60_PRICE_ID',
};

function isCheckoutProduct(product: unknown): product is CheckoutProduct {
  return product === 'premium' || product === 'coin10' || product === 'coin35' || product === 'coin60';
}

export async function POST(request: Request) {
  try {
    const { product, userId } = await request.json();

    if (!isCheckoutProduct(product)) {
      return NextResponse.json({ error: 'Invalid product.' }, { status: 400 });
    }

    if (typeof userId !== 'string' || userId.trim().length === 0) {
      return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const priceId = process.env[priceEnvByProduct[product]];

    if (!stripeSecretKey || !appUrl || !priceId) {
      return NextResponse.json({ error: 'Stripe checkout is not configured.' }, { status: 500 });
    }

    const params = new URLSearchParams({
      mode: 'payment',
      success_url: `${appUrl.replace(/\/$/, '')}/payment/success`,
      cancel_url: `${appUrl.replace(/\/$/, '')}/payment/cancel`,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'metadata[user_id]': userId,
      'metadata[product_type]': product,
    });

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {
      return NextResponse.json(
        { error: session?.error?.message || 'Failed to create Stripe Checkout Session.' },
        { status: stripeResponse.status },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json({ error: 'Failed to create Stripe Checkout Session.' }, { status: 500 });
  }
}

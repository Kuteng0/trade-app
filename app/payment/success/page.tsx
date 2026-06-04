import Link from 'next/link';

export default function PaymentSuccessPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FA] px-6 py-12 text-gray-800 font-sans antialiased">
      <div className="mx-auto max-w-md rounded-3xl border border-emerald-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl">
          ✅
        </div>
        <h1 className="text-lg font-black text-emerald-700">決済が完了しました</h1>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          Stripeでのお支払いを確認しています。特典はWebhook処理後にウォレットへ反映されます。
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black text-white"
        >
          アプリに戻る
        </Link>
      </div>
    </main>
  );
}

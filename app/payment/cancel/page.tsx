import Link from 'next/link';

export default function PaymentCancelPage() {
  return (
    <main className="min-h-screen bg-[#F7F9FA] px-6 py-12 text-gray-800 font-sans antialiased">
      <div className="mx-auto max-w-md rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 text-2xl">
          ↩️
        </div>
        <h1 className="text-lg font-black text-gray-800">決済をキャンセルしました</h1>
        <p className="mt-3 text-xs leading-relaxed text-gray-500">
          お支払いは完了していません。必要な場合はウォレットからもう一度お試しください。
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

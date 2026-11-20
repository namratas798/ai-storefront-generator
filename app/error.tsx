"use client";
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-md min-h-dvh bg-white px-6 pt-24 text-center">
      <div className="text-5xl">🙈</div>
      <h1 className="text-2xl font-extrabold mt-4">Something slipped</h1>
      <p className="text-[#6b6780] mt-2">Your draft is saved on this phone.</p>
      <button onClick={reset} className="mt-6 px-5 py-3 rounded-2xl bg-[#6d4aff] text-white font-bold">Try again</button>
    </main>
  );
}

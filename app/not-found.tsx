export default function NotFound() {
  return (
    <main className="mx-auto max-w-md min-h-dvh bg-white px-6 pt-24 text-center">
      <div className="text-5xl">🛍️</div>
      <h1 className="text-2xl font-extrabold mt-4">This store doesn't exist (yet)</h1>
      <p className="text-[#6b6780] mt-2">The link may be mistyped, or the creator hasn't published it.</p>
      <a href="/" className="inline-block mt-6 px-5 py-3 rounded-2xl bg-[#6d4aff] text-white font-bold">
        Create your own store
      </a>
    </main>
  );
}

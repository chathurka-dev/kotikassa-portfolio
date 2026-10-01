// Centered layout for login / signup pages
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4">
      <div className="mb-8 text-center">
        <span className="text-4xl">🏠</span>
        <h1 className="mt-2 text-2xl font-bold text-gray-900" translate="no">Kotikassa</h1>
        <p className="mt-1 text-sm text-gray-500">Family budget planner</p>
      </div>
      {children}
    </div>
  )
}

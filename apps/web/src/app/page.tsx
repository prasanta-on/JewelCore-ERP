export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>JewelCore ERP</h1>
      <p>Modular Monolith Enterprise Jewellery Platform</p>
      <ul>
        <li>Architecture: Modular Monolith</li>
        <li>Backend: Express 5 + Node.js 22 LTS</li>
        <li>Database: PostgreSQL 18</li>
        <li>Queue: Redis + BullMQ</li>
        <li>Frontend: Next.js 15 (App Router) + React 19</li>
      </ul>
    </main>
  );
}

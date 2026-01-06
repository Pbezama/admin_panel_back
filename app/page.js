export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Admin Panel API</h1>
      <p>Backend API funcionando correctamente.</p>
      <h2>Endpoints disponibles:</h2>
      <ul>
        <li><code>GET /api/health</code> - Health check</li>
        <li><code>POST /api/auth/login</code> - Login</li>
        <li><code>POST /api/auth/verify</code> - Verificar token</li>
        <li><code>POST /api/chat/controlador</code> - Chat Controlador</li>
        <li><code>POST /api/chat/chatia</code> - Chat IA</li>
        <li><code>GET /api/data/marca</code> - Obtener datos de marca</li>
        <li><code>POST /api/data/add</code> - Agregar dato</li>
        <li><code>PUT /api/data/update</code> - Actualizar dato</li>
        <li><code>POST /api/data/deactivate</code> - Desactivar dato</li>
      </ul>
    </main>
  )
}

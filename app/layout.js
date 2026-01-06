export const metadata = {
  title: 'Admin Panel API',
  description: 'Backend API para Admin Panel',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

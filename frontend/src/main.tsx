import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// Uma instância só pro app inteiro — é o "cofre" do cache de dados do
// servidor (agentes, mensagens, etc). Criada uma vez, nunca recriada.
const queryClient = new QueryClient()

function montarApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
}

// Vitrine da arte (só em desenvolvimento): abre em /#catalogo. O `import.meta.env.DEV` é constante no build de
// produção, então esse ramo e o módulo da vitrine nem entram no bundle.
if (import.meta.env.DEV && location.hash === '#catalogo') {
  void import('./features/predio/dev/catalogo').then(({ montarCatalogo }) => montarCatalogo(document.getElementById('root')!))
} else {
  montarApp()
}
